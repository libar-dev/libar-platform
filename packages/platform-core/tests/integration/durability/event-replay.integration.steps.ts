/**
 * Event Replay Integration Test Steps
 *
 * Tests event replay checkpoint management against real Convex backend.
 * Uses replayCheckpoints table to verify replay tracking behavior.
 *
 * @since Phase 18b-1 - EventReplayInfrastructure
 */
import { describe, beforeAll, afterAll, expect } from "vitest";
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { withPrefix } from "../../../src/testing/index.js";

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "../../../../../examples/order-management/tests/integration-features/durability/event-replay.feature"
);

// =============================================================================
// Test State
// =============================================================================

interface CheckpointRecord {
  _id: unknown;
  replayId: string;
  projection: string;
  startPosition: number;
  lastPosition: number;
  targetPosition?: number;
  status: string;
  eventsProcessed: number;
  chunksCompleted: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface StartReplayResult {
  success: boolean;
  error?: string;
  existingReplayId?: string;
  replayId?: string;
  checkpointId?: unknown;
}

interface TestState {
  helper: ConvexTestingHelper;
  testRunId: string;
  replayId: string;
  projection: string;
  checkpoint?: CheckpointRecord;
  startResult?: StartReplayResult;
  queryResult?: CheckpointRecord[];
  createdReplayIds: string[];
}

let state: TestState | null = null;

// =============================================================================
// Lifecycle
// =============================================================================

describe("Event Replay Integration Tests", () => {
  beforeAll(async () => {
    const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
    const helper = new ConvexTestingHelper({ backendUrl });
    state = {
      helper,
      testRunId: withPrefix(`r${Date.now()}`),
      replayId: "",
      projection: "",
      createdReplayIds: [],
    };
  });

  afterAll(async () => {
    state = null;
  });

  // ===========================================================================
  // Feature Tests
  // ===========================================================================

  describeFeature(feature, ({ Background, Rule }) => {
    Background(({ Given }) => {
      Given("the backend is running and clean", () => {
        expect(state).not.toBeNull();
        // Reset state for each scenario
        state!.replayId = "";
        state!.projection = "";
        state!.checkpoint = undefined;
        state!.startResult = undefined;
        state!.queryResult = undefined;
      });
    });

    // =========================================================================
    // Rule: Checkpoints track replay progress
    // =========================================================================

    Rule("Checkpoints track replay progress", ({ RuleScenario }) => {
      RuleScenario("Create a running checkpoint for replay", ({ When, Then, And }) => {
        When(
          "creating a checkpoint for projection {string}",
          async (_ctx: unknown, projection: string) => {
            state!.projection = `${state!.testRunId}_${projection}`;
            state!.replayId = `${state!.testRunId}_replay_${Date.now()}`;

            await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
              replayId: state!.replayId,
              projection: state!.projection,
              status: "running",
            });
          }
        );

        Then("a checkpoint should exist in replayCheckpoints", async () => {
          state!.checkpoint = (await state!.helper.query(
            "testing/eventReplayTest:getCheckpointByReplayId",
            { replayId: state!.replayId }
          )) as CheckpointRecord;

          expect(state!.checkpoint).not.toBeNull();
        });

        And(
          "the checkpoint status should be {string}",
          async (_ctx: unknown, expectedStatus: string) => {
            expect(state!.checkpoint?.status).toBe(expectedStatus);
          }
        );

        And(
          "the checkpoint eventsProcessed should be {int}",
          async (_ctx: unknown, expected: number) => {
            expect(state!.checkpoint?.eventsProcessed).toBe(expected);
          }
        );
      });

      RuleScenario("Update checkpoint progress", ({ Given, When, Then, And }) => {
        Given(
          "a running checkpoint for projection {string}",
          async (_ctx: unknown, projection: string) => {
            state!.projection = `${state!.testRunId}_${projection}`;
            state!.replayId = `${state!.testRunId}_replay_update_${Date.now()}`;
            state!.createdReplayIds.push(state!.replayId);

            await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
              replayId: state!.replayId,
              projection: state!.projection,
              status: "running",
              eventsProcessed: 0,
            });
          }
        );

        When(
          "updating the checkpoint with {int} events processed",
          async (_ctx: unknown, eventsProcessed: number) => {
            await state!.helper.mutation("testing/eventReplayTest:updateCheckpointProgress", {
              replayId: state!.replayId,
              eventsProcessed,
            });

            state!.checkpoint = (await state!.helper.query(
              "testing/eventReplayTest:getCheckpointByReplayId",
              { replayId: state!.replayId }
            )) as CheckpointRecord;
          }
        );

        Then(
          "the checkpoint eventsProcessed should be {int}",
          async (_ctx: unknown, expected: number) => {
            expect(state!.checkpoint?.eventsProcessed).toBe(expected);
          }
        );

        And("the updatedAt timestamp should be recent", async () => {
          const now = Date.now();
          const updatedAt = state!.checkpoint?.updatedAt ?? 0;
          // Within last 10 seconds
          expect(now - updatedAt).toBeLessThan(10000);
        });
      });
    });

