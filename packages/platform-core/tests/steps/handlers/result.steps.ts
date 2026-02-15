/**
 * Handler Result Helpers - Step Definitions
 *
 * BDD step definitions for dual-write command handler result helpers:
 * - successResult: Create success results with event data
 * - rejectedResult: Create rejection results for invariant failures
 * - failedResult: Create failure results that still emit events
 *
 * Mechanical migration from tests/unit/handlers/result.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { successResult, rejectedResult, failedResult } from "../../../src/handlers/result.js";
import type { EventData } from "../../../src/orchestration/types.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestEventData(overrides?: Partial<EventData>): EventData {
  return {
    eventId: "evt_123",
    eventType: "TestEventOccurred",
    streamType: "Test",
    streamId: "test_456",
    payload: { value: 42 },
    metadata: {
      correlationId: "corr_789",
      causationId: "cmd_101",
    },
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  data: Record<string, unknown> | null;
  event: EventData | null;
  version: number;
  successResult: ReturnType<typeof successResult> | null;
  rejectedResult: ReturnType<typeof rejectedResult> | null;
  failedResult: ReturnType<typeof failedResult> | null;
}

function createInitialState(): TestState {
  return {
    data: null,
    event: null,
    version: 0,
    successResult: null,
    rejectedResult: null,
    failedResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/handlers/result.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: successResult creates a success result with status, data, version, and event
  // ==========================================================================

  Rule(
    "successResult creates a success result with status, data, version, and event",
    ({ RuleScenario }) => {
      RuleScenario("Success result has correct structure", ({ Given, When, Then, And }) => {
        Given('a data payload with orderId "order_123" and customerId "cust_456"', () => {
          state.data = { orderId: "order_123", customerId: "cust_456" };
        });

        And("a test event", () => {
          state.event = createTestEventData();
        });

        And("a version number 5", () => {
          state.version = 5;
        });

        When("I create a success result", () => {
          state.successResult = successResult(state.data!, state.version, state.event!);
        });

        Then("the result has all expected fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          for (const row of rows) {
            if (row.field === "status") {
              expect(state.successResult!.status).toBe(row.value);
            } else if (row.field === "version") {
              expect(state.successResult!.version).toBe(Number(row.value));
            } else if (row.field === "orderId") {
              expect((state.successResult!.data as Record<string, unknown>).orderId).toBe(
                row.value
              );
            } else if (row.field === "customerId") {
              expect((state.successResult!.data as Record<string, unknown>).customerId).toBe(
                row.value
              );
            }
          }
        });

        And("the result event matches the test event", () => {
          expect(state.successResult!.event).toEqual(state.event);
        });
      });

      RuleScenario("Success result preserves typed data", ({ Given, And, When, Then }) => {
        Given('a typed data payload with orderId "order_123" and customerId "cust_456"', () => {
          state.data = { orderId: "order_123", customerId: "cust_456" };
        });

        And("a test event", () => {
          state.event = createTestEventData();
        });

        When("I create a success result with version 1", () => {
          state.successResult = successResult(state.data!, 1, state.event!);
        });

        Then("the result data fields are:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          for (const row of rows) {
            expect((state.successResult!.data as Record<string, unknown>)[row.field]).toBe(
              row.value
            );
          }
        });
      });

      RuleScenario(
        "Success result returns status as literal type",
        ({ Given, And, When, Then }) => {
          Given("an empty data payload", () => {
            state.data = {};
          });

          And("a test event", () => {
            state.event = createTestEventData();
          });

          When("I create a success result with version 0", () => {
            state.successResult = successResult(state.data!, 0, state.event!);
          });

          Then('the result status is "success"', () => {
            expect(state.successResult!.status).toBe("success");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: rejectedResult creates a rejection result with code, reason, and optional context
  // ==========================================================================

  Rule(
    "rejectedResult creates a rejection result with code, reason, and optional context",
    ({ RuleScenario }) => {
      RuleScenario("Rejected result has code and reason", ({ When, Then }) => {
        When(
          'I create a rejected result with code "ORDER_NOT_FOUND" and reason "Order not found"',
          () => {
            state.rejectedResult = rejectedResult("ORDER_NOT_FOUND", "Order not found");
          }
        );

        Then("the rejected result has all expected fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          for (const row of rows) {
            if (row.field === "status") {
              expect(state.rejectedResult!.status).toBe(row.value);
            } else if (row.field === "code") {
              expect(state.rejectedResult!.code).toBe(row.value);
            } else if (row.field === "reason") {
              expect(state.rejectedResult!.reason).toBe(row.value);
            }
          }
        });
      });

      RuleScenario("Rejected result includes context when provided", ({ When, Then, And }) => {
        When(
          'I create a rejected result with code "ORDER_NOT_FOUND" and reason "Order not found" and context',
          () => {
            state.rejectedResult = rejectedResult("ORDER_NOT_FOUND", "Order not found", {
              orderId: "order_123",
              searchedAt: Date.now(),
            });
          }
        );

        Then('the rejected result status is "rejected"', () => {
          expect(state.rejectedResult!.status).toBe("rejected");
        });

        And('the rejected result code is "ORDER_NOT_FOUND"', () => {
          expect(state.rejectedResult!.code).toBe("ORDER_NOT_FOUND");
        });

        And('the rejected result context contains orderId "order_123"', () => {
          expect((state.rejectedResult! as Record<string, unknown>).context).toEqual(
            expect.objectContaining({ orderId: "order_123" })
          );
        });

        And("the rejected result context searchedAt is a number", () => {
          const ctx = (state.rejectedResult! as Record<string, unknown>).context as Record<
            string,
            unknown
          >;
          expect(ctx.searchedAt).toEqual(expect.any(Number));
        });
      });

      RuleScenario("Rejected result omits context when not provided", ({ When, Then }) => {
        When(
          'I create a rejected result with code "VALIDATION_ERROR" and reason "Invalid input"',
          () => {
            state.rejectedResult = rejectedResult("VALIDATION_ERROR", "Invalid input");
          }
        );

        Then("the rejected result does not have a context property", () => {
          expect("context" in state.rejectedResult!).toBe(false);
        });
      });

      RuleScenario("Rejected result returns status as literal type", ({ When, Then }) => {
        When('I create a rejected result with code "ERROR" and reason "message"', () => {
          state.rejectedResult = rejectedResult("ERROR", "message");
        });

        Then('the rejected result status is "rejected"', () => {
          expect(state.rejectedResult!.status).toBe("rejected");
        });
      });
    }
  );

  // ==========================================================================
  // Rule: failedResult creates a failure result with event data and optional fields
  // ==========================================================================

  Rule(
    "failedResult creates a failure result with event data and optional fields",
    ({ RuleScenario }) => {
      RuleScenario("Failed result has event data", ({ Given, When, Then, And }) => {
        Given('a test event with eventType "ReservationFailed"', () => {
          state.event = createTestEventData({
            eventType: "ReservationFailed",
          });
        });

        When('I create a failed result with reason "Insufficient stock"', () => {
          state.failedResult = failedResult("Insufficient stock", state.event!);
        });

        Then("the failed result has all expected fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          for (const row of rows) {
            if (row.field === "status") {
              expect(state.failedResult!.status).toBe(row.value);
            } else if (row.field === "reason") {
              expect(state.failedResult!.reason).toBe(row.value);
            }
          }
        });

        And("the failed result event matches the test event", () => {
          expect(state.failedResult!.event).toEqual(state.event);
        });
      });

      RuleScenario(
        "Failed result includes expectedVersion when provided",
        ({ Given, When, Then, And }) => {
          Given("a test event", () => {
            state.event = createTestEventData();
          });

          When(
            'I create a failed result with reason "Operation failed" and expectedVersion 10',
            () => {
              state.failedResult = failedResult("Operation failed", state.event!, 10);
            }
          );

          Then('the failed result status is "failed"', () => {
            expect(state.failedResult!.status).toBe("failed");
          });

          And("the failed result expectedVersion is 10", () => {
            expect((state.failedResult! as Record<string, unknown>).expectedVersion).toBe(10);
          });
        }
      );

      RuleScenario("Failed result includes context when provided", ({ Given, When, Then }) => {
        Given("a test event", () => {
          state.event = createTestEventData();
        });

        When('I create a failed result with reason "Operation failed" and context', () => {
          state.failedResult = failedResult("Operation failed", state.event!, undefined, {
            attemptedQuantity: 100,
            availableStock: 50,
          });
        });

        Then("the failed result context is:", (_ctx: unknown, dataTable: unknown) => {
          // DataTable declares expected fields; assert directly
          void dataTable;
          expect((state.failedResult! as Record<string, unknown>).context).toEqual({
            attemptedQuantity: 100,
            availableStock: 50,
          });
        });
      });

      RuleScenario(
        "Failed result includes both expectedVersion and context",
        ({ Given, When, Then, And }) => {
          Given("a test event", () => {
            state.event = createTestEventData();
          });

          When(
            'I create a failed result with reason "Operation failed" and expectedVersion 5 and context',
            () => {
              state.failedResult = failedResult("Operation failed", state.event!, 5, {
                detail: "extra info",
              });
            }
          );

          Then("the failed result expectedVersion is 5", () => {
            expect((state.failedResult! as Record<string, unknown>).expectedVersion).toBe(5);
          });

          And('the failed result context contains detail "extra info"', () => {
            expect((state.failedResult! as Record<string, unknown>).context).toEqual({
              detail: "extra info",
            });
          });
        }
      );

      RuleScenario(
        "Failed result omits optional properties when not provided",
        ({ Given, When, Then, And }) => {
          Given("a test event", () => {
            state.event = createTestEventData();
          });

          When('I create a failed result with reason "Simple failure"', () => {
            state.failedResult = failedResult("Simple failure", state.event!);
          });

          Then("the failed result does not have expectedVersion property", () => {
            expect("expectedVersion" in state.failedResult!).toBe(false);
          });

          And("the failed result does not have context property", () => {
            expect("context" in state.failedResult!).toBe(false);
          });
        }
      );

      RuleScenario("Failed result returns status as literal type", ({ Given, When, Then }) => {
        Given("a test event", () => {
          state.event = createTestEventData();
        });

        When('I create a failed result with reason "message"', () => {
          state.failedResult = failedResult("message", state.event!);
        });

        Then('the failed result status is "failed"', () => {
          expect(state.failedResult!.status).toBe("failed");
        });
      });
    }
  );
});
