/**
 * CommandOrchestrator Partition Key Structure - Step Definitions
 *
 * BDD step definitions verifying that the partition context passed to
 * Workpool's enqueueMutation uses the structured { name, value } format
 * across all projection paths (primary, secondary, failed).
 *
 * Mechanical migration from tests/unit/orchestration/CommandOrchestrator.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { CommandOrchestrator } from "../../../src/orchestration/CommandOrchestrator.js";
import { createMiddlewarePipeline } from "../../../src/middleware/MiddlewarePipeline.js";
import type {
  WorkpoolClient,
  MutationCtx,
  CommandConfig,
  EventStoreClient,
  CommandBusClient,
  CommandHandlerResult,
  CommandHandlerSuccess,
  CommandHandlerFailed,
} from "../../../src/orchestration/types.js";
import { toEventId, toStreamId, toCorrelationId, toCausationId } from "../../../src/ids/index.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { UnknownRecord } from "../../../src/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mocks
// =============================================================================

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

const mockProjectionHandler = {
  name: "mockProjectionHandler",
} as FunctionReference<"mutation", FunctionVisibility, UnknownRecord, unknown>;

const mockSecondaryProjectionHandler = {
  name: "mockSecondaryHandler",
} as FunctionReference<"mutation", FunctionVisibility, UnknownRecord, unknown>;

const mockFailedProjectionHandler = {
  name: "mockFailedHandler",
} as FunctionReference<"mutation", FunctionVisibility, UnknownRecord, unknown>;

type TestArgs = { orderId: string };
type TestHandlerArgs = {
  orderId: string;
  commandId: string;
  correlationId: string;
};

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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockWorkpool: (WorkpoolClient & { calls: unknown[][] }) | null;
  orchestrator: CommandOrchestrator | null;
  ctx: MutationCtx | null;
  config: CommandConfig<TestArgs, TestHandlerArgs, CommandHandlerResult, UnknownRecord> | null;
  handlerResultType: "success" | "failed";
}

function createInitialState(): TestState {
  return {
    mockWorkpool: null,
    orchestrator: null,
    ctx: null,
    config: null,
    handlerResultType: "success",
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/orchestration/command-orchestrator.feature"
);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: Primary projection receives structured partition key
  // ===========================================================================

  Rule("Primary projection receives structured partition key", ({ RuleScenario }) => {
    RuleScenario(
      "Wraps partition key in structured field for primary projection",
      ({ Given, And, When, Then }) => {
        Given("an orchestrator with mock dependencies", () => {
          state.mockWorkpool = createMockWorkpool();
          state.orchestrator = new CommandOrchestrator({
            eventStore: createMockEventStore(),
            commandBus: createMockCommandBus(),
            projectionPool: state.mockWorkpool,
            middlewarePipeline: createMiddlewarePipeline(),
          });
        });

        And("a successful command handler result", () => {
          state.handlerResultType = "success";
          state.ctx = createMockCtx(createSuccessResult());
        });

        And(
          'a command config with primary projection "orderSummary" partitioned by "orderId"',
          () => {
            state.config = createBaseConfig();
          }
        );

        When('I execute the command with orderId "ord_123"', async () => {
          await state.orchestrator!.execute(state.ctx!, state.config!, {
            orderId: "ord_123",
          });
        });

        Then("the workpool was called at least 1 time", () => {
          expect(state.mockWorkpool!.calls.length).toBeGreaterThanOrEqual(1);
        });

        And("the workpool call 0 context contains:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          for (const row of rows) {
            expect(options.context[row.field]).toBe(row.value);
          }
        });

        And('the workpool call 0 partition is name "orderId" value "ord_123"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.partition).toEqual({
            name: "orderId",
            value: "ord_123",
          });
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Secondary projections receive structured partition key
  // ===========================================================================

  Rule("Secondary projections receive structured partition key", ({ RuleScenario }) => {
    RuleScenario(
      "Wraps partition key in structured field for secondary projections",
      ({ Given, And, When, Then }) => {
        Given("an orchestrator with mock dependencies", () => {
          state.mockWorkpool = createMockWorkpool();
          state.orchestrator = new CommandOrchestrator({
            eventStore: createMockEventStore(),
            commandBus: createMockCommandBus(),
            projectionPool: state.mockWorkpool,
            middlewarePipeline: createMiddlewarePipeline(),
          });
        });

        And("a successful command handler result", () => {
          state.handlerResultType = "success";
          state.ctx = createMockCtx(createSuccessResult());
        });

        And(
          'a command config with primary projection "orderSummary" partitioned by "orderId"',
          () => {
            state.config = createBaseConfig();
          }
        );

        And('a secondary projection "orderWithInventory" partitioned by "orderId"', () => {
          state.config = {
            ...state.config!,
            secondaryProjections: [
              {
                handler: mockSecondaryProjectionHandler,
                projectionName: "orderWithInventory",
                toProjectionArgs: (args, _result, globalPosition) => ({
                  orderId: (args as TestArgs).orderId,
                  globalPosition,
                }),
                getPartitionKey: (args) => ({
                  name: "orderId",
                  value: (args as TestArgs).orderId,
                }),
              },
            ],
          };
        });

        When('I execute the command with orderId "ord_456"', async () => {
          await state.orchestrator!.execute(state.ctx!, state.config!, {
            orderId: "ord_456",
          });
        });

        Then("the workpool was called at least 2 times", () => {
          expect(state.mockWorkpool!.calls.length).toBeGreaterThanOrEqual(2);
        });

        And("the workpool call 1 context contains:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const [, , , options] = state.mockWorkpool!.calls[1] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          for (const row of rows) {
            expect(options.context[row.field]).toBe(row.value);
          }
        });

        And('the workpool call 1 partition is name "orderId" value "ord_456"', () => {
          const [, , , options] = state.mockWorkpool!.calls[1] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.partition).toEqual({
            name: "orderId",
            value: "ord_456",
          });
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Failed projection receives structured partition key
  // ===========================================================================

  Rule("Failed projection receives structured partition key", ({ RuleScenario }) => {
    RuleScenario(
      "Wraps partition key in structured field for failed projection",
      ({ Given, And, When, Then }) => {
        Given("an orchestrator with mock dependencies", () => {
          state.mockWorkpool = createMockWorkpool();
          state.orchestrator = new CommandOrchestrator({
            eventStore: createMockEventStore(),
            commandBus: createMockCommandBus(),
            projectionPool: state.mockWorkpool,
            middlewarePipeline: createMiddlewarePipeline(),
          });
        });

        And("a failed command handler result", () => {
          state.handlerResultType = "failed";
          state.ctx = createMockCtx(createFailedResult());
        });

        And(
          'a command config with failed projection "reservationFailure" partitioned by "orderId"',
          () => {
            state.config = {
              ...createBaseConfig(),
              failedProjection: {
                handler: mockFailedProjectionHandler,
                projectionName: "reservationFailure",
                toProjectionArgs: (args, _failedResult, globalPosition) => ({
                  orderId: (args as TestArgs).orderId,
                  globalPosition,
                }),
                getPartitionKey: (args) => ({
                  name: "orderId",
                  value: (args as TestArgs).orderId,
                }),
              },
            };
          }
        );

        When('I execute the command with orderId "ord_789"', async () => {
          await state.orchestrator!.execute(state.ctx!, state.config!, {
            orderId: "ord_789",
          });
        });

        Then("the workpool was called at least 1 time", () => {
          expect(state.mockWorkpool!.calls.length).toBeGreaterThanOrEqual(1);
        });

        And("the workpool call 0 context contains:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          for (const row of rows) {
            expect(options.context[row.field]).toBe(row.value);
          }
        });

        And('the workpool call 0 partition is name "orderId" value "ord_789"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.partition).toEqual({
            name: "orderId",
            value: "ord_789",
          });
        });
      }
    );
  });
});
