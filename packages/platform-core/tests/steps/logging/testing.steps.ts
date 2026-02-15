/**
 * Logging Testing Utilities - Step Definitions
 *
 * BDD step definitions for mock logger utilities:
 * - createMockLogger capture, clear, getCallsAtLevel, hasLoggedMessage, hasLoggedAt, getLastCallAt
 * - createFilteredMockLogger level filtering and helper methods
 *
 * Mechanical migration from tests/unit/logging/testing.test.ts
 *
 * NOTE: vitest-cucumber v6 step callbacks receive (ctx: TestContext, ...params)
 * where ctx is the vitest test context and DataTables come as subsequent params.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createMockLogger, createFilteredMockLogger } from "../../../src/logging/testing.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

type MockLogger = ReturnType<typeof createMockLogger>;
type FilteredMockLogger = ReturnType<typeof createFilteredMockLogger>;

interface TestState {
  logger: MockLogger | null;
  filteredLogger: FilteredMockLogger | null;
  timestampBefore: number;
  timestampAfter: number;
}

let state: TestState;

function resetState(): void {
  state = {
    logger: null,
    filteredLogger: null,
    timestampBefore: 0,
    timestampAfter: 0,
  };
}

// =============================================================================
// Helper: log one message at each level
// =============================================================================

function logAllLevels(logger: MockLogger | FilteredMockLogger): void {
  logger.debug("Debug");
  logger.trace("Trace");
  logger.info("Info");
  logger.report("Report");
  logger.warn("Warn");
  logger.error("Error");
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/logging/testing.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  // ==========================================================================
  // Rule: createMockLogger captures all log method calls with metadata
  // ==========================================================================

  Rule("createMockLogger captures all log method calls with metadata", ({ RuleScenario }) => {
    RuleScenario("All six log method calls are captured", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When("I log one message at each level", () => {
        logAllLevels(state.logger!);
      });

      Then("the logger should have captured 6 calls", () => {
        expect(state.logger!.calls).toHaveLength(6);
      });
    });

    RuleScenario("Each call records the correct log level", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When("I log one message at each level", () => {
        logAllLevels(state.logger!);
      });

      Then("each call has the correct level:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ index: string; level: string }>(dataTable);
        for (const row of rows) {
          expect(state.logger!.calls[Number(row.index)].level).toBe(row.level);
        }
      });
    });

    RuleScenario("Message text is captured correctly", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message "Test message"', () => {
        state.logger!.info("Test message");
      });

      Then('the first call message should be "Test message"', () => {
        expect(state.logger!.calls[0].message).toBe("Test message");
      });
    });

    RuleScenario("Structured data is captured correctly", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message with data key "value" and count 42', () => {
        state.logger!.info("Test", { key: "value", count: 42 });
      });

      Then('the first call data should contain key "value" and count 42', () => {
        expect(state.logger!.calls[0].data).toEqual({
          key: "value",
          count: 42,
        });
      });
    });

    RuleScenario("Data is undefined when not provided", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message "No data"', () => {
        state.logger!.info("No data");
      });

      Then("the first call data should be undefined", () => {
        expect(state.logger!.calls[0].data).toBeUndefined();
      });
    });

    RuleScenario("Timestamp is captured within bounds", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When("I log an info message with timestamp tracking", () => {
        state.timestampBefore = Date.now();
        state.logger!.info("Test");
        state.timestampAfter = Date.now();
      });

      Then("the first call timestamp should be within the tracked bounds", () => {
        expect(state.logger!.calls[0].timestamp).toBeGreaterThanOrEqual(state.timestampBefore);
        expect(state.logger!.calls[0].timestamp).toBeLessThanOrEqual(state.timestampAfter);
      });
    });
  });

  // ==========================================================================
  // Rule: clear() resets the captured calls array
  // ==========================================================================

  Rule("clear() resets the captured calls array", ({ RuleScenario }) => {
    RuleScenario("Clearing resets calls to empty", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When("I log 2 info messages and then clear", () => {
        state.logger!.info("Message 1");
        state.logger!.info("Message 2");
        expect(state.logger!.calls).toHaveLength(2);
        state.logger!.clear();
      });

      Then("the logger should have captured 0 calls", () => {
        expect(state.logger!.calls).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // Rule: getCallsAtLevel filters captured calls by log level
  // ==========================================================================

  Rule("getCallsAtLevel filters captured calls by log level", ({ RuleScenario }) => {
    RuleScenario("Calls are filtered by level correctly", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When(
        'I log "Debug 1" at DEBUG, "Info 1" at INFO, "Debug 2" at DEBUG, and "Error 1" at ERROR',
        () => {
          state.logger!.debug("Debug 1");
          state.logger!.info("Info 1");
          state.logger!.debug("Debug 2");
          state.logger!.error("Error 1");
        }
      );

      Then("getCallsAtLevel returns the correct counts:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ level: string; count: string }>(dataTable);
        for (const row of rows) {
          expect(
            state.logger!.getCallsAtLevel(row.level as "DEBUG" | "INFO" | "ERROR" | "WARN")
          ).toHaveLength(Number(row.count));
        }
      });
    });
  });

  // ==========================================================================
  // Rule: hasLoggedMessage finds messages by partial text match
  // ==========================================================================

  Rule("hasLoggedMessage finds messages by partial text match", ({ RuleScenario }) => {
    RuleScenario("Partial and exact message matching", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When(
        'I log "Command executed successfully" at INFO and "Command failed with error" at WARN',
        () => {
          state.logger!.info("Command executed successfully");
          state.logger!.warn("Command failed with error");
        }
      );

      Then(
        "hasLoggedMessage returns the expected results:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            search: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            expect(state.logger!.hasLoggedMessage(row.search)).toBe(row.expected === "true");
          }
        }
      );
    });

    RuleScenario("Exact message match works", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message "Exact message"', () => {
        state.logger!.info("Exact message");
      });

      Then('hasLoggedMessage for "Exact message" returns true', () => {
        expect(state.logger!.hasLoggedMessage("Exact message")).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Rule: hasLoggedAt checks both level and message text together
  // ==========================================================================

  Rule("hasLoggedAt checks both level and message text together", ({ RuleScenario }) => {
    RuleScenario("Level and message must both match", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log "Info message" at INFO and "Error message" at ERROR', () => {
        state.logger!.info("Info message");
        state.logger!.error("Error message");
      });

      Then("hasLoggedAt returns the expected results:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          level: string;
          search: string;
          expected: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.logger!.hasLoggedAt(row.level as "INFO" | "ERROR", row.search)).toBe(
            row.expected === "true"
          );
        }
      });
    });
  });

  // ==========================================================================
  // Rule: getLastCallAt returns the most recent call at a specific level
  // ==========================================================================

  Rule("getLastCallAt returns the most recent call at a specific level", ({ RuleScenario }) => {
    RuleScenario("Returns the last call at a given level", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log "First info", "Second info", and "Third info" at INFO', () => {
        state.logger!.info("First info");
        state.logger!.info("Second info");
        state.logger!.info("Third info");
      });

      Then('getLastCallAt INFO should have message "Third info"', () => {
        const lastInfo = state.logger!.getLastCallAt("INFO");
        expect(lastInfo?.message).toBe("Third info");
      });
    });

    RuleScenario("Returns undefined when no calls at level", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message "Info message"', () => {
        state.logger!.info("Info message");
      });

      Then("getLastCallAt ERROR should be undefined", () => {
        const lastError = state.logger!.getLastCallAt("ERROR");
        expect(lastError).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Rule: calls property returns consistent array references
  // ==========================================================================

  Rule("calls property returns consistent array references", ({ RuleScenario }) => {
    RuleScenario("Multiple accesses return equal arrays", ({ Given, When, Then }) => {
      Given("a fresh mock logger", () => {
        state.logger = createMockLogger();
      });

      When('I log an info message "Test"', () => {
        state.logger!.info("Test");
      });

      Then("two accesses to the calls property should be equal", () => {
        const calls1 = state.logger!.calls;
        const calls2 = state.logger!.calls;
        expect(calls1).toEqual(calls2);
      });
    });
  });

  // ==========================================================================
  // Rule: createFilteredMockLogger only captures logs at or above minimum level
  // ==========================================================================

  Rule(
    "createFilteredMockLogger only captures logs at or above minimum level",
    ({ RuleScenario }) => {
      RuleScenario(
        "INFO minimum captures INFO, REPORT, WARN, ERROR only",
        ({ Given, When, Then, And }) => {
          Given('a filtered mock logger with minimum level "INFO"', () => {
            state.filteredLogger = createFilteredMockLogger("INFO");
          });

          When("I log one message at each level on the filtered logger", () => {
            logAllLevels(state.filteredLogger!);
          });

          Then("the filtered logger should have captured 4 calls", () => {
            expect(state.filteredLogger!.calls).toHaveLength(4);
          });

          And(
            "the filtered logger getCallsAtLevel returns:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ level: string; count: string }>(dataTable);
              for (const row of rows) {
                expect(
                  state.filteredLogger!.getCallsAtLevel(
                    row.level as "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR"
                  )
                ).toHaveLength(Number(row.count));
              }
            }
          );
        }
      );

      RuleScenario("DEBUG minimum captures all 6 levels", ({ Given, When, Then }) => {
        Given('a filtered mock logger with minimum level "DEBUG"', () => {
          state.filteredLogger = createFilteredMockLogger("DEBUG");
        });

        When("I log one message at each level on the filtered logger", () => {
          logAllLevels(state.filteredLogger!);
        });

        Then("the filtered logger should have captured 6 calls", () => {
          expect(state.filteredLogger!.calls).toHaveLength(6);
        });
      });

      RuleScenario("ERROR minimum captures only ERROR", ({ Given, When, Then, And }) => {
        Given('a filtered mock logger with minimum level "ERROR"', () => {
          state.filteredLogger = createFilteredMockLogger("ERROR");
        });

        When("I log one message at each level on the filtered logger", () => {
          logAllLevels(state.filteredLogger!);
        });

        Then("the filtered logger should have captured 1 calls", () => {
          expect(state.filteredLogger!.calls).toHaveLength(1);
        });

        And('the filtered logger first call level should be "ERROR"', () => {
          expect(state.filteredLogger!.calls[0].level).toBe("ERROR");
        });
      });

      RuleScenario("WARN minimum captures WARN and ERROR", ({ Given, When, Then, And }) => {
        Given('a filtered mock logger with minimum level "WARN"', () => {
          state.filteredLogger = createFilteredMockLogger("WARN");
        });

        When("I log one message at each level on the filtered logger", () => {
          logAllLevels(state.filteredLogger!);
        });

        Then("the filtered logger should have captured 2 calls", () => {
          expect(state.filteredLogger!.calls).toHaveLength(2);
        });

        And("the filtered logger getCallsAtLevel returns:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ level: string; count: string }>(dataTable);
          for (const row of rows) {
            expect(
              state.filteredLogger!.getCallsAtLevel(
                row.level as "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR"
              )
            ).toHaveLength(Number(row.count));
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Filtered logger helper methods respect the minimum level filter
  // ==========================================================================

  Rule("Filtered logger helper methods respect the minimum level filter", ({ RuleScenario }) => {
    RuleScenario("Clear resets filtered calls", ({ Given, When, Then }) => {
      Given('a filtered mock logger with minimum level "INFO"', () => {
        state.filteredLogger = createFilteredMockLogger("INFO");
      });

      When("I log an info and a debug message on the filtered logger and then clear", () => {
        state.filteredLogger!.info("Test");
        state.filteredLogger!.debug("Filtered out");
        expect(state.filteredLogger!.calls).toHaveLength(1);
        state.filteredLogger!.clear();
      });

      Then("the filtered logger should have captured 0 calls", () => {
        expect(state.filteredLogger!.calls).toHaveLength(0);
      });
    });

    RuleScenario("hasLoggedMessage only searches filtered calls", ({ Given, When, Then }) => {
      Given('a filtered mock logger with minimum level "WARN"', () => {
        state.filteredLogger = createFilteredMockLogger("WARN");
      });

      When(
        'I log "Info message" at INFO and "Warning message" at WARN on the filtered logger',
        () => {
          state.filteredLogger!.info("Info message");
          state.filteredLogger!.warn("Warning message");
        }
      );

      Then("filtered hasLoggedMessage returns:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          search: string;
          expected: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.filteredLogger!.hasLoggedMessage(row.search)).toBe(row.expected === "true");
        }
      });
    });
  });
});
