/**
 * Scoped Logger - Step Definitions
 *
 * BDD step definitions for scoped logger:
 * - createScopedLogger message formatting
 * - Level filtering
 * - Console method mapping
 * - Trace with timing
 * - createPlatformNoOpLogger
 * - createChildLogger
 *
 * Mechanical migration from tests/unit/logging/scoped.test.ts
 *
 * NOTE: vitest-cucumber v6 step callbacks receive (ctx: TestContext, ...params)
 * where ctx is the vitest test context and DataTables come as subsequent params.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createScopedLogger,
  createPlatformNoOpLogger,
  createChildLogger,
} from "../../../src/logging/scoped.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Console Mock
// =============================================================================

const mockConsole = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
};

const originalConsole = globalThis.console;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  logger: ReturnType<typeof createScopedLogger> | null;
  noOpLogger: ReturnType<typeof createPlatformNoOpLogger> | null;
  childLogger: ReturnType<typeof createChildLogger> | null;
}

let state: TestState;

function resetState(): void {
  state = {
    logger: null,
    noOpLogger: null,
    childLogger: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/logging/scoped.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
    vi.clearAllMocks();
    (globalThis as { console: typeof mockConsole }).console = mockConsole;
  });

  AfterEachScenario(() => {
    (globalThis as { console: Console }).console = originalConsole;
  });

  // ==========================================================================
  // Rule: createScopedLogger prefixes messages with the scope name
  // ==========================================================================

  Rule("createScopedLogger prefixes messages with the scope name", ({ RuleScenario }) => {
    RuleScenario("Messages are prefixed with scope", ({ Given, When, Then }) => {
      Given('a scoped logger "TestScope" at level "DEBUG"', () => {
        state.logger = createScopedLogger("TestScope", "DEBUG");
      });

      When('I log an info message "Test message"', () => {
        state.logger!.info("Test message");
      });

      Then('console.info was called with "[TestScope] Test message"', () => {
        expect(mockConsole.info).toHaveBeenCalledWith("[TestScope] Test message");
      });
    });

    RuleScenario("Data object is appended as JSON", ({ Given, When, Then }) => {
      Given('a scoped logger "TestScope" at level "DEBUG"', () => {
        state.logger = createScopedLogger("TestScope", "DEBUG");
      });

      When('I log an info message "Test message" with data \'{"key":"value"}\'', () => {
        state.logger!.info("Test message", { key: "value" });
      });

      Then('console.info was called with \'[TestScope] Test message {"key":"value"}\'', () => {
        expect(mockConsole.info).toHaveBeenCalledWith('[TestScope] Test message {"key":"value"}');
      });
    });

    RuleScenario("Empty data object is omitted from output", ({ Given, When, Then }) => {
      Given('a scoped logger "TestScope" at level "DEBUG"', () => {
        state.logger = createScopedLogger("TestScope", "DEBUG");
      });

      When('I log an info message "Test message" with empty data', () => {
        state.logger!.info("Test message", {});
      });

      Then('console.info was called with "[TestScope] Test message"', () => {
        expect(mockConsole.info).toHaveBeenCalledWith("[TestScope] Test message");
      });
    });
  });

  // ==========================================================================
  // Rule: createScopedLogger filters messages below the configured log level
  // ==========================================================================

  Rule("createScopedLogger filters messages below the configured log level", ({ RuleScenario }) => {
    RuleScenario("DEBUG level allows debug messages", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "DEBUG"', () => {
        state.logger = createScopedLogger("Test", "DEBUG");
      });

      When('I log a debug message "Debug message"', () => {
        state.logger!.debug("Debug message");
      });

      Then("console.debug was called", () => {
        expect(mockConsole.debug).toHaveBeenCalled();
      });
    });

    RuleScenario("INFO level suppresses debug messages", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "INFO"', () => {
        state.logger = createScopedLogger("Test", "INFO");
      });

      When('I log a debug message "Debug message"', () => {
        state.logger!.debug("Debug message");
      });

      Then("console.debug was not called", () => {
        expect(mockConsole.debug).not.toHaveBeenCalled();
      });
    });

    RuleScenario("INFO level allows info messages", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "INFO"', () => {
        state.logger = createScopedLogger("Test", "INFO");
      });

      When('I log an info message "Info message"', () => {
        state.logger!.info("Info message");
      });

      Then("console.info was called", () => {
        expect(mockConsole.info).toHaveBeenCalled();
      });
    });

    RuleScenario("INFO level allows warn messages", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "INFO"', () => {
        state.logger = createScopedLogger("Test", "INFO");
      });

      When('I log a warn message "Warn message"', () => {
        state.logger!.warn("Warn message");
      });

      Then("console.warn was called", () => {
        expect(mockConsole.warn).toHaveBeenCalled();
      });
    });

    RuleScenario("ERROR level allows error messages", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "ERROR"', () => {
        state.logger = createScopedLogger("Test", "ERROR");
      });

      When('I log an error message "Error message"', () => {
        state.logger!.error("Error message");
      });

      Then("console.error was called", () => {
        expect(mockConsole.error).toHaveBeenCalled();
      });
    });

    RuleScenario("Default level is INFO when not specified", ({ Given, When, Then, And }) => {
      Given('a scoped logger "Test" with no explicit level', () => {
        state.logger = createScopedLogger("Test");
      });

      When('I log a debug message "Debug message" and an info message "Info message"', () => {
        state.logger!.debug("Debug message");
        state.logger!.info("Info message");
      });

      Then("console.debug was not called", () => {
        expect(mockConsole.debug).not.toHaveBeenCalled();
      });

      And("console.info was called", () => {
        expect(mockConsole.info).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Rule: createScopedLogger maps each log level to the correct console method
  // ==========================================================================

  Rule(
    "createScopedLogger maps each log level to the correct console method",
    ({ RuleScenario }) => {
      RuleScenario("Each log level uses its corresponding console method", ({ Given, Then }) => {
        Given('a scoped logger "Test" at level "DEBUG"', () => {
          state.logger = createScopedLogger("Test", "DEBUG");
        });

        Then(
          "logging at each level calls the correct console method:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              logLevel: string;
              consoleMethod: string;
            }>(dataTable);
            for (const row of rows) {
              vi.clearAllMocks();
              const method = row.logLevel as keyof typeof state.logger;
              (state.logger as Record<string, (msg: string) => void>)[method]("Test");
              const consoleMethod = row.consoleMethod as keyof typeof mockConsole;
              expect(mockConsole[consoleMethod]).toHaveBeenCalled();
            }
          }
        );
      });

      RuleScenario(
        "Report level outputs structured JSON via console.log",
        ({ Given, When, Then }) => {
          Given('a scoped logger "Test" at level "DEBUG"', () => {
            state.logger = createScopedLogger("Test", "DEBUG");
          });

          When('I log a report "Metrics" with data \'{"count":10}\'', () => {
            state.logger!.report("Metrics", { count: 10 });
          });

          Then(
            "console.log was called with structured JSON containing:",
            (_ctx: unknown, dataTable: unknown) => {
              expect(mockConsole.log).toHaveBeenCalled();
              const call = mockConsole.log.mock.calls[0];
              const parsed = JSON.parse(call[0] as string);
              const rows = getDataTableRows<{
                field: string;
                value: string;
              }>(dataTable);
              for (const row of rows) {
                if (row.value === "defined") {
                  expect(parsed[row.field]).toBeDefined();
                } else {
                  const actual = parsed[row.field];
                  const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
                  expect(actual).toBe(expected);
                }
              }
            }
          );
        }
      );
    }
  );

  // ==========================================================================
  // Rule: Trace level supports console timing via the timing data field
  // ==========================================================================

  Rule("Trace level supports console timing via the timing data field", ({ RuleScenario }) => {
    RuleScenario("Timing start uses console.time", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "DEBUG"', () => {
        state.logger = createScopedLogger("Test", "DEBUG");
      });

      When('I log a trace "Operation" with timing "start"', () => {
        state.logger!.trace("Operation", { timing: "start" });
      });

      Then('console.time was called with "[Test] Operation"', () => {
        expect(mockConsole.time).toHaveBeenCalledWith("[Test] Operation");
      });
    });

    RuleScenario("Timing end uses console.timeEnd", ({ Given, When, Then }) => {
      Given('a scoped logger "Test" at level "DEBUG"', () => {
        state.logger = createScopedLogger("Test", "DEBUG");
      });

      When('I log a trace "Operation" with timing "end"', () => {
        state.logger!.trace("Operation", { timing: "end" });
      });

      Then('console.timeEnd was called with "[Test] Operation"', () => {
        expect(mockConsole.timeEnd).toHaveBeenCalledWith("[Test] Operation");
      });
    });

    RuleScenario(
      "Regular trace without timing uses console.debug",
      ({ Given, When, Then, And }) => {
        Given('a scoped logger "Test" at level "DEBUG"', () => {
          state.logger = createScopedLogger("Test", "DEBUG");
        });

        When('I log a trace "Trace message" with data \'{"data":"value"}\'', () => {
          state.logger!.trace("Trace message", { data: "value" });
        });

        Then("console.debug was called", () => {
          expect(mockConsole.debug).toHaveBeenCalled();
        });

        And("console.time was not called", () => {
          expect(mockConsole.time).not.toHaveBeenCalled();
        });

        And("console.timeEnd was not called", () => {
          expect(mockConsole.timeEnd).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: createPlatformNoOpLogger produces a logger that discards all output
  // ==========================================================================

  Rule(
    "createPlatformNoOpLogger produces a logger that discards all output",
    ({ RuleScenario }) => {
      RuleScenario("No-op logger does not call any console methods", ({ Given, When, Then }) => {
        Given("a no-op logger", () => {
          state.noOpLogger = createPlatformNoOpLogger();
        });

        When("I invoke all log levels on the no-op logger", () => {
          state.noOpLogger!.debug("Debug");
          state.noOpLogger!.trace("Trace");
          state.noOpLogger!.info("Info");
          state.noOpLogger!.report("Report");
          state.noOpLogger!.warn("Warn");
          state.noOpLogger!.error("Error");
        });

        Then("no console methods were called:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ method: string }>(dataTable);
          for (const row of rows) {
            const method = row.method as keyof typeof mockConsole;
            expect(mockConsole[method]).not.toHaveBeenCalled();
          }
        });
      });

      RuleScenario("No-op logger implements the full Logger interface", ({ Given, Then }) => {
        Given("a no-op logger", () => {
          state.noOpLogger = createPlatformNoOpLogger();
        });

        Then("the no-op logger has all required methods:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ method: string }>(dataTable);
          for (const row of rows) {
            expect(
              typeof (state.noOpLogger as Record<string, (...args: unknown[]) => void>)[row.method]
            ).toBe("function");
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: createChildLogger combines parent and child scopes with colon separator
  // ==========================================================================

  Rule(
    "createChildLogger combines parent and child scopes with colon separator",
    ({ RuleScenario }) => {
      RuleScenario("Child logger prefixes with combined scope", ({ Given, When, Then }) => {
        Given('a child logger with parent "Parent" and child "Child" at level "DEBUG"', () => {
          state.childLogger = createChildLogger("Parent", "Child", "DEBUG");
        });

        When('I log an info message "Test" on the child logger', () => {
          state.childLogger!.info("Test");
        });

        Then('console.info was called with "[Parent:Child] Test"', () => {
          expect(mockConsole.info).toHaveBeenCalledWith("[Parent:Child] Test");
        });
      });

      RuleScenario("Child logger respects provided log level", ({ Given, When, And, Then }) => {
        Given('a child logger with parent "Parent" and child "Child" at level "WARN"', () => {
          state.childLogger = createChildLogger("Parent", "Child", "WARN");
        });

        When('I log an info message "Info" on the child logger', () => {
          state.childLogger!.info("Info");
        });

        And('I log a warn message "Warn" on the child logger', () => {
          state.childLogger!.warn("Warn");
        });

        Then("console.info was not called", () => {
          expect(mockConsole.info).not.toHaveBeenCalled();
        });

        And("console.warn was called", () => {
          expect(mockConsole.warn).toHaveBeenCalled();
        });
      });

      RuleScenario("Child logger defaults to INFO level", ({ Given, When, And, Then }) => {
        Given(
          'a child logger with parent "Parent" and child "Child" with no explicit level',
          () => {
            state.childLogger = createChildLogger("Parent", "Child");
          }
        );

        When('I log a debug message "Debug" on the child logger', () => {
          state.childLogger!.debug("Debug");
        });

        And('I log an info message "Info" on the child logger', () => {
          state.childLogger!.info("Info");
        });

        Then("console.debug was not called", () => {
          expect(mockConsole.debug).not.toHaveBeenCalled();
        });

        And("console.info was called", () => {
          expect(mockConsole.info).toHaveBeenCalled();
        });
      });
    }
  );
});
