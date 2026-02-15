/**
 * Command Category Utilities - Step Definitions
 *
 * BDD step definitions for command taxonomy utilities:
 * - COMMAND_CATEGORIES constant contents and ordering
 * - CommandCategorySchema Zod validation
 * - DEFAULT_COMMAND_CATEGORY constant
 * - isCommandCategory type guard
 * - normalizeCommandCategory fallback behavior
 * - isAggregateCommand, isProcessCommand, isSystemCommand, isBatchCommand classifiers
 * - AggregateTargetSchema Zod validation
 *
 * Mechanical migration from tests/unit/commands/categories.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  COMMAND_CATEGORIES,
  CommandCategorySchema,
  DEFAULT_COMMAND_CATEGORY,
  isCommandCategory,
  normalizeCommandCategory,
  isAggregateCommand,
  isProcessCommand,
  isSystemCommand,
  isBatchCommand,
  AggregateTargetSchema,
} from "../../../src/commands/categories.js";

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
  // Schema parse results
  schemaParseResults: Array<{ input: unknown; result?: unknown; error?: unknown }>;
  // isCommandCategory results
  typeGuardResults: Array<{ input: unknown; result: boolean }>;
  // normalizeCommandCategory results
  normalizeResults: Array<{ input: unknown; result: unknown }>;
  // Classification results
  classificationResults: Array<{ category: string; result: boolean }>;
  // AggregateTargetSchema results
  targetParseResults: Array<{ input: unknown; result?: unknown; error?: unknown }>;
}

function createInitialState(): TestState {
  return {
    schemaParseResults: [],
    typeGuardResults: [],
    normalizeResults: [],
    classificationResults: [],
    targetParseResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/commands/categories.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // COMMAND_CATEGORIES
  // ==========================================================================

  Rule("COMMAND_CATEGORIES contains all four command categories in order", ({ RuleScenario }) => {
    RuleScenario(
      "COMMAND_CATEGORIES has exactly four entries in the correct order",
      ({ Given, Then, And }) => {
        Given("the COMMAND_CATEGORIES constant", () => {
          // No setup needed — constant is imported
        });

        Then("it has length 4", () => {
          expect(COMMAND_CATEGORIES).toHaveLength(4);
        });

        And("the categories in order are:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ index: string; category: string }>(dataTable);
          for (const row of rows) {
            expect(COMMAND_CATEGORIES[Number(row.index)]).toBe(row.category);
          }
        });
      }
    );
  });

  // ==========================================================================
  // CommandCategorySchema
  // ==========================================================================

  Rule("CommandCategorySchema validates category strings via Zod", ({ RuleScenario }) => {
    RuleScenario("Schema accepts valid category strings", ({ When, Then }) => {
      When("the following values are parsed with CommandCategorySchema:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        state.schemaParseResults = rows.map((row) => {
          try {
            const result = CommandCategorySchema.parse(row.value);
            return { input: row.value, result };
          } catch (e) {
            return { input: row.value, error: e };
          }
        });
      });

      Then("each parse returns the input value unchanged", () => {
        for (const entry of state.schemaParseResults) {
          expect(entry.error).toBeUndefined();
          expect(entry.result).toBe(entry.input);
        }
      });
    });

    RuleScenario("Schema rejects invalid category values", ({ When, Then }) => {
      When("the following invalid values are parsed with CommandCategorySchema:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
        state.schemaParseResults = rows.map((row) => {
          const actual = coerceValue(row.value, row.type);
          try {
            const result = CommandCategorySchema.parse(actual);
            return { input: actual, result };
          } catch (e) {
            return { input: actual, error: e };
          }
        });
      });

      Then("each parse throws a validation error", () => {
        for (const entry of state.schemaParseResults) {
          expect(entry.error).toBeDefined();
        }
      });
    });
  });

  // ==========================================================================
  // DEFAULT_COMMAND_CATEGORY
  // ==========================================================================

  Rule("Default command category provides a sensible fallback", ({ RuleScenario }) => {
    RuleScenario("DEFAULT_COMMAND_CATEGORY is aggregate", ({ Then }) => {
      Then('DEFAULT_COMMAND_CATEGORY equals "aggregate"', () => {
        expect(DEFAULT_COMMAND_CATEGORY).toBe("aggregate");
      });
    });
  });

  // ==========================================================================
  // isCommandCategory
  // ==========================================================================

  Rule("isCommandCategory returns true only for valid category strings", ({ RuleScenario }) => {
    RuleScenario("Type guard accepts all valid categories", ({ When, Then }) => {
      When("isCommandCategory is called with the following values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        state.typeGuardResults = rows.map((row) => ({
          input: row.value,
          result: isCommandCategory(row.value),
        }));
      });

      Then("each call returns true", () => {
        for (const row of state.typeGuardResults) {
          expect(row.result).toBe(true);
        }
      });
    });

    RuleScenario("Type guard rejects invalid values", ({ When, Then }) => {
      When("isCommandCategory is called with the following invalid values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
        state.typeGuardResults = rows.map((row) => {
          const actual = coerceValue(row.value, row.type);
          return {
            input: actual,
            result: isCommandCategory(actual),
          };
        });
      });

      Then("each call returns false", () => {
        for (const row of state.typeGuardResults) {
          expect(row.result).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // normalizeCommandCategory
  // ==========================================================================

  Rule(
    "normalizeCommandCategory returns the category unchanged or falls back to aggregate",
    ({ RuleScenario }) => {
      RuleScenario("Valid categories are returned unchanged", ({ When, Then }) => {
        When("normalizeCommandCategory is called with valid categories:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ input: string; expected: string }>(dataTable);
          state.normalizeResults = rows.map((row) => ({
            input: row.expected,
            result: normalizeCommandCategory(row.input),
          }));
        });

        Then("each call returns the expected category", () => {
          for (const entry of state.normalizeResults) {
            expect(entry.result).toBe(entry.input);
          }
        });
      });

      RuleScenario("Invalid values normalize to aggregate", ({ When, Then }) => {
        When("normalizeCommandCategory is called with invalid values:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
          state.normalizeResults = rows.map((row) => {
            const actual = coerceValue(row.value, row.type);
            return { input: actual, result: normalizeCommandCategory(actual) };
          });
        });

        Then('each call returns "aggregate"', () => {
          for (const entry of state.normalizeResults) {
            expect(entry.result).toBe("aggregate");
          }
        });
      });
    }
  );

  // ==========================================================================
  // isAggregateCommand
  // ==========================================================================

  Rule("isAggregateCommand returns true only for aggregate category", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as aggregate", ({ When, Then }) => {
      When("isAggregateCommand is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.classificationResults = rows.map((row) => ({
          category: row.category,
          result: isAggregateCommand(row.category),
        }));
      });

      Then("each call returns the expected aggregate classification", () => {
        for (const row of state.classificationResults) {
          expect(row.result).toBe(row.category === "aggregate");
        }
      });
    });
  });

  // ==========================================================================
  // isProcessCommand
  // ==========================================================================

  Rule("isProcessCommand returns true only for process category", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as process", ({ When, Then }) => {
      When("isProcessCommand is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.classificationResults = rows.map((row) => ({
          category: row.category,
          result: isProcessCommand(row.category),
        }));
      });

      Then("each call returns the expected process classification", () => {
        for (const row of state.classificationResults) {
          expect(row.result).toBe(row.category === "process");
        }
      });
    });
  });

  // ==========================================================================
  // isSystemCommand
  // ==========================================================================

  Rule("isSystemCommand returns true only for system category", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as system", ({ When, Then }) => {
      When("isSystemCommand is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.classificationResults = rows.map((row) => ({
          category: row.category,
          result: isSystemCommand(row.category),
        }));
      });

      Then("each call returns the expected system classification", () => {
        for (const row of state.classificationResults) {
          expect(row.result).toBe(row.category === "system");
        }
      });
    });
  });

  // ==========================================================================
  // isBatchCommand
  // ==========================================================================

  Rule("isBatchCommand returns true only for batch category", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as batch", ({ When, Then }) => {
      When("isBatchCommand is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.classificationResults = rows.map((row) => ({
          category: row.category,
          result: isBatchCommand(row.category),
        }));
      });

      Then("each call returns the expected batch classification", () => {
        for (const row of state.classificationResults) {
          expect(row.result).toBe(row.category === "batch");
        }
      });
    });
  });

  // ==========================================================================
  // AggregateTargetSchema
  // ==========================================================================

  Rule("AggregateTargetSchema validates aggregate target objects", ({ RuleScenario }) => {
    RuleScenario("Schema accepts valid aggregate targets", ({ When, Then }) => {
      When('an aggregate target with type "Order" and idField "orderId" is parsed', () => {
        const target = { type: "Order", idField: "orderId" };
        try {
          const result = AggregateTargetSchema.parse(target);
          state.targetParseResults = [{ input: target, result }];
        } catch (e) {
          state.targetParseResults = [{ input: target, error: e }];
        }
      });

      Then("the parsed result equals the input target", () => {
        expect(state.targetParseResults).toHaveLength(1);
        const entry = state.targetParseResults[0]!;
        expect(entry.error).toBeUndefined();
        expect(entry.result).toEqual(entry.input);
      });
    });

    RuleScenario("Schema rejects invalid aggregate targets", ({ When, Then }) => {
      When("the following invalid aggregate targets are parsed:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ type: string; idField: string; missing: string }>(
          dataTable
        );
        state.targetParseResults = rows.map((row) => {
          // Build the target object based on missing field
          let target: Record<string, string>;
          if (row.missing === "type") {
            target = { idField: row.idField };
          } else if (row.missing === "idField") {
            target = { type: row.type };
          } else {
            target = { type: row.type, idField: row.idField };
          }
          try {
            const result = AggregateTargetSchema.parse(target);
            return { input: target, result };
          } catch (e) {
            return { input: target, error: e };
          }
        });
      });

      Then("each parse throws a validation error", () => {
        for (const entry of state.targetParseResults) {
          expect(entry.error).toBeDefined();
        }
      });
    });
  });
});
