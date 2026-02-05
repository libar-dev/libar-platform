/**
 * Unit Tests for CommandOrchestrator partition key structure.
 *
 * Verifies that the partition context passed to Workpool's enqueueMutation
 * uses the structured { name, value } format across all projection paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CommandOrchestrator } from "../../../src/orchestration/CommandOrchestrator";
import { createMiddlewarePipeline } from "../../../src/middleware/MiddlewarePipeline";
import type {
  WorkpoolClient,
  MutationCtx,
  CommandConfig,
  OrchestratorDependencies,
  EventStoreClient,
  CommandBusClient,
  CommandHandlerResult,
  CommandHandlerSuccess,
  CommandHandlerFailed,
} from "../../../src/orchestration/types";
import { toEventId, toStreamId, toCorrelationId, toCausationId } from "../../../src/ids";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { UnknownRecord } from "../../../src/types";

// ============================================================================
// Mocks
// ============================================================================

function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
  };
}

function createMockCommandBus(): CommandBusClient {
  return {
    async recordCommand() {
      return { status: "new" as const };
    },
    async updateCommandResult() {
      return true;
    },
  };
}

function createMockEventStore(): EventStoreClient {
  return {
    async appendToStream() {
      return { status: "success" as const, globalPositions: [100] };
    },
  };
}

function createMockCtx(handlerResult: CommandHandlerResult): MutationCtx {
  return {
    runMutation: async () => handlerResult,
    runQuery: async () => null,
    runAction: async () => null,
    db: {} as MutationCtx["db"],
    auth: {} as MutationCtx["auth"],
    scheduler: {} as MutationCtx["scheduler"],
    storage: {} as MutationCtx["storage"],
  } as unknown as MutationCtx;
}

const mockHandler = { name: "mockHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  UnknownRecord,
  unknown
>;

const mockProjectionHandler = { name: "mockProjectionHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  UnknownRecord,
  unknown
>;

const mockSecondaryProjectionHandler = { name: "mockSecondaryHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  UnknownRecord,
  unknown
>;

type TestArgs = { orderId: string };
type TestHandlerArgs = { orderId: string; commandId: string; correlationId: string };

function createSuccessResult(): CommandHandlerSuccess {
  return {
    status: "success",
    data: { orderId: "ord_123" },
    version: 1,
    event: {
      eventId: toEventId("evt_test_1"),
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: toStreamId("ord_123"),
      payload: { orderId: "ord_123" },
      metadata: {
        correlationId: toCorrelationId("corr_1"),
        causationId: toCausationId("cmd_1"),
      },
    },
  };
}

function createFailedResult(): CommandHandlerFailed {
  return {
    status: "failed",
    reason: "Insufficient stock",
    event: {
      eventId: toEventId("evt_fail_1"),
      eventType: "ReservationFailed",
      streamType: "Reservation",
      streamId: toStreamId("res_123"),
      payload: { orderId: "ord_123", reason: "Insufficient stock" },
      metadata: {
        correlationId: toCorrelationId("corr_1"),
        causationId: toCausationId("cmd_1"),
      },
    },
  };
}

function createBaseConfig(): CommandConfig<
  TestArgs,
  TestHandlerArgs,
  CommandHandlerResult,
  UnknownRecord
> {
  return {
    commandType: "CreateOrder",
    boundedContext: "orders",
    handler: mockHandler as FunctionReference<
      "mutation",
      FunctionVisibility,
      TestHandlerArgs,
      CommandHandlerResult
    >,
    toHandlerArgs: (args, commandId, correlationId) => ({
      orderId: args.orderId,
      commandId,
      correlationId,
    }),
    projection: {
      handler: mockProjectionHandler,
      projectionName: "orderSummary",
      toProjectionArgs: (args, _result, globalPosition) => ({
        orderId: args.orderId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("CommandOrchestrator partition key structure", () => {
  let mockWorkpool: WorkpoolClient & { calls: unknown[][] };
  let orchestrator: CommandOrchestrator;

  beforeEach(() => {
    mockWorkpool = createMockWorkpool();
  });

  function createOrchestrator(overrides?: Partial<OrchestratorDependencies>): CommandOrchestrator {
    return new CommandOrchestrator({
      eventStore: createMockEventStore(),
      commandBus: createMockCommandBus(),
      projectionPool: mockWorkpool,
      middlewarePipeline: createMiddlewarePipeline(),
      ...overrides,
    });
  }

  it("wraps partition key in structured field for primary projection", async () => {
    orchestrator = createOrchestrator();
    const ctx = createMockCtx(createSuccessResult());
    const config = createBaseConfig();

    await orchestrator.execute(ctx, config, { orderId: "ord_123" });

    expect(mockWorkpool.calls.length).toBeGreaterThanOrEqual(1);
    const [, , , options] = mockWorkpool.calls[0] as [
      unknown,
      unknown,
      unknown,
      { context: Record<string, unknown> },
    ];
    expect(options.context.partition).toEqual({ name: "orderId", value: "ord_123" });
    expect(options.context.projectionName).toBe("orderSummary");
    expect(options.context.eventId).toBe("evt_test_1");
  });

  it("wraps partition key in structured field for secondary projections", async () => {
    orchestrator = createOrchestrator();
    const ctx = createMockCtx(createSuccessResult());
    const config: CommandConfig<TestArgs, TestHandlerArgs, CommandHandlerResult, UnknownRecord> = {
      ...createBaseConfig(),
      secondaryProjections: [
        {
          handler: mockSecondaryProjectionHandler,
          projectionName: "orderWithInventory",
          toProjectionArgs: (args, _result, globalPosition) => ({
            orderId: args.orderId,
            globalPosition,
          }),
          getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
        },
      ],
    };

    await orchestrator.execute(ctx, config, { orderId: "ord_456" });

    // calls[0] = primary projection, calls[1] = secondary projection
    expect(mockWorkpool.calls.length).toBeGreaterThanOrEqual(2);
    const [, , , secondaryOptions] = mockWorkpool.calls[1] as [
      unknown,
      unknown,
      unknown,
      { context: Record<string, unknown> },
    ];
    expect(secondaryOptions.context.partition).toEqual({ name: "orderId", value: "ord_456" });
    expect(secondaryOptions.context.projectionName).toBe("orderWithInventory");
  });

  it("wraps partition key in structured field for failed projection", async () => {
    orchestrator = createOrchestrator();
    const ctx = createMockCtx(createFailedResult());

    const mockFailedProjectionHandler = { name: "mockFailedHandler" } as FunctionReference<
      "mutation",
      FunctionVisibility,
      UnknownRecord,
      unknown
    >;

    const config: CommandConfig<TestArgs, TestHandlerArgs, CommandHandlerResult, UnknownRecord> = {
      ...createBaseConfig(),
      failedProjection: {
        handler: mockFailedProjectionHandler,
        projectionName: "reservationFailure",
        toProjectionArgs: (args, _failedResult, globalPosition) => ({
          orderId: args.orderId,
          globalPosition,
        }),
        getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
      },
    };

    await orchestrator.execute(ctx, config, { orderId: "ord_789" });

    expect(mockWorkpool.calls.length).toBeGreaterThanOrEqual(1);
    const [, , , options] = mockWorkpool.calls[0] as [
      unknown,
      unknown,
      unknown,
      { context: Record<string, unknown> },
    ];
    expect(options.context.partition).toEqual({ name: "orderId", value: "ord_789" });
    expect(options.context.projectionName).toBe("reservationFailure");
    expect(options.context.eventId).toBe("evt_fail_1");
  });
});
