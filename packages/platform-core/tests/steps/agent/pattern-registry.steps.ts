/**
 * Pattern Registry - Step Definitions
 *
 * BDD step definitions for validatePatternDefinitions() including:
 * - Error code constants (completeness and correctness)
 * - Valid patterns (single, multiple, windowed, analyzer)
 * - Empty array
 * - Duplicate names
 * - Missing name
 * - Missing trigger
 * - Error code mapping
 * - Type safety
 *
 * Mechanical migration from tests/unit/agent/pattern-registry.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  validatePatternDefinitions,
  PATTERN_REGISTRY_ERROR_CODES,
  type PatternRegistryErrorCode,
} from "../../../src/agent/pattern-registry.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";

// =============================================================================
// Test Helpers
// =============================================================================

const makePattern = (name: string, overrides?: Partial<PatternDefinition>): PatternDefinition => ({
  name,
  window: { duration: "7d" },
  trigger: () => true,
  ...overrides,
});

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  patterns: PatternDefinition[] | readonly PatternDefinition[];
  result: ReturnType<typeof validatePatternDefinitions> | null;
}

function createInitialState(): TestState {
  return {
    patterns: [],
    result: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/pattern-registry.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: Error code constants are complete and correct
  // ==========================================================================

  Rule("Error code constants are complete and correct", ({ RuleScenario }) => {
    RuleScenario("Error codes object contains all expected codes", ({ Then, And }) => {
      Then(
        "PATTERN_REGISTRY_ERROR_CODES contains all expected codes:",
        (_ctx: unknown, dataTable: unknown) => {
          const table = dataTable as { code: string; value: string }[];
          for (const row of table) {
            expect(
              PATTERN_REGISTRY_ERROR_CODES[row.code as keyof typeof PATTERN_REGISTRY_ERROR_CODES]
            ).toBe(row.value);
          }
        }
      );

      And("PATTERN_REGISTRY_ERROR_CODES has exactly 4 keys", () => {
        expect(Object.keys(PATTERN_REGISTRY_ERROR_CODES)).toHaveLength(4);
      });
    });
  });

  // ==========================================================================
  // Rule: Valid patterns pass validation
  // ==========================================================================

  Rule("Valid patterns pass validation", ({ RuleScenario }) => {
    RuleScenario("Single valid pattern passes", ({ Given, When, Then }) => {
      Given('a valid pattern named "churn-risk"', () => {
        state.patterns = [makePattern("churn-risk")];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then("the result is valid", () => {
        expect(state.result).toEqual({ valid: true });
      });
    });

    RuleScenario("Multiple patterns with unique names pass", ({ Given, When, Then }) => {
      Given("valid patterns named:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { name: string }[];
        state.patterns = table.map((row) => makePattern(row.name));
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then("the result is valid", () => {
        expect(state.result).toEqual({ valid: true });
      });
    });

    RuleScenario(
      "Patterns with different window configurations pass",
      ({ Given, And, When, Then }) => {
        Given('a pattern "short-window" with window duration "1h"', () => {
          state.patterns = [makePattern("short-window", { window: { duration: "1h" } })];
        });

        And(
          'a pattern "long-window" with window duration "30d" and minEvents 5 and eventLimit 200',
          () => {
            (state.patterns as PatternDefinition[]).push(
              makePattern("long-window", {
                window: { duration: "30d", minEvents: 5, eventLimit: 200 },
              })
            );
          }
        );

        When("I validate the pattern definitions", () => {
          state.result = validatePatternDefinitions(state.patterns);
        });

        Then("the result is valid", () => {
          expect(state.result).toEqual({ valid: true });
        });
      }
    );

    RuleScenario("Pattern with analyze function passes", ({ Given, When, Then }) => {
      Given('a pattern "with-analyzer" that has an analyze function', () => {
        state.patterns = [
          makePattern("with-analyzer", {
            analyze: async () => ({
              detected: true,
              confidence: 0.9,
              reasoning: "detected",
              matchingEventIds: [],
            }),
          }),
        ];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then("the result is valid", () => {
        expect(state.result).toEqual({ valid: true });
      });
    });
  });

  // ==========================================================================
  // Rule: Empty array passes validation
  // ==========================================================================

  Rule("Empty array passes validation", ({ RuleScenario }) => {
    RuleScenario("Empty array returns valid", ({ Given, When, Then }) => {
      Given("an empty pattern array", () => {
        state.patterns = [];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then("the result is valid", () => {
        expect(state.result).toEqual({ valid: true });
      });
    });
  });

  // ==========================================================================
  // Rule: Duplicate names are rejected
  // ==========================================================================

  Rule("Duplicate names are rejected", ({ RuleScenario }) => {
    RuleScenario("Two patterns with same name fail", ({ Given, When, Then, And }) => {
      Given("valid patterns named:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { name: string }[];
        state.patterns = table.map((row) => makePattern(row.name));
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "DUPLICATE_PATTERN"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
        }
      });

      And('the error message contains "churn-risk"', () => {
        if (!state.result!.valid) {
          expect(state.result!.message).toContain("churn-risk");
        }
      });
    });

    RuleScenario("Duplicate detected in middle of array", ({ Given, When, Then, And }) => {
      Given("valid patterns named:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { name: string }[];
        state.patterns = table.map((row) => makePattern(row.name));
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "DUPLICATE_PATTERN"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
        }
      });

      And('the error message contains "alpha"', () => {
        if (!state.result!.valid) {
          expect(state.result!.message).toContain("alpha");
        }
      });
    });

    RuleScenario("Short-circuits on first duplicate found", ({ Given, When, Then, And }) => {
      Given("valid patterns named:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { name: string }[];
        state.patterns = table.map((row) => makePattern(row.name));
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "DUPLICATE_PATTERN"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
        }
      });

      And('the error message contains "alpha"', () => {
        if (!state.result!.valid) {
          expect(state.result!.message).toContain("alpha");
        }
      });
    });
  });

  // ==========================================================================
  // Rule: Missing name is rejected
  // ==========================================================================

  Rule("Missing name is rejected", ({ RuleScenario }) => {
    RuleScenario("Empty name fails with PATTERN_NAME_REQUIRED", ({ Given, When, Then }) => {
      Given('a valid pattern named ""', () => {
        state.patterns = [makePattern("")];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
        }
      });
    });

    RuleScenario(
      "Whitespace-only name fails with PATTERN_NAME_REQUIRED",
      ({ Given, When, Then }) => {
        Given('a valid pattern named "   "', () => {
          state.patterns = [makePattern("   ")];
        });

        When("I validate the pattern definitions", () => {
          state.result = validatePatternDefinitions(state.patterns);
        });

        Then('the result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
          expect(state.result!.valid).toBe(false);
          if (!state.result!.valid) {
            expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
          }
        });
      }
    );

    RuleScenario(
      "Invalid pattern short-circuits before duplicate check",
      ({ Given, When, Then }) => {
        Given('a pattern with empty name followed by a pattern named "churn-risk"', () => {
          state.patterns = [makePattern(""), makePattern("churn-risk")];
        });

        When("I validate the pattern definitions", () => {
          state.result = validatePatternDefinitions(state.patterns);
        });

        Then('the result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
          expect(state.result!.valid).toBe(false);
          if (!state.result!.valid) {
            expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Missing trigger is rejected
  // ==========================================================================

  Rule("Missing trigger is rejected", ({ RuleScenario }) => {
    RuleScenario("Pattern without trigger function fails", ({ Given, When, Then }) => {
      Given('a pattern "no-trigger" without a trigger function', () => {
        const badPattern = {
          name: "no-trigger",
          window: { duration: "7d" },
        } as unknown as PatternDefinition;
        state.patterns = [badPattern];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "TRIGGER_REQUIRED"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED);
        }
      });
    });

    RuleScenario("Pattern with non-function trigger fails", ({ Given, When, Then }) => {
      Given('a pattern "bad-trigger" with a non-function trigger', () => {
        const badPattern = {
          name: "bad-trigger",
          window: { duration: "7d" },
          trigger: "not-a-function",
        } as unknown as PatternDefinition;
        state.patterns = [badPattern];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "TRIGGER_REQUIRED"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe(PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: Error codes are mapped correctly at registry level
  // ==========================================================================

  Rule("Error codes are mapped correctly at registry level", ({ RuleScenario }) => {
    RuleScenario(
      "PATTERN_NAME_REQUIRED maps to registry PATTERN_NAME_REQUIRED",
      ({ Given, When, Then }) => {
        Given('a valid pattern named ""', () => {
          state.patterns = [makePattern("")];
        });

        When("I validate the pattern definitions", () => {
          state.result = validatePatternDefinitions(state.patterns);
        });

        Then('the result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
          expect(state.result!.valid).toBe(false);
          if (!state.result!.valid) {
            expect(state.result!.code).toBe("PATTERN_NAME_REQUIRED");
          }
        });
      }
    );

    RuleScenario("TRIGGER_REQUIRED maps to registry TRIGGER_REQUIRED", ({ Given, When, Then }) => {
      Given('a pattern "no-trigger" without a trigger function', () => {
        const badPattern = {
          name: "no-trigger",
          window: { duration: "7d" },
        } as unknown as PatternDefinition;
        state.patterns = [badPattern];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "TRIGGER_REQUIRED"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe("TRIGGER_REQUIRED");
        }
      });
    });

    RuleScenario("Unknown pattern error codes map to INVALID_PATTERN", ({ Given, When, Then }) => {
      Given('a pattern "bad-window" with invalid window duration "invalid"', () => {
        const badPattern = {
          name: "bad-window",
          window: { duration: "invalid" },
          trigger: () => true,
        } as PatternDefinition;
        state.patterns = [badPattern];
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then('the result is invalid with code "INVALID_PATTERN"', () => {
        expect(state.result!.valid).toBe(false);
        if (!state.result!.valid) {
          expect(state.result!.code).toBe("INVALID_PATTERN");
        }
      });
    });
  });

  // ==========================================================================
  // Rule: Type safety is preserved
  // ==========================================================================

  Rule("Type safety is preserved", ({ RuleScenario }) => {
    RuleScenario("Accepts readonly array input", ({ Given, When, Then }) => {
      Given('a frozen readonly pattern array with pattern "frozen-pattern"', () => {
        const patterns: readonly PatternDefinition[] = Object.freeze([
          makePattern("frozen-pattern"),
        ]);
        state.patterns = patterns;
      });

      When("I validate the pattern definitions", () => {
        state.result = validatePatternDefinitions(state.patterns);
      });

      Then("the result is valid", () => {
        expect(state.result).toEqual({ valid: true });
      });
    });

    RuleScenario(
      "Error result has correct discriminated union shape",
      ({ Given, When, Then, And }) => {
        Given("valid patterns named:", (_ctx: unknown, dataTable: unknown) => {
          const table = dataTable as { name: string }[];
          state.patterns = table.map((row) => makePattern(row.name));
        });

        When("I validate the pattern definitions", () => {
          state.result = validatePatternDefinitions(state.patterns);
        });

        Then('the result is invalid with code "DUPLICATE_PATTERN"', () => {
          expect(state.result!.valid).toBe(false);
          if (!state.result!.valid) {
            const code: PatternRegistryErrorCode = state.result!.code;
            expect(code).toBe("DUPLICATE_PATTERN");
          } else {
            expect.unreachable("Expected validation to fail for duplicate names");
          }
        });

        And("the error message is a string", () => {
          if (!state.result!.valid) {
            expect(typeof state.result!.message).toBe("string");
          }
        });
      }
    );
  });
});
