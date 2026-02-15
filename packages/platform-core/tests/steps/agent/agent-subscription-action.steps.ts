/**
 * Agent Subscription Action Overload - Step Definitions
 *
 * BDD step definitions for the ACTION overload of createAgentSubscription().
 * Mechanical migration from tests/unit/agent/agent-subscription-action.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import {
  createAgentSubscription,
  DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
  type AgentDefinitionForSubscription,
  type AgentEventHandlerArgs,
} from "../../../../platform-bus/src/agent-subscription.js";

import type {
  PublishedEvent,
  CorrelationChain,
  ActionSubscription,
  WorkpoolOnCompleteArgs,
} from "../../../src/index.js";

// =============================================================================
// DataTable Type Helper
// =============================================================================

interface DataTableRow {
  [key: string]: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const mockActionHandler = makeFunctionReference<"action">(
  "agents/llmChurnRisk:analyzeEvent"
) as FunctionReference<"action", FunctionVisibility, AgentEventHandlerArgs, unknown>;

const mockOnComplete = makeFunctionReference<"mutation">(
  "agents/llmChurnRisk:onComplete"
) as FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

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
    payload: { orderId: streamId, reason: "Test" },
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
  subscription: ReturnType<typeof createAgentSubscription> | null;
  event: PublishedEvent | null;
  chain: CorrelationChain | null;
  workpoolContext: Record<string, unknown> | null;
  handlerArgs: AgentEventHandlerArgs | null;
  partitionKey: { name: string; value: string } | null;
}

function createInitialState(): TestState {
  return {
    agentDef: null,
    subscription: null,
    event: null,
    chain: null,
    workpoolContext: null,
    handlerArgs: null,
    partitionKey: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/agent/agent-subscription-action.feature"
);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Shared Step Helpers
  // ===========================================================================

  function givenLlmAgentDef(_ctx: unknown, id: string, context: string): void {
    state.agentDef = {
      id,
      subscriptions: ["OrderCancelled", "OrderRefunded"],
      context,
    };
  }

  function givenSimpleAgentDef(_ctx: unknown, id: string): void {
    state.agentDef = {
      id,
      subscriptions: ["EventA"],
    };
  }

  function givenActionHandlerAndOnComplete(_ctx: unknown): void {
    // References are module-level constants, nothing to set up
  }

  function whenCreateActionSubscription(_ctx: unknown): void {
    state.subscription = createAgentSubscription(state.agentDef!, {
      actionHandler: mockActionHandler,
      onComplete: mockOnComplete,
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

  // ===========================================================================
  // Rule: Action subscription creation sets correct handler type and references
  // ===========================================================================

  Rule(
    "Action subscription creation sets correct handler type and references",
    ({ RuleScenario }) => {
      RuleScenario(
        "Action subscription has correct type and references",
        ({ Given, And, When, Then }) => {
          Given(
            'an LLM agent definition with id "llm-churn-risk" and context "orders"',
            (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
          );
          And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
          When("I create an action subscription", whenCreateActionSubscription);
          Then(
            "the subscription has all expected properties:",
            (_ctx: unknown, dataTable: DataTableRow[]) => {
              const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
              for (const row of dataTable) {
                const prop = row["property"];
                const expected = row["expected"];
                if (expected === "mockActionHandler") {
                  expect(actionSub.handler).toBe(mockActionHandler);
                } else if (expected === "mockOnComplete") {
                  expect(actionSub.onComplete).toBe(mockOnComplete);
                } else {
                  expect((actionSub as unknown as Record<string, unknown>)[prop!]).toBe(expected);
                }
              }
            }
          );
        }
      );
    }
  );

  // ===========================================================================
  // Rule: Retry configuration is passed through to action subscriptions
  // ===========================================================================

  Rule("Retry configuration is passed through to action subscriptions", ({ RuleScenario }) => {
    RuleScenario("Object retry config is passed through", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When(
        "I create an action subscription with retry config maxAttempts 3, initialBackoffMs 1000, base 2",
        (_ctx: unknown) => {
          state.subscription = createAgentSubscription(state.agentDef!, {
            actionHandler: mockActionHandler,
            onComplete: mockOnComplete,
            retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
          });
        }
      );
      Then(
        "the subscription retry config equals maxAttempts 3, initialBackoffMs 1000, base 2",
        (_ctx: unknown) => {
          const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
          expect(actionSub.retry).toEqual({
            maxAttempts: 3,
            initialBackoffMs: 1000,
            base: 2,
          });
        }
      );
    });

    RuleScenario("Boolean retry config is passed through", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription with retry set to true", (_ctx: unknown) => {
        state.subscription = createAgentSubscription(state.agentDef!, {
          actionHandler: mockActionHandler,
          onComplete: mockOnComplete,
          retry: true,
        });
      });
      Then("the subscription retry is true", (_ctx: unknown) => {
        const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
        expect(actionSub.retry).toBe(true);
      });
    });

    RuleScenario("Retry field is absent when not specified", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription", whenCreateActionSubscription);
      Then("the subscription does not have a retry field", (_ctx: unknown) => {
        const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
        expect("retry" in actionSub).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: toWorkpoolContext produces correct shape
  // ===========================================================================

  Rule("toWorkpoolContext produces correct shape", ({ RuleScenario }) => {
    RuleScenario("toWorkpoolContext returns all required fields", ({ Given, When, Then, And }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      And(
        'a mock event "OrderCancelled" with streamId "order_123" at position 42',
        (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_123", "42")
      );
      And('a correlation chain with correlationId "corr_abc"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_abc")
      );
      When("I create an action subscription", whenCreateActionSubscription);
      And("I call toWorkpoolContext with the event and correlation chain", (_ctx: unknown) => {
        const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
        state.workpoolContext = actionSub.toWorkpoolContext!(
          state.event!,
          state.chain!,
          "agent:orders:llm-churn-risk"
        ) as unknown as Record<string, unknown>;
      });
      Then(
        "the workpool context has all expected fields:",
        (_ctx: unknown, dataTable: DataTableRow[]) => {
          for (const row of dataTable) {
            const field = row["field"]!;
            const expected = row["expected"]!;
            const actual = state.workpoolContext![field];
            // Handle numeric fields
            if (field === "globalPosition") {
              expect(actual).toBe(parseInt(expected, 10));
            } else {
              expect(actual).toBe(expected);
            }
          }
        }
      );
    });

    RuleScenario("causationId equals the event eventId", ({ Given, When, Then, And }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      And('a mock event "OrderRefunded" with streamId "order_789" at position 99', (ctx: unknown) =>
        givenMockEvent(ctx, "OrderRefunded", "order_789", "99")
      );
      And('a correlation chain with correlationId "corr_xyz"', (ctx: unknown) =>
        givenCorrelationChain(ctx, "corr_xyz")
      );
      When("I create an action subscription", whenCreateActionSubscription);
      And("I call toWorkpoolContext with the event and correlation chain", (_ctx: unknown) => {
        const actionSub = state.subscription as ActionSubscription<AgentEventHandlerArgs>;
        state.workpoolContext = actionSub.toWorkpoolContext!(
          state.event!,
          state.chain!,
          "sub_name"
        ) as unknown as Record<string, unknown>;
      });
      Then(
        'the workpool context causationId equals the event eventId "evt_99"',
        (_ctx: unknown) => {
          expect(state.workpoolContext!["causationId"]).toBe("evt_99");
          expect(state.workpoolContext!["causationId"]).toBe(state.event!.eventId);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Default priority is 250
  // ===========================================================================

  Rule("Default priority is 250", ({ RuleScenario }) => {
    RuleScenario("Subscription uses default priority of 250", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription", whenCreateActionSubscription);
      Then("the subscription priority is 250", (_ctx: unknown) => {
        expect(state.subscription!.priority).toBe(DEFAULT_AGENT_SUBSCRIPTION_PRIORITY);
        expect(state.subscription!.priority).toBe(250);
      });
    });

    RuleScenario("Subscription uses custom priority", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription with priority 300", (_ctx: unknown) => {
        state.subscription = createAgentSubscription(state.agentDef!, {
          actionHandler: mockActionHandler,
          onComplete: mockOnComplete,
          priority: 300,
        });
      });
      Then("the subscription priority is 300", (_ctx: unknown) => {
        expect(state.subscription!.priority).toBe(300);
      });
    });
  });

  // ===========================================================================
  // Rule: Subscription name follows agent naming convention
  // ===========================================================================

  Rule("Subscription name follows agent naming convention", ({ RuleScenario }) => {
    RuleScenario("Name includes context when provided", ({ Given, And, When, Then }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription", whenCreateActionSubscription);
      Then('the subscription name is "agent:orders:llm-churn-risk"', (_ctx: unknown) => {
        expect(state.subscription!.name).toBe("agent:orders:llm-churn-risk");
      });
    });

    RuleScenario("Name omits context when not provided", ({ Given, And, When, Then }) => {
      Given('a simple agent definition with id "simple-llm-agent"', (ctx: unknown) =>
        givenSimpleAgentDef(ctx, "simple-llm-agent")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription", whenCreateActionSubscription);
      Then('the subscription name is "agent:simple-llm-agent"', (_ctx: unknown) => {
        expect(state.subscription!.name).toBe("agent:simple-llm-agent");
      });
    });
  });

  // ===========================================================================
  // Rule: Event filtering uses configured event types
  // ===========================================================================

  Rule("Event filtering uses configured event types", ({ RuleScenario }) => {
    RuleScenario("Filter contains all configured event types", ({ Given, When, Then, And }) => {
      Given(
        'an LLM agent definition with id "llm-churn-risk" and context "orders"',
        (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
      );
      And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
      When("I create an action subscription", whenCreateActionSubscription);
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
    });
  });

  // ===========================================================================
  // Rule: toHandlerArgs transforms event to AgentEventHandlerArgs
  // ===========================================================================

  Rule("toHandlerArgs transforms event to AgentEventHandlerArgs", ({ RuleScenario }) => {
    RuleScenario(
      "toHandlerArgs produces correct AgentEventHandlerArgs",
      ({ Given, When, Then, And }) => {
        Given(
          'an LLM agent definition with id "llm-churn-risk" and context "orders"',
          (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
        );
        And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
        And(
          'a mock event "OrderCancelled" with streamId "order_123" at position 42',
          (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_123", "42")
        );
        And('a correlation chain with correlationId "corr_abc"', (ctx: unknown) =>
          givenCorrelationChain(ctx, "corr_abc")
        );
        When("I create an action subscription", whenCreateActionSubscription);
        And("I call toHandlerArgs with the event and correlation chain", (_ctx: unknown) => {
          state.handlerArgs = state.subscription!.toHandlerArgs(state.event!, state.chain!);
        });
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
  });

  // ===========================================================================
  // Rule: Partition key defaults to streamId
  // ===========================================================================

  Rule("Partition key defaults to streamId", ({ RuleScenario }) => {
    RuleScenario(
      "getPartitionKey returns streamId-based partition",
      ({ Given, When, Then, And }) => {
        Given(
          'an LLM agent definition with id "llm-churn-risk" and context "orders"',
          (ctx: unknown) => givenLlmAgentDef(ctx, "llm-churn-risk", "orders")
        );
        And("an action handler and onComplete reference", givenActionHandlerAndOnComplete);
        And(
          'a mock event "OrderCancelled" with streamId "order_456" at position 1',
          (ctx: unknown) => givenMockEvent(ctx, "OrderCancelled", "order_456", "1")
        );
        When("I create an action subscription", whenCreateActionSubscription);
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
      }
    );
  });
});
