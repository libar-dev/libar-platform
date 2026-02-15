/**
 * Cost Budget - Step Definitions
 *
 * BDD step definitions for checkBudget(), estimateCost(), and DEFAULT_MODEL_COSTS including:
 * - Budget allowed when under budget
 * - Budget denied when would exceed
 * - Alert threshold flag
 * - Below alert threshold
 * - Cost estimation arithmetic
 * - Default model costs entries
 *
 * Mechanical migration from tests/unit/agent/cost-budget.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  checkBudget,
  estimateCost,
  DEFAULT_MODEL_COSTS,
  type CostTracker,
} from "../../../src/agent/cost-budget.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  tracker: CostTracker | null;
  budgetResult: ReturnType<typeof checkBudget> | null;
  estimatedCost: number | null;
  modelEntry: { input: number; output: number } | null;
  modelKey: string | null;
}

function createInitialState(): TestState {
  return {
    tracker: null,
    budgetResult: null,
    estimatedCost: null,
    modelEntry: null,
    modelKey: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/cost-budget.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: Budget checks allow or deny based on remaining budget
  // ===========================================================================

  Rule("Budget checks allow or deny based on remaining budget", ({ RuleScenario }) => {
    RuleScenario(
      "Allowed when current spend plus estimated cost is under budget",
      ({ Given, When, Then, And }) => {
        Given(
          "a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8",
          () => {
            state.tracker = {
              currentSpend: 5,
              budget: { dailyBudget: 10, alertThreshold: 0.8 },
            };
          }
        );

        When("I check the budget with estimatedCost 1", () => {
          state.budgetResult = checkBudget(state.tracker!, 1);
        });

        Then("the result allowed is true", () => {
          expect(state.budgetResult!.allowed).toBe(true);
        });

        And("the remaining budget is 4", () => {
          if (state.budgetResult!.allowed) {
            expect(state.budgetResult!.remainingBudget).toBe(4);
          }
        });
      }
    );

    RuleScenario("Denied when estimated cost would exceed budget", ({ Given, When, Then, And }) => {
      Given(
        "a cost tracker with currentSpend 9.5 and dailyBudget 10 and alertThreshold 0.8",
        () => {
          state.tracker = {
            currentSpend: 9.5,
            budget: { dailyBudget: 10, alertThreshold: 0.8 },
          };
        }
      );

      When("I check the budget with estimatedCost 1", () => {
        state.budgetResult = checkBudget(state.tracker!, 1);
      });

      Then("the result allowed is false", () => {
        expect(state.budgetResult!.allowed).toBe(false);
      });

      And("the denial has the following properties:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{ property: string; value: string }>(table);
        if (!state.budgetResult!.allowed) {
          for (const row of rows) {
            const prop = row["property"];
            const expected = row["value"];
            if (prop === "reason") {
              expect(state.budgetResult!.reason).toBe(expected);
            } else if (prop === "currentSpend") {
              expect(state.budgetResult!.currentSpend).toBe(Number(expected));
            } else if (prop === "dailyBudget") {
              expect(state.budgetResult!.dailyBudget).toBe(Number(expected));
            }
          }
        }
      });
    });

    RuleScenario("Denied when current spend already equals budget", ({ Given, When, Then }) => {
      Given("a cost tracker with currentSpend 10 and dailyBudget 10 and alertThreshold 0.8", () => {
        state.tracker = {
          currentSpend: 10,
          budget: { dailyBudget: 10, alertThreshold: 0.8 },
        };
      });

      When("I check the budget with estimatedCost 0.01", () => {
        state.budgetResult = checkBudget(state.tracker!, 0.01);
      });

      Then("the result allowed is false", () => {
        expect(state.budgetResult!.allowed).toBe(false);
      });
    });

    RuleScenario(
      "Allowed when estimated cost exactly reaches budget",
      ({ Given, When, Then, And }) => {
        Given(
          "a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8",
          () => {
            state.tracker = {
              currentSpend: 5,
              budget: { dailyBudget: 10, alertThreshold: 0.8 },
            };
          }
        );

        When("I check the budget with estimatedCost 5", () => {
          state.budgetResult = checkBudget(state.tracker!, 5);
        });

        Then("the result allowed is true", () => {
          expect(state.budgetResult!.allowed).toBe(true);
        });

        And("the remaining budget is 0", () => {
          if (state.budgetResult!.allowed) {
            expect(state.budgetResult!.remainingBudget).toBe(0);
          }
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Alert threshold flags when spend ratio meets or exceeds threshold
  // ===========================================================================

  Rule("Alert threshold flags when spend ratio meets or exceeds threshold", ({ RuleScenario }) => {
    RuleScenario(
      "Sets atAlertThreshold when spend exceeds alert threshold",
      ({ Given, When, Then, And }) => {
        Given(
          "a cost tracker with currentSpend 8.5 and dailyBudget 10 and alertThreshold 0.8",
          () => {
            state.tracker = {
              currentSpend: 8.5,
              budget: { dailyBudget: 10, alertThreshold: 0.8 },
            };
          }
        );

        When("I check the budget with estimatedCost 0.5", () => {
          state.budgetResult = checkBudget(state.tracker!, 0.5);
        });

        Then("the result allowed is true", () => {
          expect(state.budgetResult!.allowed).toBe(true);
        });

        And("the atAlertThreshold flag is true", () => {
          if (state.budgetResult!.allowed) {
            expect(state.budgetResult!.atAlertThreshold).toBe(true);
          }
        });
      }
    );

    RuleScenario(
      "Does not set atAlertThreshold when below threshold",
      ({ Given, When, Then, And }) => {
        Given(
          "a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8",
          () => {
            state.tracker = {
              currentSpend: 5,
              budget: { dailyBudget: 10, alertThreshold: 0.8 },
            };
          }
        );

        When("I check the budget with estimatedCost 1", () => {
          state.budgetResult = checkBudget(state.tracker!, 1);
        });

        Then("the result allowed is true", () => {
          expect(state.budgetResult!.allowed).toBe(true);
        });

        And("the atAlertThreshold flag is false", () => {
          if (state.budgetResult!.allowed) {
            expect(state.budgetResult!.atAlertThreshold).toBe(false);
          }
        });
      }
    );

    RuleScenario(
      "Sets atAlertThreshold at exact threshold boundary",
      ({ Given, When, Then, And }) => {
        Given(
          "a cost tracker with currentSpend 8 and dailyBudget 10 and alertThreshold 0.8",
          () => {
            state.tracker = {
              currentSpend: 8,
              budget: { dailyBudget: 10, alertThreshold: 0.8 },
            };
          }
        );

        When("I check the budget with estimatedCost 0.5", () => {
          state.budgetResult = checkBudget(state.tracker!, 0.5);
        });

        Then("the result allowed is true", () => {
          expect(state.budgetResult!.allowed).toBe(true);
        });

        And("the atAlertThreshold flag is true", () => {
          if (state.budgetResult!.allowed) {
            expect(state.budgetResult!.atAlertThreshold).toBe(true);
          }
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Cost estimation performs token-cost multiplication
  // ===========================================================================

  Rule("Cost estimation performs token-cost multiplication", ({ RuleScenario }) => {
    RuleScenario("Simple multiplication of tokens and cost per token", ({ When, Then }) => {
      When("I estimate cost for 1000 tokens at 0.000003 per token", () => {
        state.estimatedCost = estimateCost(1000, 0.000003);
      });

      Then("the estimated cost is 0.003", () => {
        expect(state.estimatedCost).toBe(0.003);
      });
    });

    RuleScenario("Returns 0 for 0 tokens", ({ When, Then }) => {
      When("I estimate cost for 0 tokens at 0.000003 per token", () => {
        state.estimatedCost = estimateCost(0, 0.000003);
      });

      Then("the estimated cost is 0", () => {
        expect(state.estimatedCost).toBe(0);
      });
    });

    RuleScenario("Handles large token counts", ({ When, Then }) => {
      When("I estimate cost for 1000000 tokens at 0.000003 per token", () => {
        state.estimatedCost = estimateCost(1_000_000, 0.000003);
      });

      Then("the estimated cost is approximately 3.0", () => {
        expect(state.estimatedCost).toBeCloseTo(3.0);
      });
    });

    RuleScenario("Handles very small cost per token", ({ When, Then }) => {
      When("I estimate cost for 100 tokens at 0.00000015 per token", () => {
        state.estimatedCost = estimateCost(100, 0.00000015);
      });

      Then("the estimated cost is approximately 0.000015", () => {
        expect(state.estimatedCost).toBeCloseTo(0.000015);
      });
    });
  });

  // ===========================================================================
  // Rule: Default model costs contain expected entries
  // ===========================================================================

  Rule("Default model costs contain expected entries", ({ RuleScenario }) => {
    RuleScenario(
      "Claude model entry has positive input and output costs with output greater than input",
      ({ When, Then, And }) => {
        When('I look up the "anthropic/claude-sonnet-4-5-20250929" model costs', () => {
          state.modelKey = "anthropic/claude-sonnet-4-5-20250929";
          state.modelEntry =
            DEFAULT_MODEL_COSTS[
              "anthropic/claude-sonnet-4-5-20250929" as keyof typeof DEFAULT_MODEL_COSTS
            ];
        });

        Then("the model entry is defined", () => {
          expect(state.modelEntry).toBeDefined();
        });

        And("the input cost is greater than 0", () => {
          expect(state.modelEntry!.input).toBeGreaterThan(0);
        });

        And("the output cost is greater than 0", () => {
          expect(state.modelEntry!.output).toBeGreaterThan(0);
        });

        And("the output cost is greater than the input cost", () => {
          expect(state.modelEntry!.output).toBeGreaterThan(state.modelEntry!.input);
        });
      }
    );

    RuleScenario(
      "GPT-4o model entry has positive input and output costs",
      ({ When, Then, And }) => {
        When('I look up the "openai/gpt-4o" model costs', () => {
          state.modelKey = "openai/gpt-4o";
          state.modelEntry =
            DEFAULT_MODEL_COSTS["openai/gpt-4o" as keyof typeof DEFAULT_MODEL_COSTS];
        });

        Then("the model entry is defined", () => {
          expect(state.modelEntry).toBeDefined();
        });

        And("the input cost is greater than 0", () => {
          expect(state.modelEntry!.input).toBeGreaterThan(0);
        });

        And("the output cost is greater than 0", () => {
          expect(state.modelEntry!.output).toBeGreaterThan(0);
        });
      }
    );

    RuleScenario("GPT-4o-mini model entry is cheaper than GPT-4o", ({ When, Then, And }) => {
      When('I look up the "openai/gpt-4o-mini" model costs', () => {
        state.modelKey = "openai/gpt-4o-mini";
        state.modelEntry =
          DEFAULT_MODEL_COSTS["openai/gpt-4o-mini" as keyof typeof DEFAULT_MODEL_COSTS];
      });

      Then("the model entry is defined", () => {
        expect(state.modelEntry).toBeDefined();
      });

      And("the input cost is greater than 0", () => {
        expect(state.modelEntry!.input).toBeGreaterThan(0);
      });

      And("the output cost is greater than 0", () => {
        expect(state.modelEntry!.output).toBeGreaterThan(0);
      });

      And('the input cost is less than the "openai/gpt-4o" input cost', () => {
        expect(state.modelEntry!.input).toBeLessThan(
          DEFAULT_MODEL_COSTS["openai/gpt-4o" as keyof typeof DEFAULT_MODEL_COSTS].input
        );
      });
    });
  });
});