    // =========================================================================
    // Rule: Concurrent replays are prevented
    // =========================================================================

    Rule("Concurrent replays are prevented", ({ RuleScenario }) => {
      RuleScenario(
        "Cannot start replay for already running projection",
        ({ Given, When, Then }) => {
          Given(
            "a running replay exists for projection {string}",
            async (_ctx: unknown, projection: string) => {
              // Use unique projection name to avoid conflicts with other scenarios
              const uniqueTs = Date.now();
              state!.projection = `${state!.testRunId}_conflict_${projection}_${uniqueTs}`;
              state!.replayId = `${state!.testRunId}_replay_existing_${uniqueTs}`;
              state!.createdReplayIds.push(state!.replayId);

              await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
                replayId: state!.replayId,
                projection: state!.projection,
                status: "running",
              });
            }
          );

          When(
            "attempting to start another replay for {string}",
            async (_ctx: unknown, _projection: string) => {
              const newReplayId = `${state!.testRunId}_replay_conflict_${Date.now()}`;

              state!.startResult = (await state!.helper.mutation(
                "testing/eventReplayTest:simulateStartReplay",
                {
                  projection: state!.projection,
                  replayId: newReplayId,
                }
              )) as StartReplayResult;
            }
          );

          Then("the result should indicate REPLAY_ALREADY_ACTIVE", async () => {
            expect(state!.startResult?.success).toBe(false);
            expect(state!.startResult?.error).toBe("REPLAY_ALREADY_ACTIVE");
            expect(state!.startResult?.existingReplayId).toBe(state!.replayId);
          });
        }
      );
    });

    // =========================================================================
    // Rule: Replay status can be queried
    // =========================================================================

    Rule("Replay status can be queried", ({ RuleScenario }) => {
      RuleScenario("Query checkpoint by replayId", ({ Given, When, Then }) => {
        Given(
          "a checkpoint exists with replayId {string}",
          async (_ctx: unknown, replayId: string) => {
            state!.replayId = `${state!.testRunId}_${replayId}`;
            state!.projection = `${state!.testRunId}_testProjection`;
            state!.createdReplayIds.push(state!.replayId);

            await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
              replayId: state!.replayId,
              projection: state!.projection,
              status: "running",
              eventsProcessed: 100,
            });
          }
        );

        When("querying checkpoint by replayId", async () => {
          state!.checkpoint = (await state!.helper.query(
            "testing/eventReplayTest:getCheckpointByReplayId",
            { replayId: state!.replayId }
          )) as CheckpointRecord;
        });

        Then("the checkpoint should be returned with correct details", async () => {
          expect(state!.checkpoint).not.toBeNull();
          expect(state!.checkpoint?.replayId).toBe(state!.replayId);
          expect(state!.checkpoint?.projection).toBe(state!.projection);
          expect(state!.checkpoint?.status).toBe("running");
          expect(state!.checkpoint?.eventsProcessed).toBe(100);
        });
      });

      RuleScenario("List checkpoints by status", ({ Given, When, Then }) => {
        Given("multiple checkpoints with different statuses exist", async () => {
          // Create running checkpoint
          const runningId = `${state!.testRunId}_replay_list_running`;
          state!.createdReplayIds.push(runningId);
          await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
            replayId: runningId,
            projection: `${state!.testRunId}_proj_running`,
            status: "running",
          });

          // Create completed checkpoint
          const completedId = `${state!.testRunId}_replay_list_completed`;
          state!.createdReplayIds.push(completedId);
          await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
            replayId: completedId,
            projection: `${state!.testRunId}_proj_completed`,
            status: "completed",
          });

          // Create failed checkpoint
          const failedId = `${state!.testRunId}_replay_list_failed`;
          state!.createdReplayIds.push(failedId);
          await state!.helper.mutation("testing/eventReplayTest:createTestCheckpoint", {
            replayId: failedId,
            projection: `${state!.testRunId}_proj_failed`,
            status: "failed",
          });
        });

        When("listing checkpoints with status {string}", async (_ctx: unknown, status: string) => {
          state!.queryResult = (await state!.helper.query(
            "testing/eventReplayTest:listCheckpointsByStatus",
            { status: status as "running" | "paused" | "completed" | "failed" | "cancelled" }
          )) as CheckpointRecord[];
        });

        Then("only running checkpoints should be returned", async () => {
          // Filter for our test run's checkpoints
          const ourCheckpoints = state!.queryResult?.filter((c) =>
            c.replayId.startsWith(state!.testRunId)
          );

          expect(ourCheckpoints?.length).toBeGreaterThanOrEqual(1);

          // All returned should be running
          for (const cp of ourCheckpoints ?? []) {
            expect(cp.status).toBe("running");
          }
        });
      });
    });
  });
});
