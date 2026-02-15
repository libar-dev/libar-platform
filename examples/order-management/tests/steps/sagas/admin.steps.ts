/**
 * Saga Admin Operations - Step Definitions
 *
 * BDD step definitions for saga admin query and mutation operations.
 * Uses convex-test for isolated, fast testing with mocked DB.
 *
 * Tests DB-only logic: query functions and transition validation.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../../convex/_generated/api";
import { createUnitTestContext } from "../../support/setup";
import type { Id } from "../../../convex/_generated/dataModel";

// =============================================================================
// Test State
// =============================================================================

type UnitTestContext = ReturnType<typeof createUnitTestContext>;

interface TestState {
  t: UnitTestContext;
  statsResult: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    compensating: number;
  } | null;
  stuckSagasResult: Array<{ sagaId: string; [key: string]: unknown }>;
  failedSagasResult: Array<{ sagaId: string; [key: string]: unknown }>;
  mutationResult: { status: string; currentStatus?: string; [key: string]: unknown } | null;
}

function createInitialState(): TestState {
  return {
    t: createUnitTestContext(),
    statsResult: null,
    stuckSagasResult: [],
    failedSagasResult: [],
    mutationResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: Insert saga record directly into DB
// =============================================================================

async function insertSaga(
  t: UnitTestContext,
  data: {
    sagaType: string;
    sagaId: string;
    status: "pending" | "running" | "completed" | "failed" | "compensating";
    workflowId?: string;
    updatedAt?: number;
    createdAt?: number;
    error?: string;
    completedAt?: number;
  }
): Promise<Id<"sagas">> {
  const now = Date.now();
  return await t.run(async (ctx) => {
    return await ctx.db.insert("sagas", {
      sagaType: data.sagaType,
      sagaId: data.sagaId,
      status: data.status,
      workflowId: data.workflowId ?? `wf_${data.sagaId}`,
      triggerEventId: `evt_${data.sagaId}`,
      triggerGlobalPosition: 1,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
      error: data.error,
      completedAt: data.completedAt,
    });
  });
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/sagas/admin.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("a fresh unit test context", () => {
      expect(state.t).toBeDefined();
    });
  });

  // ==========================================================================
  // Rule: getSagaStats returns status counts for a saga type
  // ==========================================================================

  Rule("getSagaStats returns status counts for a saga type", ({ RuleScenario }) => {
    RuleScenario("Returns zero counts for empty database", ({ When, Then }) => {
      When('I query getSagaStats for saga type "OrderFulfillment"', async () => {
        state.statsResult = await state.t.query(api.sagas.admin.getSagaStats, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the stats should have counts:", (_ctx: unknown, table: Record<string, string>[]) => {
        expect(state.statsResult).not.toBeNull();
        for (const row of table) {
          const status = row.status as keyof NonNullable<typeof state.statsResult>;
          const expected = parseInt(row.count, 10);
          expect(state.statsResult![status]).toBe(expected);
        }
      });
    });

    RuleScenario("Counts sagas by status correctly", ({ Given, When, Then }) => {
      Given(
        "the following sagas exist:",
        async (_ctx: unknown, table: Record<string, string>[]) => {
          for (const row of table) {
            await insertSaga(state.t, {
              sagaType: row.sagaType,
              sagaId: row.sagaId,
              status: row.status as "pending" | "running" | "completed" | "failed" | "compensating",
              error: row.error || undefined,
            });
          }
        }
      );

      When('I query getSagaStats for saga type "OrderFulfillment"', async () => {
        state.statsResult = await state.t.query(api.sagas.admin.getSagaStats, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the stats should have counts:", (_ctx: unknown, table: Record<string, string>[]) => {
        expect(state.statsResult).not.toBeNull();
        for (const row of table) {
          const status = row.status as keyof NonNullable<typeof state.statsResult>;
          const expected = parseInt(row.count, 10);
          expect(state.statsResult![status]).toBe(expected);
        }
      });
    });

    RuleScenario("Filters by saga type", ({ Given, When, Then }) => {
      Given(
        "the following sagas exist:",
        async (_ctx: unknown, table: Record<string, string>[]) => {
          for (const row of table) {
            await insertSaga(state.t, {
              sagaType: row.sagaType,
              sagaId: row.sagaId,
              status: row.status as "pending" | "running" | "completed" | "failed" | "compensating",
            });
          }
        }
      );

      When('I query getSagaStats for saga type "OrderFulfillment"', async () => {
        state.statsResult = await state.t.query(api.sagas.admin.getSagaStats, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the stats should show completed count of 2", () => {
        expect(state.statsResult!.completed).toBe(2);
      });

      When('I query getSagaStats for saga type "PaymentProcessing"', async () => {
        state.statsResult = await state.t.query(api.sagas.admin.getSagaStats, {
          sagaType: "PaymentProcessing",
        });
      });

      Then("the stats should show completed count of 1", () => {
        expect(state.statsResult!.completed).toBe(1);
      });
    });
  });

  // ==========================================================================
  // Rule: getStuckSagas returns running sagas older than a threshold
  // ==========================================================================

  Rule("getStuckSagas returns running sagas older than a threshold", ({ RuleScenario }) => {
    RuleScenario("Returns empty array when no sagas exist", ({ When, Then }) => {
      When('I query getStuckSagas for saga type "OrderFulfillment"', async () => {
        state.stuckSagasResult = await state.t.query(api.sagas.admin.getStuckSagas, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the stuck sagas result is empty", () => {
        expect(state.stuckSagasResult).toEqual([]);
      });
    });

    RuleScenario("Returns running sagas older than threshold", ({ Given, And, When, Then }) => {
      Given(
        'a saga "old-running" of type "OrderFulfillment" with status "running" updated 2 hours ago',
        async () => {
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: "old-running",
            status: "running",
            updatedAt: twoHoursAgo,
          });
        }
      );

      And(
        'a saga "recent-running" of type "OrderFulfillment" with status "running" updated 30 minutes ago',
        async () => {
          const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: "recent-running",
            status: "running",
            updatedAt: thirtyMinutesAgo,
          });
        }
      );

      And(
        'a saga "completed" of type "OrderFulfillment" with status "completed" updated 2 hours ago',
        async () => {
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: "completed",
            status: "completed",
            updatedAt: twoHoursAgo,
          });
        }
      );

      When('I query getStuckSagas for saga type "OrderFulfillment"', async () => {
        state.stuckSagasResult = await state.t.query(api.sagas.admin.getStuckSagas, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the stuck sagas result has 1 entry", () => {
        expect(state.stuckSagasResult.length).toBe(1);
      });

      And('the stuck saga has sagaId "old-running"', () => {
        expect(state.stuckSagasResult[0].sagaId).toBe("old-running");
      });
    });

    RuleScenario("Respects custom threshold", ({ Given, When, Then, And }) => {
      Given(
        'a saga "ten-min-old" of type "OrderFulfillment" with status "running" updated 10 minutes ago',
        async () => {
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: "ten-min-old",
            status: "running",
            updatedAt: tenMinutesAgo,
          });
        }
      );

      When(
        'I query getStuckSagas for saga type "OrderFulfillment" with threshold 5 minutes',
        async () => {
          state.stuckSagasResult = await state.t.query(api.sagas.admin.getStuckSagas, {
            sagaType: "OrderFulfillment",
            thresholdMs: 5 * 60 * 1000,
          });
        }
      );

      Then("the stuck sagas result has 1 entry", () => {
        expect(state.stuckSagasResult.length).toBe(1);
      });

      And('the stuck saga has sagaId "ten-min-old"', () => {
        expect(state.stuckSagasResult[0].sagaId).toBe("ten-min-old");
      });
    });
  });

  // ==========================================================================
  // Rule: getFailedSagas returns only failed sagas of a given type
  // ==========================================================================

  Rule("getFailedSagas returns only failed sagas of a given type", ({ RuleScenario }) => {
    RuleScenario("Returns empty array when no failed sagas", ({ Given, When, Then }) => {
      Given('a saga "1" of type "OrderFulfillment" with status "completed"', async () => {
        await insertSaga(state.t, {
          sagaType: "OrderFulfillment",
          sagaId: "1",
          status: "completed",
        });
      });

      When('I query getFailedSagas for saga type "OrderFulfillment"', async () => {
        state.failedSagasResult = await state.t.query(api.sagas.admin.getFailedSagas, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the failed sagas result is empty", () => {
        expect(state.failedSagasResult).toEqual([]);
      });
    });

    RuleScenario("Returns only failed sagas", ({ Given, When, Then, And }) => {
      Given(
        "the following sagas exist:",
        async (_ctx: unknown, table: Record<string, string>[]) => {
          for (const row of table) {
            await insertSaga(state.t, {
              sagaType: row.sagaType,
              sagaId: row.sagaId,
              status: row.status as "pending" | "running" | "completed" | "failed" | "compensating",
              error: row.error || undefined,
            });
          }
        }
      );

      When('I query getFailedSagas for saga type "OrderFulfillment"', async () => {
        state.failedSagasResult = await state.t.query(api.sagas.admin.getFailedSagas, {
          sagaType: "OrderFulfillment",
        });
      });

      Then("the failed sagas result has 2 entries", () => {
        expect(state.failedSagasResult.length).toBe(2);
      });

      And("the failed saga IDs include:", (_ctx: unknown, table: Record<string, string>[]) => {
        const actualIds = state.failedSagasResult.map((s) => s.sagaId).sort();
        const expectedIds = table.map((row: Record<string, string>) => row.sagaId).sort();
        expect(actualIds).toEqual(expectedIds);
      });
    });

    RuleScenario("Respects limit parameter", ({ Given, When, Then }) => {
      Given('5 failed sagas of type "OrderFulfillment"', async () => {
        for (let i = 1; i <= 5; i++) {
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: `${i}`,
            status: "failed",
          });
        }
      });

      When('I query getFailedSagas for saga type "OrderFulfillment" with limit 3', async () => {
        state.failedSagasResult = await state.t.query(api.sagas.admin.getFailedSagas, {
          sagaType: "OrderFulfillment",
          limit: 3,
        });
      });

      Then("the failed sagas result has 3 entries", () => {
        expect(state.failedSagasResult.length).toBe(3);
      });
    });
  });

  // ==========================================================================
  // Rule: markSagaFailed validates state transitions
  // ==========================================================================

  Rule(
    "markSagaFailed validates state transitions before marking a saga as failed",
    ({ RuleScenarioOutline, RuleScenario }) => {
      RuleScenarioOutline(
        "Allows marking valid-source-status saga as failed",
        ({ Given, When, Then }, variables: { source_status: string; reason: string }) => {
          Given(
            'a saga "test" of type "OrderFulfillment" with status "<source_status>"',
            async () => {
              await insertSaga(state.t, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
                status: variables.source_status as "pending" | "running" | "compensating",
              });
            }
          );

          When(
            'I call markSagaFailed for saga "test" of type "OrderFulfillment" with reason "<reason>"',
            async () => {
              state.mutationResult = await state.t.mutation(api.sagas.admin.markSagaFailed, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
                reason: variables.reason,
              });
            }
          );

          Then('the mutation result status is "marked_failed"', () => {
            expect(state.mutationResult!.status).toBe("marked_failed");
          });
        }
      );

      RuleScenarioOutline(
        "Rejects marking invalid-source-status saga as failed",
        ({ Given, When, Then, And }, variables: { source_status: string }) => {
          Given(
            'a saga "test" of type "OrderFulfillment" with status "<source_status>"',
            async () => {
              await insertSaga(state.t, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
                status: variables.source_status as "completed" | "failed",
              });
            }
          );

          When(
            'I call markSagaFailed for saga "test" of type "OrderFulfillment" with reason "Should not work"',
            async () => {
              state.mutationResult = await state.t.mutation(api.sagas.admin.markSagaFailed, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
                reason: "Should not work",
              });
            }
          );

          Then('the mutation result status is "invalid_transition"', () => {
            expect(state.mutationResult!.status).toBe("invalid_transition");
          });

          And('the mutation result currentStatus is "<source_status>"', () => {
            expect(state.mutationResult!.currentStatus).toBe(variables.source_status);
          });
        }
      );

      RuleScenario("Returns not_found for non-existent saga", ({ When, Then }) => {
        When(
          'I call markSagaFailed for saga "nonexistent" of type "OrderFulfillment" with reason "Should not work"',
          async () => {
            state.mutationResult = await state.t.mutation(api.sagas.admin.markSagaFailed, {
              sagaType: "OrderFulfillment",
              sagaId: "nonexistent",
              reason: "Should not work",
            });
          }
        );

        Then('the mutation result status is "not_found"', () => {
          expect(state.mutationResult!.status).toBe("not_found");
        });
      });
    }
  );

  // ==========================================================================
  // Rule: markSagaCompensated validates state transitions
  // ==========================================================================

  Rule(
    "markSagaCompensated validates state transitions before marking a saga as compensated",
    ({ RuleScenario }) => {
      RuleScenario("Allows marking failed saga as compensated", ({ Given, When, Then }) => {
        Given('a saga "test" of type "OrderFulfillment" with status "failed"', async () => {
          await insertSaga(state.t, {
            sagaType: "OrderFulfillment",
            sagaId: "test",
            status: "failed",
          });
        });

        When('I call markSagaCompensated for saga "test" of type "OrderFulfillment"', async () => {
          state.mutationResult = await state.t.mutation(api.sagas.admin.markSagaCompensated, {
            sagaType: "OrderFulfillment",
            sagaId: "test",
          });
        });

        Then('the mutation result status is "marked_compensated"', () => {
          expect(state.mutationResult!.status).toBe("marked_compensated");
        });
      });

      RuleScenario(
        "Rejects marking non-failed saga as compensated",
        ({ Given, When, Then, And }) => {
          Given('a saga "test" of type "OrderFulfillment" with status "running"', async () => {
            await insertSaga(state.t, {
              sagaType: "OrderFulfillment",
              sagaId: "test",
              status: "running",
            });
          });

          When(
            'I call markSagaCompensated for saga "test" of type "OrderFulfillment"',
            async () => {
              state.mutationResult = await state.t.mutation(api.sagas.admin.markSagaCompensated, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
              });
            }
          );

          Then('the mutation result status is "invalid_transition"', () => {
            expect(state.mutationResult!.status).toBe("invalid_transition");
          });

          And('the mutation result currentStatus is "running"', () => {
            expect(state.mutationResult!.currentStatus).toBe("running");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: retrySaga validates state transitions
  // ==========================================================================

  Rule(
    "retrySaga validates state transitions before retrying a saga",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario("Allows retrying failed saga", ({ Given, When, Then }) => {
        Given(
          'a saga "test" of type "OrderFulfillment" with status "failed" and error "Previous error"',
          async () => {
            await insertSaga(state.t, {
              sagaType: "OrderFulfillment",
              sagaId: "test",
              status: "failed",
              error: "Previous error",
            });
          }
        );

        When('I call retrySaga for saga "test" of type "OrderFulfillment"', async () => {
          state.mutationResult = await state.t.mutation(api.sagas.admin.retrySaga, {
            sagaType: "OrderFulfillment",
            sagaId: "test",
          });
        });

        Then('the mutation result status is "reset_to_pending"', () => {
          expect(state.mutationResult!.status).toBe("reset_to_pending");
        });
      });

      RuleScenarioOutline(
        "Rejects retrying non-failed saga",
        ({ Given, When, Then, And }, variables: { source_status: string }) => {
          Given(
            'a saga "test" of type "OrderFulfillment" with status "<source_status>"',
            async () => {
              await insertSaga(state.t, {
                sagaType: "OrderFulfillment",
                sagaId: "test",
                status: variables.source_status as "running" | "completed",
              });
            }
          );

          When('I call retrySaga for saga "test" of type "OrderFulfillment"', async () => {
            state.mutationResult = await state.t.mutation(api.sagas.admin.retrySaga, {
              sagaType: "OrderFulfillment",
              sagaId: "test",
            });
          });

          Then('the mutation result status is "invalid_state"', () => {
            expect(state.mutationResult!.status).toBe("invalid_state");
          });

          And('the mutation result currentStatus is "<source_status>"', () => {
            expect(state.mutationResult!.currentStatus).toBe(variables.source_status);
          });
        }
      );
    }
  );
});
