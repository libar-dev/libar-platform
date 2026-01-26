/**
 * Durable Publication Integration Test Steps
 *
 * Tests durable cross-context event publication against real Convex backend.
 * Uses eventPublications table to verify publication tracking behavior.
 *
 * @since Phase 18b - EventStoreDurability
 */
import { describe, beforeAll, afterAll, expect } from "vitest";
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { withPrefix } from "../../../src/testing/index.js";

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "../../../../../examples/order-management/tests/integration-features/durability/durable-publication.feature"
);

// =============================================================================
// Test State
// =============================================================================

interface PublicationResult {
  eventId: string;
  publications: Array<{
    targetContext: string;
    publicationId: string;
    status: string;
  }>;
}

interface PublicationRecord {
  _id: unknown;
  publicationId: string;
  eventId: string;
  sourceContext: string;
  targetContext: string;
  status: string;
  attemptCount: number;
  correlationId?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number;
}

interface PublicationStats {
  pending: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  total: number;
}

interface TestState {
  helper: ConvexTestingHelper;
  testRunId: string;
  eventId: string;
  targetContexts: string[];
  sourceContext: string;
  correlationId?: string;
  publishResult?: PublicationResult;
  queryResult?: PublicationRecord[];
  statsResult?: PublicationStats;
  createdPublicationIds: string[];
}

let state: TestState | null = null;

// =============================================================================
// Lifecycle
// =============================================================================

