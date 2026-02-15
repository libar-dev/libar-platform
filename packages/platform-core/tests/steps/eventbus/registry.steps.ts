/**
 * EventBus Registry - Step Definitions
 *
 * BDD step definitions for EventBus subscription registry:
 * - SubscriptionBuilder fluent API
 * - SubscriptionRegistry collection
 * - defineSubscriptions helper
 * - matchesEvent filter logic
 *
 * Mechanical migration from tests/unit/eventbus/registry.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  SubscriptionBuilder,
  SubscriptionRegistry,
  defineSubscriptions,
  createSubscription,
  matchesEvent,
} from "../../../src/eventbus/registry.js";
import type { PublishedEvent, EventSubscription } from "../../../src/eventbus/types.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { CorrelationChain } from "../../../src/correlation/types.js";
import type { WorkpoolOnCompleteArgs } from "../../../src/orchestration/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock helpers
// =============================================================================

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
  builder: SubscriptionBuilder<Record<string, unknown>> | null;
  subscription: ReturnType<SubscriptionBuilder<Record<string, unknown>>["build"]> | null;
  registry: SubscriptionRegistry | null;
  defineResult: EventSubscription[] | null;
  matchSubscription: EventSubscription | null;
}

function createInitialState(): TestState {
  return {
    builder: null,
    subscription: null,
    registry: null,
    defineResult: null,
    matchSubscription: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/eventbus/registry.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // SubscriptionBuilder - Basic Construction
  // ==========================================================================

  Rule("SubscriptionBuilder creates subscriptions with sensible defaults", ({ RuleScenario }) => {
    RuleScenario("Builder creates subscription with name and handler", ({ Given, When, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then('the subscription has name "test.handler" and the mock handler', () => {
        expect(state.subscription!.name).toBe("test.handler");
        expect(state.subscription!.handler).toBe(mockHandler);
      });
    });

    RuleScenario("Builder defaults to empty filter", ({ Given, When, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter is empty", () => {
        expect(state.subscription!.filter).toEqual({});
      });
    });

    RuleScenario("Builder defaults to priority 100", ({ Given, When, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription priority is 100", () => {
        expect(state.subscription!.priority).toBe(100);
      });
    });

    RuleScenario("Builder defaults partition key to streamId", ({ Given, When, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then('the partition key for a test event uses streamId with value "order_456"', () => {
        const event = createTestEvent();
        expect(state.subscription!.getPartitionKey(event)).toEqual({
          name: "streamId",
          value: "order_456",
        });
      });
    });
  });

  // ==========================================================================
  // SubscriptionBuilder - Filter Configuration
  // ==========================================================================

  Rule("SubscriptionBuilder fluent API configures event filters", ({ RuleScenario }) => {
    RuleScenario("forEventTypes sets event type filter", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When('forEventTypes is called with "OrderSubmitted" and "OrderCancelled"', () => {
        state.builder!.forEventTypes("OrderSubmitted", "OrderCancelled");
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter eventTypes are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ eventType: string }>(dataTable);
        expect(state.subscription!.filter.eventTypes).toEqual(rows.map((r) => r.eventType));
      });
    });

    RuleScenario("forCategories sets category filter", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When('forCategories is called with "domain" and "integration"', () => {
        state.builder!.forCategories("domain", "integration");
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter categories are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string }>(dataTable);
        expect(state.subscription!.filter.categories).toEqual(rows.map((r) => r.category));
      });
    });

    RuleScenario("forBoundedContexts sets bounded context filter", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When('forBoundedContexts is called with "orders" and "inventory"', () => {
        state.builder!.forBoundedContexts("orders", "inventory");
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter boundedContexts are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ boundedContext: string }>(dataTable);
        expect(state.subscription!.filter.boundedContexts).toEqual(
          rows.map((r) => r.boundedContext)
        );
      });
    });

    RuleScenario("forStreamTypes sets stream type filter", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When('forStreamTypes is called with "Order" and "Product"', () => {
        state.builder!.forStreamTypes("Order", "Product");
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter streamTypes are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ streamType: string }>(dataTable);
        expect(state.subscription!.filter.streamTypes).toEqual(rows.map((r) => r.streamType));
      });
    });

    RuleScenario("Chaining multiple filters composes them", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When('forEventTypes is called with "OrderSubmitted"', () => {
        state.builder!.forEventTypes("OrderSubmitted");
      });

      And('forCategories is called with "domain"', () => {
        state.builder!.forCategories("domain");
      });

      And('forBoundedContexts is called with "orders"', () => {
        state.builder!.forBoundedContexts("orders");
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription filter has all three filter types set", () => {
        expect(state.subscription!.filter).toEqual({
          eventTypes: ["OrderSubmitted"],
          categories: ["domain"],
          boundedContexts: ["orders"],
        });
      });
    });
  });

  // ==========================================================================
  // SubscriptionBuilder - Handler Configuration
  // ==========================================================================

  Rule("SubscriptionBuilder configures handler options", ({ RuleScenario }) => {
    RuleScenario("withOnComplete sets the onComplete handler", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("withOnComplete is called with the mock onComplete handler", () => {
        state.builder!.withOnComplete(mockOnComplete);
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription onComplete is the mock onComplete handler", () => {
        expect(state.subscription!.onComplete).toBe(mockOnComplete);
      });
    });

    RuleScenario("withPriority sets priority", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder("test.handler", mockHandler);
      });

      When("withPriority is called with 50", () => {
        state.builder!.withPriority(50);
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("the subscription priority is 50", () => {
        expect(state.subscription!.priority).toBe(50);
      });
    });

    RuleScenario("withTransform sets custom transformer", ({ Given, When, And, Then }) => {
      Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
        state.builder = new SubscriptionBuilder<{ orderId: string; eventType: string }>(
          "test.handler",
          mockHandler
        );
      });

      When("withTransform is called with a custom transformer", () => {
        const transformer = vi.fn((event: PublishedEvent) => ({
          orderId: event.streamId,
          eventType: event.eventType,
        }));
        (
          state.builder as SubscriptionBuilder<{ orderId: string; eventType: string }>
        ).withTransform(transformer);
      });

      And("the subscription is built", () => {
        state.subscription = state.builder!.build();
      });

      Then("toHandlerArgs returns the transformed output", () => {
        const event = createTestEvent();
        const chain = createTestChain();
        const args = state.subscription!.toHandlerArgs(event, chain);
        expect(args).toEqual({
          orderId: "order_456",
          eventType: "OrderSubmitted",
        });
      });
    });

    RuleScenario(
      "withPartitionKey sets custom partition key extractor",
      ({ Given, When, And, Then }) => {
        Given('a SubscriptionBuilder with name "test.handler" and a mock handler', () => {
          state.builder = new SubscriptionBuilder("test.handler", mockHandler);
        });

        When("withPartitionKey is called with a customerId extractor", () => {
          state.builder!.withPartitionKey((event) => ({
            name: "customerId",
            value: event.payload.customerId as string,
          }));
        });

        And("the subscription is built", () => {
          state.subscription = state.builder!.build();
        });

        Then(
          'the partition key for an event with customerId "cust_123" returns name "customerId" and value "cust_123"',
          () => {
            const event = createTestEvent({ payload: { orderId: "o_1", customerId: "cust_123" } });
            expect(state.subscription!.getPartitionKey(event)).toEqual({
              name: "customerId",
              value: "cust_123",
            });
          }
        );
      }
    );
  });

  // ==========================================================================
  // SubscriptionRegistry
  // ==========================================================================

  Rule("SubscriptionRegistry collects subscriptions and rejects duplicates", ({ RuleScenario }) => {
    RuleScenario("add() adds a subscription to the registry", ({ Given, When, Then }) => {
      Given("an empty SubscriptionRegistry", () => {
        state.registry = new SubscriptionRegistry();
      });

      When('a subscription "test.handler" is added', () => {
        const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();
        state.registry!.add(subscription);
      });

      Then('the registry has 1 subscription with name "test.handler"', () => {
        expect(state.registry!.getSubscriptions()).toHaveLength(1);
        expect(state.registry!.getSubscriptions()[0].name).toBe("test.handler");
      });
    });

    RuleScenario("add() supports chaining", ({ Given, When, Then }) => {
      Given("an empty SubscriptionRegistry", () => {
        state.registry = new SubscriptionRegistry();
      });

      When('subscriptions "handler1" and "handler2" are added via chaining', () => {
        const sub1 = new SubscriptionBuilder("handler1", mockHandler).build();
        const sub2 = new SubscriptionBuilder("handler2", mockHandler).build();
        state.registry!.add(sub1).add(sub2);
      });

      Then("the registry has 2 subscriptions", () => {
        expect(state.registry!.getSubscriptions()).toHaveLength(2);
      });
    });

    RuleScenario("add() throws on duplicate subscription name", ({ Given, When, Then }) => {
      Given("an empty SubscriptionRegistry", () => {
        state.registry = new SubscriptionRegistry();
      });

      When('a subscription "duplicate.name" is added', () => {
        const sub1 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
        state.registry!.add(sub1);
      });

      Then('adding another subscription "duplicate.name" throws a duplicate error', () => {
        const sub2 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
        expect(() => state.registry!.add(sub2)).toThrow(
          'Duplicate subscription name: "duplicate.name"'
        );
      });
    });

    RuleScenario(
      "subscribe() returns builder that adds to registry on build",
      ({ Given, When, Then }) => {
        Given("an empty SubscriptionRegistry", () => {
          state.registry = new SubscriptionRegistry();
        });

        When(
          'subscribe is called with "test.handler" and built with forEventTypes "OrderSubmitted"',
          () => {
            state
              .registry!.subscribe("test.handler", mockHandler)
              .forEventTypes("OrderSubmitted")
              .build();
          }
        );

        Then('the registry has 1 subscription with name "test.handler"', () => {
          expect(state.registry!.getSubscriptions()).toHaveLength(1);
          expect(state.registry!.getSubscriptions()[0].name).toBe("test.handler");
        });
      }
    );
  });

  // ==========================================================================
  // defineSubscriptions
  // ==========================================================================

  Rule(
    "defineSubscriptions helper creates subscription arrays from a configuration callback",
    ({ RuleScenario }) => {
      RuleScenario("defineSubscriptions returns configured subscriptions", ({ When, Then }) => {
        When(
          'defineSubscriptions is called with two subscriptions "handler1" and "handler2"',
          () => {
            state.defineResult = defineSubscriptions((registry) => {
              registry.subscribe("handler1", mockHandler).forEventTypes("OrderSubmitted").build();
              registry.subscribe("handler2", mockHandler).forEventTypes("OrderCancelled").build();
            });
          }
        );

        Then('the result has 2 subscriptions named "handler1" and "handler2"', () => {
          expect(state.defineResult).toHaveLength(2);
          expect(state.defineResult![0].name).toBe("handler1");
          expect(state.defineResult![1].name).toBe("handler2");
        });
      });

      RuleScenario(
        "defineSubscriptions throws on duplicate names via subscribe().build()",
        ({ Then }) => {
          Then(
            'calling defineSubscriptions with duplicate "duplicate.handler" via subscribe throws',
            () => {
              expect(() =>
                defineSubscriptions((registry) => {
                  registry
                    .subscribe("duplicate.handler", mockHandler)
                    .forEventTypes("Event1")
                    .build();
                  registry
                    .subscribe("duplicate.handler", mockHandler)
                    .forEventTypes("Event2")
                    .build();
                })
              ).toThrow('Duplicate subscription name: "duplicate.handler"');
            }
          );
        }
      );

      RuleScenario("defineSubscriptions throws on duplicate names via add()", ({ Then }) => {
        Then('calling defineSubscriptions with duplicate "duplicate.name" via add throws', () => {
          expect(() =>
            defineSubscriptions((registry) => {
              const sub1 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
              const sub2 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
              registry.add(sub1);
              registry.add(sub2);
            })
          ).toThrow('Duplicate subscription name: "duplicate.name"');
        });
      });
    }
  );

  // ==========================================================================
  // createSubscription
  // ==========================================================================

  Rule("createSubscription creates a standalone builder", ({ RuleScenario }) => {
    RuleScenario("createSubscription creates standalone builder", ({ When, Then }) => {
      When('createSubscription is called with "standalone" and forEventTypes "TestEvent"', () => {
        state.subscription = createSubscription("standalone", mockHandler)
          .forEventTypes("TestEvent")
          .build();
      });

      Then('the built subscription has name "standalone" and eventTypes filter "TestEvent"', () => {
        expect(state.subscription!.name).toBe("standalone");
        expect(state.subscription!.filter.eventTypes).toEqual(["TestEvent"]);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - Empty Filter
  // ==========================================================================

  Rule("An empty filter matches any event", ({ RuleScenario }) => {
    RuleScenario("Empty filter matches any event", ({ Given, Then, And }) => {
      Given('a subscription "wildcard" with an empty filter', () => {
        state.matchSubscription = {
          name: "wildcard",
          filter: {},
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns true for event type "OrderSubmitted"', () => {
        expect(matchesEvent(state.matchSubscription!, createTestEvent())).toBe(true);
      });

      And('matchesEvent returns true for event type "DifferentEvent"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ eventType: "DifferentEvent" }))
        ).toBe(true);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - eventTypes filter
  // ==========================================================================

  Rule("matchesEvent filters by eventTypes using OR within the list", ({ RuleScenario }) => {
    RuleScenario("Matches when event type is in the list", ({ Given, Then, And }) => {
      Given(
        'a subscription "test" with eventTypes filter "OrderSubmitted" and "OrderCancelled"',
        () => {
          state.matchSubscription = {
            name: "test",
            filter: { eventTypes: ["OrderSubmitted", "OrderCancelled"] },
            handler: mockHandler,
            toHandlerArgs: (e) => e as Record<string, unknown>,
            getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
          };
        }
      );

      Then('matchesEvent returns true for event type "OrderSubmitted"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ eventType: "OrderSubmitted" }))
        ).toBe(true);
      });

      And('matchesEvent returns true for event type "OrderCancelled"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ eventType: "OrderCancelled" }))
        ).toBe(true);
      });
    });

    RuleScenario("Does not match when event type is not in the list", ({ Given, Then }) => {
      Given('a subscription "test" with eventTypes filter "OrderSubmitted"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { eventTypes: ["OrderSubmitted"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns false for event type "DifferentEvent"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ eventType: "DifferentEvent" }))
        ).toBe(false);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - categories filter
  // ==========================================================================

  Rule("matchesEvent filters by categories using OR within the list", ({ RuleScenario }) => {
    RuleScenario("Matches when category is in the list", ({ Given, Then, And }) => {
      Given('a subscription "test" with categories filter "domain" and "integration"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { categories: ["domain", "integration"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns true for category "domain"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ category: "domain" }))
        ).toBe(true);
      });

      And('matchesEvent returns true for category "integration"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ category: "integration" }))
        ).toBe(true);
      });
    });

    RuleScenario("Does not match when category is not in the list", ({ Given, Then }) => {
      Given('a subscription "test" with categories filter "domain"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { categories: ["domain"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns false for category "trigger"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ category: "trigger" }))
        ).toBe(false);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - boundedContexts filter
  // ==========================================================================

  Rule("matchesEvent filters by boundedContexts using OR within the list", ({ RuleScenario }) => {
    RuleScenario("Matches when bounded context is in the list", ({ Given, Then }) => {
      Given('a subscription "test" with boundedContexts filter "orders" and "inventory"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { boundedContexts: ["orders", "inventory"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns true for boundedContext "orders"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ boundedContext: "orders" }))
        ).toBe(true);
      });
    });

    RuleScenario("Does not match when bounded context is not in the list", ({ Given, Then }) => {
      Given('a subscription "test" with boundedContexts filter "payments"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { boundedContexts: ["payments"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns false for boundedContext "orders"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ boundedContext: "orders" }))
        ).toBe(false);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - streamTypes filter
  // ==========================================================================

  Rule("matchesEvent filters by streamTypes using OR within the list", ({ RuleScenario }) => {
    RuleScenario("Matches when stream type is in the list", ({ Given, Then }) => {
      Given('a subscription "test" with streamTypes filter "Order" and "Product"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { streamTypes: ["Order", "Product"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns true for streamType "Order"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ streamType: "Order" }))
        ).toBe(true);
      });
    });

    RuleScenario("Does not match when stream type is not in the list", ({ Given, Then }) => {
      Given('a subscription "test" with streamTypes filter "Customer"', () => {
        state.matchSubscription = {
          name: "test",
          filter: { streamTypes: ["Customer"] },
          handler: mockHandler,
          toHandlerArgs: (e) => e as Record<string, unknown>,
          getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
        };
      });

      Then('matchesEvent returns false for streamType "Order"', () => {
        expect(
          matchesEvent(state.matchSubscription!, createTestEvent({ streamType: "Order" }))
        ).toBe(false);
      });
    });
  });

  // ==========================================================================
  // matchesEvent - Combined Filters
  // ==========================================================================

  Rule("Combined filters use AND logic between filter types", ({ RuleScenario }) => {
    RuleScenario("All filters matching returns true", ({ Given, Then }) => {
      Given(
        'a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"',
        () => {
          state.matchSubscription = {
            name: "test",
            filter: {
              eventTypes: ["OrderSubmitted"],
              categories: ["domain"],
              boundedContexts: ["orders"],
            },
            handler: mockHandler,
            toHandlerArgs: (e) => e as Record<string, unknown>,
            getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
          };
        }
      );

      Then("matchesEvent returns true for an event matching all filters", () => {
        expect(
          matchesEvent(
            state.matchSubscription!,
            createTestEvent({
              eventType: "OrderSubmitted",
              category: "domain",
              boundedContext: "orders",
            })
          )
        ).toBe(true);
      });
    });

    RuleScenario(
      "Non-matching event type returns false with combined filters",
      ({ Given, Then }) => {
        Given(
          'a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"',
          () => {
            state.matchSubscription = {
              name: "test",
              filter: {
                eventTypes: ["OrderSubmitted"],
                categories: ["domain"],
                boundedContexts: ["orders"],
              },
              handler: mockHandler,
              toHandlerArgs: (e) => e as Record<string, unknown>,
              getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
            };
          }
        );

        Then(
          'matchesEvent returns false for an event with wrong eventType "OrderCancelled"',
          () => {
            expect(
              matchesEvent(
                state.matchSubscription!,
                createTestEvent({
                  eventType: "OrderCancelled",
                  category: "domain",
                  boundedContext: "orders",
                })
              )
            ).toBe(false);
          }
        );
      }
    );

    RuleScenario("Non-matching category returns false with combined filters", ({ Given, Then }) => {
      Given(
        'a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"',
        () => {
          state.matchSubscription = {
            name: "test",
            filter: {
              eventTypes: ["OrderSubmitted"],
              categories: ["domain"],
              boundedContexts: ["orders"],
            },
            handler: mockHandler,
            toHandlerArgs: (e) => e as Record<string, unknown>,
            getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
          };
        }
      );

      Then('matchesEvent returns false for an event with wrong category "trigger"', () => {
        expect(
          matchesEvent(
            state.matchSubscription!,
            createTestEvent({
              eventType: "OrderSubmitted",
              category: "trigger",
              boundedContext: "orders",
            })
          )
        ).toBe(false);
      });
    });
  });
});
