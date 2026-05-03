/**
 * BatchExecutor - Step Definitions
 *
 * BDD step definitions for batch command execution:
 * - Atomic mode (sequential, stop-on-failure, single-aggregate)
 * - Partial mode (continue-on-failure, cross-aggregate, concurrency)
 * - Result tracking (commandType, index, duration, error)
 * - Error handling (thrown errors, empty batch)
 * - Default bounded context filtering
 * - Factory function
 *
 * Mechanical migration from tests/unit/batch/BatchExecutor.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import { BatchExecutor, createBatchExecutor } from "../../../src/batch/BatchExecutor.js";
import type {
  BatchCommand,
  BatchResult,
  BatchSummary,
  CommandExecutor,
} from "../../../src/batch/types.js";
import type { CommandHandlerResult } from "../../../src/orchestration/types.js";
import { toCommandId, toCorrelationId } from "../../../src/ids/index.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Executors
// =============================================================================

function createMockExecutor(
  results: Record<string, CommandHandlerResult<unknown>> = {}
): CommandExecutor {
  return vi.fn(
    async (
      commandType: string,
      _args: unknown,
      options: { commandId: string; correlationId: string }
    ) => {
      if (results[commandType]) {
        return results[commandType];
      }
      return {
        status: "success" as const,
        data: { executed: true },
        version: 1,
        event: {
          eventId: `evt_${options.commandId}`,
          eventType: `${commandType}Completed`,
          streamType: "test",
          streamId: "test_1",
          payload: {},
          metadata: {
            correlationId: options.correlationId,
            causationId: options.commandId,
          },
        },
      };
    }
  ) as unknown as CommandExecutor;
}

function createFailingExecutor(failAfter: number): CommandExecutor {
  let count = 0;
  return vi.fn(
    async (
      commandType: string,
      _args: unknown,
      options: { commandId: string; correlationId: string }
    ) => {
      count++;
      if (count > failAfter) {
        return {
          status: "rejected" as const,
          code: "TEST_FAILURE",
          reason: `Command ${count} failed`,
        };
      }
      return {
        status: "success" as const,
        data: { executed: true, count },
        version: count,
        event: {
          eventId: `evt_${count}`,
          eventType: `${commandType}Completed`,
          streamType: "test",
          streamId: "test_1",
          payload: {},
          metadata: {
            correlationId: options.correlationId,
            causationId: options.commandId,
          },
        },
      };
    }
  ) as unknown as CommandExecutor;
}

// =============================================================================
// Mock Registry
// =============================================================================

const mockRegistry = {
  AddOrderItem: {
    category: "aggregate",
    boundedContext: "orders",
    targetAggregate: { type: "Order", idField: "orderId" },
  },
  RemoveOrderItem: {
    category: "aggregate",
    boundedContext: "orders",
    targetAggregate: { type: "Order", idField: "orderId" },
  },
};

const getRegistration = (type: string) => mockRegistry[type as keyof typeof mockRegistry];

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  executor: CommandExecutor | null;
  batch: BatchExecutor | null;
  commands: BatchCommand[];
  result: BatchResult | null;
  maxObservedConcurrency: number;
  factoryResult: unknown;
}

function createInitialState(): TestState {
  return {
    executor: null,
    batch: null,
    commands: [],
    result: null,
    maxObservedConcurrency: 0,
    factoryResult: null,
  };
}

let state: TestState = createInitialState();

function requireResult(): BatchResult {
  expect(state.result).not.toBeNull();
  return state.result!;
}

function getSummaryValue(field: string): BatchSummary[keyof BatchSummary] {
  const summary = requireResult().summary;
  const key = field as keyof BatchSummary;
  return summary[key];
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/batch/batch-executor.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Atomic Mode
  // ==========================================================================

  Rule(
    "Atomic mode executes commands sequentially and stops on first failure",
    ({ RuleScenario }) => {
      RuleScenario(
        "Executes commands sequentially in atomic mode",
        ({ Given, And, When, Then }) => {
          Given("a mock executor that succeeds for all commands", () => {
            state.executor = createMockExecutor();
          });

          And("a BatchExecutor with the mock executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And('a batch of 3 AddOrderItem commands for order "ord_1"', () => {
            state.commands = [
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_3" } },
            ];
          });

          When('the batch is executed in "atomic" mode with aggregateId "ord_1"', async () => {
            state.result = await state.batch!.execute(state.commands, {
              mode: "atomic",
              aggregateId: "ord_1",
            });
          });

          Then('the batch result status is "success"', () => {
            expect(state.result?.status).toBe("success");
          });

          And("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            for (const row of rows) {
              expect(getSummaryValue(row.field)).toBe(Number(row.value));
            }
          });

          And("the executor was called 3 times", () => {
            expect(state.executor).toHaveBeenCalledTimes(3);
          });
        }
      );

      RuleScenario(
        "Stops on first failure and skips remaining in atomic mode",
        ({ Given, And, When, Then }) => {
          Given("a failing executor that fails after 1 successful command", () => {
            state.executor = createFailingExecutor(1);
          });

          And("a BatchExecutor with the failing executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And('a batch of 3 AddOrderItem commands for order "ord_1"', () => {
            state.commands = [
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_3" } },
            ];
          });

          When('the batch is executed in "atomic" mode with aggregateId "ord_1"', async () => {
            state.result = await state.batch!.execute(state.commands, {
              mode: "atomic",
              aggregateId: "ord_1",
            });
          });

          Then('the batch result status is "failed"', () => {
            expect(state.result?.status).toBe("failed");
          });

          And("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            for (const row of rows) {
              expect(getSummaryValue(row.field)).toBe(Number(row.value));
            }
          });

          And("the executor was called 2 times", () => {
            expect(state.executor).toHaveBeenCalledTimes(2);
          });
        }
      );

      RuleScenario(
        "Rejects batch for cross-aggregate commands in atomic mode",
        ({ Given, And, When, Then }) => {
          Given("a mock executor that succeeds for all commands", () => {
            state.executor = createMockExecutor();
          });

          And("a BatchExecutor with the mock executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And(
            "a batch of AddOrderItem commands targeting different orders:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ orderId: string; productId: string }>(dataTable);
              state.commands = rows.map((r) => ({
                commandType: "AddOrderItem",
                args: { orderId: r.orderId, productId: r.productId },
              }));
            }
          );

          When('the batch is executed in "atomic" mode with aggregateId "ord_1"', async () => {
            state.result = await state.batch!.execute(state.commands, {
              mode: "atomic",
              aggregateId: "ord_1",
            });
          });

          Then('the batch result status is "failed"', () => {
            expect(state.result?.status).toBe("failed");
          });

          And('all batch results have status "rejected"', () => {
            expect(
              state.result?.results.every((r: { status: string }) => r.status === "rejected")
            ).toBe(true);
          });

          And("the executor was not called", () => {
            expect(state.executor).not.toHaveBeenCalled();
          });
        }
      );

      RuleScenario("Uses shared correlationId in atomic mode", ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor and standard registry", () => {
          state.batch = new BatchExecutor({
            executor: state.executor!,
            getRegistration,
          });
        });

        And('a batch of 2 AddOrderItem commands for order "ord_1"', () => {
          state.commands = [
            { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
            { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
          ];
        });

        When(
          'the batch is executed in "atomic" mode with aggregateId "ord_1" and correlationId "batch_corr_123"',
          async () => {
            state.result = await state.batch!.execute(state.commands, {
              mode: "atomic",
              aggregateId: "ord_1",
              correlationId: toCorrelationId("batch_corr_123"),
            });
          }
        );

        Then('the batch correlationId is "batch_corr_123"', () => {
          expect(state.result?.correlationId).toBe("batch_corr_123");
        });

        And('the executor received correlationId "batch_corr_123"', () => {
          expect(state.executor).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ correlationId: "batch_corr_123" })
          );
        });
      });

      RuleScenario(
        "Allows command-level correlationId override in atomic mode",
        ({ Given, And, When, Then }) => {
          Given("a mock executor that succeeds for all commands", () => {
            state.executor = createMockExecutor();
          });

          And("a BatchExecutor with the mock executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And('a batch with command-level correlationId override for order "ord_1"', () => {
            state.commands = [
              {
                commandType: "AddOrderItem",
                args: { orderId: "ord_1", productId: "prod_1" },
                correlationId: toCorrelationId("cmd_corr_1"),
              },
              { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
            ];
          });

          When(
            'the batch is executed in "atomic" mode with aggregateId "ord_1" and correlationId "batch_corr"',
            async () => {
              state.result = await state.batch!.execute(state.commands, {
                mode: "atomic",
                aggregateId: "ord_1",
                correlationId: toCorrelationId("batch_corr"),
              });
            }
          );

          Then('the executor call 1 received correlationId "cmd_corr_1"', () => {
            expect(state.executor).toHaveBeenNthCalledWith(
              1,
              expect.anything(),
              expect.anything(),
              expect.objectContaining({ correlationId: "cmd_corr_1" })
            );
          });

          And('the executor call 2 received correlationId "batch_corr"', () => {
            expect(state.executor).toHaveBeenNthCalledWith(
              2,
              expect.anything(),
              expect.anything(),
              expect.objectContaining({ correlationId: "batch_corr" })
            );
          });
        }
      );
    }
  );

  // ==========================================================================
  // Partial Mode
  // ==========================================================================

  Rule(
    "Partial mode executes all commands regardless of individual failures",
    ({ RuleScenario }) => {
      RuleScenario(
        "Executes all commands even with failures in partial mode",
        ({ Given, And, When, Then }) => {
          Given("a failing executor that fails after 1 successful command", () => {
            state.executor = createFailingExecutor(1);
          });

          And("a BatchExecutor with the failing executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And(
            "a batch of AddOrderItem commands targeting different orders:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ orderId: string; productId: string }>(dataTable);
              state.commands = rows.map((r) => ({
                commandType: "AddOrderItem",
                args: { orderId: r.orderId, productId: r.productId },
              }));
            }
          );

          When('the batch is executed in "partial" mode', async () => {
            state.result = await state.batch!.execute(state.commands, {
              mode: "partial",
            });
          });

          Then('the batch result status is "partial"', () => {
            expect(state.result?.status).toBe("partial");
          });

          And("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            for (const row of rows) {
              expect(getSummaryValue(row.field)).toBe(Number(row.value));
            }
          });

          And("the executor was called 3 times", () => {
            expect(state.executor).toHaveBeenCalledTimes(3);
          });
        }
      );

      RuleScenario(
        "Returns success when all commands succeed in partial mode",
        ({ Given, And, When, Then }) => {
          Given("a mock executor that succeeds for all commands", () => {
            state.executor = createMockExecutor();
          });

          And("a BatchExecutor with the mock executor only", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
            });
          });

          And("a batch of CreateOrder commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ orderId: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: "CreateOrder",
              args: { orderId: r.orderId },
            }));
          });

          When('the batch is executed in "partial" mode', async () => {
            state.result = await state.batch!.execute(state.commands, { mode: "partial" });
          });

          Then('the batch result status is "success"', () => {
            expect(state.result?.status).toBe("success");
          });

          And("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            for (const row of rows) {
              expect(getSummaryValue(row.field)).toBe(Number(row.value));
            }
          });
        }
      );

      RuleScenario(
        "Allows cross-aggregate commands in partial mode",
        ({ Given, And, When, Then }) => {
          Given("a mock executor that succeeds for all commands", () => {
            state.executor = createMockExecutor();
          });

          And("a BatchExecutor with the mock executor and standard registry", () => {
            state.batch = new BatchExecutor({
              executor: state.executor!,
              getRegistration,
            });
          });

          And(
            "a batch of AddOrderItem commands targeting different orders:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ orderId: string; productId: string }>(dataTable);
              state.commands = rows.map((r) => ({
                commandType: "AddOrderItem",
                args: { orderId: r.orderId, productId: r.productId },
              }));
            }
          );

          When('the batch is executed in "partial" mode', async () => {
            state.result = await state.batch!.execute(state.commands, { mode: "partial" });
          });

          Then('the batch result status is "success"', () => {
            expect(state.result?.status).toBe("success");
          });

          And("the executor was called 2 times", () => {
            expect(state.executor).toHaveBeenCalledTimes(2);
          });
        }
      );

      RuleScenario("Respects maxConcurrency in partial mode", ({ Given, And, When, Then }) => {
        Given("a concurrency-tracking executor", () => {
          let currentConcurrency = 0;
          state.maxObservedConcurrency = 0;

          state.executor = vi.fn(
            async (
              _type: string,
              _args: unknown,
              options: { commandId: string; correlationId: string }
            ) => {
              currentConcurrency++;
              state.maxObservedConcurrency = Math.max(
                state.maxObservedConcurrency,
                currentConcurrency
              );

              await new Promise((resolve) => setTimeout(resolve, 10));

              currentConcurrency--;
              return {
                status: "success" as const,
                data: {},
                version: 1,
                event: {
                  eventId: `evt_${options.commandId}`,
                  eventType: "TestCompleted",
                  streamType: "test",
                  streamId: "test_1",
                  payload: {},
                  metadata: {
                    correlationId: options.correlationId,
                    causationId: options.commandId,
                  },
                },
              };
            }
          ) as unknown as CommandExecutor;
        });

        And("a BatchExecutor with the tracking executor", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of 10 generic test commands", () => {
          state.commands = Array.from({ length: 10 }, (_, i) => ({
            commandType: "Test",
            args: {},
            commandId: toCommandId(`cmd_${i}`),
          }));
        });

        When('the batch is executed in "partial" mode with maxConcurrency 3', async () => {
          state.result = await state.batch!.execute(state.commands, {
            mode: "partial",
            maxConcurrency: 3,
          });
        });

        Then("the executor was called 10 times", () => {
          expect(state.executor).toHaveBeenCalledTimes(10);
        });

        And("the maximum observed concurrency was at most 3", () => {
          expect(state.maxObservedConcurrency).toBeLessThanOrEqual(3);
        });
      });

      RuleScenario(
        "Stops on failure when continueOnError is false in partial mode",
        ({ Given, And, When, Then }) => {
          Given("a failing executor that fails after 1 successful command", () => {
            state.executor = createFailingExecutor(1);
          });

          And("a BatchExecutor with the failing executor only", () => {
            state.batch = new BatchExecutor({ executor: state.executor! });
          });

          And("a batch of 3 generic test commands", () => {
            state.commands = [
              { commandType: "Test", args: {}, commandId: toCommandId("cmd_1") },
              { commandType: "Test", args: {}, commandId: toCommandId("cmd_2") },
              { commandType: "Test", args: {}, commandId: toCommandId("cmd_3") },
            ];
          });

          When(
            'the batch is executed in "partial" mode with maxConcurrency 1 and continueOnError false',
            async () => {
              state.result = await state.batch!.execute(state.commands, {
                mode: "partial",
                maxConcurrency: 1,
                continueOnError: false,
              });
            }
          );

          Then('the batch result status is "partial"', () => {
            expect(state.result?.status).toBe("partial");
          });

          And("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            for (const row of rows) {
              expect(getSummaryValue(row.field)).toBe(Number(row.value));
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Result Tracking
  // ==========================================================================

  Rule(
    "BatchExecutor tracks individual command results with type and index",
    ({ RuleScenario }) => {
      RuleScenario("Tracks individual command results", ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of two different command types", () => {
          state.commands = [
            { commandType: "TestA", args: { id: 1 } },
            { commandType: "TestB", args: { id: 2 } },
          ];
        });

        When('the batch is executed in "partial" mode', async () => {
          state.result = await state.batch!.execute(state.commands, { mode: "partial" });
        });

        Then("the batch has 2 results", () => {
          expect(state.result?.results).toHaveLength(2);
        });

        And('result 0 has commandType "TestA" and index 0', () => {
          expect(state.result?.results[0]?.commandType).toBe("TestA");
          expect(state.result?.results[0]?.index).toBe(0);
        });

        And('result 1 has commandType "TestB" and index 1', () => {
          expect(state.result?.results[1]?.commandType).toBe("TestB");
          expect(state.result?.results[1]?.index).toBe(1);
        });
      });

      RuleScenario("Includes duration for each command", ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a single Test command", () => {
          state.commands = [{ commandType: "Test", args: {} }];
        });

        When('the batch is executed in "partial" mode', async () => {
          state.result = await state.batch!.execute(state.commands, { mode: "partial" });
        });

        Then("result 0 has a numeric durationMs", () => {
          expect(state.result?.results[0]?.durationMs).toBeDefined();
          expect(typeof state.result?.results[0]?.durationMs).toBe("number");
        });
      });

      RuleScenario("Includes error message for failed commands", ({ Given, And, When, Then }) => {
        Given('an executor that always rejects with reason "Something went wrong"', () => {
          state.executor = vi.fn(async () => ({
            status: "rejected" as const,
            code: "TEST_ERROR",
            reason: "Something went wrong",
          })) as unknown as CommandExecutor;
        });

        And("a BatchExecutor with the rejecting executor", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a single Test command", () => {
          state.commands = [{ commandType: "Test", args: {} }];
        });

        When('the batch is executed in "partial" mode', async () => {
          state.result = await state.batch!.execute(state.commands, { mode: "partial" });
        });

        Then('result 0 has error "Something went wrong"', () => {
          expect(state.result?.results[0]?.error).toBe("Something went wrong");
        });
      });

      RuleScenario("Calculates correct summary statistics", ({ Given, And, When, Then }) => {
        Given("a failing executor that fails after 2 successful commands", () => {
          state.executor = createFailingExecutor(2);
        });

        And("a BatchExecutor with the failing executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of 5 generic test commands", () => {
          state.commands = Array.from({ length: 5 }, (_, i) => ({
            commandType: "Test",
            args: { id: i },
          }));
        });

        When('the batch is executed in "partial" mode with maxConcurrency 1', async () => {
          state.result = await state.batch!.execute(state.commands, {
            mode: "partial",
            maxConcurrency: 1,
          });
        });

        Then("the batch summary shows:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          for (const row of rows) {
            expect(getSummaryValue(row.field)).toBe(Number(row.value));
          }
        });

        And("the batch summary totalDurationMs is non-negative", () => {
          expect(state.result?.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
        });
      });
    }
  );

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  Rule("BatchExecutor handles executor exceptions gracefully", ({ RuleScenario }) => {
    RuleScenario("Handles executor throwing errors", ({ Given, And, When, Then }) => {
      Given('an executor that throws "Executor crashed"', () => {
        state.executor = vi.fn(async () => {
          throw new Error("Executor crashed");
        }) as unknown as CommandExecutor;
      });

      And("a BatchExecutor with the throwing executor", () => {
        state.batch = new BatchExecutor({ executor: state.executor! });
      });

      And("a single Test command", () => {
        state.commands = [{ commandType: "Test", args: {} }];
      });

      When('the batch is executed in "partial" mode', async () => {
        state.result = await state.batch!.execute(state.commands, { mode: "partial" });
      });

      Then('the batch result status is "failed"', () => {
        expect(state.result?.status).toBe("failed");
      });

      And('result 0 has status "failed"', () => {
        expect(state.result?.results[0]?.status).toBe("failed");
      });

      And('result 0 has error "Executor crashed"', () => {
        expect(state.result?.results[0]?.error).toBe("Executor crashed");
      });
    });

    RuleScenario("Handles empty batch gracefully", ({ Given, And, When, Then }) => {
      Given("a mock executor that succeeds for all commands", () => {
        state.executor = createMockExecutor();
      });

      And("a BatchExecutor with the mock executor only", () => {
        state.batch = new BatchExecutor({ executor: state.executor! });
      });

      When('an empty batch is executed in "partial" mode', async () => {
        state.result = await state.batch!.execute([], { mode: "partial" });
      });

      Then('the batch result status is "failed"', () => {
        expect(state.result?.status).toBe("failed");
      });

      And("the executor was not called", () => {
        expect(state.executor).not.toHaveBeenCalled();
      });
    });

    RuleScenario(
      "Rejects batch exceeding max command count before execution",
      ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of 4 generic test commands", () => {
          state.commands = Array.from({ length: 4 }, (_, i) => ({
            commandType: "Test",
            args: {},
            commandId: toCommandId(`cmd_${i}`),
          }));
        });

        When('the batch is executed in "partial" mode with max batch size 3', async () => {
          state.result = await state.batch!.execute(state.commands, {
            mode: "partial",
            maxBatchSize: 3,
          });
        });

        Then('the batch result status is "failed"', () => {
          expect(state.result?.status).toBe("failed");
        });

        And('all batch results have status "rejected"', () => {
          expect(state.result?.results.every((r) => r.status === "rejected")).toBe(true);
        });

        And("the executor was not called", () => {
          expect(state.executor).not.toHaveBeenCalled();
        });
      }
    );

    RuleScenario("Accepts batch exactly at max command count", ({ Given, And, When, Then }) => {
      Given("a mock executor that succeeds for all commands", () => {
        state.executor = createMockExecutor();
      });

      And("a BatchExecutor with the mock executor only", () => {
        state.batch = new BatchExecutor({ executor: state.executor! });
      });

      And("a batch of 3 generic test commands", () => {
        state.commands = Array.from({ length: 3 }, (_, i) => ({
          commandType: "Test",
          args: {},
          commandId: toCommandId(`cmd_${i}`),
        }));
      });

      When('the batch is executed in "partial" mode with max batch size 3', async () => {
        state.result = await state.batch!.execute(state.commands, {
          mode: "partial",
          maxBatchSize: 3,
        });
      });

      Then('the batch result status is "success"', () => {
        expect(state.result?.status).toBe("success");
      });

      And("the executor was called 3 times", () => {
        expect(state.executor).toHaveBeenCalledTimes(3);
      });
    });

    RuleScenario(
      "Accepts batch exactly at default max command count",
      ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of 100 generic test commands", () => {
          state.commands = Array.from({ length: 100 }, (_, i) => ({
            commandType: "Test",
            args: {},
            commandId: toCommandId(`cmd_${i}`),
          }));
        });

        When('the batch is executed in "partial" mode using default max batch size', async () => {
          state.result = await state.batch!.execute(state.commands, {
            mode: "partial",
          });
        });

        Then('the batch result status is "success"', () => {
          expect(state.result?.status).toBe("success");
        });

        And("the executor was called 100 times", () => {
          expect(state.executor).toHaveBeenCalledTimes(100);
        });
      }
    );

    RuleScenario(
      "Rejects batch exceeding default max command count before execution",
      ({ Given, And, When, Then }) => {
        Given("a mock executor that succeeds for all commands", () => {
          state.executor = createMockExecutor();
        });

        And("a BatchExecutor with the mock executor only", () => {
          state.batch = new BatchExecutor({ executor: state.executor! });
        });

        And("a batch of 101 generic test commands", () => {
          state.commands = Array.from({ length: 101 }, (_, i) => ({
            commandType: "Test",
            args: {},
            commandId: toCommandId(`cmd_${i}`),
          }));
        });

        When('the batch is executed in "partial" mode using default max batch size', async () => {
          state.result = await state.batch!.execute(state.commands, {
            mode: "partial",
          });
        });

        Then('the batch result status is "failed"', () => {
          expect(state.result?.status).toBe("failed");
        });

        And('all batch results have status "rejected"', () => {
          expect(state.result?.results.every((r) => r.status === "rejected")).toBe(true);
        });

        And("the executor was not called", () => {
          expect(state.executor).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Default Bounded Context
  // ==========================================================================

  Rule("Default bounded context filters commands to a single context", ({ RuleScenario }) => {
    RuleScenario("Rejects commands from wrong bounded context", ({ Given, And, When, Then }) => {
      Given("a mock executor that succeeds for all commands", () => {
        state.executor = createMockExecutor();
      });

      And('a BatchExecutor with inventory registry and default bounded context "orders"', () => {
        const getRegWithInventory = (type: string) => {
          if (type === "ReserveStock") {
            return {
              category: "aggregate",
              boundedContext: "inventory",
              targetAggregate: { type: "Stock", idField: "productId" },
            };
          }
          return mockRegistry[type as keyof typeof mockRegistry];
        };

        state.batch = new BatchExecutor({
          executor: state.executor!,
          getRegistration: getRegWithInventory,
          defaultBoundedContext: "orders",
        });
      });

      And("a batch with cross-context commands", () => {
        state.commands = [
          { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
          { commandType: "ReserveStock", args: { productId: "prod_1" } },
        ];
      });

      When('the batch is executed in "partial" mode', async () => {
        state.result = await state.batch!.execute(state.commands, { mode: "partial" });
      });

      Then('the batch result status is "failed"', () => {
        expect(state.result?.status).toBe("failed");
      });

      And('result 1 error contains "validation failed"', () => {
        expect(state.result?.results[1]?.error).toContain("validation failed");
      });

      And("the executor was not called", () => {
        expect(state.executor).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  Rule("createBatchExecutor factory creates BatchExecutor instances", ({ RuleScenario }) => {
    RuleScenario("Creates a BatchExecutor instance via factory", ({ Given, When, Then }) => {
      Given("a mock executor that succeeds for all commands", () => {
        state.executor = createMockExecutor();
      });

      When("createBatchExecutor is called with the mock executor", () => {
        state.factoryResult = createBatchExecutor({ executor: state.executor! });
      });

      Then("the result is a BatchExecutor instance", () => {
        expect(state.factoryResult).toBeInstanceOf(BatchExecutor);
      });
    });
  });
});
