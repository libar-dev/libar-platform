/**
 * Idempotent Append - Integration Step Definitions
 *
 * Integration test steps for validating idempotent event append
 * against a real Convex backend with the Event Store component.
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status active
 * @libar-docs-event-sourcing
 *
 * @since Phase 18b
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef, SafeQueryRef } from "../../../src/types/function-references.js";
import { withPrefix, testMutation, testQuery } from "../../../src/testing/index.js";

// =============================================================================
// Test Function References (TS2589 prevention)
// =============================================================================

const testIdempotentAppend = makeFunctionReference<"mutation">(
  "testing/idempotentAppendTest:testIdempotentAppend"
) as SafeMutationRef;

const getEventByIdempotencyKey = makeFunctionReference<"query">(
  "testing/idempotentAppendTest:getEventByIdempotencyKey"
) as SafeQueryRef;

const readTestStream = makeFunctionReference<"query">(
  "testing/idempotentAppendTest:readTestStream"
) as SafeQueryRef;

// =============================================================================
// Test State
// =============================================================================

interface IdempotentAppendResult {
  status: "appended" | "duplicate";
  eventId: string;
  version: number;
}

interface StoredEvent {
  eventId: string;
  eventType: string;
  streamType: string;
  streamId: string;
  version: number;
  payload: unknown;
  idempotencyKey?: string;
}

interface IdempotentAppendTestState {
  t: ConvexTestingHelper | null;
  currentIdempotencyKey: string | null;
  currentStreamId: string | null;
  currentStreamType: string | null;
  appendResult: IdempotentAppendResult | null;
  secondAppendResult: IdempotentAppendResult | null;
  originalEventId: string | null;
  idempotencyKeyA: string | null;
  idempotencyKeyB: string | null;
  resultA: IdempotentAppendResult | null;
  resultB: IdempotentAppendResult | null;
  crossStreamResults: Map<string, IdempotentAppendResult>;
  lastError: Error | null;
}

let state: IdempotentAppendTestState;

function resetState(): void {
  state = {
    t: null,
    currentIdempotencyKey: null,
    currentStreamId: null,
    currentStreamType: null,
    appendResult: null,
    secondAppendResult: null,
    originalEventId: null,
    idempotencyKeyA: null,
    idempotencyKeyB: null,
    resultA: null,
    resultB: null,
    crossStreamResults: new Map(),
    lastError: null,
  };
}

/**
 * Generate a test-isolated stream ID with testRunId prefix.
 */
