/**
 * Agent Subscription (Mutation Overload) - Step Definitions
 *
 * BDD step definitions for createAgentSubscription(), createAgentSubscriptions(),
 * defaultAgentTransform, event filtering, partition key, and agentId memoization.
 * Mechanical migration from tests/unit/agent/agent-subscription.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import {
  createAgentSubscription,
  createAgentSubscriptions,
  defaultAgentTransform,
  DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
  type AgentDefinitionForSubscription,
  type AgentEventHandlerArgs,
} from "../../../../platform-bus/src/agent-subscription.js";

import type { PublishedEvent, CorrelationChain } from "../../../src/index.js";

// =============================================================================
// DataTable Type Helper
// =============================================================================

interface DataTableRow {
  [key: string]: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const mockHandler = makeFunctionReference<"mutation">(
  "agents/churnRisk:handleEvent"
) as FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>;

function createMockEvent(
  eventType: string,
  streamId: string,
  globalPosition: number
): PublishedEvent {
  return {
    eventId: `evt_${globalPosition}`,
    eventType,
    globalPosition,
    streamType: "Order",
    streamId,
    version: 1,
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    payload: { orderId: streamId, reason: "Test cancellation" },
    schemaVersion: 1,
    aggregateVersion: 1,
    metadata: {},
    causingCommandId: `cmd_${globalPosition}`,
  };
}

function createMockCorrelationChain(correlationId: string): CorrelationChain {
  return {
    correlationId,
    causationId: `cause_${Date.now()}`,
    depth: 1,
    parentIds: [],
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  agentDef: AgentDefinitionForSubscription | null;
  simpleAgentDef: AgentDefinitionForSubscription | null;
  fraudAgentDef: AgentDefinitionForSubscription | null;
  subscription: ReturnType<typeof createAgentSubscription> | null;
  subscriptions: ReturnType<typeof createAgentSubscription>[] | null;
  event: PublishedEvent | null;
  chain: CorrelationChain | null;
  handlerArgs: AgentEventHandlerArgs | null;
  handlerArgs2: AgentEventHandlerArgs | null;
  customHandlerArgs: Record<string, unknown> | null;
  partitionKey: { name: string; value: string } | null;
  capturedAgentIdFromTransform: string | undefined;
  capturedAgentIdFromPartition: string | undefined;
  error: Error | null;
  transformResult: AgentEventHandlerArgs | null;
}

function createInitialState(): TestState {
  return {
    agentDef: null,
    simpleAgentDef: null,
    fraudAgentDef: null,
    subscription: null,
    subscriptions: null,
    event: null,
    chain: null,
    handlerArgs: null,
    handlerArgs2: null,
    customHandlerArgs: null,
    partitionKey: null,
    capturedAgentIdFromTransform: undefined,
    capturedAgentIdFromPartition: undefined,
    error: null,
    transformResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/agent-subscription.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Shared Step Helpers
  // ===========================================================================

  function givenChurnRiskAgent(_ctx: unknown, id: string, context: string): void {
    state.agentDef = {
      id,
      subscriptions: ["OrderCancelled", "OrderRefunded"],
      context,
    };
  }

  function givenSimpleAgent(_ctx: unknown, id: string, eventType: string): void {
    state.simpleAgentDef = {
      id,
      subscriptions: [eventType],
    };
  }

  function givenMockMutationHandler(_ctx: unknown): void {
    // Handler is a module-level constant
  }

  function whenCreateMutationSubscription(_ctx: unknown): void {
    state.subscription = createAgentSubscription(state.agentDef!, {
      handler: mockHandler,
    });
  }

  function givenMockEvent(
    _ctx: unknown,
    eventType: string,
    streamId: string,
    position: string
  ): void {
    state.event = createMockEvent(eventType, streamId, parseInt(position, 10));
  }

  function givenCorrelationChain(_ctx: unknown, correlationId: string): void {
    state.chain = createMockCorrelationChain(correlationId);
  }

  function whenCallToHandlerArgs(_ctx: unknown): void {
    state.handlerArgs = state.subscription!.toHandlerArgs(state.event!, state.chain!);
  }

  // ===========================================================================
  // Rule: createAgentSubscription produces correct subscription properties
  // ===========================================================================

  Rule("createAgentSubscription produces correct subscription properties", ({ RuleScenario }) => {
    RuleScenario("Subscription with context has correct name", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription", whenCreateMutationSubscription);
      Then('the subscription name is "agent:orders:churn-risk-agent"', (_ctx: unknown) => {
        expect(state.subscription!.name).toBe("agent:orders:churn-risk-agent");
      });
    });

    RuleScenario("Subscription without context has correct name", ({ Given, And, When, Then }) => {
      Given(
        'a simple agent definition with id "simple-agent" subscribing to "EventA"',
        (ctx: unknown) => givenSimpleAgent(ctx, "simple-agent", "EventA")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription", (_ctx: unknown) => {
        state.subscription = createAgentSubscription(state.simpleAgentDef!, {
          handler: mockHandler,
        });
      });
      Then('the subscription name is "agent:simple-agent"', (_ctx: unknown) => {
        expect(state.subscription!.name).toBe("agent:simple-agent");
      });
    });

    RuleScenario("Subscription uses default priority of 250", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription", whenCreateMutationSubscription);
      Then("the subscription priority is 250", (_ctx: unknown) => {
        expect(state.subscription!.priority).toBe(DEFAULT_AGENT_SUBSCRIPTION_PRIORITY);
        expect(state.subscription!.priority).toBe(250);
      });
    });

    RuleScenario("Subscription uses custom priority", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription with priority 300", (_ctx: unknown) => {
        state.subscription = createAgentSubscription(state.agentDef!, {
          handler: mockHandler,
          priority: 300,
        });
      });
      Then("the subscription priority is 300", (_ctx: unknown) => {
        expect(state.subscription!.priority).toBe(300);
      });
    });

    RuleScenario(
      "Subscription filter contains correct event types",
      ({ Given, And, When, Then }) => {
        Given(
          'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
          (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
        );
        And("a mock mutation handler", givenMockMutationHandler);
        When("I create a mutation subscription", whenCreateMutationSubscription);
        Then(
          "the subscription filter contains event types:",
          (_ctx: unknown, dataTable: DataTableRow[]) => {
            expect(state.subscription!.filter).toBeDefined();
            for (const row of dataTable) {
              expect(state.subscription!.filter!.eventTypes).toContain(row["eventType"]);
            }
          }
        );
        And("the subscription filter has 2 event types", (_ctx: unknown) => {
          expect(state.subscription!.filter!.eventTypes).toHaveLength(2);
        });
      }
    );

    RuleScenario("Subscription attaches the handler reference", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription", whenCreateMutationSubscription);
      Then("the subscription handler is the mock handler", (_ctx: unknown) => {
        expect(state.subscription!.handler).toBe(mockHandler);
      });
    });
  });

  // ===========================================================================
  // Rule: toHandlerArgs transforms event to AgentEventHandlerArgs
  // ===========================================================================

  Rule("toHandlerArgs transforms event to AgentEventHandlerArgs", ({ RuleScenario }) => {
    RuleScenario(
      "toHandlerArgs produces correct AgentEventHandlerArgs",
      ({ Given, And, When, Then }) => {
        Given(
          'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
          (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
        );
        And("a mock mutation handler", givenMockMutationHandler);
        And(
          'a mock event "OrderCancelled" with streamId "order_123" at position 42',
          (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_123", "42")
        );
        And('a correlation chain with correlationId "corr_abc"', (ctx: unknown) =>
          givenCorrelationChain(ctx, "corr_abc")
        );
        When("I create a mutation subscription", whenCreateMutationSubscription);
        And("I call toHandlerArgs with the event and correlation chain", whenCallToHandlerArgs);
        Then(
          "the handler args have all expected fields:",
          (_ctx: unknown, dataTable: DataTableRow[]) => {
            const args = state.handlerArgs as unknown as Record<string, unknown>;
            for (const row of dataTable) {
              const field = row["field"]!;
              const expected = row["expected"]!;
              if (field === "globalPosition") {
                expect(args[field]).toBe(parseInt(expected, 10));
              } else {
                expect(args[field]).toBe(expected);
              }
            }
          }
        );
      }
    );

    RuleScenario("toHandlerArgs includes payload in handler args", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      And('a mock event "OrderCancelled" with streamId "order_123" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderCancelled", "order_123", "1")
      );
      And(
        'the event payload is set to orderId "order_123" amount 150 reason "Changed mind"',
        (_ctx: unknown) => {
          state.event!.payload = {
            orderId: "order_123",
            amount: 150.0,
            reason: "Changed mind",
          };
        }
      );
      And('a correlation chain with correlationId "corr_xyz"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_xyz")
      );
      When("I create a mutation subscription", whenCreateMutationSubscription);
      And("I call toHandlerArgs with the event and correlation chain", whenCallToHandlerArgs);
      Then(
        'the handler args payload equals orderId "order_123" amount 150 reason "Changed mind"',
        (_ctx: unknown) => {
          expect(state.handlerArgs!.payload).toEqual({
            orderId: "order_123",
            amount: 150.0,
            reason: "Changed mind",
          });
        }
      );
    });

    RuleScenario(
      "defaultAgentTransform wraps non-object payload in _raw",
      ({ Given, And, When, Then }) => {
        Given(
          'a mock event "OrderCancelled" with streamId "order_123" at position 1',
          (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_123", "1")
        );
        And('the event payload is set to string "string-payload"', (_ctx: unknown) => {
          (state.event as { payload: unknown }).payload = "string-payload";
        });
        And('a correlation chain with correlationId "corr_xyz"', (ctx: unknown) =>
          givenCorrelationChain(ctx, "corr_xyz")
        );
        When('I call defaultAgentTransform with agentId "test-agent"', (_ctx: unknown) => {
          state.handlerArgs = defaultAgentTransform(state.event!, state.chain!, "test-agent");
        });
        Then('the handler args payload equals _raw "string-payload"', (_ctx: unknown) => {
          expect(state.handlerArgs!.payload).toEqual({ _raw: "string-payload" });
        });
      }
    );

    RuleScenario("Custom toHandlerArgs transformer is used", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      And('a mock event "OrderCancelled" with streamId "order_123" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderCancelled", "order_123", "1")
      );
      And('a correlation chain with correlationId "corr_xyz"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_xyz")
      );
      When(
        "I create a mutation subscription with a custom toHandlerArgs transformer",
        (_ctx: unknown) => {
          interface CustomHandlerArgs {
            id: string;
            type: string;
            custom: string;
            [key: string]: unknown;
          }

          const customTransform = (
            event: PublishedEvent,
            _chain: CorrelationChain,
            agentId: string
          ): CustomHandlerArgs => ({
            id: event.eventId,
            type: event.eventType,
            custom: `processed-by-${agentId}`,
          });

          state.subscription = createAgentSubscription<CustomHandlerArgs>(state.agentDef!, {
            handler: mockHandler as unknown as FunctionReference<
              "mutation",
              FunctionVisibility,
              CustomHandlerArgs,
              unknown
            >,
            toHandlerArgs: customTransform,
          });
        }
      );
      And("I call toHandlerArgs with the event and correlation chain", (_ctx: unknown) => {
        state.customHandlerArgs = state.subscription!.toHandlerArgs(
          state.event!,
          state.chain!
        ) as unknown as Record<string, unknown>;
      });
      Then(
        "the custom handler args have expected values:",
        (_ctx: unknown, dataTable: DataTableRow[]) => {
          for (const row of dataTable) {
            expect(state.customHandlerArgs![row["field"]!]).toBe(row["expected"]);
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: getPartitionKey extracts correct partition key
  // ===========================================================================

  Rule("getPartitionKey extracts correct partition key", ({ RuleScenario }) => {
    RuleScenario("Partitions by streamId by default", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      And('a mock event "OrderCancelled" with streamId "order_456" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderCancelled", "order_456", "1")
      );
      When("I create a mutation subscription", whenCreateMutationSubscription);
      And("I call getPartitionKey with the event", (_ctx: unknown) => {
        state.partitionKey = state.subscription!.getPartitionKey!(state.event!) as {
          name: string;
          value: string;
        };
      });
      Then('the partition key name is "streamId"', (_ctx: unknown) => {
        expect(state.partitionKey!.name).toBe("streamId");
      });
      And('the partition key value is "order_456"', (_ctx: unknown) => {
        expect(state.partitionKey!.value).toBe("order_456");
      });
    });

    RuleScenario("Custom partition key extractor is used", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      And('a mock event "OrderCancelled" with streamId "order_789" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderCancelled", "order_789", "1")
      );
      When(
        "I create a mutation subscription with a custom partition key extractor",
        (_ctx: unknown) => {
          state.subscription = createAgentSubscription(state.agentDef!, {
            handler: mockHandler,
            getPartitionKey: (event, agentId) => ({
              name: "agent",
              value: `${agentId}:${event.boundedContext}`,
            }),
          });
        }
      );
      And("I call getPartitionKey with the event", (_ctx: unknown) => {
        state.partitionKey = state.subscription!.getPartitionKey!(state.event!) as {
          name: string;
          value: string;
        };
      });
      Then('the partition key name is "agent"', (_ctx: unknown) => {
        expect(state.partitionKey!.name).toBe("agent");
      });
      And('the partition key value is "churn-risk-agent:orders"', (_ctx: unknown) => {
        expect(state.partitionKey!.value).toBe("churn-risk-agent:orders");
      });
    });
  });

  // ===========================================================================
  // Rule: createAgentSubscriptions creates batch subscriptions
  // ===========================================================================

  Rule("createAgentSubscriptions creates batch subscriptions", ({ RuleScenario }) => {
    RuleScenario("Creates subscriptions for multiple agents", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And(
        'a fraud agent definition with id "fraud-agent" subscribing to "PaymentFailed" in context "payments"',
        (_ctx: unknown) => {
          state.fraudAgentDef = {
            id: "fraud-agent",
            subscriptions: ["PaymentFailed"],
            context: "payments",
          };
        }
      );
      And(
        'a handler map with entries for "churn-risk-agent" and "fraud-agent"',
        (_ctx: unknown) => {
          // stored implicitly, used in When
        }
      );
      When("I create batch subscriptions", (_ctx: unknown) => {
        const handlerMap: Record<
          string,
          FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>
        > = {
          "churn-risk-agent": mockHandler,
          "fraud-agent": makeFunctionReference<"mutation">(
            "agents/fraud:handleEvent"
          ) as FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>,
        };
        state.subscriptions = createAgentSubscriptions(
          [state.agentDef!, state.fraudAgentDef!],
          handlerMap
        ) as ReturnType<typeof createAgentSubscription>[];
      });
      Then("the batch has 2 subscriptions", (_ctx: unknown) => {
        expect(state.subscriptions).toHaveLength(2);
      });
      And("the batch subscription names are:", (_ctx: unknown, dataTable: DataTableRow[]) => {
        for (let i = 0; i < dataTable.length; i++) {
          expect(state.subscriptions![i].name).toBe(dataTable[i]["name"]);
        }
      });
    });

    RuleScenario("Throws if handler is missing for an agent", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And(
        'a simple agent definition with id "simple-agent" subscribing to "EventA"',
        (ctx: unknown) => givenSimpleAgent(ctx, "simple-agent", "EventA")
      );
      And('a handler map with entry only for "churn-risk-agent"', (_ctx: unknown) => {
        // stored implicitly
      });
      When("I create batch subscriptions for both agents", (_ctx: unknown) => {
        try {
          const incompleteHandlerMap = {
            "churn-risk-agent": mockHandler,
          };
          createAgentSubscriptions(
            [state.agentDef!, state.simpleAgentDef!],
            incompleteHandlerMap as Record<
              string,
              FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>
            >
          );
        } catch (e) {
          state.error = e as Error;
        }
      });
      Then('it throws with message containing "Missing handler for agent"', (_ctx: unknown) => {
        expect(state.error).toBeDefined();
        expect(state.error!.message).toContain(
          'Missing handler for agent "simple-agent" in handlerMap'
        );
      });
    });

    RuleScenario("Applies common options to all subscriptions", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And(
        'a simple agent definition with id "simple-agent" subscribing to "EventA"',
        (ctx: unknown) => givenSimpleAgent(ctx, "simple-agent", "EventA")
      );
      And(
        'a handler map with entries for "churn-risk-agent" and "simple-agent"',
        (_ctx: unknown) => {
          // stored implicitly
        }
      );
      When("I create batch subscriptions with priority 300", (_ctx: unknown) => {
        const handlerMap = {
          "churn-risk-agent": mockHandler,
          "simple-agent": mockHandler,
        };
        state.subscriptions = createAgentSubscriptions(
          [state.agentDef!, state.simpleAgentDef!],
          handlerMap,
          { priority: 300 }
        ) as ReturnType<typeof createAgentSubscription>[];
      });
      Then("all subscriptions have priority 300", (_ctx: unknown) => {
        expect(state.subscriptions![0].priority).toBe(300);
        expect(state.subscriptions![1].priority).toBe(300);
      });
    });
  });

  // ===========================================================================
  // Rule: AgentId is memoized across calls
  // ===========================================================================

  Rule("AgentId is memoized across calls", ({ RuleScenario }) => {
    RuleScenario("Same agentId for multiple toHandlerArgs calls", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      And('a mock event "OrderCancelled" with streamId "order_123" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderCancelled", "order_123", "1")
      );
      And('a correlation chain with correlationId "corr_abc"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_abc")
      );
      When("I create a mutation subscription", whenCreateMutationSubscription);
      And("I call toHandlerArgs twice with the event and correlation chain", (_ctx: unknown) => {
        state.handlerArgs = state.subscription!.toHandlerArgs(state.event!, state.chain!);
        state.handlerArgs2 = state.subscription!.toHandlerArgs(state.event!, state.chain!);
      });
      Then('both handler args have agentId "churn-risk-agent"', (_ctx: unknown) => {
        expect(state.handlerArgs!.agentId).toBe(state.handlerArgs2!.agentId);
        expect(state.handlerArgs!.agentId).toBe("churn-risk-agent");
      });
    });

    RuleScenario(
      "Same agentId for toHandlerArgs and getPartitionKey",
      ({ Given, And, When, Then }) => {
        Given(
          'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
          (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
        );
        And(
          "a mock mutation handler with custom transform and partition key capturing agentId",
          (_ctx: unknown) => {
            state.subscription = createAgentSubscription<AgentEventHandlerArgs>(state.agentDef!, {
              handler: mockHandler,
              toHandlerArgs: (event, chain, agentId) => {
                state.capturedAgentIdFromTransform = agentId;
                return defaultAgentTransform(event, chain, agentId);
              },
              getPartitionKey: (event, agentId) => {
                state.capturedAgentIdFromPartition = agentId;
                return { name: "streamId", value: event.streamId };
              },
            });
          }
        );
        And(
          'a mock event "OrderCancelled" with streamId "order_123" at position 1',
          (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_123", "1")
        );
        And('a correlation chain with correlationId "corr_abc"', (ctx: unknown) =>
          givenCorrelationChain(ctx, "corr_abc")
        );
        When("I call toHandlerArgs and getPartitionKey", (_ctx: unknown) => {
          state.subscription!.toHandlerArgs(state.event!, state.chain!);
          state.subscription!.getPartitionKey!(state.event!);
        });
        Then('both captured agentIds are "churn-risk-agent"', (_ctx: unknown) => {
          expect(state.capturedAgentIdFromTransform).toBe("churn-risk-agent");
          expect(state.capturedAgentIdFromPartition).toBe("churn-risk-agent");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Event filtering only matches subscribed event types
  // ===========================================================================

  Rule("Event filtering only matches subscribed event types", ({ RuleScenario }) => {
    RuleScenario(
      "Filter matches subscribed types and rejects unsubscribed types",
      ({ Given, And, When, Then }) => {
        Given(
          'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
          (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
        );
        And("a mock mutation handler", givenMockMutationHandler);
        When("I create a mutation subscription", whenCreateMutationSubscription);
        Then(
          "the subscription filter contains event types:",
          (_ctx: unknown, dataTable: DataTableRow[]) => {
            for (const row of dataTable) {
              expect(state.subscription!.filter!.eventTypes).toContain(row["eventType"]);
            }
          }
        );
        And(
          "the subscription filter does not contain event types:",
          (_ctx: unknown, dataTable: DataTableRow[]) => {
            for (const row of dataTable) {
              expect(state.subscription!.filter!.eventTypes).not.toContain(row["eventType"]);
            }
          }
        );
      }
    );

    RuleScenario("Event types array starts with correct length", ({ Given, And, When, Then }) => {
      Given(
        'a churn risk agent definition with id "churn-risk-agent" and context "orders"',
        (ctx: unknown) => givenChurnRiskAgent(ctx, "churn-risk-agent", "orders")
      );
      And("a mock mutation handler", givenMockMutationHandler);
      When("I create a mutation subscription", whenCreateMutationSubscription);
      Then("the subscription filter has 2 event types", (_ctx: unknown) => {
        expect(state.subscription!.filter!.eventTypes).toHaveLength(2);
      });
    });
  });

  // ===========================================================================
  // Rule: defaultAgentTransform handles all PublishedEvent fields
  // ===========================================================================

  Rule("defaultAgentTransform handles all PublishedEvent fields", ({ RuleScenario }) => {
    RuleScenario("Transforms all PublishedEvent fields correctly", ({ Given, And, When, Then }) => {
      Given("a fully populated published event", (_ctx: unknown) => {
        state.event = {
          eventId: "evt_test_123",
          eventType: "TestEvent",
          globalPosition: 999,
          streamType: "TestStream",
          streamId: "test_stream_456",
          version: 5,
          timestamp: 1700000000000,
          category: "domain",
          boundedContext: "testing",
          payload: { key: "value", nested: { prop: 123 } },
          schemaVersion: 2,
          aggregateVersion: 5,
          metadata: { source: "test" },
          causingCommandId: "cmd_test_789",
        };
      });
      And(
        'a fully populated correlation chain with correlationId "corr_test_abc"',
        (_ctx: unknown) => {
          state.chain = {
            correlationId: "corr_test_abc",
            causationId: "cause_test_def",
            depth: 3,
            parentIds: ["parent_1", "parent_2"],
          };
        }
      );
      When('I call defaultAgentTransform with agentId "test-agent-id"', (_ctx: unknown) => {
        state.transformResult = defaultAgentTransform(state.event!, state.chain!, "test-agent-id");
      });
      Then(
        "the transform result has all expected fields:",
        (_ctx: unknown, dataTable: DataTableRow[]) => {
          const args = state.transformResult as unknown as Record<string, unknown>;
          for (const row of dataTable) {
            const field = row["field"]!;
            const expected = row["expected"]!;
            if (field === "globalPosition" || field === "timestamp") {
              expect(args[field]).toBe(parseInt(expected, 10));
            } else {
              expect(args[field]).toBe(expected);
            }
          }
        }
      );
      And(
        'the transform result payload equals key "value" with nested prop 123',
        (_ctx: unknown) => {
          expect(state.transformResult!.payload).toEqual({
            key: "value",
            nested: { prop: 123 },
          });
        }
      );
    });

    RuleScenario("Handles null payload", ({ Given, And, When, Then }) => {
      Given('a mock event "TestEvent" with streamId "stream_1" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "TestEvent", "stream_1", "1")
      );
      And("the event payload is set to null", (_ctx: unknown) => {
        (state.event as { payload: unknown }).payload = null;
      });
      And('a correlation chain with correlationId "corr_1"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_1")
      );
      When('I call defaultAgentTransform with agentId "agent"', (_ctx: unknown) => {
        state.handlerArgs = defaultAgentTransform(state.event!, state.chain!, "agent");
      });
      Then("the handler args payload equals _raw null", (_ctx: unknown) => {
        expect(state.handlerArgs!.payload).toEqual({ _raw: null });
      });
    });

    RuleScenario("Handles array payload", ({ Given, And, When, Then }) => {
      Given('a mock event "TestEvent" with streamId "stream_1" at position 1', (ctx: unknown) =>
        givenMockEvent(ctx, "TestEvent", "stream_1", "1")
      );
      And("the event payload is set to array 1 2 3", (_ctx: unknown) => {
        (state.event as { payload: unknown }).payload = [1, 2, 3];
      });
      And('a correlation chain with correlationId "corr_1"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_1")
      );
      When('I call defaultAgentTransform with agentId "agent"', (_ctx: unknown) => {
        state.handlerArgs = defaultAgentTransform(state.event!, state.chain!, "agent");
      });
      Then("the handler args payload equals _raw array 1 2 3", (_ctx: unknown) => {
        expect(state.handlerArgs!.payload).toEqual({ _raw: [1, 2, 3] });
      });
    });
  });
});
