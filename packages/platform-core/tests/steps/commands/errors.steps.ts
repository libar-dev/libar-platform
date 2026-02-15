/**
 * Command Errors - Step Definitions
 *
 * BDD step definitions for command error categorization and recovery:
 * - Error categories and constants
 * - CommandError creation and serialization
 * - Factory functions (CommandErrors.*)
 * - Recovery helpers (isRecoverableError, getRetryDelay)
 *
 * Mechanical migration from tests/unit/commands/errors.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  ErrorCategory,
  ERROR_CATEGORIES,
  isErrorCategory,
  CommandError,
  CommandErrors,
  isCommandErrorOfCategory,
  isRecoverableError,
  getRetryDelay,
} from "../../../src/commands/errors.js";

import { getDataTableRows } from "../_helpers/data-table.js";

/**
 * Convert a DataTable value + type to the actual JS value.
 */
function coerceValue(value: string, type: string): unknown {
  switch (type) {
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "number":
      return Number(value);
    case "string":
    default:
      return value;
  }
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  error: CommandError | null;
  wrappedError: CommandError | null;
  originalError: CommandError | null;
  regularError: Error | null;
  json: Record<string, unknown> | null;
  isErrorCategoryResults: Array<{ input: unknown; result: boolean }>;
  factoryError: CommandError | null;
  retryDelay: number;
}

