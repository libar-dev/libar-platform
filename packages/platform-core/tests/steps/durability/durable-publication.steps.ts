/**
 * Durable Publication - Step Definitions
 *
 * BDD step definitions for durable cross-context event publication:
 * - createPublicationPartitionKey builder
 * - createDurableEventPublisher factory
 * - publish method
 * - getPublicationStatus query
 * - retryPublication mutation
 * - onComplete callback behavior
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createPublicationPartitionKey,
  createDurableEventPublisher,
  type DurableEventPublisher,
  type PublishableEvent,
  type DurablePublishResult,
} from "../../../src/durability/publication.js";
import type { EventPublication, PublicationStatus } from "../../../src/durability/types.js";

// =============================================================================
// Types
// =============================================================================

interface MockPublicationRecord {
  _id: string;
  publicationId: string;
  eventId: string;
  sourceContext: string;
  targetContext: string;
  status: PublicationStatus;
  attemptCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  deliveredAt?: number;
  error?: string;
  correlationId?: string;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Input state
  eventId: string;
  targetContext: string;
  targetContexts: string[];
  correlationId?: string;
  maxAttempts: number;
  event: PublishableEvent | null;

  // Mock records
  mockPublicationRecords: MockPublicationRecord[];

  // Captured calls
  insertedRecords: Record<string, unknown>[];
  enqueuedActions: Array<{
    actionRef: unknown;
    args: unknown;
    options: { key?: string; onComplete?: unknown; context?: unknown };
  }>;
  patchedRecords: Array<{ id: string; fields: Record<string, unknown> }>;

  // Results
  partitionKeyResult: { name: string; value: string } | null;
  publisher: DurableEventPublisher | null;
  publishResult: DurablePublishResult | null;
  publicationStatusResult: EventPublication[] | null;
  retryResult: { status: string } | null;

  // onComplete simulation
  onCompleteSuccess: boolean;
  onCompleteResult: {
    status: PublicationStatus;
    attemptCount?: number;
    deliveredAt?: number;
    error?: string;
  } | null;
}

let state: TestState;

function resetState(): void {
  state = {
    eventId: "",
    targetContext: "",
    targetContexts: [],
    correlationId: undefined,
    maxAttempts: 5,
    event: null,
    mockPublicationRecords: [],
    insertedRecords: [],
    enqueuedActions: [],
    patchedRecords: [],
    partitionKeyResult: null,
    publisher: null,
    publishResult: null,
    publicationStatusResult: null,
    retryResult: null,
    onCompleteSuccess: true,
    onCompleteResult: null,
  };
}

// =============================================================================
// Mock Factories
// =============================================================================

function createMockWorkpool() {
  return {
    enqueueAction: vi.fn().mockImplementation((_ctx, actionRef, args, options) => {
      state.enqueuedActions.push({ actionRef, args, options });
      return Promise.resolve();
    }),
  };
}

function createMockContext() {
  return {
    db: {
      insert: vi.fn().mockImplementation((table, doc) => {
        state.insertedRecords.push({ table, ...doc });
        return Promise.resolve(`mock_id_${state.insertedRecords.length}`);
      }),
      query: vi.fn().mockImplementation(() => ({
        withIndex: vi.fn().mockImplementation(() => ({
          collect: vi.fn().mockImplementation(() => {
            return Promise.resolve(state.mockPublicationRecords);
          }),
          first: vi.fn().mockImplementation(() => {
            return Promise.resolve(state.mockPublicationRecords[0] ?? null);
          }),
        })),
      })),
      patch: vi.fn().mockImplementation((id, fields) => {
        state.patchedRecords.push({ id, fields });
        return Promise.resolve();
      }),
    },
  };
}

function createMockPublisher(): DurableEventPublisher {
  const mockWorkpool = createMockWorkpool();

  return createDurableEventPublisher({
    maxAttempts: state.maxAttempts,
    initialBackoffMs: 100,
    base: 2,
    dependencies: {
      workpool: mockWorkpool,
      deliveryActionRef: "mockDeliveryAction",
      onCompleteRef: "mockOnComplete",
    },
  });
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/durable-publication.feature"
);

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Partition Key Builder
  // ===========================================================================

  Scenario("Partition key format is eventId:targetContext", ({ Given, When, Then, And }) => {
    Given('an eventId "evt-123" and target context "inventory"', () => {
      state.eventId = "evt-123";
      state.targetContext = "inventory";
    });

    When("creating a publication partition key", () => {
      state.partitionKeyResult = createPublicationPartitionKey(state.eventId, state.targetContext);
    });

    Then('the partition key value should be "evt-123:inventory"', () => {
      expect(state.partitionKeyResult?.value).toBe("evt-123:inventory");
    });

    And('the partition key name should be "publication"', () => {
      expect(state.partitionKeyResult?.name).toBe("publication");
    });
  });

  ScenarioOutline(
    "Different events get different partition keys",
    (
      { Given, When, Then },
      variables: { eventId: string; targetContext: string; expected: string }
    ) => {
      Given('an eventId "<eventId>" and target context "<targetContext>"', () => {
        state.eventId = variables.eventId;
        state.targetContext = variables.targetContext;
      });

      When("creating a publication partition key", () => {
        state.partitionKeyResult = createPublicationPartitionKey(
          state.eventId,
          state.targetContext
        );
      });

      Then('the partition key value should be "<expected>"', () => {
        expect(state.partitionKeyResult?.value).toBe(variables.expected);
      });
    }
  );

  // ===========================================================================
  // Publisher Factory and Publish Method
  // ===========================================================================

  Scenario(
    "Publishing event creates tracking records for each target",
    ({ Given, When, Then, And }) => {
      Given("a durable event publisher configured with maxAttempts 5", () => {
        state.maxAttempts = 5;
        state.publisher = createMockPublisher();
      });

      And('an event "evt-123" to publish to contexts "inventory" and "notifications"', () => {
        state.event = {
          eventId: "evt-123",
          eventType: "OrderSubmitted",
          eventData: { orderId: "ord-123" },
          streamType: "Order",
          streamId: "ord-123",
        };
        state.targetContexts = ["inventory", "notifications"];
      });

      When("publishing the event", async () => {
        const ctx = createMockContext();
        state.publishResult = await state.publisher!.publish(ctx, {
          event: state.event!,
          sourceContext: "orders",
          targetContexts: state.targetContexts,
        });
      });

      Then("2 publication tracking records should be created", () => {
        expect(state.insertedRecords.length).toBe(2);
      });

      And('each record should have status "pending"', () => {
        for (const record of state.insertedRecords) {
          expect(record.status).toBe("pending");
        }
      });

      And("each record should have attemptCount 0", () => {
        for (const record of state.insertedRecords) {
          expect(record.attemptCount).toBe(0);
        }
      });
    }
  );

  Scenario(
    "Publishing event enqueues delivery actions via Workpool",
    ({ Given, When, Then, And }) => {
      Given("a durable event publisher configured with maxAttempts 5", () => {
        state.maxAttempts = 5;
        state.publisher = createMockPublisher();
      });

      And('an event "evt-123" to publish to contexts "inventory" and "notifications"', () => {
        state.event = {
          eventId: "evt-123",
          eventType: "OrderSubmitted",
          eventData: { orderId: "ord-123" },
          streamType: "Order",
          streamId: "ord-123",
        };
        state.targetContexts = ["inventory", "notifications"];
      });

      When("publishing the event", async () => {
        const ctx = createMockContext();
        state.publishResult = await state.publisher!.publish(ctx, {
          event: state.event!,
          sourceContext: "orders",
          targetContexts: state.targetContexts,
        });
      });

      Then("2 delivery actions should be enqueued", () => {
        expect(state.enqueuedActions.length).toBe(2);
      });

      And("each action should have correct partition key", () => {
        for (let i = 0; i < state.enqueuedActions.length; i++) {
          const action = state.enqueuedActions[i];
          const expectedKey = `${state.event!.eventId}:${state.targetContexts[i]}`;
          expect(action.options.key).toBe(expectedKey);
        }
      });

      And("each action should have onComplete handler set", () => {
        for (const action of state.enqueuedActions) {
          expect(action.options.onComplete).toBe("mockOnComplete");
        }
      });
    }
  );

  Scenario(
    "Publish result contains publication IDs for each target",
    ({ Given, When, Then, And }) => {
      Given("a durable event publisher", () => {
        state.publisher = createMockPublisher();
      });

      And('an event "evt-123" to publish to contexts "inventory" and "notifications"', () => {
        state.event = {
          eventId: "evt-123",
          eventType: "OrderSubmitted",
          eventData: { orderId: "ord-123" },
          streamType: "Order",
          streamId: "ord-123",
        };
        state.targetContexts = ["inventory", "notifications"];
      });

      When("publishing the event", async () => {
        const ctx = createMockContext();
        state.publishResult = await state.publisher!.publish(ctx, {
          event: state.event!,
          sourceContext: "orders",
          targetContexts: state.targetContexts,
        });
      });

      Then('the result should contain eventId "evt-123"', () => {
        expect(state.publishResult?.eventId).toBe("evt-123");
      });

      And("the result should have 2 publications", () => {
        expect(state.publishResult?.publications.length).toBe(2);
      });

      And('each publication should have a unique publicationId starting with "pub_"', () => {
        const ids = new Set<string>();
        for (const pub of state.publishResult!.publications) {
          expect(pub.publicationId.startsWith("pub_")).toBe(true);
          expect(ids.has(pub.publicationId)).toBe(false);
          ids.add(pub.publicationId);
        }
      });
    }
  );

  Scenario("Correlation ID is passed through to tracking records", ({ Given, When, Then, And }) => {
    Given("a durable event publisher", () => {
      state.publisher = createMockPublisher();
    });

    And('an event "evt-123" with correlationId "corr-456"', () => {
      state.event = {
        eventId: "evt-123",
        eventType: "OrderSubmitted",
        eventData: { orderId: "ord-123" },
        streamType: "Order",
        streamId: "ord-123",
        correlationId: "corr-456",
      };
    });

    And('target contexts "inventory"', () => {
      state.targetContexts = ["inventory"];
    });

    When("publishing the event", async () => {
      const ctx = createMockContext();
      state.publishResult = await state.publisher!.publish(ctx, {
        event: state.event!,
        sourceContext: "orders",
        targetContexts: state.targetContexts,
      });
    });

    Then('the tracking record should have correlationId "corr-456"', () => {
      expect(state.insertedRecords[0]?.correlationId).toBe("corr-456");
    });
  });

  // ===========================================================================
  // Get Publication Status
  // ===========================================================================

  Scenario("Get publication status returns all target contexts", ({ Given, When, Then, And }) => {
    Given('publications exist for event "evt-123" to 3 targets', () => {
      state.eventId = "evt-123";
      state.mockPublicationRecords = [
        {
          _id: "id_0",
          publicationId: "pub_0",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "delivered",
          attemptCount: 1,
          createdAt: Date.now(),
        },
        {
          _id: "id_1",
          publicationId: "pub_1",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "notifications",
          status: "delivered",
          attemptCount: 2,
          createdAt: Date.now(),
        },
        {
          _id: "id_2",
          publicationId: "pub_2",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "analytics",
          status: "dead_letter",
          attemptCount: 5,
          createdAt: Date.now(),
        },
      ];
      state.publisher = createMockPublisher();
    });

    When('getting publication status for event "evt-123"', async () => {
      const ctx = createMockContext();
      state.publicationStatusResult = await state.publisher!.getPublicationStatus(ctx, "evt-123");
    });

    Then("the result should contain 3 publications", () => {
      expect(state.publicationStatusResult?.length).toBe(3);
    });

    And("the result should show inventory as delivered", () => {
      const inventory = state.publicationStatusResult?.find((p) => p.targetContext === "inventory");
      expect(inventory?.status).toBe("delivered");
    });

    And("the result should show analytics as dead_letter", () => {
      const analytics = state.publicationStatusResult?.find((p) => p.targetContext === "analytics");
      expect(analytics?.status).toBe("dead_letter");
    });
  });

  Scenario(
    "Get publication status returns empty array for unknown event",
    ({ Given, When, Then }) => {
      Given('no publications exist for event "evt-unknown"', () => {
        state.mockPublicationRecords = [];
        state.publisher = createMockPublisher();
      });

      When('getting publication status for event "evt-unknown"', async () => {
        const ctx = createMockContext();
        state.publicationStatusResult = await state.publisher!.getPublicationStatus(
          ctx,
          "evt-unknown"
        );
      });

      Then("the result should be an empty array", () => {
        expect(state.publicationStatusResult).toEqual([]);
      });
    }
  );

  // ===========================================================================
  // Retry Publication
  // ===========================================================================

  Scenario("Retry publication re-enqueues delivery action", ({ Given, When, Then, And }) => {
    Given('a publication record "pub-123" with status "dead_letter"', () => {
      state.mockPublicationRecords = [
        {
          _id: "mock_id_1",
          publicationId: "pub-123",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "dead_letter",
          attemptCount: 3,
          createdAt: Date.now(),
        },
      ];
      state.publisher = createMockPublisher();
    });

    When('retrying publication "pub-123"', async () => {
      const ctx = createMockContext();
      state.retryResult = await state.publisher!.retryPublication(ctx, "pub-123");
    });

    Then('the result status should be "retried"', () => {
      expect(state.retryResult?.status).toBe("retried");
    });

    And('the record status should be updated to "retried"', () => {
      expect(state.patchedRecords[0]?.fields.status).toBe("retried");
    });

    And("attemptCount should be incremented", () => {
      expect(state.patchedRecords[0]?.fields.attemptCount).toBe(4);
    });

    And("a new delivery action should be enqueued", () => {
      expect(state.enqueuedActions.length).toBe(1);
    });
  });

  Scenario(
    "Retry publication returns not_found for unknown publication",
    ({ Given, When, Then }) => {
      Given('no publication record exists for "pub-unknown"', () => {
        state.mockPublicationRecords = [];
        state.publisher = createMockPublisher();
      });

      When('retrying publication "pub-unknown"', async () => {
        const ctx = createMockContext();
        state.retryResult = await state.publisher!.retryPublication(ctx, "pub-unknown");
      });

      Then('the result status should be "not_found"', () => {
        expect(state.retryResult?.status).toBe("not_found");
      });
    }
  );

  Scenario(
    "Retry publication returns already_delivered for delivered publication",
    ({ Given, When, Then, And }) => {
      Given('a publication record "pub-123" with status "delivered"', () => {
        state.mockPublicationRecords = [
          {
            _id: "mock_id_1",
            publicationId: "pub-123",
            eventId: "evt-123",
            sourceContext: "orders",
            targetContext: "inventory",
            status: "delivered",
            attemptCount: 1,
            createdAt: Date.now(),
            deliveredAt: Date.now(),
          },
        ];
        state.publisher = createMockPublisher();
      });

      When('retrying publication "pub-123"', async () => {
        const ctx = createMockContext();
        state.retryResult = await state.publisher!.retryPublication(ctx, "pub-123");
      });

      Then('the result status should be "already_delivered"', () => {
        expect(state.retryResult?.status).toBe("already_delivered");
      });

      And("no delivery action should be enqueued", () => {
        expect(state.enqueuedActions.length).toBe(0);
      });
    }
  );

  Scenario("Retry increments attempt count correctly", ({ Given, When, Then, And }) => {
    Given('a publication record "pub-123" with status "dead_letter" and attemptCount 5', () => {
      state.mockPublicationRecords = [
        {
          _id: "mock_id_1",
          publicationId: "pub-123",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "dead_letter",
          attemptCount: 5,
          createdAt: Date.now(),
        },
      ];
      state.publisher = createMockPublisher();
    });

    When('retrying publication "pub-123"', async () => {
      const ctx = createMockContext();
      state.retryResult = await state.publisher!.retryPublication(ctx, "pub-123");
    });

    Then("the record attemptCount should be 6", () => {
      expect(state.patchedRecords[0]?.fields.attemptCount).toBe(6);
    });

    And("lastAttemptAt should be updated", () => {
      expect(state.patchedRecords[0]?.fields.lastAttemptAt).toBeDefined();
      expect(typeof state.patchedRecords[0]?.fields.lastAttemptAt).toBe("number");
    });
  });

  // ===========================================================================
  // onComplete Callback Behavior (Simulated)
  // ===========================================================================

  Scenario("onComplete updates status to delivered on success", ({ Given, When, Then, And }) => {
    Given('a publication "pub-123" in pending state', () => {
      state.mockPublicationRecords = [
        {
          _id: "mock_id_1",
          publicationId: "pub-123",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "pending",
          attemptCount: 1,
          createdAt: Date.now(),
        },
      ];
    });

    And("delivery action succeeds", () => {
      state.onCompleteSuccess = true;
    });

    When("onComplete callback is invoked with success", () => {
      // Simulate onComplete behavior - this would be in the app's deadLetters.ts
      if (state.onCompleteSuccess) {
        state.onCompleteResult = {
          status: "delivered",
          deliveredAt: Date.now(),
        };
      }
    });

    Then('publication status should be "delivered"', () => {
      expect(state.onCompleteResult?.status).toBe("delivered");
    });

    And("deliveredAt timestamp should be set", () => {
      expect(state.onCompleteResult?.deliveredAt).toBeDefined();
    });
  });

  Scenario("onComplete increments attemptCount on failure", ({ Given, When, Then, And }) => {
    const maxAttempts = 5;

    Given('a publication "pub-123" with attemptCount 2', () => {
      state.mockPublicationRecords = [
        {
          _id: "mock_id_1",
          publicationId: "pub-123",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "pending",
          attemptCount: 2,
          createdAt: Date.now(),
        },
      ];
    });

    And("delivery action fails", () => {
      state.onCompleteSuccess = false;
    });

    When("onComplete callback is invoked with failure", () => {
      // Simulate onComplete behavior
      const currentAttempt = state.mockPublicationRecords[0].attemptCount + 1;
      state.onCompleteResult = {
        attemptCount: currentAttempt,
        status: currentAttempt >= maxAttempts ? "dead_letter" : "pending",
      };
    });

    Then("publication attemptCount should be 3", () => {
      expect(state.onCompleteResult?.attemptCount).toBe(3);
    });

    And('status should remain "pending" if under maxAttempts', () => {
      expect(state.onCompleteResult?.status).toBe("pending");
    });
  });

  Scenario("onComplete creates dead letter after max retries", ({ Given, When, Then, And }) => {
    const maxAttempts = 5;

    Given('a publication "pub-123" with attemptCount at maxAttempts', () => {
      state.mockPublicationRecords = [
        {
          _id: "mock_id_1",
          publicationId: "pub-123",
          eventId: "evt-123",
          sourceContext: "orders",
          targetContext: "inventory",
          status: "pending",
          attemptCount: maxAttempts - 1, // One more attempt will hit max
          createdAt: Date.now(),
        },
      ];
    });

    And("delivery action fails", () => {
      state.onCompleteSuccess = false;
    });

    When("onComplete callback is invoked with failure", () => {
      // Simulate onComplete behavior
      const currentAttempt = state.mockPublicationRecords[0].attemptCount + 1;
      state.onCompleteResult = {
        status: currentAttempt >= maxAttempts ? "dead_letter" : "pending",
        error: "Delivery failed: Connection timeout",
      };
    });

    Then('publication status should be "dead_letter"', () => {
      expect(state.onCompleteResult?.status).toBe("dead_letter");
    });

    And("error details should be recorded", () => {
      expect(state.onCompleteResult?.error).toBeDefined();
      expect(state.onCompleteResult!.error!.length).toBeGreaterThan(0);
    });
  });
});
