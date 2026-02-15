/**
 * ConvexEventBus - Step Definitions
 *
 * BDD step definitions for ConvexEventBus:
 * - Constructor with priority sorting
 * - publish() - subscription matching, workpool enqueue, partition keys, onComplete
 * - hasSubscribersFor() - event type + wildcard checking
 * - getAllSubscriptions() - retrieval
 * - getMatchingSubscriptions() - filter logic
 * - Priority ordering
 * - Error handling
 * - Wildcard subscriptions
 * - createEventBus factory
 *
 * Mechanical migration from tests/unit/eventbus/ConvexEventBus.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConvexEventBus, createEventBus } from "../../../src/eventbus/ConvexEventBus.js";
import { defineSubscriptions } from "../../../src/eventbus/registry.js";
import type { PublishedEvent, EventSubscription } from "../../../src/eventbus/types.js";
import type { WorkpoolClient, MutationCtx } from "../../../src/orchestration/types.js";
import type { CorrelationChain } from "../../../src/correlation/types.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { WorkpoolOnCompleteArgs } from "../../../src/orchestration/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock helpers
// =============================================================================

function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
    async enqueueAction() {
      return null;
    },
  };
}

function createMockCtx(): MutationCtx {
  return {} as MutationCtx;
}

const mockHandler = { name: "mockHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  Record<string, unknown>,
  unknown
>;

const mockOnComplete = { name: "mockOnComplete" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  WorkpoolOnCompleteArgs,
  unknown
>;

function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "OrderSubmitted",
    streamType: "Order",
    streamId: "order_456",
    category: "domain",
    schemaVersion: 1,
    boundedContext: "orders",
    globalPosition: 1000,
    timestamp: Date.now(),
    payload: { orderId: "order_456" },
    correlation: {
      correlationId: "corr_789",
      causationId: "cmd_abc",
    },
    ...overrides,
  };
}

function createTestChain(): CorrelationChain {
  return {
    commandId: "cmd_abc",
    correlationId: "corr_789",
    causationId: "cmd_abc",
    initiatedAt: Date.now(),
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockWorkpool: (WorkpoolClient & { calls: unknown[][] }) | null;
  mockCtx: MutationCtx | null;
  bus: ConvexEventBus | null;
  publishResult: Awaited<ReturnType<ConvexEventBus["publish"]>> | null;
  publishError: Error | null;
  matchingResult: EventSubscription[] | null;
  failingCallCount: number;
  // For createEventBus factory
  factoryBus: ReturnType<typeof createEventBus> | null;
}

function createInitialState(): TestState {
  return {
    mockWorkpool: null,
    mockCtx: null,
    bus: null,
    publishResult: null,
    publishError: null,
    matchingResult: null,
    failingCallCount: 0,
    factoryBus: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/eventbus/convex-event-bus.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    state.mockWorkpool = createMockWorkpool();
    state.mockCtx = createMockCtx();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are at file level — nothing to do here
    });
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  Rule("Constructor creates bus with subscriptions sorted by priority", ({ RuleScenario }) => {
    RuleScenario("Creates bus with empty subscriptions", ({ Given, Then }) => {
      Given("a ConvexEventBus with no subscriptions", () => {
        state.bus = new ConvexEventBus(state.mockWorkpool!, []);
      });

      Then("getAllSubscriptions returns 0 subscriptions", () => {
        expect(state.bus!.getAllSubscriptions()).toHaveLength(0);
      });
    });

    RuleScenario("Creates bus with subscriptions sorted by priority", ({ Given, Then }) => {
      Given(
        "a ConvexEventBus with subscriptions at priorities:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; priority: string }>(dataTable);
          const subscriptions = defineSubscriptions((registry) => {
            for (const row of rows) {
              registry.subscribe(row.name, mockHandler).withPriority(Number(row.priority)).build();
            }
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        }
      );

      Then(
        "getAllSubscriptions returns 3 subscriptions in order:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string }>(dataTable);
          const all = state.bus!.getAllSubscriptions();
          expect(all).toHaveLength(3);
          for (let i = 0; i < rows.length; i++) {
            expect(all[i].name).toBe(rows[i].name);
          }
        }
      );
    });
  });

  // ==========================================================================
  // Publish - Subscription Matching
  // ==========================================================================

  Rule(
    "publish() matches events to subscriptions and enqueues via workpool",
    ({ RuleScenario }) => {
      RuleScenario(
        "Returns empty result when no subscriptions match",
        ({ Given, When, Then, And }) => {
          Given(
            'a ConvexEventBus with a subscription "order.handler" for event type "OrderCancelled"',
            () => {
              const subscriptions = defineSubscriptions((registry) => {
                registry
                  .subscribe("order.handler", mockHandler)
                  .forEventTypes("OrderCancelled")
                  .build();
              });
              state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
            }
          );

          When('an "OrderSubmitted" event is published', async () => {
            const event = createTestEvent({ eventType: "OrderSubmitted" });
            const chain = createTestChain();
            state.publishResult = await state.bus!.publish(state.mockCtx!, event, chain);
          });

          Then("the publish result has 0 matched subscriptions", () => {
            expect(state.publishResult!.matchedSubscriptions).toBe(0);
          });

          And("the triggered subscriptions list is empty", () => {
            expect(state.publishResult!.triggeredSubscriptions).toHaveLength(0);
          });

          And("the publish result is successful", () => {
            expect(state.publishResult!.success).toBe(true);
          });

          And("the workpool received 0 enqueue calls", () => {
            expect(state.mockWorkpool!.calls).toHaveLength(0);
          });
        }
      );

      RuleScenario("Enqueues matching subscriptions via workpool", ({ Given, When, Then, And }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for event type "OrderSubmitted"',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          state.publishResult = await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then("the publish result has 1 matched subscription", () => {
          expect(state.publishResult!.matchedSubscriptions).toBe(1);
        });

        And('the triggered subscriptions include "order.handler"', () => {
          expect(state.publishResult!.triggeredSubscriptions).toEqual(["order.handler"]);
        });

        And("the publish result is successful", () => {
          expect(state.publishResult!.success).toBe(true);
        });

        And("the workpool received 1 enqueue call", () => {
          expect(state.mockWorkpool!.calls).toHaveLength(1);
        });
      });

      RuleScenario("Enqueues multiple matching subscriptions", ({ Given, When, Then, And }) => {
        Given(
          'a ConvexEventBus with subscriptions for event type "OrderSubmitted":',
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string; priority: string }>(dataTable);
            const subscriptions = defineSubscriptions((registry) => {
              for (const row of rows) {
                registry
                  .subscribe(row.name, mockHandler)
                  .forEventTypes("OrderSubmitted")
                  .withPriority(Number(row.priority))
                  .build();
              }
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          state.publishResult = await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then("the publish result has 2 matched subscriptions", () => {
          expect(state.publishResult!.matchedSubscriptions).toBe(2);
        });

        And("the triggered subscriptions are in order:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string }>(dataTable);
          expect(state.publishResult!.triggeredSubscriptions).toEqual(rows.map((r) => r.name));
        });

        And("the workpool received 2 enqueue calls", () => {
          expect(state.mockWorkpool!.calls).toHaveLength(2);
        });
      });
    }
  );

  // ==========================================================================
  // Publish - Transform and Partition
  // ==========================================================================

  Rule(
    "publish() passes transformed args and partition context to workpool",
    ({ RuleScenario }) => {
      RuleScenario("Passes transformed args to workpool", ({ Given, When, Then }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with a custom transform',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .withTransform((event) => ({
                  orderId: event.streamId,
                  eventType: event.eventType,
                }))
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then(
          'the workpool received args with orderId "order_456" and eventType "OrderSubmitted"',
          () => {
            const [, , args] = state.mockWorkpool!.calls[0];
            expect(args).toEqual({
              orderId: "order_456",
              eventType: "OrderSubmitted",
            });
          }
        );
      });

      RuleScenario("Includes partition key in workpool context", ({ Given, When, Then, And }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with a custom partition key',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .withPartitionKey((event) => ({
                  name: "orderId",
                  value: event.streamId,
                }))
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then('the workpool context has partition name "orderId" and value "order_456"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.partition).toEqual({ name: "orderId", value: "order_456" });
        });

        And("the workpool context has globalPosition 1000", () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.globalPosition).toBe(1000);
        });

        And('the workpool context has subscriptionName "order.handler"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.subscriptionName).toBe("order.handler");
        });

        And('the workpool context has eventId "evt_test_123"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.eventId).toBe("evt_test_123");
        });

        And('the workpool context has eventType "OrderSubmitted"', () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { context: Record<string, unknown> },
          ];
          expect(options.context.eventType).toBe("OrderSubmitted");
        });
      });
    }
  );

  // ==========================================================================
  // Publish - OnComplete Handling
  // ==========================================================================

  Rule("publish() resolves onComplete from subscription or config default", ({ RuleScenario }) => {
    RuleScenario("Uses subscription-level onComplete when provided", ({ Given, When, Then }) => {
      const subscriptionOnComplete = { name: "subscriptionOnComplete" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      >;

      Given(
        'a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with subscription-level onComplete',
        () => {
          const subscriptions = defineSubscriptions((registry) => {
            registry
              .subscribe("order.handler", mockHandler)
              .forEventTypes("OrderSubmitted")
              .withOnComplete(subscriptionOnComplete)
              .build();
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        }
      );

      When('an "OrderSubmitted" event is published', async () => {
        const event = createTestEvent();
        const chain = createTestChain();
        await state.bus!.publish(state.mockCtx!, event, chain);
      });

      Then("the workpool options onComplete is the subscription onComplete handler", () => {
        const [, , , options] = state.mockWorkpool!.calls[0] as [
          unknown,
          unknown,
          unknown,
          { onComplete?: FunctionReference<"mutation", FunctionVisibility, unknown, unknown> },
        ];
        expect(options.onComplete).toBe(subscriptionOnComplete);
      });
    });

    RuleScenario(
      "Uses default onComplete from config when subscription has none",
      ({ Given, When, Then }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" and a default onComplete config',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions, {
              defaultOnComplete: mockOnComplete,
            });
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then("the workpool options onComplete is the default onComplete handler", () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { onComplete?: FunctionReference<"mutation", FunctionVisibility, unknown, unknown> },
          ];
          expect(options.onComplete).toBe(mockOnComplete);
        });
      }
    );

    RuleScenario(
      "Does not include onComplete if neither subscription nor config provides it",
      ({ Given, When, Then }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" without any onComplete',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          await state.bus!.publish(state.mockCtx!, event, chain);
        });

        Then("the workpool options onComplete is undefined", () => {
          const [, , , options] = state.mockWorkpool!.calls[0] as [
            unknown,
            unknown,
            unknown,
            { onComplete?: unknown },
          ];
          expect(options.onComplete).toBeUndefined();
        });
      }
    );
  });

  // ==========================================================================
  // hasSubscribersFor
  // ==========================================================================

  Rule("hasSubscribersFor() checks event type and wildcard subscriptions", ({ RuleScenario }) => {
    RuleScenario(
      "Returns true for indexed event type and false for unsubscribed type",
      ({ Given, Then, And }) => {
        Given(
          'a ConvexEventBus with a subscription "order.handler" for event type "OrderSubmitted"',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("order.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        Then('hasSubscribersFor "OrderSubmitted" returns true', () => {
          expect(state.bus!.hasSubscribersFor("OrderSubmitted")).toBe(true);
        });

        And('hasSubscribersFor "OrderCancelled" returns false', () => {
          expect(state.bus!.hasSubscribersFor("OrderCancelled")).toBe(false);
        });
      }
    );

    RuleScenario(
      "Returns true for any event type when wildcard subscription exists",
      ({ Given, Then, And }) => {
        Given('a ConvexEventBus with a wildcard subscription "wildcard.handler"', () => {
          const subscriptions = defineSubscriptions((registry) => {
            registry.subscribe("wildcard.handler", mockHandler).build();
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        });

        Then('hasSubscribersFor "AnyEventType" returns true', () => {
          expect(state.bus!.hasSubscribersFor("AnyEventType")).toBe(true);
        });

        And('hasSubscribersFor "AnotherType" returns true', () => {
          expect(state.bus!.hasSubscribersFor("AnotherType")).toBe(true);
        });
      }
    );

    RuleScenario("Returns false when no subscriptions exist", ({ Given, Then }) => {
      Given("a ConvexEventBus with no subscriptions", () => {
        state.bus = new ConvexEventBus(state.mockWorkpool!, []);
      });

      Then('hasSubscribersFor "SomeEvent" returns false', () => {
        expect(state.bus!.hasSubscribersFor("SomeEvent")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // getAllSubscriptions
  // ==========================================================================

  Rule("getAllSubscriptions() returns all registered subscriptions", ({ RuleScenario }) => {
    RuleScenario("Returns all subscriptions", ({ Given, Then, And }) => {
      Given('a ConvexEventBus with subscriptions "handler1" and "handler2"', () => {
        const subscriptions = defineSubscriptions((registry) => {
          registry.subscribe("handler1", mockHandler).build();
          registry.subscribe("handler2", mockHandler).build();
        });
        state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
      });

      Then("getAllSubscriptions returns 2 subscriptions", () => {
        expect(state.bus!.getAllSubscriptions()).toHaveLength(2);
      });

      And('getAllSubscriptions contains "handler1" and "handler2"', () => {
        const all = state.bus!.getAllSubscriptions();
        expect(all.map((s) => s.name)).toContain("handler1");
        expect(all.map((s) => s.name)).toContain("handler2");
      });
    });

    RuleScenario("Returns empty array when no subscriptions", ({ Given, Then }) => {
      Given("a ConvexEventBus with no subscriptions", () => {
        state.bus = new ConvexEventBus(state.mockWorkpool!, []);
      });

      Then("getAllSubscriptions returns an empty array", () => {
        expect(state.bus!.getAllSubscriptions()).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // getMatchingSubscriptions
  // ==========================================================================

  Rule("getMatchingSubscriptions() filters subscriptions by criteria", ({ RuleScenario }) => {
    RuleScenario("Returns subscriptions matching event type filter", ({ Given, When, Then }) => {
      Given(
        "a ConvexEventBus with event-type subscriptions:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; eventType: string }>(dataTable);
          const subscriptions = defineSubscriptions((registry) => {
            for (const row of rows) {
              registry.subscribe(row.name, mockHandler).forEventTypes(row.eventType).build();
            }
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        }
      );

      When('getMatchingSubscriptions is called with eventTypes "OrderSubmitted"', () => {
        state.matchingResult = state.bus!.getMatchingSubscriptions({
          eventTypes: ["OrderSubmitted"],
        });
      });

      Then('the matching result has 1 subscription named "order.handler"', () => {
        expect(state.matchingResult).toHaveLength(1);
        expect(state.matchingResult![0].name).toBe("order.handler");
      });
    });

    RuleScenario("Returns subscriptions matching category filter", ({ Given, When, Then }) => {
      Given(
        "a ConvexEventBus with category subscriptions:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; category: string }>(dataTable);
          const subscriptions = defineSubscriptions((registry) => {
            for (const row of rows) {
              registry.subscribe(row.name, mockHandler).forCategories(row.category).build();
            }
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        }
      );

      When('getMatchingSubscriptions is called with categories "integration"', () => {
        state.matchingResult = state.bus!.getMatchingSubscriptions({
          categories: ["integration"],
        });
      });

      Then('the matching result has 1 subscription named "integration.handler"', () => {
        expect(state.matchingResult).toHaveLength(1);
        expect(state.matchingResult![0].name).toBe("integration.handler");
      });
    });
  });

  // ==========================================================================
  // Priority Ordering
  // ==========================================================================

  Rule("publish() triggers subscriptions in priority order", ({ RuleScenario }) => {
    RuleScenario("Publishes to subscriptions in priority order", ({ Given, When, Then }) => {
      Given(
        'a ConvexEventBus with subscriptions for event type "TestEvent":',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string; priority: string }>(dataTable);
          const subscriptions = defineSubscriptions((registry) => {
            for (const row of rows) {
              registry
                .subscribe(row.name, mockHandler)
                .forEventTypes("TestEvent")
                .withPriority(Number(row.priority))
                .build();
            }
          });
          state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
        }
      );

      When('a "TestEvent" event is published', async () => {
        const event = createTestEvent({ eventType: "TestEvent" });
        const chain = createTestChain();
        state.publishResult = await state.bus!.publish(state.mockCtx!, event, chain);
      });

      Then("the triggered subscriptions are in order:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ name: string }>(dataTable);
        expect(state.publishResult!.triggeredSubscriptions).toEqual(rows.map((r) => r.name));
      });
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  Rule("publish() propagates workpool errors", ({ RuleScenario }) => {
    RuleScenario("Propagates workpool errors when enqueue fails", ({ Given, When, Then }) => {
      Given(
        'a ConvexEventBus with a failing workpool and subscription "order.handler" for "OrderSubmitted"',
        () => {
          const failingWorkpool: WorkpoolClient = {
            async enqueueMutation() {
              throw new Error("Workpool unavailable");
            },
            async enqueueAction() {
              throw new Error("Workpool unavailable");
            },
          };
          const subscriptions = defineSubscriptions((registry) => {
            registry
              .subscribe("order.handler", mockHandler)
              .forEventTypes("OrderSubmitted")
              .build();
          });
          state.bus = new ConvexEventBus(failingWorkpool, subscriptions);
        }
      );

      When('an "OrderSubmitted" event is published', async () => {
        const event = createTestEvent();
        const chain = createTestChain();
        try {
          await state.bus!.publish(state.mockCtx!, event, chain);
        } catch (e) {
          state.publishError = e as Error;
        }
      });

      Then('the publish rejects with error "Workpool unavailable"', () => {
        expect(state.publishError).toBeDefined();
        expect(state.publishError!.message).toBe("Workpool unavailable");
      });
    });

    RuleScenario(
      "Does not enqueue subsequent subscriptions if earlier enqueue fails",
      ({ Given, When, Then, And }) => {
        Given(
          'a ConvexEventBus with a workpool that fails on second enqueue and 3 subscriptions for "OrderSubmitted"',
          () => {
            state.failingCallCount = 0;
            const failingOnSecondWorkpool: WorkpoolClient = {
              enqueueMutation: async () => {
                state.failingCallCount++;
                if (state.failingCallCount === 2) {
                  throw new Error("Second enqueue failed");
                }
                return null;
              },
              async enqueueAction() {
                return null;
              },
            };
            const subscriptions = defineSubscriptions((registry) => {
              registry
                .subscribe("first.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .withPriority(100)
                .build();
              registry
                .subscribe("second.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .withPriority(200)
                .build();
              registry
                .subscribe("third.handler", mockHandler)
                .forEventTypes("OrderSubmitted")
                .withPriority(300)
                .build();
            });
            state.bus = new ConvexEventBus(failingOnSecondWorkpool, subscriptions);
          }
        );

        When('an "OrderSubmitted" event is published', async () => {
          const event = createTestEvent();
          const chain = createTestChain();
          try {
            await state.bus!.publish(state.mockCtx!, event, chain);
          } catch (e) {
            state.publishError = e as Error;
          }
        });

        Then('the publish rejects with error "Second enqueue failed"', () => {
          expect(state.publishError).toBeDefined();
          expect(state.publishError!.message).toBe("Second enqueue failed");
        });

        And("the workpool enqueue was called 2 times", () => {
          expect(state.failingCallCount).toBe(2);
        });
      }
    );
  });

  // ==========================================================================
  // Wildcard Subscriptions
  // ==========================================================================

  Rule("Wildcard subscriptions match events regardless of type", ({ RuleScenario }) => {
    RuleScenario("Wildcard subscriptions match any event type", ({ Given, When, Then }) => {
      const publishResults: Awaited<ReturnType<ConvexEventBus["publish"]>>[] = [];

      Given('a ConvexEventBus with a wildcard subscription "wildcard"', () => {
        const subscriptions = defineSubscriptions((registry) => {
          registry.subscribe("wildcard", mockHandler).build();
        });
        state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
      });

      When(
        "events of different types are published:",
        async (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ eventType: string }>(dataTable);
          for (const row of rows) {
            const event = createTestEvent({ eventType: row.eventType });
            const chain = createTestChain();
            const result = await state.bus!.publish(state.mockCtx!, event, chain);
            publishResults.push(result);
          }
        }
      );

      Then('every publish result includes "wildcard" in triggered subscriptions', () => {
        for (const result of publishResults) {
          expect(result.triggeredSubscriptions).toContain("wildcard");
        }
      });
    });

    RuleScenario(
      "Wildcard with bounded context filter only matches that context",
      ({ Given, When, Then }) => {
        const contextResults: {
          boundedContext: string;
          expectedMatches: number;
          actual: number;
        }[] = [];

        Given(
          'a ConvexEventBus with a subscription "orders.audit" filtered to bounded context "orders"',
          () => {
            const subscriptions = defineSubscriptions((registry) => {
              registry.subscribe("orders.audit", mockHandler).forBoundedContexts("orders").build();
            });
            state.bus = new ConvexEventBus(state.mockWorkpool!, subscriptions);
          }
        );

        When(
          "events from different bounded contexts are published:",
          async (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ boundedContext: string; expectedMatches: string }>(
              dataTable
            );
            for (const row of rows) {
              state.mockWorkpool!.calls = []; // Reset between publishes
              const event = createTestEvent({ boundedContext: row.boundedContext });
              const chain = createTestChain();
              const result = await state.bus!.publish(state.mockCtx!, event, chain);
              contextResults.push({
                boundedContext: row.boundedContext,
                expectedMatches: Number(row.expectedMatches),
                actual: result.matchedSubscriptions,
              });
            }
          }
        );

        Then("each publish result matches the expected subscription count", () => {
          for (const entry of contextResults) {
            expect(entry.actual).toBe(entry.expectedMatches);
          }
        });
      }
    );
  });

  // ==========================================================================
  // createEventBus Factory
  // ==========================================================================

  Rule("createEventBus factory creates ConvexEventBus instances", ({ RuleScenario }) => {
    RuleScenario("Creates EventBus instance with empty subscriptions", ({ When, Then, And }) => {
      When("createEventBus is called with empty subscriptions", () => {
        const workpool = createMockWorkpool();
        const subscriptions = defineSubscriptions(() => {});
        state.factoryBus = createEventBus(workpool, subscriptions);
      });

      Then("the result is a ConvexEventBus instance", () => {
        expect(state.factoryBus).toBeInstanceOf(ConvexEventBus);
      });

      And("getAllSubscriptions returns 0 subscriptions", () => {
        expect(state.factoryBus!.getAllSubscriptions()).toHaveLength(0);
      });
    });

    RuleScenario("Creates EventBus with config", ({ When, Then }) => {
      When("createEventBus is called with a subscription and default onComplete config", () => {
        const workpool = createMockWorkpool();
        const subscriptions = defineSubscriptions((registry) => {
          registry
            .subscribe("handler", { name: "handler" } as FunctionReference<
              "mutation",
              FunctionVisibility,
              Record<string, unknown>,
              unknown
            >)
            .forEventTypes("TestEvent")
            .build();
        });
        const onComplete = { name: "onComplete" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          WorkpoolOnCompleteArgs,
          unknown
        >;
        state.factoryBus = createEventBus(workpool, subscriptions, {
          defaultOnComplete: onComplete,
        });
      });

      Then("the result is a ConvexEventBus instance", () => {
        expect(state.factoryBus).toBeInstanceOf(ConvexEventBus);
      });
    });
  });
});