function createInitialState(): TestState {
  return {
    error: null,
    wrappedError: null,
    originalError: null,
    regularError: null,
    json: null,
    isErrorCategoryResults: [],
    factoryError: null,
    retryDelay: 0,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/commands/errors.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // ERROR_CATEGORIES Constant
  // ==========================================================================

  Rule("ERROR_CATEGORIES contains all four error categories", ({ RuleScenario }) => {
    RuleScenario(
      "ERROR_CATEGORIES has exactly four entries with correct values",
      ({ Given, Then, And }) => {
        Given("the ERROR_CATEGORIES constant", () => {
          // No setup needed — constant is imported
        });

        Then("it has length 4", () => {
          expect(ERROR_CATEGORIES).toHaveLength(4);
        });

        And("it contains all categories:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ category: string }>(dataTable);
          for (const row of rows) {
            expect(ERROR_CATEGORIES).toContain(row.category);
          }
        });
      }
    );
  });

  // ==========================================================================
  // ErrorCategory Enum
  // ==========================================================================

  Rule("ErrorCategory enum maps to correct string values", ({ RuleScenario }) => {
    RuleScenario("ErrorCategory members have correct string values", ({ Then }) => {
      Then("the ErrorCategory enum values are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ member: string; value: string }>(dataTable);
        const enumMap: Record<string, string> = {
          DOMAIN: ErrorCategory.DOMAIN,
          VALIDATION: ErrorCategory.VALIDATION,
          CONCURRENCY: ErrorCategory.CONCURRENCY,
          INFRASTRUCTURE: ErrorCategory.INFRASTRUCTURE,
        };
        for (const row of rows) {
          expect(enumMap[row.member]).toBe(row.value);
        }
      });
    });
  });

  // ==========================================================================
  // isErrorCategory Type Guard
  // ==========================================================================

  Rule("isErrorCategory returns true only for valid category strings", ({ RuleScenario }) => {
    RuleScenario("Type guard accepts valid error categories", ({ When, Then }) => {
      When("isErrorCategory is called with valid values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        state.isErrorCategoryResults = rows.map((row) => ({
          input: row.value,
          result: isErrorCategory(row.value),
        }));
      });

      Then("each isErrorCategory call returns true", () => {
        for (const row of state.isErrorCategoryResults) {
          expect(row.result).toBe(true);
        }
      });
    });

    RuleScenario("Type guard rejects invalid values", ({ When, Then }) => {
      When("isErrorCategory is called with invalid values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
        state.isErrorCategoryResults = rows.map((row) => {
          const actual = coerceValue(row.value, row.type);
          return { input: actual, result: isErrorCategory(actual) };
        });
      });

      Then("each isErrorCategory call returns false", () => {
        for (const row of state.isErrorCategoryResults) {
          expect(row.result).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // CommandError Constructor
  // ==========================================================================

  Rule("CommandError constructor creates error with all properties", ({ RuleScenario }) => {
    RuleScenario("CommandError is created with all properties", ({ When, Then, And }) => {
      When(
        'a CommandError is created with category "domain", code "ORDER_NOT_FOUND", message "Order was not found", recoverable false, and context orderId "123"',
        () => {
          state.error = new CommandError(
            ErrorCategory.DOMAIN,
            "ORDER_NOT_FOUND",
            "Order was not found",
            false,
            { orderId: "123" }
          );
        }
      );

      Then("the error has all expected properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
        for (const row of rows) {
          const actual = (state.error as unknown as Record<string, unknown>)[row.property];
          if (row.value === "false") {
            expect(actual).toBe(false);
          } else {
            expect(actual).toBe(row.value);
          }
        }
      });

      And('the error context has orderId "123"', () => {
        expect(state.error!.context).toEqual({ orderId: "123" });
      });
    });
  });

  Rule("CommandError extends Error", ({ RuleScenario }) => {
    RuleScenario("CommandError is an instance of Error", ({ When, Then }) => {
      When(
        'a CommandError is created with category "domain", code "TEST", and message "test message"',
        () => {
          state.error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test message", false);
        }
      );

      Then("it is an instance of Error", () => {
        expect(state.error).toBeInstanceOf(Error);
      });
    });
  });

  // ==========================================================================
  // CommandError.from Static Method
  // ==========================================================================

  Rule("CommandError.from returns CommandError instances unchanged", ({ RuleScenario }) => {
    RuleScenario(
      "CommandError.from returns existing CommandError unchanged",
      ({ Given, When, Then }) => {
        Given('a CommandError with category "domain", code "TEST", and message "test"', () => {
          state.originalError = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
        });

        When("CommandError.from is called with that error", () => {
          state.wrappedError = CommandError.from(state.originalError!);
        });

        Then("the result is the same reference as the original", () => {
          expect(state.wrappedError).toBe(state.originalError);
        });
      }
    );
  });

  Rule(
    "CommandError.from wraps non-CommandError values as infrastructure errors",
    ({ RuleScenario }) => {
      RuleScenario("CommandError.from wraps a regular Error", ({ When, Then, And }) => {
        When(
          'CommandError.from is called with a regular Error "Something went wrong" and code "WRAPPED_ERROR"',
          () => {
            const original = new Error("Something went wrong");
            state.wrappedError = CommandError.from(original, "WRAPPED_ERROR");
          }
        );

        Then(
          'the wrapped error has category "infra", code "WRAPPED_ERROR", message "Something went wrong", and is recoverable',
          () => {
            expect(state.wrappedError!.category).toBe(ErrorCategory.INFRASTRUCTURE);
            expect(state.wrappedError!.code).toBe("WRAPPED_ERROR");
            expect(state.wrappedError!.message).toBe("Something went wrong");
            expect(state.wrappedError!.recoverable).toBe(true);
          }
        );

        And('the wrapped error context has originalError "Error"', () => {
          expect(state.wrappedError!.context?.originalError).toBe("Error");
        });
      });

      RuleScenario("CommandError.from wraps a string value", ({ When, Then }) => {
        When('CommandError.from is called with string "string error"', () => {
          state.wrappedError = CommandError.from("string error");
        });

        Then('the wrapped error has category "infra" and message "string error"', () => {
          expect(state.wrappedError!.category).toBe(ErrorCategory.INFRASTRUCTURE);
          expect(state.wrappedError!.message).toBe("string error");
        });
      });

      RuleScenario("CommandError.from wraps an unknown value", ({ When, Then }) => {
        When("CommandError.from is called with number 123", () => {
          state.wrappedError = CommandError.from(123);
        });

        Then('the wrapped error has message "123"', () => {
          expect(state.wrappedError!.message).toBe("123");
        });
      });
    }
  );

  // ==========================================================================
  // CommandError.toJSON
  // ==========================================================================

  Rule("CommandError.toJSON serializes to a plain object", ({ RuleScenario }) => {
    RuleScenario("toJSON serializes error with context", ({ Given, When, Then, And }) => {
      Given(
        'a CommandError with category "domain", code "ORDER_NOT_FOUND", message "Order was not found", recoverable false, and context orderId "123"',
        () => {
          state.error = new CommandError(
            ErrorCategory.DOMAIN,
            "ORDER_NOT_FOUND",
            "Order was not found",
            false,
            { orderId: "123" }
          );
        }
      );

      When("toJSON is called", () => {
        state.json = state.error!.toJSON();
      });

      Then("the JSON contains all properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
        for (const row of rows) {
          const actual = state.json![row.property];
          if (row.value === "false") {
            expect(actual).toBe(false);
          } else {
            expect(actual).toBe(row.value);
          }
        }
      });

      And('the JSON context has orderId "123"', () => {
        expect(state.json!.context).toEqual({ orderId: "123" });
      });
    });

    RuleScenario("toJSON handles undefined context", ({ Given, When, Then }) => {
      Given(
        'a CommandError with category "domain", code "TEST", message "test", and no context',
        () => {
          state.error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
        }
      );

      When("toJSON is called on it", () => {
        state.json = state.error!.toJSON();
      });

      Then("the JSON context is undefined", () => {
        expect(state.json!.context).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // CommandErrors Factory Functions
  // ==========================================================================

  Rule("CommandErrors.domain creates non-recoverable domain errors", ({ RuleScenario }) => {
    RuleScenario("Factory creates domain error", ({ When, Then }) => {
      When(
        'CommandErrors.domain is called with code "ORDER_ALREADY_SUBMITTED" and message "Order has already been submitted"',
        () => {
          state.factoryError = CommandErrors.domain(
            "ORDER_ALREADY_SUBMITTED",
            "Order has already been submitted"
          );
        }
      );

      Then(
        'the factory error has category "domain", code "ORDER_ALREADY_SUBMITTED", and is not recoverable',
        () => {
          expect(state.factoryError!.category).toBe(ErrorCategory.DOMAIN);
          expect(state.factoryError!.code).toBe("ORDER_ALREADY_SUBMITTED");
          expect(state.factoryError!.recoverable).toBe(false);
        }
      );
    });
  });

  Rule("CommandErrors.validation creates non-recoverable validation errors", ({ RuleScenario }) => {
    RuleScenario("Factory creates validation error", ({ When, Then }) => {
      When(
        'CommandErrors.validation is called with code "INVALID_EMAIL" and message "Email format is invalid"',
        () => {
          state.factoryError = CommandErrors.validation("INVALID_EMAIL", "Email format is invalid");
        }
      );

      Then('the factory error has category "validation" and is not recoverable', () => {
        expect(state.factoryError!.category).toBe(ErrorCategory.VALIDATION);
        expect(state.factoryError!.recoverable).toBe(false);
      });
    });
  });

  Rule("CommandErrors.concurrency creates recoverable concurrency errors", ({ RuleScenario }) => {
    RuleScenario("Factory creates concurrency error", ({ When, Then }) => {
      When(
        'CommandErrors.concurrency is called with code "VERSION_CONFLICT" and message "Resource was modified by another request"',
        () => {
          state.factoryError = CommandErrors.concurrency(
            "VERSION_CONFLICT",
            "Resource was modified by another request"
          );
        }
      );

      Then('the factory error has category "concurrency" and is recoverable', () => {
        expect(state.factoryError!.category).toBe(ErrorCategory.CONCURRENCY);
        expect(state.factoryError!.recoverable).toBe(true);
      });
    });
  });

  Rule(
    "CommandErrors.infrastructure creates recoverable infrastructure errors",
    ({ RuleScenario }) => {
      RuleScenario("Factory creates infrastructure error", ({ When, Then }) => {
        When(
          'CommandErrors.infrastructure is called with code "DATABASE_UNAVAILABLE" and message "Database connection failed"',
          () => {
            state.factoryError = CommandErrors.infrastructure(
              "DATABASE_UNAVAILABLE",
              "Database connection failed"
            );
          }
        );

        Then('the factory error has category "infra" and is recoverable', () => {
          expect(state.factoryError!.category).toBe(ErrorCategory.INFRASTRUCTURE);
          expect(state.factoryError!.recoverable).toBe(true);
        });
      });
    }
  );

  Rule(
    "CommandErrors.notFound creates domain errors with formatted messages",
    ({ RuleScenario }) => {
      RuleScenario("Factory creates not found error", ({ When, Then, And }) => {
        When('CommandErrors.notFound is called with entity "Order" and id "ord_123"', () => {
          state.factoryError = CommandErrors.notFound("Order", "ord_123");
        });

        Then(
          'the error has code "ORDER_NOT_FOUND" and message \'Order with ID "ord_123" was not found\'',
          () => {
            expect(state.factoryError!.code).toBe("ORDER_NOT_FOUND");
            expect(state.factoryError!.message).toBe('Order with ID "ord_123" was not found');
          }
        );

        And(
          'the error has category "domain" and context entityType "Order" and entityId "ord_123"',
          () => {
            expect(state.factoryError!.category).toBe(ErrorCategory.DOMAIN);
            expect(state.factoryError!.context).toEqual({
              entityType: "Order",
              entityId: "ord_123",
            });
          }
        );
      });
    }
  );

  Rule(
    "CommandErrors.alreadyExists creates domain errors with formatted messages",
    ({ RuleScenario }) => {
      RuleScenario("Factory creates already exists error", ({ When, Then }) => {
        When('CommandErrors.alreadyExists is called with entity "Order" and id "ord_123"', () => {
          state.factoryError = CommandErrors.alreadyExists("Order", "ord_123");
        });

        Then(
          'the error has code "ORDER_ALREADY_EXISTS" and message \'Order with ID "ord_123" already exists\'',
          () => {
            expect(state.factoryError!.code).toBe("ORDER_ALREADY_EXISTS");
            expect(state.factoryError!.message).toBe('Order with ID "ord_123" already exists');
          }
        );
      });
    }
  );

  Rule("CommandErrors.invalidState creates domain errors with state info", ({ RuleScenario }) => {
    RuleScenario("Factory creates invalid state error", ({ When, Then, And }) => {
      When(
        'CommandErrors.invalidState is called with entity "Order", current "draft", and required "submitted"',
        () => {
          state.factoryError = CommandErrors.invalidState("Order", "draft", "submitted");
        }
      );

      Then(
        'the error has code "INVALID_ORDER_STATE" and message \'Order is in "draft" state but "submitted" is required\'',
        () => {
          expect(state.factoryError!.code).toBe("INVALID_ORDER_STATE");
          expect(state.factoryError!.message).toBe(
            'Order is in "draft" state but "submitted" is required'
          );
        }
      );

      And(
        'the error context has entityType "Order", currentState "draft", and requiredState "submitted"',
        () => {
          expect(state.factoryError!.context).toEqual({
            entityType: "Order",
            currentState: "draft",
            requiredState: "submitted",
          });
        }
      );
    });
  });

  Rule(
    "CommandErrors.unauthorized creates domain errors for denied actions",
    ({ RuleScenario }) => {
      RuleScenario("Factory creates unauthorized error", ({ When, Then }) => {
        When('CommandErrors.unauthorized is called with action "delete order"', () => {
          state.factoryError = CommandErrors.unauthorized("delete order");
        });

        Then(
          'the error has code "UNAUTHORIZED" and message "Not authorized to perform action: delete order"',
          () => {
            expect(state.factoryError!.code).toBe("UNAUTHORIZED");
            expect(state.factoryError!.message).toBe(
              "Not authorized to perform action: delete order"
            );
          }
        );
      });
    }
  );

  Rule(
    "CommandErrors.rateLimited creates recoverable infrastructure errors with retry info",
    ({ RuleScenario }) => {
      RuleScenario("Factory creates rate limited error", ({ When, Then }) => {
        When("CommandErrors.rateLimited is called with retryAfterMs 5000", () => {
          state.factoryError = CommandErrors.rateLimited(5000);
        });

        Then(
          'the error has code "RATE_LIMITED", category "infra", is recoverable, and context retryAfterMs 5000',
          () => {
            expect(state.factoryError!.code).toBe("RATE_LIMITED");
            expect(state.factoryError!.category).toBe(ErrorCategory.INFRASTRUCTURE);
            expect(state.factoryError!.recoverable).toBe(true);
            expect(state.factoryError!.context?.retryAfterMs).toBe(5000);
          }
        );
      });
    }
  );

  // ==========================================================================
  // isCommandErrorOfCategory
  // ==========================================================================

  Rule("isCommandErrorOfCategory checks category membership", ({ RuleScenario }) => {
    RuleScenario("Returns true for matching category", ({ Given, Then }) => {
      Given('a CommandError with category "domain"', () => {
        state.error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
      });

      Then('isCommandErrorOfCategory returns true for category "domain"', () => {
        expect(isCommandErrorOfCategory(state.error!, ErrorCategory.DOMAIN)).toBe(true);
      });
    });

    RuleScenario("Returns false for non-matching category", ({ Given, Then }) => {
      Given('a CommandError with category "domain"', () => {
        state.error = new CommandError(ErrorCategory.DOMAIN, "TEST", "test", false);
      });

      Then('isCommandErrorOfCategory returns false for category "validation"', () => {
        expect(isCommandErrorOfCategory(state.error!, ErrorCategory.VALIDATION)).toBe(false);
      });
    });

    RuleScenario("Returns false for non-CommandError", ({ Given, Then }) => {
      Given('a regular Error "test"', () => {
        state.regularError = new Error("test");
      });

      Then("isCommandErrorOfCategory returns false for any category", () => {
        expect(isCommandErrorOfCategory(state.regularError!, ErrorCategory.DOMAIN)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // isRecoverableError
  // ==========================================================================

  Rule("isRecoverableError checks recovery semantics", ({ RuleScenario }) => {
    RuleScenario("Recoverable errors are identified correctly", ({ Then, And }) => {
      Then("isRecoverableError returns true for a concurrency error", () => {
        const error = CommandErrors.concurrency("TEST", "test");
        expect(isRecoverableError(error)).toBe(true);
      });

      And("isRecoverableError returns false for a domain error", () => {
        const error = CommandErrors.domain("TEST", "test");
        expect(isRecoverableError(error)).toBe(false);
      });

      And("isRecoverableError returns true for a regular Error", () => {
        const error = new Error("unknown");
        expect(isRecoverableError(error)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // getRetryDelay
  // ==========================================================================

  Rule("getRetryDelay returns -1 for non-recoverable errors", ({ RuleScenario }) => {
    RuleScenario("Non-recoverable error gets delay of -1", ({ When, Then }) => {
      When("getRetryDelay is called with a domain error at attempt 1", () => {
        const error = CommandErrors.domain("TEST", "test");
        state.retryDelay = getRetryDelay(error);
      });

      Then("the delay is -1", () => {
        expect(state.retryDelay).toBe(-1);
      });
    });
  });

  Rule(
    "getRetryDelay computes quick backoff for concurrency errors capped at 500ms",
    ({ RuleScenario }) => {
      RuleScenario("Concurrency error delays escalate then cap", ({ Then }) => {
        Then("getRetryDelay for concurrency errors returns:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ attempt: string; delay: string }>(dataTable);
          const error = CommandErrors.concurrency("TEST", "test");
          for (const row of rows) {
            expect(getRetryDelay(error, Number(row.attempt))).toBe(Number(row.delay));
          }
        });
      });
    }
  );

  Rule(
    "getRetryDelay computes exponential backoff for infrastructure errors capped at 30s",
    ({ RuleScenario }) => {
      RuleScenario("Infrastructure error delays escalate then cap", ({ Then }) => {
        Then("getRetryDelay for infrastructure errors returns:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ attempt: string; delay: string }>(dataTable);
          const error = CommandErrors.infrastructure("TEST", "test");
          for (const row of rows) {
            expect(getRetryDelay(error, Number(row.attempt))).toBe(Number(row.delay));
          }
        });
      });
    }
  );

  Rule("getRetryDelay treats unknown errors like infrastructure errors", ({ RuleScenario }) => {
    RuleScenario("Unknown error gets infrastructure-style delay", ({ When, Then }) => {
      When("getRetryDelay is called with a regular Error at attempt 1", () => {
        const error = new Error("unknown");
        state.retryDelay = getRetryDelay(error, 1);
      });

      Then("the delay is 1000", () => {
        expect(state.retryDelay).toBe(1000);
      });
    });
  });
});