function generateStreamId(): string {
  return withPrefix(`stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
}

/**
 * Generate a test-isolated idempotency key with testRunId prefix.
 */
function generateIdempotencyKey(suffix?: string): string {
  const base = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return withPrefix(suffix ? `${base}-${suffix}` : base);
}

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "../../../../../examples/order-management/tests/integration-features/durability/idempotent-append.feature"
);

// =============================================================================
// Feature Implementation
// =============================================================================

describeFeature(
  feature,
  ({ Background, Rule, BeforeAllScenarios, AfterAllScenarios, BeforeEachScenario }) => {
    BeforeAllScenarios(async () => {
      resetState();
      const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
      state.t = new ConvexTestingHelper({ backendUrl });
    });

    BeforeEachScenario(() => {
      // Reset per-scenario state while preserving the ConvexTestingHelper connection
      const t = state.t;
      resetState();
      state.t = t;
    });

    AfterAllScenarios(async () => {
      if (state.t) {
        await state.t.close();
      }
      resetState();
    });

    // ===========================================================================
    // Background
    // ===========================================================================

    Background(({ Given }) => {
      Given("the backend is running and clean", () => {
        expect(state.t).not.toBeNull();
      });
    });

    // ===========================================================================
    // Rule: First append with unique idempotency key creates event
    // ===========================================================================

    Rule("First append with unique idempotency key creates event", ({ RuleScenario }) => {
      RuleScenario(
        "Append event with unique idempotency key succeeds",
        ({ Given, When, Then, And }) => {
          Given('a unique idempotency key for stream "Order"', () => {
            state.currentIdempotencyKey = generateIdempotencyKey();
            state.currentStreamId = generateStreamId();
            state.currentStreamType = "Order";
          });

          When("I append an event with the idempotency key", async () => {
            state.appendResult = await testMutation(state.t!, testIdempotentAppend, {
              idempotencyKey: state.currentIdempotencyKey!,
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
              eventType: "TestEventCreated",
              eventData: { test: true, timestamp: Date.now() },
              boundedContext: "testing",
              correlationId: withPrefix(`corr-${Date.now()}`),
            });
          });

          Then('the append result status should be "appended"', () => {
            expect(state.appendResult).not.toBeNull();
            expect(state.appendResult!.status).toBe("appended");
          });

          And("the event should be queryable by idempotency key", async () => {
            const event = await testQuery(state.t!, getEventByIdempotencyKey, {
              idempotencyKey: state.currentIdempotencyKey!,
            });
            expect(event).not.toBeNull();
            expect(event.eventId).toBe(state.appendResult!.eventId);
          });

          And("the event should exist in the stream", async () => {
            const events = await testQuery(state.t!, readTestStream, {
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
            });
            expect(events.length).toBeGreaterThan(0);
            const foundEvent = events.find(
              (e: StoredEvent) => e.eventId === state.appendResult!.eventId
            );
            expect(foundEvent).toBeDefined();
          });
        }
      );

      RuleScenario(
        "Different idempotency keys create separate events",
        ({ Given, And, When, Then }) => {
          Given('a unique idempotency key "key-A" for stream "Order"', () => {
            state.idempotencyKeyA = generateIdempotencyKey("key-A");
            state.currentStreamId = generateStreamId();
            state.currentStreamType = "Order";
          });

          And('a unique idempotency key "key-B" for stream "Order"', () => {
            state.idempotencyKeyB = generateIdempotencyKey("key-B");
          });

          When('I append an event with idempotency key "key-A"', async () => {
            state.resultA = await testMutation(state.t!, testIdempotentAppend, {
              idempotencyKey: state.idempotencyKeyA!,
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
              eventType: "TestEventA",
              eventData: { key: "A" },
              boundedContext: "testing",
            });
          });

          And('I append an event with idempotency key "key-B"', async () => {
            // Get current version first to avoid OCC conflict
            const events = await testQuery(state.t!, readTestStream, {
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
            });
            const expectedVersion = events.length;

            state.resultB = await testMutation(state.t!, testIdempotentAppend, {
              idempotencyKey: state.idempotencyKeyB!,
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
              eventType: "TestEventB",
              eventData: { key: "B" },
              boundedContext: "testing",
              expectedVersion,
            });
          });

          Then("both events should exist in the stream", async () => {
            const events = await testQuery(state.t!, readTestStream, {
              streamType: state.currentStreamType!,
              streamId: state.currentStreamId!,
            });
            expect(events.length).toBe(2);
          });

          And("they should have different event IDs", () => {
            expect(state.resultA).not.toBeNull();
            expect(state.resultB).not.toBeNull();
            expect(state.resultA!.eventId).not.toBe(state.resultB!.eventId);
          });
        }
      );
    });

    // ===========================================================================
    // Rule: Duplicate append with same idempotency key returns existing event
    // ===========================================================================

    Rule(
      "Duplicate append with same idempotency key returns existing event",
      ({ RuleScenario }) => {
        RuleScenario(
          "Second append with same idempotency key returns duplicate",
          ({ Given, When, Then, And }) => {
            Given('an event was already appended with idempotency key "dup-key-001"', async () => {
              state.currentIdempotencyKey = generateIdempotencyKey("dup-key-001");
              state.currentStreamId = generateStreamId();
              state.currentStreamType = "Order";

              // First append
              state.appendResult = await testMutation(state.t!, testIdempotentAppend, {
                idempotencyKey: state.currentIdempotencyKey,
                streamType: state.currentStreamType,
                streamId: state.currentStreamId,
                eventType: "OriginalEvent",
                eventData: { original: true },
                boundedContext: "testing",
              });

              state.originalEventId = state.appendResult!.eventId;
            });

            When('I append another event with idempotency key "dup-key-001"', async () => {
              state.secondAppendResult = await testMutation(state.t!, testIdempotentAppend, {
                idempotencyKey: state.currentIdempotencyKey!,
                streamType: state.currentStreamType!,
                streamId: state.currentStreamId!,
                eventType: "DuplicateEvent",
                eventData: { duplicate: true },
                boundedContext: "testing",
              });
            });

            Then('the append result status should be "duplicate"', () => {
              expect(state.secondAppendResult).not.toBeNull();
              expect(state.secondAppendResult!.status).toBe("duplicate");
            });

            And("the result should contain the original event ID", () => {
              expect(state.secondAppendResult!.eventId).toBe(state.originalEventId);
            });

            And("only one event should exist with that idempotency key", async () => {
              const events = await testQuery(state.t!, readTestStream, {
                streamType: state.currentStreamType!,
                streamId: state.currentStreamId!,
              });
              expect(events.length).toBe(1);
              expect(events[0].eventId).toBe(state.originalEventId);
            });
          }
        );

        RuleScenario(
          "Duplicate append preserves original event data",
          ({ Given, When, Then, And }) => {
            Given(
              'an event with payload "original data" was appended with key "preserve-key"',
              async () => {
                state.currentIdempotencyKey = generateIdempotencyKey("preserve-key");
                state.currentStreamId = generateStreamId();
                state.currentStreamType = "Order";

                state.appendResult = await testMutation(state.t!, testIdempotentAppend, {
                  idempotencyKey: state.currentIdempotencyKey,
                  streamType: state.currentStreamType,
                  streamId: state.currentStreamId,
                  eventType: "DataEvent",
                  eventData: { message: "original data" },
                  boundedContext: "testing",
                });

                state.originalEventId = state.appendResult!.eventId;
              }
            );

            When(
              'I append an event with different payload "new data" using key "preserve-key"',
              async () => {
                state.secondAppendResult = await testMutation(state.t!, testIdempotentAppend, {
                  idempotencyKey: state.currentIdempotencyKey!,
                  streamType: state.currentStreamType!,
                  streamId: state.currentStreamId!,
                  eventType: "DataEvent",
                  eventData: { message: "new data" },
                  boundedContext: "testing",
                });
              }
            );

            Then('the append result status should be "duplicate"', () => {
              expect(state.secondAppendResult!.status).toBe("duplicate");
            });

            And('the event in the store should have payload "original data"', async () => {
              const event = await testQuery(state.t!, getEventByIdempotencyKey, {
                idempotencyKey: state.currentIdempotencyKey!,
              });
              expect(event).not.toBeNull();
              expect(event.payload.message).toBe("original data");
            });
          }
        );
      }
    );

    // ===========================================================================
    // Rule: Idempotency works across different stream types
    // ===========================================================================

    Rule("Idempotency works across different stream types", ({ RuleScenario }) => {
      RuleScenario(
        "Same idempotency key on different streams creates separate events",
        ({ Given, When, Then, And }) => {
          let baseKey: string;
          let orderStreamId: string;
          let inventoryStreamId: string;

          Given('a unique base key "cross-stream-key"', () => {
            baseKey = generateIdempotencyKey("cross-stream-key");
            orderStreamId = generateStreamId();
            inventoryStreamId = generateStreamId();
          });

          When(
            'I append to stream "Order:ord-001" with key "cross-stream-key:Order:ord-001"',
            async () => {
              const key = `${baseKey}:Order:${orderStreamId}`;
              const result = await testMutation(state.t!, testIdempotentAppend, {
                idempotencyKey: key,
                streamType: "Order",
                streamId: orderStreamId,
                eventType: "OrderEvent",
                eventData: { type: "order" },
                boundedContext: "orders",
              });
              state.crossStreamResults.set("order", result);
            }
          );

          And(
            'I append to stream "Inventory:inv-001" with key "cross-stream-key:Inventory:inv-001"',
            async () => {
              const key = `${baseKey}:Inventory:${inventoryStreamId}`;
              const result = await testMutation(state.t!, testIdempotentAppend, {
                idempotencyKey: key,
                streamType: "Inventory",
                streamId: inventoryStreamId,
                eventType: "InventoryEvent",
                eventData: { type: "inventory" },
                boundedContext: "inventory",
              });
              state.crossStreamResults.set("inventory", result);
            }
          );

          Then('both appends should succeed with status "appended"', () => {
            const orderResult = state.crossStreamResults.get("order");
            const inventoryResult = state.crossStreamResults.get("inventory");
            expect(orderResult).not.toBeNull();
            expect(inventoryResult).not.toBeNull();
            expect(orderResult!.status).toBe("appended");
            expect(inventoryResult!.status).toBe("appended");
          });

          And("both streams should have their respective events", async () => {
            const orderEvents = await testQuery(state.t!, readTestStream, {
              streamType: "Order",
              streamId: orderStreamId,
            });
            const inventoryEvents = await testQuery(state.t!, readTestStream, {
              streamType: "Inventory",
              streamId: inventoryStreamId,
            });

            expect(orderEvents.length).toBe(1);
            expect(inventoryEvents.length).toBe(1);
            expect(orderEvents[0].eventType).toBe("OrderEvent");
            expect(inventoryEvents[0].eventType).toBe("InventoryEvent");
          });
        }
      );
    });
  }
);
