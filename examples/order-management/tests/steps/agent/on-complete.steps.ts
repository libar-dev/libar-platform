/**
 * Agent onComplete Handler - Step Definitions
 *
 * BDD step definitions for the agent onComplete handler that routes
 * success/canceled/failed results and manages dead letter entries.
 *
 * Uses convex-test for isolated testing with mocked DB.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createUnitTestContext } from "../../support/setup";

// =============================================================================
// Test State
// =============================================================================

type UnitTestContext = ReturnType<typeof createUnitTestContext>;

const AGENT_ID = "churn-risk-agent";

const baseContext = {
  agentId: AGENT_ID,
  subscriptionId: "sub_churn-risk",
  eventId: "evt_test_1",
  eventType: "OrderCancelled",
  globalPosition: 100,
  correlationId: "corr_1",
  causationId: "cause_1",
  streamId: "order_test_1",
  streamType: "Order",
  boundedContext: "orders",
};

interface TestState {
  t: UnitTestContext;
  deadLetterCount: number;
  deadLetter: {
    attemptCount: number;
    status: string;
    error: string;
    globalPosition: number;
    [key: string]: unknown;
  } | null;
}

function createInitialState(): TestState {
  return {
    t: createUnitTestContext(),
    deadLetterCount: 0,
    deadLetter: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers
// =============================================================================

async function queryDeadLetters(t: UnitTestContext) {
  return await t.query(api.queries.agent.getDeadLetters, {
    agentId: AGENT_ID,
    limit: 1000,
  });
}

async function refreshDeadLetterState() {
  const results = await queryDeadLetters(state.t);
  state.deadLetterCount = results.length;
  state.deadLetter =
    (results.find(
      (dl: { eventId: string }) => dl.eventId === baseContext.eventId
    ) as TestState["deadLetter"]) ?? null;
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/on-complete.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("a fresh unit test context", () => {
      expect(state.t).toBeDefined();
    });
  });

  // ===========================================================================
  // Rule: Successful and canceled results do not create dead letters
  // ===========================================================================

  Rule("Successful and canceled results do not create dead letters", ({ RuleScenario }) => {
    RuleScenario("No dead letter on success", ({ When, Then }) => {
      When("the onComplete handler receives a success result", async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: "work_1",
            context: baseContext,
            result: { kind: "success", returnValue: null },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 0", () => {
        expect(state.deadLetterCount).toBe(0);
      });
    });

    RuleScenario("No dead letter on canceled", ({ When, Then }) => {
      When("the onComplete handler receives a canceled result", async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: "work_2",
            context: baseContext,
            result: { kind: "canceled" },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 0", () => {
        expect(state.deadLetterCount).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Rule: Failed results create dead letters with error details
  // ===========================================================================

  Rule("Failed results create dead letters with error details", ({ RuleScenario }) => {
    RuleScenario("Creates dead letter on failure", ({ When, Then, And }) => {
      When('the onComplete handler receives a failed result with error "Test error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: "work_3",
            context: baseContext,
            result: { kind: "failed", error: "Test error" },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 1", () => {
        expect(state.deadLetterCount).toBe(1);
      });

      And(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expect(state.deadLetter).not.toBeNull();
          for (const row of table) {
            const actual = state.deadLetter![row.field];
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(actual).toBe(expected);
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Repeated failures increment attempt count
  // ===========================================================================

  Rule("Repeated failures increment attempt count", ({ RuleScenario }) => {
    RuleScenario("Increments attemptCount on repeated failure", ({ Given, When, Then, And }) => {
      Given('a first failure with error "First error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: "work_4a",
            context: baseContext,
            result: { kind: "failed", error: "First error" },
          }
        );
      });

      When(
        'the onComplete handler receives a failed result with error "Second error"',
        async () => {
          await state.t.mutation(
            internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
            {
              workId: "work_4b",
              context: baseContext,
              result: { kind: "failed", error: "Second error" },
            }
          );
          await refreshDeadLetterState();
        }
      );

      Then("the dead letter count should be 1", () => {
        expect(state.deadLetterCount).toBe(1);
      });

      And(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expect(state.deadLetter).not.toBeNull();
          for (const row of table) {
            const actual = state.deadLetter![row.field];
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(actual).toBe(expected);
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Terminal dead letters are not updated
  // ===========================================================================

  Rule("Terminal dead letters are not updated", ({ RuleScenario }) => {
    RuleScenario("Does not update dead letter in terminal state", ({ Given, And, When, Then }) => {
      Given('a first failure with error "Original error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: "work_5a",
            context: baseContext,
            result: { kind: "failed", error: "Original error" },
          }
        );
      });

      And('the dead letter is marked as ignored with reason "Test ignore"', async () => {
        await state.t.mutation(internal.contexts.agent.handlers.onComplete.ignoreDeadLetter, {
          eventId: "evt_test_1",
          reason: "Test ignore",
        });
      });

      When(
        'the onComplete handler receives a failed result with error "Should not overwrite"',
        async () => {
          await state.t.mutation(
            internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
            {
              workId: "work_5b",
              context: baseContext,
              result: { kind: "failed", error: "Should not overwrite" },
            }
          );
          await refreshDeadLetterState();
        }
      );

      Then(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expect(state.deadLetter).not.toBeNull();
          for (const row of table) {
            const actual = state.deadLetter![row.field];
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(actual).toBe(expected);
          }
        }
      );
    });
  });
});
