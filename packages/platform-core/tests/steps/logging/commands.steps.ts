/**
 * Command Logging Helpers - Step Definitions
 *
 * BDD step definitions for command logging helpers:
 * - logCommandStart
 * - logCommandSuccess
 * - logCommandRejected
 * - logCommandFailed
 * - logCommandError
 * - Integration lifecycle patterns
 *
 * Mechanical migration from tests/unit/logging/commands.test.ts
 *
 * NOTE: vitest-cucumber v6 step callbacks receive (ctx: TestContext, ...params)
 * where ctx is the vitest test context and DataTables come as subsequent params.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createMockLogger } from "../../../src/logging/testing.js";
import {
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandFailed,
  logCommandError,
  type BaseCommandLogContext,
} from "../../../src/logging/commands.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockLogger: ReturnType<typeof createMockLogger>;
  baseContext: BaseCommandLogContext;
  extendedContext: BaseCommandLogContext | null;
}

let state: TestState;

function resetState(): void {
  const mockLogger = createMockLogger();
  state = {
    mockLogger,
    baseContext: {
      commandType: "CreateOrder",
      commandId: "cmd-123",
      correlationId: "corr-456",
      orderId: "order-789",
    },
    extendedContext: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/logging/commands.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  // ==========================================================================
  // Rule: logCommandStart logs at INFO level with full context
  // ==========================================================================

  Rule("logCommandStart logs at INFO level with full context", ({ RuleScenario }) => {
    RuleScenario("Command start is logged at INFO level", ({ Given, When, Then, And }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When("I call logCommandStart", () => {
        logCommandStart(state.mockLogger, state.baseContext);
      });

      Then('the log has 1 entry at level "INFO" with message "Command started"', () => {
        expect(state.mockLogger.calls).toHaveLength(1);
        expect(state.mockLogger.calls[0].level).toBe("INFO");
        expect(state.mockLogger.calls[0].message).toBe("Command started");
      });

      And("the log data equals the base context", () => {
        expect(state.mockLogger.calls[0].data).toEqual(state.baseContext);
      });
    });

    RuleScenario(
      "Entity-specific fields are included in start log data",
      ({ Given, When, Then }) => {
        Given("a base command log context with extra fields", () => {
          state.extendedContext = {
            ...state.baseContext,
            customerId: "cust-111",
            amount: 100.5,
          };
        });

        When("I call logCommandStart with the extended context", () => {
          logCommandStart(state.mockLogger, state.extendedContext!);
        });

        Then("the log data equals the extended context", () => {
          expect(state.mockLogger.calls[0].data).toEqual(state.extendedContext);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: logCommandSuccess logs at INFO level with version and eventType
  // ==========================================================================

  Rule("logCommandSuccess logs at INFO level with version and eventType", ({ RuleScenario }) => {
    RuleScenario("Command success is logged at INFO level with result", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When('I call logCommandSuccess with version 1 and eventType "OrderCreated"', () => {
        logCommandSuccess(state.mockLogger, state.baseContext, {
          version: 1,
          eventType: "OrderCreated",
        });
      });

      Then(
        "the success log data equals the base context merged with:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const expected: Record<string, unknown> = { ...state.baseContext };
          for (const row of rows) {
            expected[row.field] = isNaN(Number(row.value)) ? row.value : Number(row.value);
          }
          expect(state.mockLogger.calls).toHaveLength(1);
          expect(state.mockLogger.calls[0].level).toBe("INFO");
          expect(state.mockLogger.calls[0].message).toBe("Command succeeded");
          expect(state.mockLogger.calls[0].data).toEqual(expected);
        }
      );
    });

    RuleScenario(
      "Context fields are preserved alongside result fields",
      ({ Given, When, Then }) => {
        Given("a base command log context", () => {
          // Already set in resetState
        });

        When('I call logCommandSuccess with version 5 and eventType "OrderConfirmed"', () => {
          logCommandSuccess(state.mockLogger, state.baseContext, {
            version: 5,
            eventType: "OrderConfirmed",
          });
        });

        Then("the log data has all expected properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          const data = state.mockLogger.calls[0].data;
          for (const row of rows) {
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(data).toHaveProperty(row.property, expected);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: logCommandRejected logs at WARN level with rejection details
  // ==========================================================================

  Rule("logCommandRejected logs at WARN level with rejection details", ({ RuleScenario }) => {
    RuleScenario("Command rejection is logged at WARN level", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When(
        'I call logCommandRejected with code "INVALID_STATE" and message "Order already confirmed"',
        () => {
          logCommandRejected(state.mockLogger, state.baseContext, {
            code: "INVALID_STATE",
            message: "Order already confirmed",
          });
        }
      );

      Then(
        "the rejection log data equals the base context merged with:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const expected: Record<string, unknown> = { ...state.baseContext };
          for (const row of rows) {
            expected[row.field] = row.value;
          }
          expect(state.mockLogger.calls).toHaveLength(1);
          expect(state.mockLogger.calls[0].level).toBe("WARN");
          expect(state.mockLogger.calls[0].message).toBe("Command rejected");
          expect(state.mockLogger.calls[0].data).toEqual(expected);
        }
      );
    });

    RuleScenario(
      "Rejection uses prefixed field names not raw code/message",
      ({ Given, When, Then, And }) => {
        Given("a base command log context", () => {
          // Already set in resetState
        });

        When(
          'I call logCommandRejected with code "DUPLICATE" and message "Order ID already exists"',
          () => {
            logCommandRejected(state.mockLogger, state.baseContext, {
              code: "DUPLICATE",
              message: "Order ID already exists",
            });
          }
        );

        Then("the log data has expected properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          const data = state.mockLogger.calls[0].data;
          for (const row of rows) {
            expect(data).toHaveProperty(row.property, row.value);
          }
        });

        And("the log data does not have properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string }>(dataTable);
          const data = state.mockLogger.calls[0].data;
          for (const row of rows) {
            expect(data).not.toHaveProperty(row.property);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: logCommandFailed logs business failures at WARN level
  // ==========================================================================

  Rule("logCommandFailed logs business failures at WARN level", ({ RuleScenario }) => {
    RuleScenario("Business failure is logged at WARN level", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When(
        'I call logCommandFailed with eventType "ReservationFailed" and reason "Insufficient stock"',
        () => {
          logCommandFailed(state.mockLogger, state.baseContext, {
            eventType: "ReservationFailed",
            reason: "Insufficient stock",
          });
        }
      );

      Then(
        "the failure log data equals the base context merged with:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const expected: Record<string, unknown> = { ...state.baseContext };
          for (const row of rows) {
            expected[row.field] = row.value;
          }
          expect(state.mockLogger.calls).toHaveLength(1);
          expect(state.mockLogger.calls[0].level).toBe("WARN");
          expect(state.mockLogger.calls[0].message).toBe("Command failed (business)");
          expect(state.mockLogger.calls[0].data).toEqual(expected);
        }
      );
    });

    RuleScenario("Business failure uses failureReason not reason", ({ Given, When, Then, And }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When(
        'I call logCommandFailed with eventType "PaymentFailed" and reason "Card declined"',
        () => {
          logCommandFailed(state.mockLogger, state.baseContext, {
            eventType: "PaymentFailed",
            reason: "Card declined",
          });
        }
      );

      Then('the log data has failureReason "Card declined"', () => {
        expect(state.mockLogger.calls[0].data).toHaveProperty("failureReason", "Card declined");
      });

      And('the log data does not have property "reason"', () => {
        expect(state.mockLogger.calls[0].data).not.toHaveProperty("reason");
      });
    });
  });

  // ==========================================================================
  // Rule: logCommandError logs unexpected errors at ERROR level
  // ==========================================================================

  Rule("logCommandError logs unexpected errors at ERROR level", ({ RuleScenario }) => {
    RuleScenario(
      "Error object is logged at ERROR level with message and stack",
      ({ Given, When, Then, And }) => {
        Given("a base command log context", () => {
          // Already set in resetState
        });

        When('I call logCommandError with an Error "Database connection failed"', () => {
          logCommandError(
            state.mockLogger,
            state.baseContext,
            new Error("Database connection failed")
          );
        });

        Then('the log has 1 entry at level "ERROR" with message "Command failed"', () => {
          expect(state.mockLogger.calls).toHaveLength(1);
          expect(state.mockLogger.calls[0].level).toBe("ERROR");
          expect(state.mockLogger.calls[0].message).toBe("Command failed");
        });

        And('the log error data has message "Database connection failed"', () => {
          const data = state.mockLogger.calls[0].data as Record<string, unknown>;
          const errorData = data?.["error"] as {
            message: string;
            stack?: string;
          };
          expect(errorData).toMatchObject({
            message: "Database connection failed",
          });
        });

        And('the log error data has a stack trace containing "Database connection failed"', () => {
          const data = state.mockLogger.calls[0].data as Record<string, unknown>;
          const errorData = data?.["error"] as {
            message: string;
            stack?: string;
          };
          expect(errorData.stack).toContain("Database connection failed");
        });
      }
    );

    RuleScenario("String error is logged directly", ({ Given, When, Then, And }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When('I call logCommandError with string "Something went wrong"', () => {
        logCommandError(state.mockLogger, state.baseContext, "Something went wrong");
      });

      Then('the log has 1 entry at level "ERROR" with message "Command failed"', () => {
        expect(state.mockLogger.calls).toHaveLength(1);
        expect(state.mockLogger.calls[0].level).toBe("ERROR");
        expect(state.mockLogger.calls[0].message).toBe("Command failed");
      });

      And('the log data error field equals "Something went wrong"', () => {
        expect(state.mockLogger.calls[0].data).toEqual({
          ...state.baseContext,
          error: "Something went wrong",
        });
      });
    });

    RuleScenario("Non-string non-Error values are stringified", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When("I call logCommandError with a plain object", () => {
        logCommandError(state.mockLogger, state.baseContext, {
          custom: "error object",
        });
      });

      Then('the log data error field equals "[object Object]"', () => {
        expect(state.mockLogger.calls[0].data).toHaveProperty("error", "[object Object]");
      });
    });

    RuleScenario("Null error is stringified", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When("I call logCommandError with null", () => {
        logCommandError(state.mockLogger, state.baseContext, null);
      });

      Then('the log data error field equals "null"', () => {
        expect(state.mockLogger.calls[0].data).toHaveProperty("error", "null");
      });
    });

    RuleScenario("Undefined error is stringified", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When("I call logCommandError with undefined", () => {
        logCommandError(state.mockLogger, state.baseContext, undefined);
      });

      Then('the log data error field equals "undefined"', () => {
        expect(state.mockLogger.calls[0].data).toHaveProperty("error", "undefined");
      });
    });

    RuleScenario("Stack trace is preserved for debugging", ({ Given, When, Then }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When('I call logCommandError with an Error "Test error"', () => {
        logCommandError(state.mockLogger, state.baseContext, new Error("Test error"));
      });

      Then('the log error data has a stack trace containing "Test error"', () => {
        const data = state.mockLogger.calls[0].data as Record<string, unknown>;
        const errorData = data?.["error"] as {
          message: string;
          stack?: string;
        };
        expect(errorData).toHaveProperty("stack");
        expect(errorData.stack).toContain("Test error");
      });
    });
  });

  // ==========================================================================
  // Rule: Command lifecycle can be traced through sequential log entries
  // ==========================================================================

  Rule("Command lifecycle can be traced through sequential log entries", ({ RuleScenario }) => {
    RuleScenario(
      "Full success lifecycle produces start and success logs",
      ({ Given, When, Then }) => {
        Given("a base command log context", () => {
          // Already set in resetState
        });

        When("I log a full success lifecycle", () => {
          logCommandStart(state.mockLogger, state.baseContext);
          logCommandSuccess(state.mockLogger, state.baseContext, {
            version: 1,
            eventType: "OrderCreated",
          });
        });

        Then("there are 2 log entries with messages:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ message: string }>(dataTable);
          expect(state.mockLogger.calls).toHaveLength(2);
          for (let i = 0; i < rows.length; i++) {
            expect(state.mockLogger.calls[i].message).toBe(rows[i].message);
          }
        });
      }
    );

    RuleScenario(
      "Rejection lifecycle produces INFO and WARN logs",
      ({ Given, When, Then, And }) => {
        Given("a base command log context", () => {
          // Already set in resetState
        });

        When("I log a rejection lifecycle", () => {
          logCommandStart(state.mockLogger, state.baseContext);
          logCommandRejected(state.mockLogger, state.baseContext, {
            code: "INVALID_STATE",
            message: "Cannot modify confirmed order",
          });
        });

        Then("there are 2 log entries", () => {
          expect(state.mockLogger.calls).toHaveLength(2);
        });

        And("the log level counts are:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ level: string; count: string }>(dataTable);
          for (const row of rows) {
            expect(
              state.mockLogger.getCallsAtLevel(row.level as "INFO" | "WARN" | "ERROR")
            ).toHaveLength(parseInt(row.count, 10));
          }
        });
      }
    );

    RuleScenario("Error lifecycle produces INFO and ERROR logs", ({ Given, When, Then, And }) => {
      Given("a base command log context", () => {
        // Already set in resetState
      });

      When("I log an error lifecycle", () => {
        logCommandStart(state.mockLogger, state.baseContext);
        logCommandError(state.mockLogger, state.baseContext, new Error("Unexpected failure"));
      });

      Then("there are 2 log entries", () => {
        expect(state.mockLogger.calls).toHaveLength(2);
      });

      And("the log level counts are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ level: string; count: string }>(dataTable);
        for (const row of rows) {
          expect(
            state.mockLogger.getCallsAtLevel(row.level as "INFO" | "WARN" | "ERROR")
          ).toHaveLength(parseInt(row.count, 10));
        }
      });
    });
  });
});
