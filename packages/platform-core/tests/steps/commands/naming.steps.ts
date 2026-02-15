/**
 * Command Naming Policy - Step Definitions
 *
 * BDD step definitions for command naming conventions:
 * - COMMAND_NAME_PREFIXES constant contents
 * - CommandNamingPolicy regex pattern matching
 * - isValidCommandName boolean validation
 * - validateCommandName structured results
 * - generateNameSuggestions corrective suggestions
 * - getCommandPrefix prefix extraction
 * - formatCommandName format conversion
 *
 * Mechanical migration from tests/unit/commands/naming.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  CommandNamingPolicy,
  COMMAND_NAME_PREFIXES,
  validateCommandName,
  generateNameSuggestions,
  isValidCommandName,
  getCommandPrefix,
  formatCommandName,
} from "../../../src/commands/naming.js";
import type { CommandNameValidationResult } from "../../../src/commands/naming.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  patternTestResults: Array<{ name: string; expected: boolean; result: boolean }>;
  validityResults: Array<{ name: string; expected: boolean; result: boolean }>;
  validationResults: Array<{
    name: string;
    expectedPrefix: string;
    result: CommandNameValidationResult;
  }>;
  singleValidationResult: CommandNameValidationResult | null;
  suggestions: string[];
  prefixResults: Array<{ name: string; expectedPrefix: string; result: string | undefined }>;
  formatResults: Array<{ name: string; expected: string; result: string }>;
}

function createInitialState(): TestState {
  return {
    patternTestResults: [],
    validityResults: [],
    validationResults: [],
    singleValidationResult: null,
    suggestions: [],
    prefixResults: [],
    formatResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/commands/naming.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // COMMAND_NAME_PREFIXES
  // ==========================================================================

  Rule("COMMAND_NAME_PREFIXES contains all recognized verb prefixes", ({ RuleScenario }) => {
    RuleScenario("COMMAND_NAME_PREFIXES includes all standard prefixes", ({ Given, Then }) => {
      Given("the COMMAND_NAME_PREFIXES constant", () => {
        // No setup needed — constant is imported
      });

      Then("it contains all of the following prefixes:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ prefix: string }>(dataTable);
        for (const row of rows) {
          expect(COMMAND_NAME_PREFIXES).toContain(row.prefix);
        }
      });
    });
  });

  // ==========================================================================
  // CommandNamingPolicy Pattern Matching — CREATE
  // ==========================================================================

  Rule("CREATE pattern matches PascalCase names starting with Create", ({ RuleScenario }) => {
    RuleScenario("CREATE pattern accepts valid Create-prefixed names", ({ When, Then }) => {
      When(
        "the CREATE pattern is tested against the following names:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; expected: string }>(dataTable);
          state.patternTestResults = rows.map((row) => ({
            name: row.name,
            expected: row.expected === "true",
            result: CommandNamingPolicy.CREATE.test(row.name),
          }));
        }
      );

      Then("each pattern test returns the expected result", () => {
        for (const entry of state.patternTestResults) {
          expect(entry.result, `Pattern test for "${entry.name}"`).toBe(entry.expected);
        }
      });
    });
  });

  // ==========================================================================
  // CommandNamingPolicy Pattern Matching — ADD
  // ==========================================================================

  Rule("ADD pattern matches PascalCase names starting with Add", ({ RuleScenario }) => {
    RuleScenario("ADD pattern accepts valid Add-prefixed names", ({ When, Then }) => {
      When(
        "the ADD pattern is tested against the following names:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; expected: string }>(dataTable);
          state.patternTestResults = rows.map((row) => ({
            name: row.name,
            expected: row.expected === "true",
            result: CommandNamingPolicy.ADD.test(row.name),
          }));
        }
      );

      Then("each pattern test returns the expected result", () => {
        for (const entry of state.patternTestResults) {
          expect(entry.result, `Pattern test for "${entry.name}"`).toBe(entry.expected);
        }
      });
    });
  });

  // ==========================================================================
  // CommandNamingPolicy Pattern Matching — UPDATE
  // ==========================================================================

  Rule(
    "UPDATE pattern matches names starting with Update, Change, or Modify",
    ({ RuleScenario }) => {
      RuleScenario(
        "UPDATE pattern accepts Update, Change, and Modify prefixes",
        ({ When, Then }) => {
          When(
            "the UPDATE pattern is tested against the following names:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ name: string; expected: string }>(dataTable);
              state.patternTestResults = rows.map((row) => ({
                name: row.name,
                expected: row.expected === "true",
                result: CommandNamingPolicy.UPDATE.test(row.name),
              }));
            }
          );

          Then("each pattern test returns the expected result", () => {
            for (const entry of state.patternTestResults) {
              expect(entry.result, `Pattern test for "${entry.name}"`).toBe(entry.expected);
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // isValidCommandName
  // ==========================================================================

  Rule(
    "isValidCommandName returns true only for names matching any recognized prefix pattern",
    ({ RuleScenario }) => {
      RuleScenario("Valid command names are accepted", ({ When, Then }) => {
        When(
          "isValidCommandName is called with the following names:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string; expected: string }>(dataTable);
            state.validityResults = rows.map((row) => ({
              name: row.name,
              expected: row.expected === "true",
              result: isValidCommandName(row.name),
            }));
          }
        );

        Then("each validity check returns the expected result", () => {
          for (const entry of state.validityResults) {
            expect(entry.result, `isValidCommandName("${entry.name}")`).toBe(entry.expected);
          }
        });
      });

      RuleScenario("Invalid command names are rejected", ({ When, Then }) => {
        When(
          "isValidCommandName is called with the following names:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string; expected: string }>(dataTable);
            state.validityResults = rows.map((row) => ({
              name: row.name,
              expected: row.expected === "true",
              result: isValidCommandName(row.name),
            }));
          }
        );

        Then("each validity check returns the expected result", () => {
          for (const entry of state.validityResults) {
            expect(entry.result, `isValidCommandName("${entry.name}")`).toBe(entry.expected);
          }
        });
      });
    }
  );

  // ==========================================================================
  // validateCommandName
  // ==========================================================================

  Rule(
    "validateCommandName returns structured validation results with matched prefix",
    ({ RuleScenario }) => {
      RuleScenario("Valid names return matched prefix and valid flag", ({ When, Then, And }) => {
        When(
          "validateCommandName is called with the following valid names:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string; expectedPrefix: string }>(dataTable);
            state.validationResults = rows.map((row) => ({
              name: row.name,
              expectedPrefix: row.expectedPrefix,
              result: validateCommandName(row.name),
            }));
          }
        );

        Then("each validation result is valid with the expected prefix", () => {
          for (const entry of state.validationResults) {
            expect(entry.result.valid, `validateCommandName("${entry.name}").valid`).toBe(true);
            expect(
              entry.result.matchedPrefix,
              `validateCommandName("${entry.name}").matchedPrefix`
            ).toBe(entry.expectedPrefix);
          }
        });

        And("no validation result contains suggestions", () => {
          for (const entry of state.validationResults) {
            expect(entry.result.suggestions).toBeUndefined();
          }
        });
      });

      RuleScenario("Invalid name returns suggestions and error message", ({ When, Then, And }) => {
        When('validateCommandName is called with "OrderCreate"', () => {
          state.singleValidationResult = validateCommandName("OrderCreate");
        });

        Then("the validation result is invalid", () => {
          expect(state.singleValidationResult!.valid).toBe(false);
        });

        And('the validation message contains "does not follow naming conventions"', () => {
          expect(state.singleValidationResult!.message).toContain(
            "does not follow naming conventions"
          );
        });

        And('the suggestions include "CreateOrder"', () => {
          expect(state.singleValidationResult!.suggestions).toBeDefined();
          expect(state.singleValidationResult!.suggestions!.length).toBeGreaterThan(0);
          expect(state.singleValidationResult!.suggestions).toContain("CreateOrder");
        });
      });
    }
  );

  // ==========================================================================
  // generateNameSuggestions
  // ==========================================================================

  Rule(
    "generateNameSuggestions produces corrective suggestions for invalid names",
    ({ RuleScenario }) => {
      RuleScenario("Inverted name receives corrected suggestion", ({ When, Then }) => {
        When('generateNameSuggestions is called with "OrderCreate"', () => {
          state.suggestions = generateNameSuggestions("OrderCreate");
        });

        Then('the suggestions include "CreateOrder"', () => {
          expect(state.suggestions).toContain("CreateOrder");
        });
      });

      RuleScenario("Suggestions are limited to at most 3", ({ When, Then }) => {
        When('generateNameSuggestions is called with "SomeRandomName"', () => {
          state.suggestions = generateNameSuggestions("SomeRandomName");
        });

        Then("the suggestion count is at most 3", () => {
          expect(state.suggestions.length).toBeLessThanOrEqual(3);
        });
      });
    }
  );

  // ==========================================================================
  // getCommandPrefix
  // ==========================================================================

  Rule("getCommandPrefix extracts the matched prefix or returns undefined", ({ RuleScenario }) => {
    RuleScenario("Known names return their prefix", ({ When, Then }) => {
      When(
        "getCommandPrefix is called with the following names:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; expectedPrefix: string }>(dataTable);
          state.prefixResults = rows.map((row) => ({
            name: row.name,
            expectedPrefix: row.expectedPrefix,
            result: getCommandPrefix(row.name),
          }));
        }
      );

      Then("each prefix extraction returns the expected prefix", () => {
        for (const entry of state.prefixResults) {
          expect(entry.result, `getCommandPrefix("${entry.name}")`).toBe(entry.expectedPrefix);
        }
      });
    });

    RuleScenario("Invalid or empty names return undefined", ({ When, Then }) => {
      When(
        "getCommandPrefix is called with the following names:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; expectedPrefix: string }>(dataTable);
          state.prefixResults = rows.map((row) => ({
            name: row.name,
            expectedPrefix: row.expectedPrefix,
            result: getCommandPrefix(row.name),
          }));
        }
      );

      Then("each prefix extraction returns the expected prefix", () => {
        for (const entry of state.prefixResults) {
          const expected = entry.expectedPrefix === "undefined" ? undefined : entry.expectedPrefix;
          expect(entry.result, `getCommandPrefix("${entry.name}")`).toBe(expected);
        }
      });
    });
  });

  // ==========================================================================
  // formatCommandName
  // ==========================================================================

  Rule(
    "formatCommandName converts various input formats to valid PascalCase command names",
    ({ RuleScenario }) => {
      RuleScenario("Various input formats produce correct PascalCase names", ({ When, Then }) => {
        When(
          "formatCommandName is called with the following inputs:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string; prefix: string; expected: string }>(
              dataTable
            );
            state.formatResults = rows.map((row) => {
              const result = row.prefix
                ? formatCommandName(row.name, row.prefix)
                : formatCommandName(row.name);
              return { name: row.name, expected: row.expected, result };
            });
          }
        );

        Then("each format call returns the expected output", () => {
          for (const entry of state.formatResults) {
            expect(entry.result, `formatCommandName("${entry.name}")`).toBe(entry.expected);
          }
        });
      });
    }
  );
});
