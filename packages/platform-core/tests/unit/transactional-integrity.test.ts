import { describe, expect, it, vi } from "vitest";
import { success } from "@libar-dev/platform-decider";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import { executeWithDCB, createScopeKey } from "../../src/dcb/index.js";
import { createMiddlewarePipeline } from "../../src/middleware/MiddlewarePipeline.js";
import { toCorrelationId, toCausationId, toEventId, toStreamId } from "../../src/ids/index.js";
import { CommandOrchestrator } from "../../src/orchestration/CommandOrchestrator.js";
import { TransactionAbortError } from "../../src/transactionAbort.js";
import type {
  CommandBusClient,
  CommandConfig,
  CommandHandlerResult,
  CommandHandlerSuccess,
  EventStoreClient,
  MutationCtx,
  WorkpoolClient,
} from "../../src/orchestration/types.js";
import type { UnknownRecord } from "../../src/types.js";

type CommandState = {
  records: string[];
  results: Array<{ commandId: string; status: string }>;
  cmsRows: Array<{ orderId: string; version: number }>;
};

type TransactionRun<T> = {
  committed: boolean;
  committedState: CommandState;
  workingState: CommandState;
  result?: T;
  error?: unknown;
};

const mockHandler = { name: "transactionalHandler" } as unknown as FunctionReference<
  "mutation",
  FunctionVisibility,
  { orderId: string; commandId: string; correlationId: string },
  CommandHandlerResult<{ orderId: string }>
>;

const mockProjectionHandler = { name: "mockProjectionHandler" } as unknown as FunctionReference<
  "mutation",
  FunctionVisibility,
  UnknownRecord,
  unknown
>;

function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
    async enqueueAction() {
      return null;
    },
  };
}

function createSuccessResult(): CommandHandlerSuccess<{ orderId: string }> {
  return {
    status: "success",
    data: { orderId: "ord_tx_123" },
    version: 1,
    event: {
      eventId: toEventId("evt_tx_1"),
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: toStreamId("ord_tx_123"),
      payload: { orderId: "ord_tx_123" },
      metadata: {
        correlationId: toCorrelationId("corr_tx_1"),
        causationId: toCausationId("cmd_tx_1"),
      },
    },
  };
}

function createConfig(): CommandConfig<
  { orderId: string },
  { orderId: string; commandId: string; correlationId: string },
  CommandHandlerResult<{ orderId: string }>,
  UnknownRecord,
  { orderId: string }
> {
  return {
    commandType: "CreateOrder",
    boundedContext: "orders",
    handler: mockHandler,
    toHandlerArgs: (args, commandId, correlationId) => ({
      orderId: args.orderId,
      commandId,
      correlationId,
    }),
    projection: {
      handler: mockProjectionHandler,
      projectionName: "orderSummary",
      toProjectionArgs: () => ({ orderId: "ord_tx_123" }),
      getPartitionKey: () => ({ name: "orderId", value: "ord_tx_123" }),
    },
  };
}

async function runCommandTransaction(
  executor: (ctx: MutationCtx, workingState: CommandState) => Promise<unknown>
): Promise<TransactionRun<unknown>> {
  const initialState: CommandState = {
    records: [],
    results: [],
    cmsRows: [],
  };
  const workingState: CommandState = {
    records: [...initialState.records],
    results: [...initialState.results],
    cmsRows: [...initialState.cmsRows],
  };

  const ctx = {
    runMutation: vi.fn(async (ref, args) => {
      if (ref === mockHandler) {
        const handlerArgs = args as { orderId: string };
        workingState.cmsRows.push({
          orderId: handlerArgs.orderId,
          version: 1,
        });
        return createSuccessResult();
      }
      return null;
    }),
    runQuery: vi.fn(async () => null),
    runAction: vi.fn(async () => null),
    db: {} as MutationCtx["db"],
    auth: {} as MutationCtx["auth"],
    scheduler: {} as MutationCtx["scheduler"],
    storage: {} as MutationCtx["storage"],
  } as unknown as MutationCtx;

  try {
    const result = await executor(ctx, workingState);
    return {
      committed: true,
      committedState: workingState,
      workingState,
      result,
    };
  } catch (error) {
    return {
      committed: false,
      committedState: initialState,
      workingState,
      error,
    };
  }
}

