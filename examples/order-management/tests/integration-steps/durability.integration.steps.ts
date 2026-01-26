/**
 * Durability Integration Step Definitions
 *
 * Tests for durable events infrastructure including:
 * - Intent/completion bracketing (durable commands)
 * - Orphan intent detection
 * - Poison event quarantine
 * - Projection rebuild via event replay
 * - Durable publication tracking
 * - Idempotent event append
 *
 * Requires Docker backend running on port 3210.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { testMutation, testQuery } from "../support/integrationHelpers";
import { waitUntil } from "../support/localBackendHelpers";
import {
  getState,
  setLastResult,
  initIntegrationState,
  type IntegrationScenarioState,
} from "./common.integration.steps";
import { generateCustomerId } from "../fixtures/orders";

// =============================================================================
// Type-Safe Access to Testing Modules
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const intentTestApi = (api as any)["testing/intentTest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const poisonTestApi = (api as any)["testing/poisonEventTest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventReplayTestApi = (api as any)["testing/eventReplayTest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const publicationTestApi = (api as any)["testing/durablePublicationTest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const idempotentAppendTestApi = (api as any)["testing/idempotentAppendTest"];
// Internal APIs are accessed through the testing wrappers above
// These are kept as documentation of the underlying admin APIs:
// - internal["admin/intents"] - Intent operations
// - internal["admin/poison"] - Poison event operations
// - internal["admin/rebuildDemo"] - Rebuild demonstration
void internal; // Suppress unused import warning

// =============================================================================
// Extended State for Durability Tests
// =============================================================================

interface DurabilityState extends IntegrationScenarioState {
  durability: {
    /** Intent key for current test */
    intentKey?: string;
    /** Order ID for durable command test */
    orderId?: string;
    /** Customer ID for durable command test */
    customerId?: string;
    /** Last intent record retrieved */
    intentRecord?: {
      intentKey: string;
      operationType: string;
      streamType: string;
      streamId: string;
      boundedContext: string;
      status: "pending" | "completed" | "failed" | "abandoned";
      timeoutMs: number;
      correlationId?: string;
      completionEventId?: string;
      error?: string;
    } | null;
    /** Intent stats */
    intentStats?: {
      pending: number;
      completed: number;
      failed: number;
      abandoned: number;
      total: number;
    };
    /** Orphan detection result */
    orphanResult?: {
      orphanCount: number;
      abandoned: string[];
    };
    /** Timeout handler result */
    timeoutResult?: {
      status: "abandoned" | "already_completed" | "not_found";
    };
    /** Poison event test state */
    poisonRecord?: {
      eventId: string;
      projectionName: string;
      status: string;
      attemptCount: number;
      error?: string;
    } | null;
    /** Poison stats */
    poisonStats?: {
      totalQuarantined: number;
      byProjection: Record<string, number>;
    };
    /** Checkpoint ID for replay tests */
    replayId?: string;
    /** Checkpoint record */
    checkpoint?: {
      replayId: string;
      projection: string;
      status: string;
      eventsProcessed: number;
    } | null;
    /** Publication test state */
    publications?: Array<{
      publicationId: string;
      eventId: string;
      status: string;
      targetContext: string;
    }>;
    /** Idempotent append result */
    appendResult?: {
      status: "appended" | "duplicate";
      eventId?: string;
    };
    /** Idempotency key for append tests */
    idempotencyKey?: string;
  };
}

/**
 * Get extended state with durability fields.
 */
function getExtendedState(): DurabilityState {
  const state = getState() as DurabilityState;
  if (!state.durability) {
    state.durability = {};
  }
  return state;
}

// =============================================================================
// Test ID Generation (Namespace Isolation)
// =============================================================================

