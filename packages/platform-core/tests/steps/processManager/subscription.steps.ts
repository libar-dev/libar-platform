/**
 * Process Manager EventBus Subscription - Step Definitions
 *
 * BDD step definitions for PM subscription helpers:
 * - computePMInstanceId for instance ID resolution
 * - createPMSubscription for single PM registration
 * - createPMSubscriptions for bulk PM registration
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  computePMInstanceId,
  createPMSubscription,
  createPMSubscriptions,
  DEFAULT_PM_SUBSCRIPTION_PRIORITY,
  type PMDefinitionForSubscription,
  type PMEventHandlerArgs,
} from "../../../src/processManager/subscription";
import type { PublishedEvent } from "../../../src/eventbus/types";
import type { CorrelationChain } from "../../../src/correlation/types";
import type { FunctionReference } from "convex/server";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Mock Helpers
// =============================================================================

const mockHandler =
  "internal.processManagers.orderNotification.handleEvent" as unknown as FunctionReference<
    "mutation",
    "internal",
    PMEventHandlerArgs,
    unknown
  >;

const mockHandler1 =
  "internal.processManagers.orderNotification.handleEvent" as unknown as FunctionReference<
    "mutation",
    "internal",
    PMEventHandlerArgs,
    unknown
  >;

const mockHandler2 =
  "internal.processManagers.orderAnalytics.handleEvent" as unknown as FunctionReference<
    "mutation",
    "internal",
    PMEventHandlerArgs,
    unknown
  >;

const handlerMap: Record<string, typeof mockHandler1> = {
  orderNotification: mockHandler1,
  orderAnalytics: mockHandler2,
};

function createMockEvent(overrides?: Partial<PublishedEvent>): PublishedEvent {
  return {
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    streamType: "Order",
    streamId: "ord_123",
    payload: { orderId: "ord_123", customerId: "cust_456" },
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    ...overrides,
  };
}

const mockCorrelationChain: CorrelationChain = {
  correlationId: "corr_001",
  causationId: "cause_001",
  metadata: {},
};

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  event: PublishedEvent | null;
  instanceId: string | null;
  subscription: ReturnType<typeof createPMSubscription> | null;
  subscriptions: ReturnType<typeof createPMSubscriptions> | null;
  pmDefinition: PMDefinitionForSubscription | null;
  handlerArgs: Record<string, unknown> | null;
  partitionKey: { name: string; value: string } | null;
  correlationChain: CorrelationChain;
  customTransformer: ReturnType<typeof vi.fn> | null;
  customGetPartitionKey: ReturnType<typeof vi.fn> | null;
  thrownError: Error | null;
  bulkDefinitions: PMDefinitionForSubscription[];
}

function createInitialState(): TestState {
  return {
    event: null,
    instanceId: null,
    subscription: null,
    subscriptions: null,
    pmDefinition: null,
    handlerArgs: null,
    partitionKey: null,
    correlationChain: { ...mockCorrelationChain },
    customTransformer: null,
    customGetPartitionKey: null,
    thrownError: null,
    bulkDefinitions: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/processManager/subscription.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // computePMInstanceId -- no correlation strategy
  // ==========================================================================

  Rule("computePMInstanceId returns streamId when no correlation strategy", ({ RuleScenario }) => {
    RuleScenario("No correlation strategy uses streamId", ({ Given, When, Then }) => {
      Given("an event with streamId {string}", (_ctx: unknown, streamId: string) => {
        state.event = createMockEvent({ streamId });
      });

      When("I compute PM instance ID without a correlation strategy", () => {
        state.instanceId = computePMInstanceId(state.event!, undefined);
      });

      Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
        expect(state.instanceId).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // computePMInstanceId -- extracts correlation property
  // ==========================================================================

  Rule("computePMInstanceId extracts correlation property from payload", ({ RuleScenario }) => {
    RuleScenario("Correlation property is extracted from payload", ({ Given, When, Then }) => {
      Given(
        "an event with payload property {string} set to {string}",
        (_ctx: unknown, prop: string, value: string) => {
          state.event = createMockEvent({
            payload: { orderId: "ord_999", [prop]: value },
          });
        }
      );

      When(
        "I compute PM instance ID with correlation property {string}",
        (_ctx: unknown, prop: string) => {
          state.instanceId = computePMInstanceId(state.event!, {
            correlationProperty: prop,
          });
        }
      );

      Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
        expect(state.instanceId).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // computePMInstanceId -- fallback to streamId
  // ==========================================================================

  Rule(
    "computePMInstanceId falls back to streamId for invalid correlation values",
    ({ RuleScenario }) => {
      RuleScenario(
        "Falls back to streamId when correlation property not in payload",
        ({ Given, When, Then }) => {
          Given(
            "an event with streamId {string} and payload without {string}",
            (_ctx: unknown, streamId: string, _prop: string) => {
              state.event = createMockEvent({
                streamId,
                payload: { orderId: "ord_123" },
              });
            }
          );

          When(
            "I compute PM instance ID with correlation property {string}",
            (_ctx: unknown, prop: string) => {
              state.instanceId = computePMInstanceId(state.event!, {
                correlationProperty: prop,
              });
            }
          );

          Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
            expect(state.instanceId).toBe(expected);
          });
        }
      );

      RuleScenario(
        "Falls back to streamId when correlation property is not a string",
        ({ Given, When, Then }) => {
          Given(
            "an event with streamId {string} and numeric payload property {string}",
            (_ctx: unknown, streamId: string, prop: string) => {
              state.event = createMockEvent({
                streamId,
                payload: { orderId: "ord_123", [prop]: 12345 },
              });
            }
          );

          When(
            "I compute PM instance ID with correlation property {string}",
            (_ctx: unknown, prop: string) => {
              state.instanceId = computePMInstanceId(state.event!, {
                correlationProperty: prop,
              });
            }
          );

          Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
            expect(state.instanceId).toBe(expected);
          });
        }
      );

      RuleScenario(
        "Falls back to streamId when correlation property is null",
        ({ Given, When, Then }) => {
          Given(
            "an event with streamId {string} and null payload property {string}",
            (_ctx: unknown, streamId: string, prop: string) => {
              state.event = createMockEvent({
                streamId,
                payload: { orderId: "ord_123", [prop]: null },
              });
            }
          );

          When(
            "I compute PM instance ID with correlation property {string}",
            (_ctx: unknown, prop: string) => {
              state.instanceId = computePMInstanceId(state.event!, {
                correlationProperty: prop,
              });
            }
          );

          Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
            expect(state.instanceId).toBe(expected);
          });
        }
      );

      RuleScenario(
        "Falls back to streamId when correlation property is undefined",
        ({ Given, When, Then }) => {
          Given(
            "an event with streamId {string} and undefined payload property {string}",
            (_ctx: unknown, streamId: string, prop: string) => {
              state.event = createMockEvent({
                streamId,
                payload: { orderId: "ord_123", [prop]: undefined },
              });
            }
          );

          When(
            "I compute PM instance ID with correlation property {string}",
            (_ctx: unknown, prop: string) => {
              state.instanceId = computePMInstanceId(state.event!, {
                correlationProperty: prop,
              });
            }
          );

          Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
            expect(state.instanceId).toBe(expected);
          });
        }
      );
    }
  );

  // ==========================================================================
  // computePMInstanceId -- edge-case string values
  // ==========================================================================

  Rule("computePMInstanceId accepts edge-case string values", ({ RuleScenario }) => {
    RuleScenario(
      "Empty string correlation property value is used as-is",
      ({ Given, When, Then }) => {
        Given(
          "an event with streamId {string} and payload property {string} set to {string}",
          (_ctx: unknown, streamId: string, prop: string, value: string) => {
            state.event = createMockEvent({
              streamId,
              payload: { [prop]: value, customerId: "cust_123" },
            });
          }
        );

        When(
          "I compute PM instance ID with correlation property {string}",
          (_ctx: unknown, prop: string) => {
            state.instanceId = computePMInstanceId(state.event!, {
              correlationProperty: prop,
            });
          }
        );

        Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
          expect(state.instanceId).toBe(expected);
        });
      }
    );

    RuleScenario(
      "Whitespace-only correlation property value is used as-is",
      ({ Given, When, Then }) => {
        Given(
          "an event with streamId {string} and payload property {string} set to {string}",
          (_ctx: unknown, streamId: string, prop: string, value: string) => {
            state.event = createMockEvent({
              streamId,
              payload: { [prop]: value, customerId: "cust_123" },
            });
          }
        );

        When(
          "I compute PM instance ID with correlation property {string}",
          (_ctx: unknown, prop: string) => {
            state.instanceId = computePMInstanceId(state.event!, {
              correlationProperty: prop,
            });
          }
        );

        Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
          expect(state.instanceId).toBe(expected);
        });
      }
    );

    RuleScenario("orderId correlation strategy extracts correctly", ({ Given, When, Then }) => {
      Given(
        "an event with streamId {string} and payload property {string} set to {string}",
        (_ctx: unknown, streamId: string, prop: string, value: string) => {
          state.event = createMockEvent({
            streamId,
            payload: { [prop]: value },
          });
        }
      );

      When(
        "I compute PM instance ID with correlation property {string}",
        (_ctx: unknown, prop: string) => {
          state.instanceId = computePMInstanceId(state.event!, {
            correlationProperty: prop,
          });
        }
      );

      Then("the instance ID is {string}", (_ctx: unknown, expected: string) => {
        expect(state.instanceId).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- naming
  // ==========================================================================

  Rule("createPMSubscription generates correct subscription names", ({ RuleScenario }) => {
    RuleScenario("Subscription name without context", ({ Given, When, Then }) => {
      Given("a PM definition {string} without context", (_ctx: unknown, name: string) => {
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        };
      });

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the subscription name is {string}", (_ctx: unknown, expected: string) => {
        expect(state.subscription!.name).toBe(expected);
      });
    });

    RuleScenario("Subscription name with context", ({ Given, When, Then }) => {
      Given(
        "a PM definition {string} with context {string}",
        (_ctx: unknown, name: string, context: string) => {
          state.pmDefinition = {
            processManagerName: name,
            eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
            context,
          };
        }
      );

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the subscription name is {string}", (_ctx: unknown, expected: string) => {
        expect(state.subscription!.name).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- priority
  // ==========================================================================

  Rule("createPMSubscription configures priority correctly", ({ RuleScenario }) => {
    RuleScenario("Default priority is 200", ({ Given, When, Then, And }) => {
      Given("a PM definition {string} without context", (_ctx: unknown, name: string) => {
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        };
      });

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the subscription priority is {int}", (_ctx: unknown, priority: number) => {
        expect(state.subscription!.priority).toBe(priority);
      });

      And("the subscription priority equals DEFAULT_PM_SUBSCRIPTION_PRIORITY", () => {
        expect(state.subscription!.priority).toBe(DEFAULT_PM_SUBSCRIPTION_PRIORITY);
      });
    });

    RuleScenario("Custom priority overrides default", ({ Given, When, Then }) => {
      Given("a PM definition {string} without context", (_ctx: unknown, name: string) => {
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        };
      });

      When("I create a PM subscription with priority {int}", (_ctx: unknown, priority: number) => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
          priority,
        });
      });

      Then("the subscription priority is {int}", (_ctx: unknown, priority: number) => {
        expect(state.subscription!.priority).toBe(priority);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- event filtering
  // ==========================================================================

  Rule("createPMSubscription filters by PM event types", ({ RuleScenario }) => {
    RuleScenario("Filters by event types from PM definition", ({ Given, When, Then }) => {
      Given("a PM definition {string} subscribing to events:", (...args: unknown[]) => {
        const name = args[1] as string;
        const rows = extractDataTable<{ eventType: string }>(...args);
        const events = rows.map((r) => r.eventType);
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: events as unknown as readonly string[],
        };
      });

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the subscription filters by event types:", (...args: unknown[]) => {
        const rows = extractDataTable<{ eventType: string }>(...args);
        const expected = rows.map((r) => r.eventType);
        expect(state.subscription!.filter?.eventTypes).toEqual(expected);
      });
    });

    RuleScenario("Creates mutable copy of event types", ({ Given, When, Then }) => {
      Given("a PM definition {string} subscribing to events:", (...args: unknown[]) => {
        const name = args[1] as string;
        const rows = extractDataTable<{ eventType: string }>(...args);
        const events = rows.map((r) => r.eventType);
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: events as unknown as readonly string[],
        };
      });

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the filter event types are a copy not the original reference", () => {
        expect(state.subscription!.filter?.eventTypes).not.toBe(
          state.pmDefinition!.eventSubscriptions
        );
        expect(state.subscription!.filter?.eventTypes).toEqual([
          ...state.pmDefinition!.eventSubscriptions,
        ]);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- handler args (default)
  // ==========================================================================

  Rule(
    "createPMSubscription transforms handler args with default transformer",
    ({ RuleScenario }) => {
      RuleScenario(
        "Default toHandlerArgs produces correct output",
        ({ Given, When, Then, And }) => {
          Given(
            "a PM definition {string} without correlation strategy",
            (_ctx: unknown, name: string) => {
              state.pmDefinition = {
                processManagerName: name,
                eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
              };
            }
          );

          And("a test event for handler args transformation", () => {
            state.event = createMockEvent({
              eventId: "evt_test",
              eventType: "OrderConfirmed",
              globalPosition: 2000,
              streamId: "ord_456",
              payload: { orderId: "ord_456", total: 100 },
            });
          });

          And(
            "a correlation chain with correlationId {string}",
            (_ctx: unknown, corrId: string) => {
              state.correlationChain = {
                correlationId: corrId,
                causationId: "cause_001",
                metadata: {},
              };
            }
          );

          When("I create a PM subscription and call toHandlerArgs", () => {
            state.subscription = createPMSubscription(state.pmDefinition!, {
              handler: mockHandler,
            });
            state.handlerArgs = state.subscription.toHandlerArgs!(
              state.event!,
              state.correlationChain
            ) as Record<string, unknown>;
          });

          Then(
            "the handler args contain instanceId {string}",
            (_ctx: unknown, expected: string) => {
              expect(state.handlerArgs!.instanceId).toBe(expected);
            }
          );

          And("the handler args contain eventId {string}", (_ctx: unknown, expected: string) => {
            expect(state.handlerArgs!.eventId).toBe(expected);
          });
        }
      );
    }
  );

  // ==========================================================================
  // createPMSubscription -- handler args (correlation strategy)
  // ==========================================================================

  Rule("createPMSubscription computes instanceId from correlation strategy", ({ RuleScenario }) => {
    RuleScenario("instanceId from correlation strategy", ({ Given, And, When, Then }) => {
      Given("a PM definition with correlation property {string}", (_ctx: unknown, prop: string) => {
        state.pmDefinition = {
          processManagerName: "orderNotification",
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
          correlationStrategy: { correlationProperty: prop },
        };
      });

      And(
        "an event in stream {string} with payload property {string} set to {string}",
        (_ctx: unknown, streamId: string, prop: string, value: string) => {
          state.event = createMockEvent({
            streamId,
            payload: { [prop]: value },
          });
        }
      );

      And("a correlation chain with correlationId {string}", (_ctx: unknown, corrId: string) => {
        state.correlationChain = {
          correlationId: corrId,
          causationId: "cause_001",
          metadata: {},
        };
      });

      When("I create a PM subscription and call toHandlerArgs", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
        state.handlerArgs = state.subscription.toHandlerArgs!(
          state.event!,
          state.correlationChain
        ) as Record<string, unknown>;
      });

      Then("the handler args contain instanceId {string}", (_ctx: unknown, expected: string) => {
        expect(state.handlerArgs!.instanceId).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- custom toHandlerArgs
  // ==========================================================================

  Rule("createPMSubscription supports custom toHandlerArgs transformer", ({ RuleScenario }) => {
    RuleScenario("Custom toHandlerArgs transformer is used", ({ Given, And, When, Then }) => {
      Given(
        "a PM definition {string} with a custom toHandlerArgs transformer",
        (_ctx: unknown, _name: string) => {
          state.customTransformer = vi.fn(
            (_event: unknown, _chain: unknown, instanceId: string) => ({
              customField: "custom_value",
              instanceId,
            })
          );
          state.pmDefinition = {
            processManagerName: "orderNotification",
            eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
          };
        }
      );

      And("an event in stream {string}", (_ctx: unknown, streamId: string) => {
        state.event = createMockEvent({ streamId });
      });

      And("a correlation chain with correlationId {string}", (_ctx: unknown, corrId: string) => {
        state.correlationChain = {
          correlationId: corrId,
          causationId: "cause_001",
          metadata: {},
        };
      });

      When("I create a PM subscription and call toHandlerArgs", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler as unknown as FunctionReference<
            "mutation",
            "internal",
            { customField: string; instanceId: string },
            unknown
          >,
          toHandlerArgs: state.customTransformer!,
        });
        state.handlerArgs = state.subscription.toHandlerArgs!(
          state.event!,
          state.correlationChain
        ) as Record<string, unknown>;
      });

      Then(
        "the custom transformer was called with the event and instanceId {string}",
        (_ctx: unknown, expectedInstanceId: string) => {
          expect(state.customTransformer).toHaveBeenCalledWith(
            state.event,
            state.correlationChain,
            expectedInstanceId
          );
        }
      );

      And("the handler args contain customField {string}", (_ctx: unknown, expected: string) => {
        expect(state.handlerArgs!.customField).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- default partition key
  // ==========================================================================

  Rule("createPMSubscription partitions by instanceId by default", ({ RuleScenario }) => {
    RuleScenario("Default partition by instanceId", ({ Given, And, When, Then }) => {
      Given(
        "a PM definition {string} without correlation strategy",
        (_ctx: unknown, name: string) => {
          state.pmDefinition = {
            processManagerName: name,
            eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
          };
        }
      );

      And("an event with streamId {string}", (_ctx: unknown, streamId: string) => {
        state.event = createMockEvent({ streamId });
      });

      When("I create a PM subscription and call getPartitionKey", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
        state.partitionKey = state.subscription.getPartitionKey!(state.event!) as {
          name: string;
          value: string;
        };
      });

      Then("the partition key name is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.name).toBe(expected);
      });

      And("the partition key value is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.value).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- correlation strategy partition key
  // ==========================================================================

  Rule("createPMSubscription uses correlation strategy for partition key", ({ RuleScenario }) => {
    RuleScenario("Correlation strategy affects partition key", ({ Given, And, When, Then }) => {
      Given("a PM definition with correlation property {string}", (_ctx: unknown, prop: string) => {
        state.pmDefinition = {
          processManagerName: "orderNotification",
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
          correlationStrategy: { correlationProperty: prop },
        };
      });

      And(
        "an event with payload property {string} set to {string}",
        (_ctx: unknown, prop: string, value: string) => {
          state.event = createMockEvent({
            payload: { [prop]: value },
          });
        }
      );

      When("I create a PM subscription and call getPartitionKey", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
        state.partitionKey = state.subscription.getPartitionKey!(state.event!) as {
          name: string;
          value: string;
        };
      });

      Then("the partition key name is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.name).toBe(expected);
      });

      And("the partition key value is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.value).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- custom getPartitionKey
  // ==========================================================================

  Rule("createPMSubscription supports custom getPartitionKey", ({ RuleScenario }) => {
    RuleScenario("Custom getPartitionKey is used", ({ Given, And, When, Then }) => {
      Given(
        "a PM definition {string} with a custom getPartitionKey",
        (_ctx: unknown, _name: string) => {
          state.customGetPartitionKey = vi.fn((_event: unknown, instanceId: string) => ({
            name: "customPartition",
            value: `custom:${instanceId}`,
          }));
          state.pmDefinition = {
            processManagerName: "orderNotification",
            eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
          };
        }
      );

      And("an event with streamId {string}", (_ctx: unknown, streamId: string) => {
        state.event = createMockEvent({ streamId });
      });

      When("I create a PM subscription and call getPartitionKey", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
          getPartitionKey: state.customGetPartitionKey!,
        });
        state.partitionKey = state.subscription.getPartitionKey!(state.event!) as {
          name: string;
          value: string;
        };
      });

      Then(
        "the custom getPartitionKey was called with the event and instanceId {string}",
        (_ctx: unknown, expectedInstanceId: string) => {
          expect(state.customGetPartitionKey).toHaveBeenCalledWith(state.event, expectedInstanceId);
        }
      );

      And("the partition key name is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.name).toBe(expected);
      });

      And("the partition key value is {string}", (_ctx: unknown, expected: string) => {
        expect(state.partitionKey!.value).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // createPMSubscription -- handler reference
  // ==========================================================================

  Rule("createPMSubscription passes handler reference through", ({ RuleScenario }) => {
    RuleScenario("Handler reference is passed through", ({ Given, When, Then }) => {
      Given("a PM definition {string} without context", (_ctx: unknown, name: string) => {
        state.pmDefinition = {
          processManagerName: name,
          eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        };
      });

      When("I create a PM subscription", () => {
        state.subscription = createPMSubscription(state.pmDefinition!, {
          handler: mockHandler,
        });
      });

      Then("the subscription handler is the same reference as the input handler", () => {
        expect(state.subscription!.handler).toBe(mockHandler);
      });
    });
  });

  // ==========================================================================
  // createPMSubscriptions -- bulk creation
  // ==========================================================================

  Rule("createPMSubscriptions creates subscriptions for all definitions", ({ RuleScenario }) => {
    RuleScenario(
      "Bulk creation produces correct subscription names",
      ({ Given, When, Then, And }) => {
        Given("PM definitions:", (...args: unknown[]) => {
          const rows = extractDataTable<{
            name: string;
            context: string;
            events: string;
          }>(...args);
          state.bulkDefinitions = rows.map((r) => ({
            processManagerName: r.name,
            context: r.context,
            eventSubscriptions: r.events.split(",") as unknown as readonly string[],
          }));
        });

        When("I create PM subscriptions in bulk", () => {
          state.subscriptions = createPMSubscriptions(
            state.bulkDefinitions,
            handlerMap as Record<string, typeof mockHandler>
          );
        });

        Then("there are {int} subscriptions", (_ctx: unknown, count: number) => {
          expect(state.subscriptions).toHaveLength(count);
        });

        And("the subscription names are:", (...args: unknown[]) => {
          const rows = extractDataTable<{ name: string }>(...args);
          const expected = rows.map((r) => r.name);
          for (let i = 0; i < expected.length; i++) {
            expect(state.subscriptions![i]?.name).toBe(expected[i]);
          }
        });
      }
    );
  });

  // ==========================================================================
  // createPMSubscriptions -- missing handler
  // ==========================================================================

  Rule("createPMSubscriptions throws on missing handler", ({ RuleScenario }) => {
    RuleScenario("Missing handler throws error", ({ Given, When, Then }) => {
      Given("PM definitions:", (...args: unknown[]) => {
        const rows = extractDataTable<{
          name: string;
          context: string;
          events: string;
        }>(...args);
        state.bulkDefinitions = rows.map((r) => ({
          processManagerName: r.name,
          context: r.context,
          eventSubscriptions: r.events.split(",") as unknown as readonly string[],
        }));
      });

      When(
        "I create PM subscriptions with only {string} handler",
        (_ctx: unknown, handlerName: string) => {
          try {
            createPMSubscriptions(state.bulkDefinitions, {
              [handlerName]: mockHandler1,
            } as Record<string, typeof mockHandler>);
          } catch (e) {
            state.thrownError = e as Error;
          }
        }
      );

      Then(
        "it throws an error about missing handler for {string}",
        (_ctx: unknown, pmName: string) => {
          expect(state.thrownError).toBeTruthy();
          expect(state.thrownError!.message).toBe(
            `Missing handler for process manager "${pmName}" in handlerMap`
          );
        }
      );
    });
  });

  // ==========================================================================
  // createPMSubscriptions -- common options
  // ==========================================================================

  Rule("createPMSubscriptions applies common options to all", ({ RuleScenario }) => {
    RuleScenario("Common priority applies to all subscriptions", ({ Given, When, Then }) => {
      Given("PM definitions:", (...args: unknown[]) => {
        const rows = extractDataTable<{
          name: string;
          context: string;
          events: string;
        }>(...args);
        state.bulkDefinitions = rows.map((r) => ({
          processManagerName: r.name,
          context: r.context,
          eventSubscriptions: r.events.split(",") as unknown as readonly string[],
        }));
      });

      When(
        "I create PM subscriptions in bulk with priority {int}",
        (_ctx: unknown, priority: number) => {
          state.subscriptions = createPMSubscriptions(
            state.bulkDefinitions,
            handlerMap as Record<string, typeof mockHandler>,
            { priority }
          );
        }
      );

      Then("all subscriptions have priority {int}", (_ctx: unknown, priority: number) => {
        for (const sub of state.subscriptions!) {
          expect(sub.priority).toBe(priority);
        }
      });
    });
  });

  // ==========================================================================
  // createPMSubscriptions -- correct event filters
  // ==========================================================================

  Rule("createPMSubscriptions creates correct event filters", ({ RuleScenario }) => {
    RuleScenario("Each subscription has correct event filter", ({ Given, When, Then, And }) => {
      Given("PM definitions:", (...args: unknown[]) => {
        const rows = extractDataTable<{
          name: string;
          context: string;
          events: string;
        }>(...args);
        state.bulkDefinitions = rows.map((r) => ({
          processManagerName: r.name,
          context: r.context,
          eventSubscriptions: r.events.split(",") as unknown as readonly string[],
        }));
      });

      When("I create PM subscriptions in bulk", () => {
        state.subscriptions = createPMSubscriptions(
          state.bulkDefinitions,
          handlerMap as Record<string, typeof mockHandler>
        );
      });

      Then(
        "subscription {int} filters by events {string}",
        (_ctx: unknown, index: number, events: string) => {
          const expected = events.split(",");
          expect(state.subscriptions![index]?.filter?.eventTypes).toEqual(expected);
        }
      );

      And(
        "subscription {int} also filters by events {string}",
        (_ctx: unknown, index: number, events: string) => {
          const expected = events.split(",");
          expect(state.subscriptions![index]?.filter?.eventTypes).toEqual(expected);
        }
      );
    });
  });

  // ==========================================================================
  // createPMSubscriptions -- empty definitions
  // ==========================================================================

  Rule("createPMSubscriptions handles empty definitions", ({ RuleScenario }) => {
    RuleScenario("Empty definitions produces empty subscriptions", ({ When, Then }) => {
      When("I create PM subscriptions with no definitions", () => {
        state.subscriptions = createPMSubscriptions([], {});
      });

      Then("there are {int} subscriptions", (_ctx: unknown, count: number) => {
        expect(state.subscriptions).toHaveLength(count);
      });
    });
  });

  // ==========================================================================
  // createPMSubscriptions -- handler passthrough
  // ==========================================================================

  Rule("createPMSubscriptions passes handlers correctly", ({ RuleScenario }) => {
    RuleScenario("Handlers match their definitions", ({ Given, When, Then, And }) => {
      Given("PM definitions:", (...args: unknown[]) => {
        const rows = extractDataTable<{
          name: string;
          context: string;
          events: string;
        }>(...args);
        state.bulkDefinitions = rows.map((r) => ({
          processManagerName: r.name,
          context: r.context,
          eventSubscriptions: r.events.split(",") as unknown as readonly string[],
        }));
      });

      When("I create PM subscriptions in bulk", () => {
        state.subscriptions = createPMSubscriptions(
          state.bulkDefinitions,
          handlerMap as Record<string, typeof mockHandler>
        );
      });

      Then(
        "subscription {int} handler is the {string} mock handler",
        (_ctx: unknown, index: number, handlerName: string) => {
          expect(state.subscriptions![index]?.handler).toBe(handlerMap[handlerName]);
        }
      );

      And(
        "subscription {int} also uses the {string} mock handler",
        (_ctx: unknown, index: number, handlerName: string) => {
          expect(state.subscriptions![index]?.handler).toBe(handlerMap[handlerName]);
        }
      );
    });
  });

  // ==========================================================================
  // DEFAULT_PM_SUBSCRIPTION_PRIORITY
  // ==========================================================================

  Rule("DEFAULT_PM_SUBSCRIPTION_PRIORITY has value 200", ({ RuleScenario }) => {
    RuleScenario("Default priority constant is 200", ({ Then }) => {
      Then("DEFAULT_PM_SUBSCRIPTION_PRIORITY is 200", () => {
        expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBe(200);
      });
    });
  });

  Rule("DEFAULT_PM_SUBSCRIPTION_PRIORITY is between projections and sagas", ({ RuleScenario }) => {
    RuleScenario("Priority is after projections and before sagas", ({ Then, And }) => {
      Then(
        "DEFAULT_PM_SUBSCRIPTION_PRIORITY is greater than projection priority {int}",
        (_ctx: unknown, priority: number) => {
          expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBeGreaterThan(priority);
        }
      );

      And(
        "DEFAULT_PM_SUBSCRIPTION_PRIORITY is less than saga priority {int}",
        (_ctx: unknown, priority: number) => {
          expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBeLessThan(priority);
        }
      );
    });
  });
});