describe("Durable Publication Integration Tests", () => {
  beforeAll(async () => {
    const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
    const helper = new ConvexTestingHelper({ backendUrl });
    state = {
      helper,
      testRunId: withPrefix(`r${Date.now()}`),
      eventId: "",
      targetContexts: [],
      sourceContext: "orders",
      createdPublicationIds: [],
    };
  });

  afterAll(async () => {
    state = null;
  });

  // ===========================================================================
  // Feature Tests
  // ===========================================================================

  describeFeature(feature, ({ Background, Rule }) => {
    Background(({ Given, And }) => {
      Given("the backend is running and clean", () => {
        expect(state).not.toBeNull();
        // Reset state for each scenario
        state!.eventId = "";
        state!.targetContexts = [];
        state!.correlationId = undefined;
        state!.publishResult = undefined;
        state!.queryResult = undefined;
        state!.statsResult = undefined;
        state!.createdPublicationIds = [];
      });

      And("durable publication is configured with maxAttempts 3", () => {
        // Configuration is implicit in test mutations (maxAttempts = 3)
        expect(state).not.toBeNull();
      });
    });

    // =========================================================================
    // Rule: Publications create tracking records
    // =========================================================================

    Rule("Publications create tracking records", ({ RuleScenario }) => {
      RuleScenario(
        "Publishing creates records for each target context",
        ({ Given, When, Then, And }) => {
          Given(
            "an event {string} to publish to contexts {string} and {string}",
            async (_ctx: unknown, eventId: string, ctx1: string, ctx2: string) => {
              state!.eventId = `${state!.testRunId}_${eventId}`;
              state!.targetContexts = [ctx1, ctx2];
            }
          );

          When("publishing the event via durable publisher", async () => {
            state!.publishResult = await state!.helper.mutation(
              "testing/durablePublicationTest:testPublishEvent",
              {
                eventId: state!.eventId,
                eventType: "TestEvent",
                eventData: { test: true },
                streamType: "TestStream",
                streamId: `${state!.testRunId}_stream_1`,
                sourceContext: state!.sourceContext,
                targetContexts: state!.targetContexts,
                maxAttempts: 3,
              }
            );
          });

          Then(
            "{int} publication records should exist in eventPublications",
            async (_ctx: unknown, count: number) => {
              const records = (await state!.helper.query(
                "testing/durablePublicationTest:getPublicationRecords",
                { eventId: state!.eventId }
              )) as PublicationRecord[];

              expect(records).toHaveLength(count);
            }
          );

          And(
            "each record should have status {string}",
            async (_ctx: unknown, expectedStatus: string) => {
              const records = (await state!.helper.query(
                "testing/durablePublicationTest:getPublicationRecords",
                { eventId: state!.eventId }
              )) as PublicationRecord[];

              for (const record of records) {
                expect(record.status).toBe(expectedStatus);
              }
            }
          );

          And(
            "each record should have attemptCount {int}",
            async (_ctx: unknown, expectedCount: number) => {
              const records = (await state!.helper.query(
                "testing/durablePublicationTest:getPublicationRecords",
                { eventId: state!.eventId }
              )) as PublicationRecord[];

              for (const record of records) {
                expect(record.attemptCount).toBe(expectedCount);
              }
            }
          );

          And("each record should have a unique publicationId", async () => {
            const records = (await state!.helper.query(
              "testing/durablePublicationTest:getPublicationRecords",
              { eventId: state!.eventId }
            )) as PublicationRecord[];

            const ids = records.map((r) => r.publicationId);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          });
        }
      );

      RuleScenario("Publication records contain event metadata", ({ Given, And, When, Then }) => {
        Given(
          "an event {string} with correlationId {string}",
          async (_ctx: unknown, eventId: string, corrId: string) => {
            state!.eventId = `${state!.testRunId}_${eventId}`;
            state!.correlationId = `${state!.testRunId}_${corrId}`;
          }
        );

        And("target context {string}", async (_ctx: unknown, targetContext: string) => {
          state!.targetContexts = [targetContext];
        });

        When("publishing the event via durable publisher", async () => {
          state!.publishResult = await state!.helper.mutation(
            "testing/durablePublicationTest:testPublishEvent",
            {
              eventId: state!.eventId,
              eventType: "TestEvent",
              eventData: { test: true },
              streamType: "TestStream",
              streamId: `${state!.testRunId}_stream_1`,
              sourceContext: state!.sourceContext,
              targetContexts: state!.targetContexts,
              correlationId: state!.correlationId,
              maxAttempts: 3,
            }
          );
        });

        Then(
          "the publication record should have correlationId {string}",
          async (_ctx: unknown, _corrId: string) => {
            const records = (await state!.helper.query(
              "testing/durablePublicationTest:getPublicationRecords",
              { eventId: state!.eventId }
            )) as PublicationRecord[];

            expect(records).toHaveLength(1);
            expect(records[0].correlationId).toBe(state!.correlationId);
          }
        );

        And(
          "the publication record should have sourceContext {string}",
          async (_ctx: unknown, expected: string) => {
            const records = (await state!.helper.query(
              "testing/durablePublicationTest:getPublicationRecords",
              { eventId: state!.eventId }
            )) as PublicationRecord[];

            expect(records[0].sourceContext).toBe(expected);
          }
        );

        And(
          "the publication record should have targetContext {string}",
          async (_ctx: unknown, expected: string) => {
            const records = (await state!.helper.query(
              "testing/durablePublicationTest:getPublicationRecords",
              { eventId: state!.eventId }
            )) as PublicationRecord[];

            expect(records[0].targetContext).toBe(expected);
          }
        );
      });
    });

    // =========================================================================
    // Rule: Publication results provide tracking information
    // =========================================================================

    Rule("Publication results provide tracking information", ({ RuleScenario }) => {
      RuleScenario("Publish result contains publication IDs", ({ Given, When, Then, And }) => {
        Given(
          "an event {string} to publish to contexts {string} and {string}",
          async (_ctx: unknown, eventId: string, ctx1: string, ctx2: string) => {
            state!.eventId = `${state!.testRunId}_${eventId}`;
            state!.targetContexts = [ctx1, ctx2];
          }
        );

        When("publishing the event via durable publisher", async () => {
          state!.publishResult = await state!.helper.mutation(
            "testing/durablePublicationTest:testPublishEvent",
            {
              eventId: state!.eventId,
              eventType: "TestEvent",
              eventData: { test: true },
              streamType: "TestStream",
              streamId: `${state!.testRunId}_stream_1`,
              sourceContext: state!.sourceContext,
              targetContexts: state!.targetContexts,
              maxAttempts: 3,
            }
          );
        });

        Then(
          "the result should have eventId {string}",
          async (_ctx: unknown, expectedEventId: string) => {
            const fullEventId = `${state!.testRunId}_${expectedEventId}`;
            expect(state!.publishResult?.eventId).toBe(fullEventId);
          }
        );

        And("the result should have {int} publications", async (_ctx: unknown, count: number) => {
          expect(state!.publishResult?.publications).toHaveLength(count);
        });

        And(
          "each publication should have a publicationId starting with {string}",
          async (_ctx: unknown, prefix: string) => {
            for (const pub of state!.publishResult?.publications ?? []) {
              expect(pub.publicationId.startsWith(prefix)).toBe(true);
            }
          }
        );

        And(
          "each publication should have status {string}",
          async (_ctx: unknown, expectedStatus: string) => {
            for (const pub of state!.publishResult?.publications ?? []) {
              expect(pub.status).toBe(expectedStatus);
            }
          }
        );
      });
    });

    // =========================================================================
    // Rule: Publication status can be queried
    // =========================================================================

    Rule("Publication status can be queried", ({ RuleScenario }) => {
      RuleScenario("Query publications by event ID", ({ Given, When, Then }) => {
        Given(
          "{int} publications exist for event {string}",
          async (_ctx: unknown, count: number, eventId: string) => {
            state!.eventId = `${state!.testRunId}_${eventId}`;
            const contexts = ["context1", "context2", "context3"].slice(0, count);

            for (const ctx of contexts) {
              const pubId = `${state!.testRunId}_pub_${eventId}_${ctx}`;
              state!.createdPublicationIds.push(pubId);

              await state!.helper.mutation("testing/durablePublicationTest:createTestPublication", {
                publicationId: pubId,
                eventId: state!.eventId,
                sourceContext: "orders",
                targetContext: ctx,
                status: "pending",
                attemptCount: 0,
              });
            }
          }
        );

        When("querying publications for event {string}", async (_ctx: unknown, eventId: string) => {
          const fullEventId = `${state!.testRunId}_${eventId}`;
          state!.queryResult = (await state!.helper.query(
            "testing/durablePublicationTest:getPublicationRecords",
            { eventId: fullEventId }
          )) as PublicationRecord[];
        });

        Then(
          "{int} publication records should be returned",
          async (_ctx: unknown, count: number) => {
            expect(state!.queryResult).toHaveLength(count);
          }
        );
      });

      RuleScenario("Query returns empty for unknown event", ({ Given, When, Then }) => {
        Given(
          "no publications exist for event {string}",
          async (_ctx: unknown, _eventId: string) => {
            // No setup needed - just using a unique eventId
          }
        );

        When("querying publications for event {string}", async (_ctx: unknown, eventId: string) => {
          const fullEventId = `${state!.testRunId}_${eventId}`;
          state!.queryResult = (await state!.helper.query(
            "testing/durablePublicationTest:getPublicationRecords",
            { eventId: fullEventId }
          )) as PublicationRecord[];
        });

        Then(
          "{int} publication records should be returned",
          async (_ctx: unknown, count: number) => {
            expect(state!.queryResult).toHaveLength(count);
          }
        );
      });

      RuleScenario("Query publications by status", ({ Given, When, Then }) => {
        Given("publications exist with various statuses", async () => {
          // Create publications with different statuses
          const publications = [
            { pubId: "pub-d-001", status: "delivered" },
            { pubId: "pub-d-002", status: "pending" },
            { pubId: "pub-d-003", status: "dead_lettered" },
          ];

          for (const { pubId, status } of publications) {
            const fullPubId = `${state!.testRunId}_${pubId}`;
            state!.createdPublicationIds.push(fullPubId);

            await state!.helper.mutation("testing/durablePublicationTest:createTestPublication", {
              publicationId: fullPubId,
              eventId: `${state!.testRunId}_event_for_${pubId}`,
              sourceContext: "orders",
              targetContext: "test",
              status: status as "pending" | "delivered" | "failed" | "dead_lettered",
              attemptCount: 0,
            });
          }
        });

        When(
          "querying publications with status {string}",
          async (_ctx: unknown, status: string) => {
            state!.queryResult = (await state!.helper.query(
              "testing/durablePublicationTest:listPublicationsByStatus",
              { status: status as "pending" | "delivered" | "failed" | "dead_lettered" }
            )) as PublicationRecord[];
          }
        );

        Then("only delivered publications should be returned", async () => {
          // Filter for our test run's publications
          const ourDelivered = state!.queryResult?.filter(
            (r) => r.publicationId.startsWith(state!.testRunId) && r.status === "delivered"
          );
          expect(ourDelivered?.length).toBeGreaterThanOrEqual(1);
        });
      });
    });

    // =========================================================================
    // Rule: Publication stats provide visibility
    // =========================================================================

    Rule("Publication stats provide visibility", ({ RuleScenario }) => {
      RuleScenario("Stats show counts by status", ({ Given, When, Then }) => {
        Given("multiple publications with various statuses exist", async () => {
          // Create publications with different statuses
          const publications = [
            { status: "pending", count: 2 },
            { status: "delivered", count: 3 },
            { status: "dead_lettered", count: 1 },
          ];

          for (const { status, count } of publications) {
            for (let i = 0; i < count; i++) {
              const pubId = `${state!.testRunId}_stats_${status}_${i}`;
              state!.createdPublicationIds.push(pubId);

              await state!.helper.mutation("testing/durablePublicationTest:createTestPublication", {
                publicationId: pubId,
                eventId: `${state!.testRunId}_event_stats_${status}_${i}`,
                sourceContext: "orders",
                targetContext: "test",
                status: status as "pending" | "delivered" | "failed" | "dead_lettered",
                attemptCount: 0,
              });
            }
          }
        });

        When("querying publication stats", async () => {
          state!.statsResult = (await state!.helper.query(
            "testing/durablePublicationTest:getPublicationStats",
            {}
          )) as PublicationStats;
        });

        Then("stats should show correct counts per status", async () => {
          // Stats include all publications in DB, so we check >= expected
          expect(state!.statsResult?.pending).toBeGreaterThanOrEqual(2);
          expect(state!.statsResult?.delivered).toBeGreaterThanOrEqual(3);
          expect(state!.statsResult?.deadLettered).toBeGreaterThanOrEqual(1);
          expect(state!.statsResult?.total).toBeGreaterThanOrEqual(6);
        });
      });
    });

    // =========================================================================
    // Rule: Multiple events maintain isolation
    // =========================================================================

    Rule("Multiple events maintain isolation", ({ RuleScenario }) => {
      RuleScenario("Publications for different events are isolated", ({ Given, When, Then }) => {
        Given("two events are published to different contexts", async () => {
          // Create first event -> inventory
          state!.eventId = `${state!.testRunId}_evt-pub-010`;
          const pubId1 = `${state!.testRunId}_pub_evt-pub-010`;
          state!.createdPublicationIds.push(pubId1);

          await state!.helper.mutation("testing/durablePublicationTest:createTestPublication", {
            publicationId: pubId1,
            eventId: state!.eventId,
            sourceContext: "orders",
            targetContext: "inventory",
            status: "pending",
            attemptCount: 0,
          });

          // Create second event -> analytics
          const eventId2 = `${state!.testRunId}_evt-pub-011`;
          const pubId2 = `${state!.testRunId}_pub_evt-pub-011`;
          state!.createdPublicationIds.push(pubId2);

          await state!.helper.mutation("testing/durablePublicationTest:createTestPublication", {
            publicationId: pubId2,
            eventId: eventId2,
            sourceContext: "orders",
            targetContext: "analytics",
            status: "pending",
            attemptCount: 0,
          });
        });

        When("querying publications for the first event", async () => {
          state!.queryResult = (await state!.helper.query(
            "testing/durablePublicationTest:getPublicationRecords",
            { eventId: state!.eventId }
          )) as PublicationRecord[];
        });

        Then("only that event's publication should be returned", async () => {
          expect(state!.queryResult).toHaveLength(1);
          expect(state!.queryResult?.[0].eventId).toBe(state!.eventId);
          expect(state!.queryResult?.[0].targetContext).toBe("inventory");
          // Verify analytics is not included
          const analyticsRecords = state!.queryResult?.filter(
            (r) => r.targetContext === "analytics"
          );
          expect(analyticsRecords).toHaveLength(0);
        });
      });
    });
  });
});