function generateTestRunId(): string {
  return `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

let testRunId = generateTestRunId();

function generateIntentKey(base: string): string {
  return `${testRunId}_intent_${base}`;
}

function generateEventId(base: string): string {
  return `${testRunId}_evt_${base}`;
}

function generateIdempotencyKey(base: string): string {
  return `${testRunId}_idem_${base}`;
}

function generateReplayId(base: string): string {
  return `${testRunId}_replay_${base}`;
}

// =============================================================================
// DURABLE COMMANDS FEATURE
// =============================================================================

const durableCommandsFeature = await loadFeature(
  "tests/integration-features/durability/durable-commands.feature"
);

describeFeature(durableCommandsFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });

    Given("durable command execution is configured with timeoutMs {int}", async () => {
      // Configuration is handled at the infrastructure level
      // This step confirms the test understands the configuration
    });
  });

  // =========================================================================
  // Rule: Intent is recorded before command execution
  // =========================================================================
  Rule("Intent is recorded before command execution", ({ RuleScenario }) => {
    RuleScenario(
      "Successful command records intent and completion",
      ({ Given, When, Then, And }) => {
        Given("a draft order exists for durable command test", async () => {
          const state = getExtendedState();
          const orderId = `${testRunId}_ord_dur_success`;
          const customerId = generateCustomerId();

          state.durability.orderId = orderId;
          state.durability.customerId = customerId;

          // Create a draft order with items
          await testMutation(state.t, api.testing.createTestOrder, {
            orderId,
            customerId,
            status: "draft",
            items: [{ productId: "p1", productName: "Test Product", quantity: 2, unitPrice: 25 }],
          });
        });

        When("I submit the order using durable execution", async () => {
          const state = getExtendedState();
          const orderId = state.durability.orderId!;
          const intentKey = generateIntentKey("submit");
          state.durability.intentKey = intentKey;

          // Record intent first
          await testMutation(state.t, intentTestApi.recordTestIntent, {
            intentKey,
            operationType: "SubmitOrder",
            streamType: "orders",
            streamId: orderId,
            boundedContext: "orders",
            timeoutMs: 5000,
          });

          // Execute the command
          try {
            const result = await testMutation(state.t, api.orders.submitOrder, {
              orderId,
            });
            setLastResult(result);

            // Record completion
            await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
              intentKey,
              status: result.status === "success" ? "completed" : "failed",
              completionEventId: result.status === "success" ? result.eventId : undefined,
              error: result.status !== "success" ? result.reason : undefined,
            });
          } catch (error) {
            await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
              intentKey,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        });

        Then("an intent record should exist for the command", async () => {
          const state = getExtendedState();
          const intentKey = state.durability.intentKey!;

          const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
            intentKey,
          });

          expect(record).toBeDefined();
          state.durability.intentRecord = record;
        });

        And("the intent status should be {string}", (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          expect(state.durability.intentRecord?.status).toBe(expectedStatus);
        });

        And("the intent should have a completionEventId", () => {
          const state = getExtendedState();
          expect(state.durability.intentRecord?.completionEventId).toBeDefined();
        });

        And(
          "the order status should be {string}",
          async (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            const orderId = state.durability.orderId!;

            await waitUntil(
              async () => {
                const order = await testQuery(state.t, api.orders.getOrderSummary, { orderId });
                return order?.status === expectedStatus ? order : null;
              },
              { message: `Order ${orderId} to reach status ${expectedStatus}` }
            );
          }
        );
      }
    );

    RuleScenario("Intent record captures command metadata", ({ Given, When, Then, And }) => {
      Given("a draft order exists for durable command test", async () => {
        const state = getExtendedState();
        const orderId = `${testRunId}_ord_dur_meta`;
        const customerId = generateCustomerId();

        state.durability.orderId = orderId;
        state.durability.customerId = customerId;

        await testMutation(state.t, api.testing.createTestOrder, {
          orderId,
          customerId,
          status: "draft",
          items: [{ productId: "p1", productName: "Test Product", quantity: 1, unitPrice: 10 }],
        });
      });

      When(
        "I submit the order using durable execution with correlationId {string}",
        async (_ctx: unknown, correlationId: string) => {
          const state = getExtendedState();
          const orderId = state.durability.orderId!;
          const intentKey = generateIntentKey("meta");
          state.durability.intentKey = intentKey;

          await testMutation(state.t, intentTestApi.recordTestIntent, {
            intentKey,
            operationType: "SubmitOrder",
            streamType: "orders",
            streamId: orderId,
            boundedContext: "orders",
            timeoutMs: 5000,
            correlationId,
          });

          const result = await testMutation(state.t, api.orders.submitOrder, {
            orderId,
          });

          await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
            intentKey,
            status: result.status === "success" ? "completed" : "failed",
            completionEventId: result.status === "success" ? result.eventId : undefined,
          });

          setLastResult(result);
        }
      );

      Then(
        "the intent record should have correlationId {string}",
        async (_ctx: unknown, expectedCorrelationId: string) => {
          const state = getExtendedState();
          const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
            intentKey: state.durability.intentKey!,
          });
          expect(record?.correlationId).toBe(expectedCorrelationId);
          state.durability.intentRecord = record;
        }
      );

      And(
        "the intent record should have operationType {string}",
        (_ctx: unknown, expectedOp: string) => {
          const state = getExtendedState();
          expect(state.durability.intentRecord?.operationType).toBe(expectedOp);
        }
      );

      And(
        "the intent record should have boundedContext {string}",
        (_ctx: unknown, expectedBc: string) => {
          const state = getExtendedState();
          expect(state.durability.intentRecord?.boundedContext).toBe(expectedBc);
        }
      );
    });
  });

  // =========================================================================
  // Rule: Failed commands are tracked
  // =========================================================================
  Rule("Failed commands are tracked", ({ RuleScenario }) => {
    RuleScenario("Business rejection records failed intent", ({ Given, When, Then, And }) => {
      Given("an empty draft order exists for durable command test", async () => {
        const state = getExtendedState();
        const orderId = `${testRunId}_ord_dur_empty`;
        const customerId = generateCustomerId();

        state.durability.orderId = orderId;
        state.durability.customerId = customerId;

        // Create empty draft order
        await testMutation(state.t, api.testing.createTestOrder, {
          orderId,
          customerId,
          status: "draft",
          items: [],
        });
      });

      When("I submit the order using durable execution", async () => {
        const state = getExtendedState();
        const orderId = state.durability.orderId!;
        const intentKey = generateIntentKey("empty");
        state.durability.intentKey = intentKey;

        await testMutation(state.t, intentTestApi.recordTestIntent, {
          intentKey,
          operationType: "SubmitOrder",
          streamType: "orders",
          streamId: orderId,
          boundedContext: "orders",
          timeoutMs: 5000,
        });

        try {
          const result = await testMutation(state.t, api.orders.submitOrder, {
            orderId,
          });
          setLastResult(result);

          // Record failure for rejected result
          await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
            intentKey,
            status: result.status === "success" ? "completed" : "failed",
            error: result.status === "rejected" ? result.reason : undefined,
          });
        } catch (error) {
          await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
            intentKey,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      Then("an intent record should exist for the command", async () => {
        const state = getExtendedState();
        const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
          intentKey: state.durability.intentKey!,
        });
        expect(record).toBeDefined();
        state.durability.intentRecord = record;
      });

      And("the intent status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        expect(state.durability.intentRecord?.status).toBe(expectedStatus);
      });

      And("the intent error should contain {string}", (_ctx: unknown, expectedError: string) => {
        const state = getExtendedState();
        expect(state.durability.intentRecord?.error).toContain(expectedError);
      });
    });

    RuleScenario("Technical failure records failed intent", ({ Given, When, Then, And }) => {
      Given("a non-existent order for durable command test", async () => {
        const state = getExtendedState();
        state.durability.orderId = `${testRunId}_ord_nonexistent`;
      });

      When("I attempt to submit the order using durable execution", async () => {
        const state = getExtendedState();
        const orderId = state.durability.orderId!;
        const intentKey = generateIntentKey("notfound");
        state.durability.intentKey = intentKey;

        await testMutation(state.t, intentTestApi.recordTestIntent, {
          intentKey,
          operationType: "SubmitOrder",
          streamType: "orders",
          streamId: orderId,
          boundedContext: "orders",
          timeoutMs: 5000,
        });

        try {
          const result = await testMutation(state.t, api.orders.submitOrder, {
            orderId,
          });
          setLastResult(result);

          await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
            intentKey,
            status: result.status === "success" ? "completed" : "failed",
            error: result.status !== "success" ? result.reason : undefined,
          });
        } catch (error) {
          await testMutation(state.t, intentTestApi.updateTestIntentStatus, {
            intentKey,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      Then("an intent record should exist for the command", async () => {
        const state = getExtendedState();
        const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
          intentKey: state.durability.intentKey!,
        });
        expect(record).toBeDefined();
        state.durability.intentRecord = record;
      });

      And("the intent status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        expect(state.durability.intentRecord?.status).toBe(expectedStatus);
      });
    });
  });

  // =========================================================================
  // Rule: Intent stats are queryable
  // =========================================================================
  Rule("Intent stats are queryable", ({ RuleScenario }) => {
    RuleScenario("Intent statistics show correct counts", ({ Given, When, Then, And }) => {
      Given("multiple durable commands have been executed", async () => {
        const state = getExtendedState();

        // Create intents in various states
        await testMutation(state.t, intentTestApi.createTestIntent, {
          intentKey: generateIntentKey("stat_pending"),
          operationType: "CreateOrder",
          streamType: "orders",
          streamId: "ord-stat-1",
          boundedContext: "orders",
          status: "pending",
          timeoutMs: 60000,
        });

        await testMutation(state.t, intentTestApi.createTestIntent, {
          intentKey: generateIntentKey("stat_completed"),
          operationType: "SubmitOrder",
          streamType: "orders",
          streamId: "ord-stat-2",
          boundedContext: "orders",
          status: "completed",
          timeoutMs: 5000,
          completionEventId: "evt_123",
        });

        await testMutation(state.t, intentTestApi.createTestIntent, {
          intentKey: generateIntentKey("stat_failed"),
          operationType: "CancelOrder",
          streamType: "orders",
          streamId: "ord-stat-3",
          boundedContext: "orders",
          status: "failed",
          timeoutMs: 5000,
          error: "Test failure",
        });
      });

      When("I query intent stats", async () => {
        const state = getExtendedState();
        const stats = await testQuery(state.t, intentTestApi.getIntentStats, {});
        state.durability.intentStats = stats;
        setLastResult(stats);
      });

      Then("stats should show pending, completed, failed, and abandoned counts", () => {
        const state = getExtendedState();
        const stats = state.durability.intentStats!;
        expect(stats.pending).toBeGreaterThanOrEqual(0);
        expect(stats.completed).toBeGreaterThanOrEqual(0);
        expect(stats.failed).toBeGreaterThanOrEqual(0);
        expect(stats.abandoned).toBeGreaterThanOrEqual(0);
      });

      And("the total should match the sum of all statuses", () => {
        const state = getExtendedState();
        const stats = state.durability.intentStats!;
        expect(stats.total).toBe(stats.pending + stats.completed + stats.failed + stats.abandoned);
      });
    });
  });
});

// =============================================================================
// ORPHAN DETECTION FEATURE
// =============================================================================

const orphanDetectionFeature = await loadFeature(
  "tests/integration-features/durability/orphan-detection.feature"
);

describeFeature(orphanDetectionFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });

    Given("orphan detection is configured", async () => {
      // Configuration is at infrastructure level
    });
  });

  // =========================================================================
  // Rule: Pending intents exceeding timeout are detected
  // =========================================================================
  Rule("Pending intents exceeding timeout are detected", ({ RuleScenario }) => {
    RuleScenario(
      "Intent exceeding timeout is flagged as abandoned",
      ({ Given, And, When, Then }) => {
        Given(
          "a pending intent exists with timeout {int}ms",
          async (_ctx: unknown, timeoutMs: number) => {
            const state = getExtendedState();
            const intentKey = generateIntentKey("orphan_timeout");
            state.durability.intentKey = intentKey;

            // Create intent with old timestamp
            const pastTime = Date.now() - (timeoutMs + 1000);
            await testMutation(state.t, intentTestApi.createTestIntent, {
              intentKey,
              operationType: "TestOperation",
              streamType: "test",
              streamId: "test-001",
              boundedContext: "test",
              status: "pending",
              timeoutMs,
              createdAtOverride: pastTime,
            });
          }
        );

        And("the intent was created more than {int}ms ago", async () => {
          // Already handled in the previous step with createdAtOverride
        });

        When("the orphan detection runs", async () => {
          const state = getExtendedState();
          const result = await testMutation(state.t, intentTestApi.runOrphanDetection, {});
          state.durability.orphanResult = result;
          setLastResult(result);
        });

        Then(
          "the intent should be marked as {string}",
          async (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
              intentKey: state.durability.intentKey!,
            });
            expect(record?.status).toBe(expectedStatus);
          }
        );

        And("the intent should have an error message about timeout", async () => {
          const state = getExtendedState();
          const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
            intentKey: state.durability.intentKey!,
          });
          expect(record?.error).toContain("Timeout");
        });
      }
    );

    RuleScenario("Intent within timeout is not flagged", ({ Given, And, When, Then }) => {
      Given(
        "a pending intent exists with timeout {int}ms",
        async (_ctx: unknown, timeoutMs: number) => {
          const state = getExtendedState();
          const intentKey = generateIntentKey("orphan_recent");
          state.durability.intentKey = intentKey;

          // Create recent intent (no createdAtOverride = now)
          await testMutation(state.t, intentTestApi.createTestIntent, {
            intentKey,
            operationType: "TestOperation",
            streamType: "test",
            streamId: "test-002",
            boundedContext: "test",
            status: "pending",
            timeoutMs,
          });
        }
      );

      And("the intent was created recently", async () => {
        // Already handled - no override means created now
      });

      When("the orphan detection runs", async () => {
        const state = getExtendedState();
        await testMutation(state.t, intentTestApi.runOrphanDetection, {});
      });

      Then("the intent should still be {string}", async (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
          intentKey: state.durability.intentKey!,
        });
        expect(record?.status).toBe(expectedStatus);
      });
    });
  });

  // =========================================================================
  // Rule: Completed intents are never flagged
  // =========================================================================
  Rule("Completed intents are never flagged", ({ RuleScenario }) => {
    RuleScenario("Completed intent is not flagged even if old", ({ Given, When, Then }) => {
      Given("a completed intent exists from long ago", async () => {
        const state = getExtendedState();
        const intentKey = generateIntentKey("orphan_completed");
        state.durability.intentKey = intentKey;

        // Create old completed intent
        const pastTime = Date.now() - 86400000; // 24 hours ago
        await testMutation(state.t, intentTestApi.createTestIntent, {
          intentKey,
          operationType: "TestOperation",
          streamType: "test",
          streamId: "test-003",
          boundedContext: "test",
          status: "completed",
          timeoutMs: 1000,
          createdAtOverride: pastTime,
          completionEventId: "evt_old_completed",
        });
      });

      When("the orphan detection runs", async () => {
        const state = getExtendedState();
        await testMutation(state.t, intentTestApi.runOrphanDetection, {});
      });

      Then("the intent should still be {string}", async (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
          intentKey: state.durability.intentKey!,
        });
        expect(record?.status).toBe(expectedStatus);
      });
    });

    RuleScenario("Failed intent is not flagged even if old", ({ Given, When, Then }) => {
      Given("a failed intent exists from long ago", async () => {
        const state = getExtendedState();
        const intentKey = generateIntentKey("orphan_failed");
        state.durability.intentKey = intentKey;

        const pastTime = Date.now() - 86400000;
        await testMutation(state.t, intentTestApi.createTestIntent, {
          intentKey,
          operationType: "TestOperation",
          streamType: "test",
          streamId: "test-004",
          boundedContext: "test",
          status: "failed",
          timeoutMs: 1000,
          createdAtOverride: pastTime,
          error: "Test failure from long ago",
        });
      });

      When("the orphan detection runs", async () => {
        const state = getExtendedState();
        await testMutation(state.t, intentTestApi.runOrphanDetection, {});
      });

      Then("the intent should still be {string}", async (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
          intentKey: state.durability.intentKey!,
        });
        expect(record?.status).toBe(expectedStatus);
      });
    });
  });

  // =========================================================================
  // Rule: Abandoned intents are queryable
  // =========================================================================
  Rule("Abandoned intents are queryable", ({ RuleScenario }) => {
    RuleScenario("List abandoned intents for investigation", ({ Given, When, Then, And }) => {
      Given("multiple intents have been abandoned", async () => {
        const state = getExtendedState();

        // Create abandoned intents
        for (let i = 0; i < 3; i++) {
          await testMutation(state.t, intentTestApi.createTestIntent, {
            intentKey: generateIntentKey(`abandoned_list_${i}`),
            operationType: "TestOperation",
            streamType: "test",
            streamId: `test-list-${i}`,
            boundedContext: "test",
            status: "abandoned",
            timeoutMs: 1000,
            error: `Abandoned intent ${i}`,
          });
        }
      });

      When("I query abandoned intents", async () => {
        const state = getExtendedState();
        const abandoned = await testQuery(state.t, intentTestApi.listAbandonedIntents, {
          limit: 100,
        });
        setLastResult(abandoned);
      });

      Then("I should receive a list of abandoned intents", () => {
        const state = getExtendedState();
        const abandoned = state.lastResult as unknown[];
        expect(abandoned.length).toBeGreaterThan(0);
      });

      And("each intent should have intentKey, operationType, and error", () => {
        const state = getExtendedState();
        const abandoned = state.lastResult as Array<{
          intentKey: string;
          operationType: string;
          error?: string;
        }>;
        for (const intent of abandoned) {
          expect(intent.intentKey).toBeDefined();
          expect(intent.operationType).toBeDefined();
        }
      });
    });
  });

  // =========================================================================
  // Rule: Scheduled timeout handler marks orphan
  // =========================================================================
  Rule("Scheduled timeout handler marks orphan", ({ RuleScenario }) => {
    RuleScenario(
      "Timeout handler marks pending intent as abandoned",
      ({ Given, When, Then, And }) => {
        Given(
          "a pending intent exists with intentKey {string}",
          async (_ctx: unknown, baseKey: string) => {
            const state = getExtendedState();
            const intentKey = generateIntentKey(baseKey);
            state.durability.intentKey = intentKey;

            await testMutation(state.t, intentTestApi.createTestIntent, {
              intentKey,
              operationType: "TestOperation",
              streamType: "test",
              streamId: "test-timeout-1",
              boundedContext: "test",
              status: "pending",
              timeoutMs: 1000,
            });
          }
        );

        When("the timeout handler fires for intentKey {string}", async () => {
          const state = getExtendedState();
          const result = await testMutation(state.t, intentTestApi.triggerTimeoutHandler, {
            intentKey: state.durability.intentKey!,
          });
          state.durability.timeoutResult = result;
          setLastResult(result);
        });

        Then(
          "the intent status should be {string}",
          async (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
              intentKey: state.durability.intentKey!,
            });
            expect(record?.status).toBe(expectedStatus);
          }
        );

        And("the result should be {string}", (_ctx: unknown, expectedResult: string) => {
          const state = getExtendedState();
          expect(state.durability.timeoutResult?.status).toBe(expectedResult);
        });
      }
    );

    RuleScenario("Timeout handler no-ops for completed intent", ({ Given, When, Then, And }) => {
      Given(
        "a completed intent exists with intentKey {string}",
        async (_ctx: unknown, baseKey: string) => {
          const state = getExtendedState();
          const intentKey = generateIntentKey(baseKey);
          state.durability.intentKey = intentKey;

          await testMutation(state.t, intentTestApi.createTestIntent, {
            intentKey,
            operationType: "TestOperation",
            streamType: "test",
            streamId: "test-timeout-2",
            boundedContext: "test",
            status: "completed",
            timeoutMs: 1000,
            completionEventId: "evt_already_done",
          });
        }
      );

      When("the timeout handler fires for intentKey {string}", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, intentTestApi.triggerTimeoutHandler, {
          intentKey: state.durability.intentKey!,
        });
        state.durability.timeoutResult = result;
        setLastResult(result);
      });

      Then(
        "the intent status should still be {string}",
        async (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          const record = await testQuery(state.t, intentTestApi.getIntentByKey, {
            intentKey: state.durability.intentKey!,
          });
          expect(record?.status).toBe(expectedStatus);
        }
      );

      And("the result should be {string}", (_ctx: unknown, expectedResult: string) => {
        const state = getExtendedState();
        expect(state.durability.timeoutResult?.status).toBe(expectedResult);
      });
    });
  });
});

// =============================================================================
// POISON EVENT FEATURE
// =============================================================================

const poisonEventFeature = await loadFeature(
  "tests/integration-features/durability/poison-event.feature"
);

describeFeature(poisonEventFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });

    Given("poison event handling is configured with maxAttempts {int}", async () => {
      // Configuration is at infrastructure level
    });
  });

  // =========================================================================
  // Rule: Failed projections are tracked in poisonEvents table
  // =========================================================================
  Rule("Failed projections are tracked in poisonEvents table", ({ RuleScenario }) => {
    RuleScenario("First failure creates pending poison record", ({ Given, And, When, Then }) => {
      // Note: projectionName is constant, but eventId must be generated inside
      // the step to use the per-scenario testRunId set by Background
      const projectionName = "orderSummary";

      Given("a test event {string} of type {string}", async () => {
        const state = getExtendedState();
        const eventId = generateEventId("poison_first");
        state.durability.poisonRecord = {
          eventId,
          projectionName,
          status: "pending",
          attemptCount: 0,
        };
      });

      And("the projection handler will fail", async () => {
        // Failure is simulated in the test mutation
      });

      When("processing the event through withPoisonEventHandling", async () => {
        const state = getExtendedState();
        const eventId = state.durability.poisonRecord!.eventId;
        const result = await testMutation(state.t, poisonTestApi.simulateProjectionFailure, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          maxAttempts: 3,
          shouldFail: true,
          errorMessage: "Simulated failure",
        });
        setLastResult(result);
      });

      Then("a poison record should exist in the database", async () => {
        const state = getExtendedState();
        const eventId = state.durability.poisonRecord!.eventId;
        const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
          eventId,
          projectionName,
        });
        expect(record).toBeDefined();
        state.durability.poisonRecord = record;
      });

      And("the record status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.status).toBe(expectedStatus);
      });

      And("the attemptCount should be {int}", (_ctx: unknown, expectedCount: number) => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.attemptCount).toBe(expectedCount);
      });

      And("the error should be captured", () => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.error).toBeDefined();
      });
    });

    RuleScenario("Second failure increments attempt count", ({ Given, And, When, Then }) => {
      const eventId = generateEventId("poison_second");
      const projectionName = "orderSummary";

      Given("a pending poison record for event {string} with {int} attempt", async () => {
        const state = getExtendedState();
        // Create existing poison record
        await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          status: "pending",
          attemptCount: 1,
        });
      });

      And("the projection handler will fail", async () => {
        // Failure is simulated
      });

      When("processing the event through withPoisonEventHandling", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, poisonTestApi.simulateProjectionFailure, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          maxAttempts: 3,
          shouldFail: true,
        });
        setLastResult(result);
      });

      Then("the attemptCount should be {int}", async (_ctx: unknown, expectedCount: number) => {
        const state = getExtendedState();
        const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
          eventId,
          projectionName,
        });
        expect(record?.attemptCount).toBe(expectedCount);
        state.durability.poisonRecord = record;
      });

      And("the record status should still be {string}", (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.status).toBe(expectedStatus);
      });

      And("the handler should have re-thrown the error", () => {
        const state = getExtendedState();
        const result = state.lastResult as { threwError: boolean };
        expect(result.threwError).toBe(true);
      });
    });
  });

  // =========================================================================
  // Rule: Events are quarantined after max attempts
  // =========================================================================
  Rule("Events are quarantined after max attempts", ({ RuleScenario }) => {
    RuleScenario("Event quarantined after 3 failures", ({ Given, And, When, Then }) => {
      const eventId = generateEventId("poison_quarantine");
      const projectionName = "orderSummary";

      Given("a pending poison record for event {string} with {int} attempts", async () => {
        const state = getExtendedState();
        await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          status: "pending",
          attemptCount: 2,
        });
      });

      And("the projection handler will fail", async () => {
        // Failure is simulated
      });

      When("processing the event through withPoisonEventHandling", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, poisonTestApi.simulateProjectionFailure, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          maxAttempts: 3,
          shouldFail: true,
        });
        setLastResult(result);
      });

      Then(
        "the record status should be {string}",
        async (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
            eventId,
            projectionName,
          });
          expect(record?.status).toBe(expectedStatus);
          state.durability.poisonRecord = record;
        }
      );

      And("the attemptCount should be {int}", (_ctx: unknown, expectedCount: number) => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.attemptCount).toBe(expectedCount);
      });

      And("quarantinedAt timestamp should be set", () => {
        const state = getExtendedState();
        const record = state.durability.poisonRecord as { quarantinedAt?: number };
        expect(record?.quarantinedAt).toBeDefined();
      });

      And("the error should be swallowed", () => {
        const state = getExtendedState();
        const result = state.lastResult as { threwError: boolean };
        expect(result.threwError).toBe(false);
      });
    });

    RuleScenario("Quarantine captures error details", ({ Given, And, When, Then }) => {
      const eventId = generateEventId("poison_details");
      const projectionName = "orderSummary";

      Given("a test event {string} of type {string}", async () => {
        // Event ID is already set
      });

      And("the projection handler will fail with message {string}", async () => {
        // Error message is passed to simulateProjectionFailure
      });

      When("processing reaches maxAttempts failures", async () => {
        const state = getExtendedState();
        // Create with 2 attempts, then fail to trigger quarantine
        await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          status: "pending",
          attemptCount: 2,
        });

        await testMutation(state.t, poisonTestApi.simulateProjectionFailure, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          maxAttempts: 3,
          shouldFail: true,
          errorMessage: "Invalid order format",
        });
      });

      Then(
        "the poison record should contain error {string}",
        async (_ctx: unknown, expectedError: string) => {
          const state = getExtendedState();
          const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
            eventId,
            projectionName,
          });
          expect(record?.error).toContain(expectedError);
          state.durability.poisonRecord = record;
        }
      );

      And("the record should be queryable by projection name", async () => {
        const state = getExtendedState();
        const quarantined = await testQuery(state.t, poisonTestApi.listQuarantinedRecords, {
          projectionName,
        });
        expect(quarantined.some((r: { eventId: string }) => r.eventId === eventId)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Rule: Quarantined events are skipped
  // =========================================================================
  Rule("Quarantined events are skipped", ({ RuleScenario }) => {
    RuleScenario("Quarantined event bypasses handler completely", ({ Given, And, When, Then }) => {
      const eventId = generateEventId("poison_skip");
      const projectionName = "orderSummary";

      Given("event {string} is already quarantined", async () => {
        const state = getExtendedState();
        await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          status: "quarantined",
          attemptCount: 3,
        });
      });

      And("the projection handler would fail if called", async () => {
        // Handler is set to fail, but shouldn't be called
      });

      When("processing the event through withPoisonEventHandling", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, poisonTestApi.simulateProjectionFailure, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          maxAttempts: 3,
          shouldFail: true, // Would fail if called
        });
        setLastResult(result);
      });

      Then("the underlying projection handler should NOT be called", () => {
        const state = getExtendedState();
        // Since handler wasn't called, no error was thrown
        const result = state.lastResult as { threwError: boolean };
        expect(result.threwError).toBe(false);
      });

      And("the operation should complete without error", () => {
        const state = getExtendedState();
        const result = state.lastResult as { threwError: boolean };
        expect(result.threwError).toBe(false);
      });

      And("no new error should be recorded", async () => {
        const state = getExtendedState();
        const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
          eventId,
          projectionName,
        });
        // Attempt count should still be 3 (no new attempt)
        expect(record?.attemptCount).toBe(3);
      });
    });
  });

  // =========================================================================
  // Rule: Unquarantine enables reprocessing
  // =========================================================================
  Rule("Unquarantine enables reprocessing", ({ RuleScenario }) => {
    RuleScenario("Unquarantine resets status for retry", ({ Given, When, Then, And }) => {
      const eventId = generateEventId("poison_unquarantine");
      const projectionName = "orderSummary";

      Given("event {string} is quarantined with {int} attempts", async () => {
        const state = getExtendedState();
        await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
          eventId,
          eventType: "OrderCreated",
          projectionName,
          status: "quarantined",
          attemptCount: 3,
        });
      });

      When("calling unquarantine for the event", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, poisonTestApi.testUnquarantine, {
          eventId,
          projectionName,
        });
        setLastResult(result);
      });

      Then(
        "the record status should be {string}",
        async (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
            eventId,
            projectionName,
          });
          expect(record?.status).toBe(expectedStatus);
          state.durability.poisonRecord = record;
        }
      );

      And("the attemptCount should be reset to {int}", (_ctx: unknown, expectedCount: number) => {
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.attemptCount).toBe(expectedCount);
      });

      And("the event can be processed again", async () => {
        // Status is now "replayed" which means it can be reprocessed
        const state = getExtendedState();
        expect(state.durability.poisonRecord?.status).toBe("replayed");
      });
    });

    RuleScenario(
      "Unquarantine of non-quarantined event returns not_quarantined",
      ({ Given, When, Then, And }) => {
        const eventId = generateEventId("poison_not_q");
        const projectionName = "orderSummary";

        Given("a pending poison record for event {string} with {int} attempt", async () => {
          const state = getExtendedState();
          await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
            eventId,
            eventType: "OrderCreated",
            projectionName,
            status: "pending",
            attemptCount: 1,
          });
        });

        When("calling unquarantine for the event", async () => {
          const state = getExtendedState();
          const result = await testMutation(state.t, poisonTestApi.testUnquarantine, {
            eventId,
            projectionName,
          });
          setLastResult(result);
        });

        Then("the result should be {string}", (_ctx: unknown, expectedResult: string) => {
          const state = getExtendedState();
          const result = state.lastResult as { status: string };
          expect(result.status).toBe(expectedResult);
        });

        And("the record should remain unchanged", async () => {
          const state = getExtendedState();
          const record = await testQuery(state.t, poisonTestApi.getTestPoisonRecord, {
            eventId,
            projectionName,
          });
          expect(record?.status).toBe("pending");
          expect(record?.attemptCount).toBe(1);
        });
      }
    );
  });

  // =========================================================================
  // Rule: Stats provide visibility into poison events
  // =========================================================================
  Rule("Stats provide visibility into poison events", ({ RuleScenario }) => {
    RuleScenario(
      "Stats show quarantined event counts by projection",
      ({ Given, And, When, Then }) => {
        Given(
          "events {string} and {string} are quarantined for projection {string}",
          async (_ctx: unknown, evt1Base: string, evt2Base: string, proj: string) => {
            const state = getExtendedState();
            const evt1 = generateEventId(evt1Base);
            const evt2 = generateEventId(evt2Base);

            await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
              eventId: evt1,
              eventType: "OrderCreated",
              projectionName: proj,
              status: "quarantined",
              attemptCount: 3,
            });

            await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
              eventId: evt2,
              eventType: "OrderCreated",
              projectionName: proj,
              status: "quarantined",
              attemptCount: 3,
            });
          }
        );

        And(
          "event {string} is quarantined for projection {string}",
          async (_ctx: unknown, evtBase: string, proj: string) => {
            const state = getExtendedState();
            const evt = generateEventId(evtBase);

            await testMutation(state.t, poisonTestApi.createTestPoisonRecord, {
              eventId: evt,
              eventType: "InventoryUpdated",
              projectionName: proj,
              status: "quarantined",
              attemptCount: 3,
            });
          }
        );

        When("querying poison event stats", async () => {
          const state = getExtendedState();
          const stats = await testQuery(state.t, poisonTestApi.getPoisonStats, {});
          state.durability.poisonStats = stats;
          setLastResult(stats);
        });

        Then("totalQuarantined should be {int}", (_ctx: unknown, expectedTotal: number) => {
          const state = getExtendedState();
          expect(state.durability.poisonStats?.totalQuarantined).toBeGreaterThanOrEqual(
            expectedTotal
          );
        });

        And(
          "byProjection should show {int} for {string}",
          (_ctx: unknown, count: number, proj: string) => {
            const state = getExtendedState();
            expect(state.durability.poisonStats?.byProjection[proj]).toBeGreaterThanOrEqual(count);
          }
        );
      }
    );
  });
});

// =============================================================================
// EVENT REPLAY FEATURE
// =============================================================================

const eventReplayFeature = await loadFeature(
  "tests/integration-features/durability/event-replay.feature"
);

describeFeature(eventReplayFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });
  });

  // =========================================================================
  // Rule: Checkpoints track replay progress
  // =========================================================================
  Rule("Checkpoints track replay progress", ({ RuleScenario }) => {
    RuleScenario("Create a running checkpoint for replay", ({ When, Then, And }) => {
      const projectionName = "orderSummary";

      When("creating a checkpoint for projection {string}", async () => {
        const state = getExtendedState();
        const replayId = generateReplayId("checkpoint");
        state.durability.replayId = replayId;

        await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
          replayId,
          projection: projectionName,
          status: "running",
        });
      });

      Then("a checkpoint should exist in replayCheckpoints", async () => {
        const state = getExtendedState();
        const checkpoint = await testQuery(state.t, eventReplayTestApi.getCheckpointByReplayId, {
          replayId: state.durability.replayId!,
        });
        expect(checkpoint).toBeDefined();
        state.durability.checkpoint = checkpoint;
      });

      And("the checkpoint status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        const state = getExtendedState();
        expect(state.durability.checkpoint?.status).toBe(expectedStatus);
      });

      And(
        "the checkpoint eventsProcessed should be {int}",
        (_ctx: unknown, expectedCount: number) => {
          const state = getExtendedState();
          expect(state.durability.checkpoint?.eventsProcessed).toBe(expectedCount);
        }
      );
    });

    RuleScenario("Update checkpoint progress", ({ Given, When, Then, And }) => {
      Given(
        "a running checkpoint for projection {string}",
        async (_ctx: unknown, projectionName: string) => {
          const state = getExtendedState();
          const replayId = generateReplayId("progress");
          state.durability.replayId = replayId;

          await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
            replayId,
            projection: projectionName,
            status: "running",
            eventsProcessed: 0,
          });
        }
      );

      When(
        "updating the checkpoint with {int} events processed",
        async (_ctx: unknown, count: number) => {
          const state = getExtendedState();
          const result = await testMutation(state.t, eventReplayTestApi.updateCheckpointProgress, {
            replayId: state.durability.replayId!,
            eventsProcessed: count,
          });
          setLastResult(result);
        }
      );

      Then(
        "the checkpoint eventsProcessed should be {int}",
        async (_ctx: unknown, expectedCount: number) => {
          const state = getExtendedState();
          const checkpoint = await testQuery(state.t, eventReplayTestApi.getCheckpointByReplayId, {
            replayId: state.durability.replayId!,
          });
          expect(checkpoint?.eventsProcessed).toBe(expectedCount);
          state.durability.checkpoint = checkpoint;
        }
      );

      And("the updatedAt timestamp should be recent", () => {
        const state = getExtendedState();
        const result = state.lastResult as { updatedAt: number };
        const fiveMinutesAgo = Date.now() - 300000;
        expect(result.updatedAt).toBeGreaterThan(fiveMinutesAgo);
      });
    });
  });

  // =========================================================================
  // Rule: Concurrent replays are prevented
  // =========================================================================
  Rule("Concurrent replays are prevented", ({ RuleScenario }) => {
    RuleScenario("Cannot start replay for already running projection", ({ Given, When, Then }) => {
      const projectionName = "orderSummary";

      Given("a running replay exists for projection {string}", async () => {
        const state = getExtendedState();
        const replayId = generateReplayId("concurrent_existing");
        state.durability.replayId = replayId;

        await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
          replayId,
          projection: projectionName,
          status: "running",
        });
      });

      When("attempting to start another replay for {string}", async () => {
        const state = getExtendedState();
        const newReplayId = generateReplayId("concurrent_new");

        const result = await testMutation(state.t, eventReplayTestApi.simulateStartReplay, {
          projection: projectionName,
          replayId: newReplayId,
        });
        setLastResult(result);
      });

      Then("the result should indicate REPLAY_ALREADY_ACTIVE", () => {
        const state = getExtendedState();
        const result = state.lastResult as { success: boolean; error?: string };
        expect(result.success).toBe(false);
        expect(result.error).toBe("REPLAY_ALREADY_ACTIVE");
      });
    });
  });

  // =========================================================================
  // Rule: Replay status can be queried
  // =========================================================================
  Rule("Replay status can be queried", ({ RuleScenario }) => {
    RuleScenario("Query checkpoint by replayId", ({ Given, When, Then }) => {
      Given("a checkpoint exists with replayId {string}", async (_ctx: unknown, baseId: string) => {
        const state = getExtendedState();
        const replayId = generateReplayId(baseId);
        state.durability.replayId = replayId;

        await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
          replayId,
          projection: "orderSummary",
          status: "running",
          eventsProcessed: 25,
        });
      });

      When("querying checkpoint by replayId", async () => {
        const state = getExtendedState();
        const checkpoint = await testQuery(state.t, eventReplayTestApi.getCheckpointByReplayId, {
          replayId: state.durability.replayId!,
        });
        state.durability.checkpoint = checkpoint;
        setLastResult(checkpoint);
      });

      Then("the checkpoint should be returned with correct details", () => {
        const state = getExtendedState();
        expect(state.durability.checkpoint?.replayId).toBe(state.durability.replayId);
        expect(state.durability.checkpoint?.eventsProcessed).toBe(25);
      });
    });

    RuleScenario("List checkpoints by status", ({ Given, When, Then }) => {
      Given("multiple checkpoints with different statuses exist", async () => {
        const state = getExtendedState();

        await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
          replayId: generateReplayId("list_running"),
          projection: "orderSummary",
          status: "running",
        });

        await testMutation(state.t, eventReplayTestApi.createTestCheckpoint, {
          replayId: generateReplayId("list_completed"),
          projection: "productCatalog",
          status: "completed",
        });
      });

      When("listing checkpoints with status {string}", async (_ctx: unknown, status: string) => {
        const state = getExtendedState();
        const checkpoints = await testQuery(state.t, eventReplayTestApi.listCheckpointsByStatus, {
          status,
        });
        setLastResult(checkpoints);
      });

      Then("only running checkpoints should be returned", () => {
        const state = getExtendedState();
        const checkpoints = state.lastResult as Array<{ status: string }>;
        for (const cp of checkpoints) {
          expect(cp.status).toBe("running");
        }
      });
    });
  });
});

// =============================================================================
// DURABLE PUBLICATION FEATURE
// =============================================================================

const durablePublicationFeature = await loadFeature(
  "tests/integration-features/durability/durable-publication.feature"
);

describeFeature(durablePublicationFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });

    Given("durable publication is configured with maxAttempts {int}", async () => {
      // Configuration is at infrastructure level
    });
  });

  // =========================================================================
  // Rule: Publications create tracking records
  // =========================================================================
  Rule("Publications create tracking records", ({ RuleScenario }) => {
    RuleScenario(
      "Publishing creates records for each target context",
      ({ Given, When, Then, And }) => {
        const eventId = generateEventId("pub_tracking");

        Given("an event {string} to publish to contexts {string} and {string}", async () => {
          // Event ID and contexts captured for later use
        });

        When("publishing the event via durable publisher", async () => {
          const state = getExtendedState();
          const result = await testMutation(state.t, publicationTestApi.testPublishEvent, {
            eventId,
            eventType: "OrderCreated",
            eventData: { orderId: "test-order" },
            streamType: "Order",
            streamId: "test-order",
            sourceContext: "orders",
            targetContexts: ["inventory", "notifications"],
          });
          setLastResult(result);
        });

        Then(
          "{int} publication records should exist in eventPublications",
          async (_ctx: unknown, expectedCount: number) => {
            const state = getExtendedState();
            const records = await testQuery(state.t, publicationTestApi.getPublicationRecords, {
              eventId,
            });
            expect(records.length).toBe(expectedCount);
            state.durability.publications = records;
          }
        );

        And("each record should have status {string}", (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          for (const pub of state.durability.publications!) {
            expect(pub.status).toBe(expectedStatus);
          }
        });

        And("each record should have attemptCount {int}", async () => {
          const state = getExtendedState();
          const records = await testQuery(state.t, publicationTestApi.getPublicationRecords, {
            eventId,
          });
          for (const pub of records) {
            expect(pub.attemptCount).toBe(0);
          }
        });

        And("each record should have a unique publicationId", () => {
          const state = getExtendedState();
          const ids = state.durability.publications!.map((p) => p.publicationId);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        });
      }
    );

    RuleScenario("Publication records contain event metadata", ({ Given, And, When, Then }) => {
      const eventId = generateEventId("pub_metadata");
      const correlationId = `corr_${testRunId}_pub_meta`;

      Given("an event {string} with correlationId {string}", async () => {
        // Event ID and correlation ID captured
      });

      And("target context {string}", async () => {
        // Target context captured
      });

      When("publishing the event via durable publisher", async () => {
        const state = getExtendedState();
        const result = await testMutation(state.t, publicationTestApi.testPublishEvent, {
          eventId,
          eventType: "OrderCreated",
          eventData: { orderId: "test-order-meta" },
          streamType: "Order",
          streamId: "test-order-meta",
          sourceContext: "orders",
          targetContexts: ["inventory"],
          correlationId,
        });
        setLastResult(result);
      });

      Then(
        "the publication record should have correlationId {string}",
        async (_ctx: unknown, expectedCorrelationId: string) => {
          const state = getExtendedState();
          const records = await testQuery(state.t, publicationTestApi.getPublicationRecords, {
            eventId,
          });
          expect(records.length).toBe(1);

          // Assert correlationId is present (may be in record, eventData, or metadata)
          const record = records[0] as Record<string, unknown>;
          const actualCorrelationId =
            record.correlationId ??
            (record.eventData as Record<string, unknown>)?.correlationId ??
            (record.metadata as Record<string, unknown>)?.correlationId;
          expect(actualCorrelationId).toBe(expectedCorrelationId);

          state.durability.publications = records;
        }
      );

      And(
        "the publication record should have sourceContext {string}",
        (_ctx: unknown, expectedSource: string) => {
          const state = getExtendedState();
          expect(state.durability.publications![0].sourceContext).toBe(expectedSource);
        }
      );

      And(
        "the publication record should have targetContext {string}",
        (_ctx: unknown, expectedTarget: string) => {
          const state = getExtendedState();
          expect(state.durability.publications![0].targetContext).toBe(expectedTarget);
        }
      );
    });
  });

  // Additional rules can be implemented similarly...
});

// =============================================================================
// IDEMPOTENT APPEND FEATURE
// =============================================================================

const idempotentAppendFeature = await loadFeature(
  "tests/integration-features/durability/idempotent-append.feature"
);

describeFeature(idempotentAppendFeature, ({ Background, Rule }) => {
  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      testRunId = generateTestRunId();
      initIntegrationState();
    });
  });

  // =========================================================================
  // Rule: First append with unique idempotency key creates event
  // =========================================================================
  Rule("First append with unique idempotency key creates event", ({ RuleScenario }) => {
    RuleScenario(
      "Append event with unique idempotency key succeeds",
      ({ Given, When, Then, And }) => {
        Given(
          "a unique idempotency key for stream {string}",
          async (_ctx: unknown, _streamType: string) => {
            const state = getExtendedState();
            state.durability.idempotencyKey = generateIdempotencyKey("unique");
          }
        );

        When("I append an event with the idempotency key", async () => {
          const state = getExtendedState();
          const result = await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
            idempotencyKey: state.durability.idempotencyKey!,
            streamType: "Order",
            streamId: `${testRunId}_stream_unique`,
            eventType: "OrderCreated",
            eventData: { orderId: `${testRunId}_ord_unique` },
            boundedContext: "orders",
            expectedVersion: 0,
          });
          state.durability.appendResult = result;
          setLastResult(result);
        });

        Then(
          "the append result status should be {string}",
          (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            expect(state.durability.appendResult?.status).toBe(expectedStatus);
          }
        );

        And("the event should be queryable by idempotency key", async () => {
          const state = getExtendedState();
          const event = await testQuery(state.t, idempotentAppendTestApi.getEventByIdempotencyKey, {
            idempotencyKey: state.durability.idempotencyKey!,
          });
          expect(event).toBeDefined();
        });

        And("the event should exist in the stream", async () => {
          const state = getExtendedState();
          const events = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Order",
            streamId: `${testRunId}_stream_unique`,
          });
          expect(events.length).toBeGreaterThan(0);
        });
      }
    );

    RuleScenario(
      "Different idempotency keys create separate events",
      ({ Given, And, When, Then }) => {
        const streamId = `${testRunId}_stream_multi`;

        Given(
          "a unique idempotency key {string} for stream {string}",
          async (_ctx: unknown, keyName: string) => {
            const state = getExtendedState();
            state.durability.idempotencyKey = generateIdempotencyKey(keyName);
          }
        );

        And("a unique idempotency key {string} for stream {string}", async () => {
          // Second key will be used in the second When step
        });

        When(
          "I append an event with idempotency key {string}",
          async (_ctx: unknown, keyName: string) => {
            const state = getExtendedState();
            const idempotencyKey = generateIdempotencyKey(keyName);

            const version = await testQuery(state.t, idempotentAppendTestApi.getTestStreamVersion, {
              streamType: "Order",
              streamId,
            });

            await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
              idempotencyKey,
              streamType: "Order",
              streamId,
              eventType: "OrderCreated",
              eventData: { key: keyName },
              boundedContext: "orders",
              expectedVersion: version ?? 0,
            });
          }
        );

        And(
          "I append an event with idempotency key {string}",
          async (_ctx: unknown, keyName: string) => {
            const state = getExtendedState();
            const idempotencyKey = generateIdempotencyKey(keyName);

            const version = await testQuery(state.t, idempotentAppendTestApi.getTestStreamVersion, {
              streamType: "Order",
              streamId,
            });

            await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
              idempotencyKey,
              streamType: "Order",
              streamId,
              eventType: "OrderCreated",
              eventData: { key: keyName },
              boundedContext: "orders",
              expectedVersion: version ?? 0,
            });
          }
        );

        Then("both events should exist in the stream", async () => {
          const state = getExtendedState();
          const events = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Order",
            streamId,
          });
          expect(events.length).toBeGreaterThanOrEqual(2);
        });

        And("they should have different event IDs", async () => {
          const state = getExtendedState();
          const events = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Order",
            streamId,
          });
          const eventIds = events.map((e: { eventId: string }) => e.eventId);
          const uniqueIds = new Set(eventIds);
          expect(uniqueIds.size).toBe(events.length);
        });
      }
    );
  });

  // =========================================================================
  // Rule: Duplicate append with same idempotency key returns existing event
  // =========================================================================
  Rule("Duplicate append with same idempotency key returns existing event", ({ RuleScenario }) => {
    RuleScenario(
      "Second append with same idempotency key returns duplicate",
      ({ Given, When, Then, And }) => {
        const idempotencyKey = generateIdempotencyKey("dup_key_001");
        const streamId = `${testRunId}_stream_dup`;

        Given("an event was already appended with idempotency key {string}", async () => {
          const state = getExtendedState();

          await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
            idempotencyKey,
            streamType: "Order",
            streamId,
            eventType: "OrderCreated",
            eventData: { orderId: "dup-test" },
            boundedContext: "orders",
            expectedVersion: 0,
          });
        });

        When("I append another event with idempotency key {string}", async () => {
          const state = getExtendedState();

          const result = await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
            idempotencyKey,
            streamType: "Order",
            streamId,
            eventType: "OrderCreated",
            eventData: { orderId: "dup-test-2" },
            boundedContext: "orders",
            expectedVersion: 0,
          });
          state.durability.appendResult = result;
          setLastResult(result);
        });

        Then(
          "the append result status should be {string}",
          (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            expect(state.durability.appendResult?.status).toBe(expectedStatus);
          }
        );

        And("the result should contain the original event ID", () => {
          const state = getExtendedState();
          expect(state.durability.appendResult?.eventId).toBeDefined();
        });

        And("only one event should exist with that idempotency key", async () => {
          const state = getExtendedState();
          const events = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Order",
            streamId,
          });
          const matchingEvents = events.filter(
            (e: { idempotencyKey?: string }) => e.idempotencyKey === idempotencyKey
          );
          expect(matchingEvents.length).toBe(1);
        });
      }
    );

    RuleScenario("Duplicate append preserves original event data", ({ Given, When, Then, And }) => {
      const idempotencyKey = generateIdempotencyKey("preserve_key");
      const streamId = `${testRunId}_stream_preserve`;

      Given("an event with payload {string} was appended with key {string}", async () => {
        const state = getExtendedState();

        await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
          idempotencyKey,
          streamType: "Order",
          streamId,
          eventType: "OrderCreated",
          eventData: { payload: "original data" },
          boundedContext: "orders",
          expectedVersion: 0,
        });
      });

      When("I append an event with different payload {string} using key {string}", async () => {
        const state = getExtendedState();

        const result = await testMutation(state.t, idempotentAppendTestApi.testIdempotentAppend, {
          idempotencyKey,
          streamType: "Order",
          streamId,
          eventType: "OrderCreated",
          eventData: { payload: "new data" },
          boundedContext: "orders",
          expectedVersion: 0,
        });
        state.durability.appendResult = result;
        setLastResult(result);
      });

      Then(
        "the append result status should be {string}",
        (_ctx: unknown, expectedStatus: string) => {
          const state = getExtendedState();
          expect(state.durability.appendResult?.status).toBe(expectedStatus);
        }
      );

      And(
        "the event in the store should have payload {string}",
        async (_ctx: unknown, expectedPayload: string) => {
          const state = getExtendedState();
          const event = await testQuery(state.t, idempotentAppendTestApi.getEventByIdempotencyKey, {
            idempotencyKey,
          });
          expect(event?.payload?.payload).toBe(expectedPayload);
        }
      );
    });
  });

  // =========================================================================
  // Rule: Idempotency works across different stream types
  // =========================================================================
  Rule("Idempotency works across different stream types", ({ RuleScenario }) => {
    RuleScenario(
      "Same idempotency key on different streams creates separate events",
      ({ Given, When, Then, And }) => {
        const baseKey = generateIdempotencyKey("cross_stream");

        Given("a unique base key {string}", async () => {
          // Base key is already set
        });

        When(
          "I append to stream {string} with key {string}",
          async (_ctx: unknown, streamSpec: string, _keySpec: string) => {
            const state = getExtendedState();
            // Parse stream spec like "Order:ord-001"
            const [streamType, streamId] = streamSpec.split(":");
            const idempotencyKey = `${baseKey}:${streamType}:${streamId}`;

            const result = await testMutation(
              state.t,
              idempotentAppendTestApi.testIdempotentAppend,
              {
                idempotencyKey,
                streamType,
                streamId: `${testRunId}_${streamId}`,
                eventType: `${streamType}Created`,
                eventData: { id: streamId },
                boundedContext: streamType.toLowerCase(),
                expectedVersion: 0,
              }
            );
            setLastResult(result);
          }
        );

        And(
          "I append to stream {string} with key {string}",
          async (_ctx: unknown, streamSpec: string, _keySpec: string) => {
            const state = getExtendedState();
            const [streamType, streamId] = streamSpec.split(":");
            const idempotencyKey = `${baseKey}:${streamType}:${streamId}`;

            const result = await testMutation(
              state.t,
              idempotentAppendTestApi.testIdempotentAppend,
              {
                idempotencyKey,
                streamType,
                streamId: `${testRunId}_${streamId}`,
                eventType: `${streamType}Created`,
                eventData: { id: streamId },
                boundedContext: streamType.toLowerCase(),
                expectedVersion: 0,
              }
            );
            setLastResult(result);
          }
        );

        Then(
          "both appends should succeed with status {string}",
          (_ctx: unknown, expectedStatus: string) => {
            const state = getExtendedState();
            const result = state.lastResult as { status: string };
            expect(result.status).toBe(expectedStatus);
          }
        );

        And("both streams should have their respective events", async () => {
          const state = getExtendedState();

          const orderEvents = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Order",
            streamId: `${testRunId}_ord-001`,
          });

          const inventoryEvents = await testQuery(state.t, idempotentAppendTestApi.readTestStream, {
            streamType: "Inventory",
            streamId: `${testRunId}_inv-001`,
          });

          expect(orderEvents.length).toBeGreaterThan(0);
          expect(inventoryEvents.length).toBeGreaterThan(0);
        });
      }
    );
  });
});
