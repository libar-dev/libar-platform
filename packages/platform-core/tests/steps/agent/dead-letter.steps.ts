/**
 * Dead Letter - Step Definitions
 *
 * BDD step definitions for agent dead letter queue functionality including:
 * - Error codes and status types
 * - Zod schema validation
 * - Error message sanitization
 * - Factory functions (createAgentDeadLetter, incrementDeadLetterAttempt)
 * - Status transitions (markDeadLetterReplayed, markDeadLetterIgnored)
 * - Type guards (isDeadLetterPending/Replayed/Ignored)
 * - Validation (validateAgentDeadLetter)
 * - Lifecycle scenarios
 *
 * Mechanical migration from tests/unit/agent/dead-letter.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  DEAD_LETTER_ERROR_CODES,
  AGENT_DEAD_LETTER_STATUSES,
  isAgentDeadLetterStatus,
  AgentDeadLetterStatusSchema,
  AgentDeadLetterContextSchema,
  AgentDeadLetterSchema,
  sanitizeErrorMessage,
  createAgentDeadLetter,
  incrementDeadLetterAttempt,
  markDeadLetterReplayed,
  markDeadLetterIgnored,
  isDeadLetterPending,
  isDeadLetterReplayed,
  isDeadLetterIgnored,
  validateAgentDeadLetter,
  type AgentDeadLetter,
  type AgentDeadLetterContext,
} from "../../../src/agent/dead-letter.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestDeadLetter(overrides: Partial<AgentDeadLetter> = {}): AgentDeadLetter {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    eventId: "evt-123",
    globalPosition: 1000,
    error: "Test error message",
    attemptCount: 1,
    status: "pending",
    failedAt: Date.now(),
    ...overrides,
  };
}

function createTestContext(
  overrides: Partial<AgentDeadLetterContext> = {}
): AgentDeadLetterContext {
  return {
    correlationId: "corr-123",
    errorCode: "LLM_TIMEOUT",
    triggeringPattern: "churn-risk",
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  deadLetter: AgentDeadLetter | null;
  sanitizedMessage: string | null;
  context: Record<string, unknown> | null;
  schemaInput: unknown;
  oldFailedAt: number | null;
  useFakeTimers: boolean;
}

function createInitialState(): TestState {
  return {
    deadLetter: null,
    sanitizedMessage: null,
    context: null,
    schemaInput: null,
    oldFailedAt: null,
    useFakeTimers: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/dead-letter.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    if (state.useFakeTimers) {
      vi.useRealTimers();
      state.useFakeTimers = false;
    }
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module is imported at the top of this file
    });
  });

  // ===========================================================================
  // Rule: Error codes are well-defined constants
  // ===========================================================================

  Rule("Error codes are well-defined constants", ({ RuleScenario }) => {
    RuleScenario("Contains all expected error codes", ({ Then }) => {
      Then(
        "DEAD_LETTER_ERROR_CODES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string; value: string }>(dataTable);
          for (const row of rows) {
            expect(DEAD_LETTER_ERROR_CODES[row.code as keyof typeof DEAD_LETTER_ERROR_CODES]).toBe(
              row.value
            );
          }
        }
      );
    });

    RuleScenario("Has exactly 3 error codes", ({ Then }) => {
      Then("DEAD_LETTER_ERROR_CODES has exactly 3 keys", () => {
        expect(Object.keys(DEAD_LETTER_ERROR_CODES).length).toBe(3);
      });
    });
  });

  // ===========================================================================
  // Rule: Status types enumerate all valid dead letter statuses
  // ===========================================================================

  Rule("Status types enumerate all valid dead letter statuses", ({ RuleScenario }) => {
    RuleScenario("Contains all three statuses in order", ({ Then }) => {
      Then("AGENT_DEAD_LETTER_STATUSES equals pending, replayed, ignored", () => {
        expect(AGENT_DEAD_LETTER_STATUSES).toEqual(["pending", "replayed", "ignored"]);
      });
    });

    RuleScenario("Is a readonly tuple with 3 elements", ({ Then }) => {
      Then("AGENT_DEAD_LETTER_STATUSES is an array with 3 elements", () => {
        expect(Array.isArray(AGENT_DEAD_LETTER_STATUSES)).toBe(true);
        expect(AGENT_DEAD_LETTER_STATUSES.length).toBe(3);
      });
    });

    RuleScenario("Type guard accepts valid statuses", ({ Then }) => {
      Then(
        "isAgentDeadLetterStatus returns true for the following values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(isAgentDeadLetterStatus(row.value)).toBe(true);
          }
        }
      );
    });

    RuleScenario("Type guard rejects invalid values", ({ Then }) => {
      Then(
        "isAgentDeadLetterStatus returns false for the following values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(isAgentDeadLetterStatus(row.value)).toBe(false);
          }
        }
      );
    });

    RuleScenario("Type guard rejects non-string types", ({ Then }) => {
      Then(
        "isAgentDeadLetterStatus returns false for numbers, null, undefined, objects, and arrays",
        () => {
          expect(isAgentDeadLetterStatus(123)).toBe(false);
          expect(isAgentDeadLetterStatus(null)).toBe(false);
          expect(isAgentDeadLetterStatus(undefined)).toBe(false);
          expect(isAgentDeadLetterStatus({})).toBe(false);
          expect(isAgentDeadLetterStatus(["pending"])).toBe(false);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Zod status schema validates status strings
  // ===========================================================================

  Rule("Zod status schema validates status strings", ({ RuleScenario }) => {
    RuleScenario("Accepts all valid statuses", ({ Then }) => {
      Then("AgentDeadLetterStatusSchema accepts all AGENT_DEAD_LETTER_STATUSES", () => {
        for (const status of AGENT_DEAD_LETTER_STATUSES) {
          const result = AgentDeadLetterStatusSchema.safeParse(status);
          expect(result.success).toBe(true);
        }
      });
    });

    RuleScenario("Rejects invalid status values", ({ Then }) => {
      Then(
        "AgentDeadLetterStatusSchema rejects the following values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          // Also test non-string types
          const invalidValues: unknown[] = rows.map((r) => r.value);
          invalidValues.push(123, null);
          for (const value of invalidValues) {
            const result = AgentDeadLetterStatusSchema.safeParse(value);
            expect(result.success).toBe(false);
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Zod context schema validates dead letter context objects
  // ===========================================================================

  Rule("Zod context schema validates dead letter context objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid context with all fields", ({ Given, Then }) => {
      Given(
        'a test context with correlationId "corr-123" and errorCode "LLM_TIMEOUT" and triggeringPattern "churn-risk"',
        () => {
          state.context = createTestContext();
        }
      );
      Then("AgentDeadLetterContextSchema accepts the context", () => {
        const result = AgentDeadLetterContextSchema.safeParse(state.context);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts context with only correlationId", ({ Given, Then }) => {
      Given('a context with only correlationId "corr-123"', () => {
        state.context = { correlationId: "corr-123" };
      });
      Then("AgentDeadLetterContextSchema accepts the context", () => {
        const result = AgentDeadLetterContextSchema.safeParse(state.context);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts context with only errorCode", ({ Given, Then }) => {
      Given('a context with only errorCode "LLM_TIMEOUT"', () => {
        state.context = { errorCode: "LLM_TIMEOUT" };
      });
      Then("AgentDeadLetterContextSchema accepts the context", () => {
        const result = AgentDeadLetterContextSchema.safeParse(state.context);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts empty context object", ({ Given, Then }) => {
      Given("an empty context object", () => {
        state.context = {};
      });
      Then("AgentDeadLetterContextSchema accepts the context", () => {
        const result = AgentDeadLetterContextSchema.safeParse(state.context);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Rejects context with unknown fields in strict mode", ({ Given, Then }) => {
      Given('a context with correlationId "corr-123" and an unknown field', () => {
        state.context = { correlationId: "corr-123", unknownField: "value" };
      });
      Then("AgentDeadLetterContextSchema rejects the context", () => {
        const result = AgentDeadLetterContextSchema.safeParse(state.context);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Zod dead letter schema validates complete dead letter objects
  // ===========================================================================

  Rule("Zod dead letter schema validates complete dead letter objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid dead letter", ({ Given, Then }) => {
      Given("a valid test dead letter", () => {
        state.deadLetter = createTestDeadLetter();
      });
      Then("AgentDeadLetterSchema accepts the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.deadLetter);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts dead letter with context", ({ Given, Then }) => {
      Given("a valid test dead letter with context", () => {
        state.deadLetter = createTestDeadLetter({
          context: createTestContext(),
        });
      });
      Then("AgentDeadLetterSchema accepts the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.deadLetter);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Rejects dead letter with empty agentId", ({ Given, Then }) => {
      Given('a test dead letter with agentId ""', () => {
        state.schemaInput = { ...createTestDeadLetter(), agentId: "" };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects dead letter with empty subscriptionId", ({ Given, Then }) => {
      Given('a test dead letter with subscriptionId ""', () => {
        state.schemaInput = {
          ...createTestDeadLetter(),
          subscriptionId: "",
        };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects dead letter with empty eventId", ({ Given, Then }) => {
      Given('a test dead letter with eventId ""', () => {
        state.schemaInput = { ...createTestDeadLetter(), eventId: "" };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects dead letter with negative globalPosition", ({ Given, Then }) => {
      Given("a test dead letter with globalPosition -1", () => {
        state.schemaInput = {
          ...createTestDeadLetter(),
          globalPosition: -1,
        };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Accepts dead letter with globalPosition of 0", ({ Given, Then }) => {
      Given("a test dead letter with globalPosition 0", () => {
        state.deadLetter = createTestDeadLetter({ globalPosition: 0 });
      });
      Then("AgentDeadLetterSchema accepts the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.deadLetter);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Rejects dead letter with non-positive attemptCount", ({ Given, Then }) => {
      Given("a test dead letter with attemptCount 0", () => {
        state.schemaInput = {
          ...createTestDeadLetter(),
          attemptCount: 0,
        };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects dead letter with missing required fields", ({ Given, Then }) => {
      Given('a partial object with only agentId "test"', () => {
        state.schemaInput = { agentId: "test" };
      });
      Then("AgentDeadLetterSchema rejects the dead letter", () => {
        const result = AgentDeadLetterSchema.safeParse(state.schemaInput ?? state.deadLetter);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Sanitization removes stack traces from error messages
  // ===========================================================================

  Rule("Sanitization removes stack traces from error messages", ({ RuleScenario }) => {
    RuleScenario(
      "Removes content after at when followed by path-like content",
      ({ When, Then, And }) => {
        When('I sanitize the error "Error occurred at /app/src/agent.ts:42:10"', () => {
          state.sanitizedMessage = sanitizeErrorMessage(
            "Error occurred at /app/src/agent.ts:42:10"
          );
        });
        Then('the sanitized message is "Error occurred"', () => {
          expect(state.sanitizedMessage).toBe("Error occurred");
        });
        And('the sanitized message does not contain "/app/src/agent.ts:42:10"', () => {
          expect(state.sanitizedMessage).not.toContain("/app/src/agent.ts:42:10");
        });
      }
    );

    RuleScenario("Removes multi-line stack traces", ({ When, Then, And }) => {
      When("I sanitize a multi-line error with stack traces", () => {
        const error = `Error: Something failed
    at processEvent (/app/src/handler.ts:100:5)
    at runAgent (/app/src/agent.ts:50:10)`;
        state.sanitizedMessage = sanitizeErrorMessage(error);
      });
      Then('the sanitized message does not contain "at processEvent"', () => {
        expect(state.sanitizedMessage).not.toContain("at processEvent");
      });
      And('the sanitized message does not contain "at runAgent"', () => {
        expect(state.sanitizedMessage).not.toContain("at runAgent");
      });
    });

    RuleScenario("Preserves the error message itself", ({ When, Then }) => {
      When('I sanitize the error "LLM timeout during analysis"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("LLM timeout during analysis");
      });
      Then('the sanitized message is "LLM timeout during analysis"', () => {
        expect(state.sanitizedMessage).toContain("LLM timeout during analysis");
      });
    });
  });

  // ===========================================================================
  // Rule: Sanitization removes or replaces file paths
  // ===========================================================================

  Rule("Sanitization removes or replaces file paths", ({ RuleScenario }) => {
    RuleScenario("Removes TypeScript file paths with at prefix", ({ When, Then }) => {
      When('I sanitize the error "Failed at /app/src/agent.ts"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Failed at /app/src/agent.ts");
      });
      Then('the sanitized message is "Failed"', () => {
        expect(state.sanitizedMessage).toBe("Failed");
      });
    });

    RuleScenario("Replaces file paths without at prefix with path marker", ({ When, Then }) => {
      When('I sanitize the error "Error in /dist/handler.js:100:5"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Error in /dist/handler.js:100:5");
      });
      Then('the sanitized message is "Error in [path]"', () => {
        expect(state.sanitizedMessage).toBe("Error in [path]");
      });
    });

    RuleScenario("Removes ESM file paths when preceded by at", ({ When, Then }) => {
      When('I sanitize the error "Module error at /lib/module.mjs"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Module error at /lib/module.mjs");
      });
      Then('the sanitized message is "Module error"', () => {
        expect(state.sanitizedMessage).toBe("Module error");
      });
    });

    RuleScenario(
      "Replaces CJS file paths with path marker when not preceded by at",
      ({ When, Then }) => {
        When('I sanitize the error "Require failed for /lib/module.cjs"', () => {
          state.sanitizedMessage = sanitizeErrorMessage("Require failed for /lib/module.cjs");
        });
        Then('the sanitized message is "Require failed for [path]"', () => {
          expect(state.sanitizedMessage).toBe("Require failed for [path]");
        });
      }
    );

    RuleScenario("Removes paths with line and column numbers", ({ When, Then }) => {
      When('I sanitize the error "Error at /path/to/file.ts:42:10"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Error at /path/to/file.ts:42:10");
      });
      Then('the sanitized message does not contain ":42:10"', () => {
        expect(state.sanitizedMessage).not.toContain(":42:10");
      });
    });
  });

  // ===========================================================================
  // Rule: Sanitization truncates at 500 characters
  // ===========================================================================

  Rule("Sanitization truncates at 500 characters", ({ RuleScenario }) => {
    RuleScenario(
      "Truncates long messages to 500 characters ending with ellipsis",
      ({ When, Then, And }) => {
        When('I sanitize an error of 600 repeated "A" characters', () => {
          state.sanitizedMessage = sanitizeErrorMessage("A".repeat(600));
        });
        Then("the sanitized message has length 500", () => {
          expect(state.sanitizedMessage!.length).toBe(500);
        });
        And('the sanitized message ends with "..."', () => {
          expect(state.sanitizedMessage!.endsWith("...")).toBe(true);
        });
      }
    );

    RuleScenario("Does not truncate messages under 500 characters", ({ When, Then, And }) => {
      When('I sanitize an error of 400 repeated "A" characters', () => {
        state.sanitizedMessage = sanitizeErrorMessage("A".repeat(400));
      });
      Then("the sanitized message has length 400", () => {
        expect(state.sanitizedMessage!.length).toBe(400);
      });
      And('the sanitized message does not end with "..."', () => {
        expect(state.sanitizedMessage!.endsWith("...")).toBe(false);
      });
    });

    RuleScenario("Does not truncate messages of exactly 500 characters", ({ When, Then, And }) => {
      When('I sanitize an error of 500 repeated "A" characters', () => {
        state.sanitizedMessage = sanitizeErrorMessage("A".repeat(500));
      });
      Then("the sanitized message has length 500", () => {
        expect(state.sanitizedMessage!.length).toBe(500);
      });
      And('the sanitized message does not end with "..."', () => {
        expect(state.sanitizedMessage!.endsWith("...")).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Sanitization handles different input types
  // ===========================================================================

  Rule("Sanitization handles different input types", ({ RuleScenario }) => {
    RuleScenario("Handles Error objects", ({ When, Then }) => {
      When('I sanitize an Error object with message "Test error message"', () => {
        state.sanitizedMessage = sanitizeErrorMessage(new Error("Test error message"));
      });
      Then('the sanitized message contains "Test error message"', () => {
        expect(state.sanitizedMessage).toContain("Test error message");
      });
    });

    RuleScenario("Handles string errors", ({ When, Then }) => {
      When('I sanitize the error "String error message"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("String error message");
      });
      Then('the sanitized message is "String error message"', () => {
        expect(state.sanitizedMessage).toBe("String error message");
      });
    });

    RuleScenario("Handles objects with message property", ({ When, Then }) => {
      When('I sanitize an object with message "Object error message"', () => {
        state.sanitizedMessage = sanitizeErrorMessage({
          message: "Object error message",
        });
      });
      Then('the sanitized message contains "Object error message"', () => {
        expect(state.sanitizedMessage).toContain("Object error message");
      });
    });

    RuleScenario("Handles unknown error types", ({ When, Then }) => {
      When("I sanitize an object without message property", () => {
        state.sanitizedMessage = sanitizeErrorMessage({ code: 500 });
      });
      Then('the sanitized message is "Unknown error"', () => {
        expect(state.sanitizedMessage).toBe("Unknown error");
      });
    });

    RuleScenario("Handles null", ({ When, Then }) => {
      When("I sanitize null", () => {
        state.sanitizedMessage = sanitizeErrorMessage(null);
      });
      Then('the sanitized message is "Unknown error"', () => {
        expect(state.sanitizedMessage).toBe("Unknown error");
      });
    });

    RuleScenario("Handles undefined", ({ When, Then }) => {
      When("I sanitize undefined", () => {
        state.sanitizedMessage = sanitizeErrorMessage(undefined);
      });
      Then('the sanitized message is "Unknown error"', () => {
        expect(state.sanitizedMessage).toBe("Unknown error");
      });
    });

    RuleScenario("Handles empty string", ({ When, Then }) => {
      When('I sanitize the error ""', () => {
        state.sanitizedMessage = sanitizeErrorMessage("");
      });
      Then('the sanitized message is "Unknown error"', () => {
        expect(state.sanitizedMessage).toBe("Unknown error");
      });
    });
  });

  // ===========================================================================
  // Rule: Sanitization normalizes whitespace
  // ===========================================================================

  Rule("Sanitization normalizes whitespace", ({ RuleScenario }) => {
    RuleScenario("Collapses multiple spaces", ({ When, Then }) => {
      When('I sanitize the error "Error    with    multiple    spaces"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Error    with    multiple    spaces");
      });
      Then('the sanitized message is "Error with multiple spaces"', () => {
        expect(state.sanitizedMessage).toBe("Error with multiple spaces");
      });
    });

    RuleScenario("Trims leading and trailing whitespace", ({ When, Then }) => {
      When('I sanitize the error "   Error with surrounding whitespace   "', () => {
        state.sanitizedMessage = sanitizeErrorMessage("   Error with surrounding whitespace   ");
      });
      Then('the sanitized message is "Error with surrounding whitespace"', () => {
        expect(state.sanitizedMessage).toBe("Error with surrounding whitespace");
      });
    });

    RuleScenario("Handles newlines", ({ When, Then }) => {
      When('I sanitize an error with newlines "Error\\non\\nmultiple\\nlines"', () => {
        state.sanitizedMessage = sanitizeErrorMessage("Error\non\nmultiple\nlines");
      });
      Then('the sanitized message is "Error on multiple lines"', () => {
        expect(state.sanitizedMessage).toBe("Error on multiple lines");
      });
    });
  });

  // ===========================================================================
  // Rule: Factory function creates dead letters with correct defaults
  // ===========================================================================

  Rule("Factory function creates dead letters with correct defaults", ({ RuleScenario }) => {
    RuleScenario("Creates dead letter with required fields", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "test-agent" subscriptionId "sub-001" eventId "evt-123" globalPosition 1000 and error "Error message"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "test-agent",
            "sub-001",
            "evt-123",
            1000,
            "Error message"
          );
        }
      );
      Then("the dead letter has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const prop = row.property as keyof AgentDeadLetter;
          const expected = row.value;
          if (prop === "globalPosition") {
            expect(state.deadLetter![prop]).toBe(Number(expected));
          } else {
            expect(state.deadLetter![prop]).toBe(expected);
          }
        }
      });
    });

    RuleScenario("Creates dead letter with pending status", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"',
        () => {
          state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
        }
      );
      Then('the dead letter status is "pending"', () => {
        expect(state.deadLetter!.status).toBe("pending");
      });
    });

    RuleScenario("Sets attemptCount to 1", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"',
        () => {
          state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
        }
      );
      Then("the dead letter attemptCount is 1", () => {
        expect(state.deadLetter!.attemptCount).toBe(1);
      });
    });

    RuleScenario("Sets failedAt to current time", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"',
        () => {
          state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
        }
      );
      Then("the dead letter failedAt equals the current time", () => {
        expect(state.deadLetter!.failedAt).toBe(Date.now());
      });
    });

    RuleScenario("Includes context when provided", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with context containing correlationId "corr-123" errorCode "LLM_TIMEOUT" and triggeringPattern "churn-risk"',
        () => {
          const context = createTestContext();
          state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error", context);
          state.context = context;
        }
      );
      Then("the dead letter context matches the provided context", () => {
        expect(state.deadLetter!.context).toEqual(state.context);
      });
    });

    RuleScenario("Does not include context when not provided", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"',
        () => {
          state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
        }
      );
      Then("the dead letter context is undefined", () => {
        expect(state.deadLetter!.context).toBeUndefined();
      });
    });

    RuleScenario(
      "Sanitizes Error objects removing stack-like patterns",
      ({ Given, When, Then, And }) => {
        Given('the system time is "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          state.useFakeTimers = true;
        });
        When(
          'I create a dead letter with an Error object "Error at /app/src/handler.ts:42"',
          () => {
            state.deadLetter = createAgentDeadLetter(
              "agent",
              "sub",
              "evt",
              0,
              new Error("Error at /app/src/handler.ts:42")
            );
          }
        );
        Then('the dead letter error is "Error"', () => {
          expect(state.deadLetter!.error).toBe("Error");
        });
        And('the dead letter error does not contain "/app/src/handler.ts"', () => {
          expect(state.deadLetter!.error).not.toContain("/app/src/handler.ts");
        });
      }
    );

    RuleScenario("Sanitizes string errors", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Error at /app/src/handler.ts:42"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "agent",
            "sub",
            "evt",
            0,
            "Error at /app/src/handler.ts:42"
          );
        }
      );
      Then('the dead letter error is "Error"', () => {
        expect(state.deadLetter!.error).toBe("Error");
      });
    });

    RuleScenario("Replaces paths in errors without at prefix", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Failed loading /app/src/handler.ts"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "agent",
            "sub",
            "evt",
            0,
            "Failed loading /app/src/handler.ts"
          );
        }
      );
      Then('the dead letter error is "Failed loading [path]"', () => {
        expect(state.deadLetter!.error).toBe("Failed loading [path]");
      });
    });

    RuleScenario("Replaces paths with line column suffix", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Failed loading /app/src/handler.ts:42:10"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "agent",
            "sub",
            "evt",
            0,
            "Failed loading /app/src/handler.ts:42:10"
          );
        }
      );
      Then('the dead letter error is "Failed loading [path]"', () => {
        expect(state.deadLetter!.error).toBe("Failed loading [path]");
      });
    });

    RuleScenario("Sanitizes unknown error types", ({ Given, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When("I create a dead letter with an unknown error type", () => {
        state.deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, { code: 500 });
      });
      Then('the dead letter error is "Unknown error"', () => {
        expect(state.deadLetter!.error).toBe("Unknown error");
      });
    });
  });

  // ===========================================================================
  // Rule: Increment updates attempt count, error, and timestamp
  // ===========================================================================

  Rule("Increment updates attempt count, error, and timestamp", ({ RuleScenario }) => {
    RuleScenario("Increments attemptCount", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And("a test dead letter with attemptCount 1", () => {
        state.deadLetter = createTestDeadLetter({ attemptCount: 1 });
      });
      When('I increment the dead letter attempt with error "New error"', () => {
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "New error");
      });
      Then("the dead letter attemptCount is 2", () => {
        expect(state.deadLetter!.attemptCount).toBe(2);
      });
    });

    RuleScenario("Updates error message", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And('a test dead letter with error "Old error"', () => {
        state.deadLetter = createTestDeadLetter({ error: "Old error" });
      });
      When('I increment the dead letter attempt with error "New error"', () => {
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "New error");
      });
      Then('the dead letter error is "New error"', () => {
        expect(state.deadLetter!.error).toBe("New error");
      });
    });

    RuleScenario("Sanitizes new error message with at pattern", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And("a test dead letter with attemptCount 1", () => {
        state.deadLetter = createTestDeadLetter({ attemptCount: 1 });
      });
      When('I increment the dead letter attempt with error "Error at /app/file.ts:10"', () => {
        state.deadLetter = incrementDeadLetterAttempt(
          state.deadLetter!,
          "Error at /app/file.ts:10"
        );
      });
      Then('the dead letter error is "Error"', () => {
        expect(state.deadLetter!.error).toBe("Error");
      });
    });

    RuleScenario(
      "Sanitizes new error message with path replacement",
      ({ Given, And, When, Then }) => {
        Given('the system time is "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          state.useFakeTimers = true;
        });
        And("a test dead letter with attemptCount 1", () => {
          state.deadLetter = createTestDeadLetter({ attemptCount: 1 });
        });
        When('I increment the dead letter attempt with error "Failed loading /app/file.ts"', () => {
          state.deadLetter = incrementDeadLetterAttempt(
            state.deadLetter!,
            "Failed loading /app/file.ts"
          );
        });
        Then('the dead letter error is "Failed loading [path]"', () => {
          expect(state.deadLetter!.error).toBe("Failed loading [path]");
        });
      }
    );

    RuleScenario("Updates failedAt to current time", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And("a test dead letter with failedAt 10000 ms ago", () => {
        state.oldFailedAt = Date.now() - 10000;
        state.deadLetter = createTestDeadLetter({
          failedAt: state.oldFailedAt,
        });
      });
      When('I increment the dead letter attempt with error "New error"', () => {
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "New error");
      });
      Then("the dead letter failedAt equals the current time", () => {
        expect(state.deadLetter!.failedAt).toBe(Date.now());
      });
      And("the dead letter failedAt is different from the old failedAt", () => {
        expect(state.deadLetter!.failedAt).not.toBe(state.oldFailedAt);
      });
    });

    RuleScenario("Preserves other fields during increment", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And(
        'a test dead letter with agentId "my-agent" subscriptionId "my-sub" eventId "my-evt" globalPosition 500 status "pending" and context',
        () => {
          state.deadLetter = createTestDeadLetter({
            agentId: "my-agent",
            subscriptionId: "my-sub",
            eventId: "my-evt",
            globalPosition: 500,
            status: "pending",
            context: createTestContext(),
          });
        }
      );
      When('I increment the dead letter attempt with error "New error"', () => {
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "New error");
      });
      Then(
        "the dead letter preserves all original fields except attemptCount, error, and failedAt",
        () => {
          expect(state.deadLetter!.agentId).toBe("my-agent");
          expect(state.deadLetter!.subscriptionId).toBe("my-sub");
          expect(state.deadLetter!.eventId).toBe("my-evt");
          expect(state.deadLetter!.globalPosition).toBe(500);
          expect(state.deadLetter!.status).toBe("pending");
          expect(state.deadLetter!.context).toEqual(createTestContext());
        }
      );
    });

    RuleScenario("Handles multiple increments", ({ Given, And, When, Then }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      And("a test dead letter with attemptCount 1", () => {
        state.deadLetter = createTestDeadLetter({ attemptCount: 1 });
      });
      When(
        'I increment the dead letter attempt 3 times with errors "Retry 1", "Retry 2", "Retry 3"',
        () => {
          state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "Retry 1");
          state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "Retry 2");
          state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "Retry 3");
        }
      );
      Then("the dead letter attemptCount is 4", () => {
        expect(state.deadLetter!.attemptCount).toBe(4);
      });
      And('the dead letter error is "Retry 3"', () => {
        expect(state.deadLetter!.error).toBe("Retry 3");
      });
    });
  });

  // ===========================================================================
  // Rule: Status transition to replayed only from pending
  // ===========================================================================

  Rule("Status transition to replayed only from pending", ({ RuleScenario }) => {
    RuleScenario("Transitions pending to replayed", ({ Given, When, Then }) => {
      Given('a test dead letter with status "pending"', () => {
        state.deadLetter = createTestDeadLetter({ status: "pending" });
      });
      When("I mark the dead letter as replayed", () => {
        state.deadLetter = markDeadLetterReplayed(state.deadLetter!);
      });
      Then('the dead letter status is "replayed"', () => {
        expect(state.deadLetter!.status).toBe("replayed");
      });
    });

    RuleScenario(
      "Preserves all other fields when transitioning to replayed",
      ({ Given, When, Then }) => {
        Given(
          'a test dead letter with status "pending" agentId "my-agent" attemptCount 3 and context',
          () => {
            state.deadLetter = createTestDeadLetter({
              status: "pending",
              agentId: "my-agent",
              attemptCount: 3,
              context: createTestContext(),
            });
          }
        );
        When("I mark the dead letter as replayed", () => {
          state.deadLetter = markDeadLetterReplayed(state.deadLetter!);
        });
        Then('the dead letter preserves agentId "my-agent" and attemptCount 3 and context', () => {
          expect(state.deadLetter!.agentId).toBe("my-agent");
          expect(state.deadLetter!.attemptCount).toBe(3);
          expect(state.deadLetter!.context).toEqual(createTestContext());
        });
      }
    );

    RuleScenario("Throws when marking replayed dead letter as replayed", ({ Given, Then }) => {
      Given('a test dead letter with status "replayed"', () => {
        state.deadLetter = createTestDeadLetter({ status: "replayed" });
      });
      Then(
        'marking the dead letter as replayed throws with message containing "replayed" and "pending"',
        () => {
          expect(() => markDeadLetterReplayed(state.deadLetter!)).toThrow(
            'current status is "replayed", expected "pending"'
          );
        }
      );
    });

    RuleScenario("Throws when marking ignored dead letter as replayed", ({ Given, Then }) => {
      Given('a test dead letter with status "ignored"', () => {
        state.deadLetter = createTestDeadLetter({ status: "ignored" });
      });
      Then(
        'marking the dead letter as replayed throws with message containing "ignored" and "pending"',
        () => {
          expect(() => markDeadLetterReplayed(state.deadLetter!)).toThrow(
            'current status is "ignored", expected "pending"'
          );
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Status transition to ignored only from pending
  // ===========================================================================

  Rule("Status transition to ignored only from pending", ({ RuleScenario }) => {
    RuleScenario("Transitions pending to ignored", ({ Given, When, Then }) => {
      Given('a test dead letter with status "pending"', () => {
        state.deadLetter = createTestDeadLetter({ status: "pending" });
      });
      When("I mark the dead letter as ignored", () => {
        state.deadLetter = markDeadLetterIgnored(state.deadLetter!);
      });
      Then('the dead letter status is "ignored"', () => {
        expect(state.deadLetter!.status).toBe("ignored");
      });
    });

    RuleScenario(
      "Preserves all other fields when transitioning to ignored",
      ({ Given, When, Then }) => {
        Given(
          'a test dead letter with status "pending" eventId "evt-456" and error "Original error"',
          () => {
            state.deadLetter = createTestDeadLetter({
              status: "pending",
              eventId: "evt-456",
              error: "Original error",
            });
          }
        );
        When("I mark the dead letter as ignored", () => {
          state.deadLetter = markDeadLetterIgnored(state.deadLetter!);
        });
        Then('the dead letter preserves eventId "evt-456" and error "Original error"', () => {
          expect(state.deadLetter!.eventId).toBe("evt-456");
          expect(state.deadLetter!.error).toBe("Original error");
        });
      }
    );

    RuleScenario("Throws when marking replayed dead letter as ignored", ({ Given, Then }) => {
      Given('a test dead letter with status "replayed"', () => {
        state.deadLetter = createTestDeadLetter({ status: "replayed" });
      });
      Then(
        'marking the dead letter as ignored throws with message containing "replayed" and "pending"',
        () => {
          expect(() => markDeadLetterIgnored(state.deadLetter!)).toThrow(
            'current status is "replayed", expected "pending"'
          );
        }
      );
    });

    RuleScenario(
      "Throws when marking already ignored dead letter as ignored",
      ({ Given, Then }) => {
        Given('a test dead letter with status "ignored"', () => {
          state.deadLetter = createTestDeadLetter({ status: "ignored" });
        });
        Then(
          'marking the dead letter as ignored throws with message containing "ignored" and "pending"',
          () => {
            expect(() => markDeadLetterIgnored(state.deadLetter!)).toThrow(
              'current status is "ignored", expected "pending"'
            );
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: Type guards correctly identify dead letter statuses
  // ===========================================================================

  Rule("Type guards correctly identify dead letter statuses", ({ RuleScenario }) => {
    RuleScenario("isDeadLetterPending returns true only for pending", ({ Given, Then, And }) => {
      Given('a test dead letter with status "pending"', () => {
        state.deadLetter = createTestDeadLetter({ status: "pending" });
      });
      Then("isDeadLetterPending returns true", () => {
        expect(isDeadLetterPending(state.deadLetter!)).toBe(true);
      });
      And("isDeadLetterReplayed returns false", () => {
        expect(isDeadLetterReplayed(state.deadLetter!)).toBe(false);
      });
      And("isDeadLetterIgnored returns false", () => {
        expect(isDeadLetterIgnored(state.deadLetter!)).toBe(false);
      });
    });

    RuleScenario("isDeadLetterReplayed returns true only for replayed", ({ Given, Then, And }) => {
      Given('a test dead letter with status "replayed"', () => {
        state.deadLetter = createTestDeadLetter({ status: "replayed" });
      });
      Then("isDeadLetterPending returns false", () => {
        expect(isDeadLetterPending(state.deadLetter!)).toBe(false);
      });
      And("isDeadLetterReplayed returns true", () => {
        expect(isDeadLetterReplayed(state.deadLetter!)).toBe(true);
      });
      And("isDeadLetterIgnored returns false", () => {
        expect(isDeadLetterIgnored(state.deadLetter!)).toBe(false);
      });
    });

    RuleScenario("isDeadLetterIgnored returns true only for ignored", ({ Given, Then, And }) => {
      Given('a test dead letter with status "ignored"', () => {
        state.deadLetter = createTestDeadLetter({ status: "ignored" });
      });
      Then("isDeadLetterPending returns false", () => {
        expect(isDeadLetterPending(state.deadLetter!)).toBe(false);
      });
      And("isDeadLetterReplayed returns false", () => {
        expect(isDeadLetterReplayed(state.deadLetter!)).toBe(false);
      });
      And("isDeadLetterIgnored returns true", () => {
        expect(isDeadLetterIgnored(state.deadLetter!)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: Validation function checks complete dead letter structure
  // ===========================================================================

  Rule("Validation function checks complete dead letter structure", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid dead letter", ({ Given, Then }) => {
      Given("a valid test dead letter", () => {
        state.deadLetter = createTestDeadLetter();
      });
      Then("validateAgentDeadLetter returns true", () => {
        expect(validateAgentDeadLetter(state.deadLetter)).toBe(true);
      });
    });

    RuleScenario("Returns true for dead letter with context", ({ Given, Then }) => {
      Given("a valid test dead letter with context", () => {
        state.deadLetter = createTestDeadLetter({
          context: createTestContext(),
        });
      });
      Then("validateAgentDeadLetter returns true", () => {
        expect(validateAgentDeadLetter(state.deadLetter)).toBe(true);
      });
    });

    RuleScenario("Returns false for null", ({ Then }) => {
      Then("validateAgentDeadLetter returns false for null", () => {
        expect(validateAgentDeadLetter(null)).toBe(false);
      });
    });

    RuleScenario("Returns false for undefined", ({ Then }) => {
      Then("validateAgentDeadLetter returns false for undefined", () => {
        expect(validateAgentDeadLetter(undefined)).toBe(false);
      });
    });

    RuleScenario("Returns false for empty object", ({ Then }) => {
      Then("validateAgentDeadLetter returns false for an empty object", () => {
        expect(validateAgentDeadLetter({})).toBe(false);
      });
    });

    RuleScenario("Returns false for non-object types", ({ Then }) => {
      Then(
        "validateAgentDeadLetter returns false for non-object types including string, number, and boolean",
        () => {
          expect(validateAgentDeadLetter("not an object")).toBe(false);
          expect(validateAgentDeadLetter(123)).toBe(false);
          expect(validateAgentDeadLetter(true)).toBe(false);
        }
      );
    });

    RuleScenario("Returns false for dead letter with invalid status", ({ Given, Then }) => {
      Given('a test dead letter with status "invalid"', () => {
        state.schemaInput = {
          ...createTestDeadLetter(),
          status: "invalid",
        };
      });
      Then("validateAgentDeadLetter returns false for the dead letter", () => {
        expect(validateAgentDeadLetter(state.schemaInput)).toBe(false);
      });
    });

    RuleScenario("Returns false for dead letter with missing fields", ({ Given, Then }) => {
      Given('a partial object with agentId "test" and status "pending"', () => {
        state.schemaInput = { agentId: "test", status: "pending" };
      });
      Then("validateAgentDeadLetter returns false for the dead letter", () => {
        expect(validateAgentDeadLetter(state.schemaInput)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Dead letter lifecycle supports replay and ignore paths
  // ===========================================================================

  Rule("Dead letter lifecycle supports replay and ignore paths", ({ RuleScenario }) => {
    RuleScenario("Failed event processing and replay lifecycle", ({ Given, When, Then, And }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter for agent "churn-agent" subscription "sub-001" event "evt-500" position 500 with Error "LLM timeout" and context correlationId "corr-abc" triggeringPattern "churn-risk"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "churn-agent",
            "sub-001",
            "evt-500",
            500,
            new Error("LLM timeout"),
            {
              correlationId: "corr-abc",
              triggeringPattern: "churn-risk",
            }
          );
        }
      );
      Then('the dead letter status is "pending"', () => {
        expect(state.deadLetter!.status).toBe("pending");
      });
      And("the dead letter attemptCount is 1", () => {
        expect(state.deadLetter!.attemptCount).toBe(1);
      });
      And("validateAgentDeadLetter returns true", () => {
        expect(validateAgentDeadLetter(state.deadLetter)).toBe(true);
      });
      When('I advance time by 5000 ms and increment with error "LLM timeout on retry"', () => {
        vi.advanceTimersByTime(5000);
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "LLM timeout on retry");
      });
      Then("the dead letter attemptCount is 2", () => {
        expect(state.deadLetter!.attemptCount).toBe(2);
      });
      And("isDeadLetterPending returns true", () => {
        expect(isDeadLetterPending(state.deadLetter!)).toBe(true);
      });
      When('I advance time by 10000 ms and increment with error "LLM still unavailable"', () => {
        vi.advanceTimersByTime(10000);
        state.deadLetter = incrementDeadLetterAttempt(state.deadLetter!, "LLM still unavailable");
      });
      Then("the dead letter attemptCount is 3", () => {
        expect(state.deadLetter!.attemptCount).toBe(3);
      });
      When("I mark the dead letter as replayed", () => {
        state.deadLetter = markDeadLetterReplayed(state.deadLetter!);
      });
      Then('the dead letter status is "replayed"', () => {
        expect(state.deadLetter!.status).toBe("replayed");
      });
      And("isDeadLetterReplayed returns true", () => {
        expect(isDeadLetterReplayed(state.deadLetter!)).toBe(true);
      });
      Then("marking the dead letter as ignored throws", () => {
        expect(() => markDeadLetterIgnored(state.deadLetter!)).toThrow();
      });
      And("marking the dead letter as replayed throws", () => {
        expect(() => markDeadLetterReplayed(state.deadLetter!)).toThrow();
      });
    });

    RuleScenario("Obsolete event being ignored lifecycle", ({ Given, When, Then, And }) => {
      Given('the system time is "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.useFakeTimers = true;
      });
      When(
        'I create a dead letter for agent "inventory-agent" subscription "sub-002" event "evt-obsolete" position 100 with string error "Processing failed"',
        () => {
          state.deadLetter = createAgentDeadLetter(
            "inventory-agent",
            "sub-002",
            "evt-obsolete",
            100,
            "Processing failed"
          );
        }
      );
      Then("isDeadLetterPending returns true", () => {
        expect(isDeadLetterPending(state.deadLetter!)).toBe(true);
      });
      When("I mark the dead letter as ignored", () => {
        state.deadLetter = markDeadLetterIgnored(state.deadLetter!);
      });
      Then('the dead letter status is "ignored"', () => {
        expect(state.deadLetter!.status).toBe("ignored");
      });
      And("isDeadLetterIgnored returns true", () => {
        expect(isDeadLetterIgnored(state.deadLetter!)).toBe(true);
      });
      Then("marking the dead letter as replayed throws", () => {
        expect(() => markDeadLetterReplayed(state.deadLetter!)).toThrow();
      });
    });
  });
});
