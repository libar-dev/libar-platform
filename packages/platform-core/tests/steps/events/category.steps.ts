/**
 * Event Category Utilities - Step Definitions
 *
 * BDD step definitions for event taxonomy utilities:
 * - EVENT_CATEGORIES constant contents and ordering
 * - EventCategorySchema Zod validation
 * - DEFAULT_EVENT_CATEGORY and DEFAULT_SCHEMA_VERSION constants
 * - isEventCategory type guard
 * - normalizeCategory and normalizeSchemaVersion fallback behavior
 * - isExternalCategory and isCrossContextCategory classifiers
 *
 * Mechanical migration from tests/unit/events/category.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  EVENT_CATEGORIES,
  EventCategorySchema,
  DEFAULT_EVENT_CATEGORY,
  DEFAULT_SCHEMA_VERSION,
  isEventCategory,
  normalizeCategory,
  normalizeSchemaVersion,
  isExternalCategory,
  isCrossContextCategory,
} from "../../../src/events/category.js";

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
  // Schema parse
  schemaParseResults: Array<{ input: unknown; result?: unknown; error?: unknown }>;
  // isEventCategory
  typeGuardResults: Array<{ input: unknown; result: boolean }>;
  // normalizeCategory
  normalizeCategoryResults: Array<{ input: unknown; result: unknown }>;
  // normalizeSchemaVersion
  normalizeVersionResults: Array<{ input: unknown; result: unknown }>;
  // isExternalCategory
  externalResults: Array<{ category: string; result: boolean }>;
  // isCrossContextCategory
  crossContextResults: Array<{ category: string; result: boolean }>;
}

function createInitialState(): TestState {
  return {
    schemaParseResults: [],
    typeGuardResults: [],
    normalizeCategoryResults: [],
    normalizeVersionResults: [],
    externalResults: [],
    crossContextResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/events/category.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // EVENT_CATEGORIES
  // ==========================================================================

  Rule("EVENT_CATEGORIES contains all four event categories in order", ({ RuleScenario }) => {
    RuleScenario(
      "EVENT_CATEGORIES has exactly four entries in the correct order",
      ({ Given, Then, And }) => {
        Given("the EVENT_CATEGORIES constant", () => {
          // No setup needed — constant is imported
        });

        Then("it has length 4", () => {
          expect(EVENT_CATEGORIES).toHaveLength(4);
        });

        And("the categories in order are:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ index: string; category: string }>(dataTable);
          for (const row of rows) {
            expect(EVENT_CATEGORIES[Number(row.index)]).toBe(row.category);
          }
        });
      }
    );
  });

  // ==========================================================================
  // EventCategorySchema
  // ==========================================================================

  Rule("EventCategorySchema validates category strings via Zod", ({ RuleScenario }) => {
    RuleScenario("Schema accepts valid category strings", ({ When, Then }) => {
      When("the following values are parsed with EventCategorySchema:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        state.schemaParseResults = rows.map((row) => {
          try {
            const result = EventCategorySchema.parse(row.value);
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
      When("the following values are parsed with EventCategorySchema:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
        state.schemaParseResults = rows.map((row) => {
          const actual = coerceValue(row.value, row.type);
          try {
            const result = EventCategorySchema.parse(actual);
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
  // Defaults
  // ==========================================================================

  Rule("Default constants provide sensible fallbacks", ({ RuleScenario }) => {
    RuleScenario("DEFAULT_EVENT_CATEGORY is domain", ({ Then }) => {
      Then('DEFAULT_EVENT_CATEGORY equals "domain"', () => {
        expect(DEFAULT_EVENT_CATEGORY).toBe("domain");
      });
    });

    RuleScenario("DEFAULT_SCHEMA_VERSION is 1", ({ Then }) => {
      Then("DEFAULT_SCHEMA_VERSION equals 1", () => {
        expect(DEFAULT_SCHEMA_VERSION).toBe(1);
      });
    });
  });

  // ==========================================================================
  // isEventCategory
  // ==========================================================================

  Rule("isEventCategory returns true only for valid category strings", ({ RuleScenario }) => {
    RuleScenario("Type guard accepts all valid categories", ({ When, Then }) => {
      When("isEventCategory is called with the following values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; expected: string }>(dataTable);
        state.typeGuardResults = rows.map((row) => ({
          input: row.value,
          result: isEventCategory(row.value),
        }));
      });

      Then("each call returns the expected boolean", () => {
        const rows = state.typeGuardResults;
        for (const row of rows) {
          expect(row.result).toBe(true);
        }
      });
    });

    RuleScenario("Type guard rejects invalid values", ({ When, Then }) => {
      When("isEventCategory is called with the following invalid values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; type: string; expected: string }>(dataTable);
        state.typeGuardResults = rows.map((row) => {
          const actual = coerceValue(row.value, row.type);
          return {
            input: actual,
            result: isEventCategory(actual),
          };
        });
      });

      Then("each call returns the expected boolean result", () => {
        for (const row of state.typeGuardResults) {
          expect(row.result).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // normalizeCategory
  // ==========================================================================

  Rule(
    "normalizeCategory returns the category unchanged or falls back to domain",
    ({ RuleScenario }) => {
      RuleScenario("Valid categories are returned unchanged", ({ When, Then }) => {
        When("normalizeCategory is called with valid categories:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ input: string; expected: string }>(dataTable);
          state.normalizeCategoryResults = rows.map((row) => ({
            input: row.expected,
            result: normalizeCategory(row.input),
          }));
        });

        Then("each call returns the expected result", () => {
          for (const entry of state.normalizeCategoryResults) {
            expect(entry.result).toBe(entry.input);
          }
        });
      });

      RuleScenario("Invalid values normalize to domain", ({ When, Then }) => {
        When("normalizeCategory is called with invalid values:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
          state.normalizeCategoryResults = rows.map((row) => {
            const actual = coerceValue(row.value, row.type);
            return { input: actual, result: normalizeCategory(actual) };
          });
        });

        Then('each call returns "domain"', () => {
          for (const entry of state.normalizeCategoryResults) {
            expect(entry.result).toBe("domain");
          }
        });
      });
    }
  );

  // ==========================================================================
  // normalizeSchemaVersion
  // ==========================================================================

  Rule(
    "normalizeSchemaVersion returns valid positive integers or falls back to 1",
    ({ RuleScenario }) => {
      RuleScenario("Positive integers are returned unchanged", ({ When, Then }) => {
        When("normalizeSchemaVersion is called with:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ input: string; expected: string }>(dataTable);
          state.normalizeVersionResults = rows.map((row) => ({
            input: Number(row.expected),
            result: normalizeSchemaVersion(Number(row.input)),
          }));
        });

        Then("each call returns the expected version number", () => {
          for (const entry of state.normalizeVersionResults) {
            expect(entry.result).toBe(entry.input);
          }
        });
      });

      RuleScenario("Invalid values normalize to 1", ({ When, Then }) => {
        When("normalizeSchemaVersion is called with invalid values:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string; type: string }>(dataTable);
          state.normalizeVersionResults = rows.map((row) => {
            const actual = coerceValue(row.value, row.type);
            return { input: actual, result: normalizeSchemaVersion(actual) };
          });
        });

        Then("each call returns 1", () => {
          for (const entry of state.normalizeVersionResults) {
            expect(entry.result).toBe(1);
          }
        });
      });
    }
  );

  // ==========================================================================
  // isExternalCategory
  // ==========================================================================

  Rule("isExternalCategory identifies trigger and fat as external", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as external or internal", ({ When, Then }) => {
      When("isExternalCategory is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.externalResults = rows.map((row) => ({
          category: row.category,
          result: isExternalCategory(row.category as "domain" | "integration" | "trigger" | "fat"),
        }));
      });

      Then("each call returns the expected classification", () => {
        for (const row of state.externalResults) {
          expect(row.result).toBe(row.category === "trigger" || row.category === "fat");
        }
      });
    });
  });

  // ==========================================================================
  // isCrossContextCategory
  // ==========================================================================

  Rule("isCrossContextCategory identifies integration as cross-context", ({ RuleScenario }) => {
    RuleScenario("Classification of categories as cross-context", ({ When, Then }) => {
      When("isCrossContextCategory is called with each category:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; expected: string }>(dataTable);
        state.crossContextResults = rows.map((row) => ({
          category: row.category,
          result: isCrossContextCategory(
            row.category as "domain" | "integration" | "trigger" | "fat"
          ),
        }));
      });

      Then("each call returns the expected cross-context classification", () => {
        for (const row of state.crossContextResults) {
          expect(row.result).toBe(row.category === "integration");
        }
      });
    });
  });
});