describe("transactional integrity", () => {
  it("aborts the orchestrator transaction when event append conflicts after handler writes", async () => {
    const projectionPool = createMockWorkpool();
    const fanoutPool = createMockWorkpool();
    const sagaPool = createMockWorkpool();

    const commandBus: CommandBusClient = {
      recordCommand: vi.fn(async () => ({ status: "new" as const })),
      updateCommandResult: vi.fn(async () => true),
    };

    const eventStore: EventStoreClient = {
      appendToStream: vi.fn(async () => ({ status: "conflict" as const, currentVersion: 2 })),
    };

    const orchestrator = new CommandOrchestrator({
      eventStore,
      commandBus,
      projectionPool,
      fanoutPool,
      sagaPool,
      middlewarePipeline: createMiddlewarePipeline(),
    });

    const transaction = await runCommandTransaction(async (ctx, workingState) => {
      const originalRecordCommand = commandBus.recordCommand;
      commandBus.recordCommand = vi.fn(async (_innerCtx, args) => {
        workingState.records.push(String(args.commandId));
        return originalRecordCommand(_innerCtx, args);
      });

      const originalUpdateCommandResult = commandBus.updateCommandResult;
      commandBus.updateCommandResult = vi.fn(async (_innerCtx, args) => {
        workingState.results.push({
          commandId: String(args.commandId),
          status: args.status,
        });
        return originalUpdateCommandResult(_innerCtx, args);
      });

      return orchestrator.execute(ctx, createConfig(), { orderId: "ord_tx_123" });
    });

    expect(transaction.committed).toBe(false);
    expect(transaction.error).toBeInstanceOf(TransactionAbortError);
    expect(transaction.workingState.records).toHaveLength(1);
    expect(transaction.workingState.cmsRows).toEqual([{ orderId: "ord_tx_123", version: 1 }]);
    expect(transaction.committedState.records).toEqual([]);
    expect(transaction.committedState.cmsRows).toEqual([]);
    expect(transaction.committedState.results).toEqual([]);
    expect(commandBus.updateCommandResult).not.toHaveBeenCalled();
    expect(projectionPool.calls).toHaveLength(0);
    expect(fanoutPool.calls).toHaveLength(0);
    expect(sagaPool.calls).toHaveLength(0);
  });

  it("checks DCB scope commit before applying entity updates", async () => {
    const applyUpdate = vi.fn(async () => undefined);
    const commitScope = vi.fn(async () => ({ status: "conflict" as const, currentVersion: 1 }));

    const result = await executeWithDCB(
      {
        db: {
          query: vi.fn(),
          insert: vi.fn(),
          patch: vi.fn(),
        },
      },
      {
        scopeKey: createScopeKey("t1", "reservation", "ord_tx_123"),
        expectedVersion: 0,
        boundedContext: "inventory",
        streamType: "Reservation",
        schemaVersion: 1,
        scopeOperations: {
          getScope: async () => ({
            boundedContext: "inventory",
            currentVersion: 0,
            tenantId: "t1",
            scopeType: "reservation",
            scopeId: "ord_tx_123",
          }),
          commitScope,
        },
        entities: {
          streamIds: ["product_1"],
          loadEntity: async () => ({
            cms: { quantity: 5 },
            _id: "inventory_1",
          }),
        },
        decider: () =>
          success({
            data: { reservationId: "res_tx_1" },
            event: { eventType: "ItemsReserved", payload: { quantity: 1 } },
            stateUpdate: new Map([["product_1", { quantityChange: -1 }]]),
          }),
        command: {
          orderId: "ord_tx_123",
          items: [] as Array<{ productId: string; quantity: number }>,
        },
        applyUpdate,
        commandId: "cmd_tx_1",
        correlationId: "corr_tx_1",
      }
    );

    expect(result).toEqual({ status: "conflict", currentVersion: 1 });
    expect(commitScope).toHaveBeenCalledWith(["product_1"]);
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
