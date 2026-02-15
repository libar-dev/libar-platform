/**
 * Agent Action Handler - Step Definitions
 *
 * BDD step definitions for createAgentActionHandler() including:
 * - Idempotency (skipping already-processed events)
 * - Skipping inactive agents
 * - Normal processing (first event, null checkpoint)
 * - Rule-based analysis when pattern has no analyze function
 * - Error propagation when pattern executor throws
 * - Deterministic decisionId format
 * - Patterns mode integration (rule-based, LLM analyze, no match)
 *
 * Mechanical migration from tests/unit/agent/action-handler.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createAgentActionHandler,
  type AgentActionState,
  type AgentActionResult,
} from "../../../src/agent/action-handler.js";
import type { AgentBCConfig } from "../../../src/agent/types.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";
import type { AgentEventHandlerArgs } from "../../../src/agent/init.js";
import { createMockAgentRuntime } from "../../../src/agent/init.js";
import type { AgentCheckpoint } from "../../../src/agent/checkpoint.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const defaultTestPattern: PatternDefinition = {
  name: "test-pattern",
  window: { duration: "7d" },
  trigger: () => true,
};

function createTestHandlerArgs(
  overrides: Partial<AgentEventHandlerArgs> = {}
): AgentEventHandlerArgs {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCancelled",
    globalPosition: 100,
    correlationId: "corr_001",
    streamType: "Order",
    streamId: "order-001",
    payload: { orderId: "order-001", reason: "customer_request" },
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    agentId: "test-agent",
    ...overrides,
  };
}

function createTestCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    lastProcessedPosition: 50,
    lastEventId: "evt_prev_123",
    status: "active",
    eventsProcessed: 50,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createTestAgentConfig(overrides: Partial<AgentBCConfig> = {}): AgentBCConfig {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled", "OrderCreated"],
    patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
    confidenceThreshold: 0.9,
    patterns: [defaultTestPattern],
    ...overrides,
  };
}

function createTestState(overrides: Partial<AgentActionState> = {}): AgentActionState {
  return {
    checkpoint: createTestCheckpoint(),
    eventHistory: [],
    injectedData: {},
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  agentConfig: AgentBCConfig | null;
  loadState: ReturnType<typeof vi.fn> | null;
  runtime:
    | ReturnType<typeof createMockAgentRuntime>
    | { analyze: ReturnType<typeof vi.fn>; reason: ReturnType<typeof vi.fn> }
    | null;
  result: AgentActionResult | null | undefined;
  result2: AgentActionResult | null | undefined;
  caughtError: Error | null;
}

function createInitialState(): TestState {
  return {
    agentConfig: null,
    loadState: null,
    runtime: null,
    result: undefined,
    result2: undefined,
    caughtError: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: build handler and invoke
// =============================================================================

function buildHandler() {
  return createAgentActionHandler({
    agentConfig: state.agentConfig!,
    runtime: (state.runtime ?? createMockAgentRuntime()) as ReturnType<
      typeof createMockAgentRuntime
    >,
    loadState: state.loadState!,
  });
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/action-handler.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Rule: Idempotency via checkpoint position
  // ===========================================================================

  Rule("Idempotency via checkpoint position", ({ RuleScenario }) => {
    RuleScenario(
      "Returns null when checkpoint position equals event position",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And('a checkpoint with lastProcessedPosition 100 and status "active"', () => {
          state.loadState = vi.fn().mockResolvedValue(
            createTestState({
              checkpoint: createTestCheckpoint({
                lastProcessedPosition: 100,
                status: "active",
              }),
            })
          );
        });
        When("I invoke the handler with globalPosition 100", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs({ globalPosition: 100 }));
        });
        Then("the result is null", () => {
          expect(state.result).toBeNull();
        });
      }
    );

    RuleScenario(
      "Returns null when checkpoint position exceeds event position",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And('a checkpoint with lastProcessedPosition 200 and status "active"', () => {
          state.loadState = vi.fn().mockResolvedValue(
            createTestState({
              checkpoint: createTestCheckpoint({
                lastProcessedPosition: 200,
                status: "active",
              }),
            })
          );
        });
        When("I invoke the handler with globalPosition 100", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs({ globalPosition: 100 }));
        });
        Then("the result is null", () => {
          expect(state.result).toBeNull();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Inactive agent handling
  // ===========================================================================

  Rule("Inactive agent handling", ({ RuleScenario }) => {
    RuleScenario("Returns null when agent status is paused", ({ Given, And, When, Then }) => {
      Given("an agent config with default test pattern", () => {
        state.agentConfig = createTestAgentConfig();
      });
      And('a checkpoint with lastProcessedPosition 50 and status "paused"', () => {
        state.loadState = vi.fn().mockResolvedValue(
          createTestState({
            checkpoint: createTestCheckpoint({
              lastProcessedPosition: 50,
              status: "paused",
            }),
          })
        );
      });
      When("I invoke the handler with globalPosition 100", async () => {
        const handler = buildHandler();
        state.result = await handler({}, createTestHandlerArgs({ globalPosition: 100 }));
      });
      Then("the result is null", () => {
        expect(state.result).toBeNull();
      });
    });

    RuleScenario("Returns null when agent status is stopped", ({ Given, And, When, Then }) => {
      Given("an agent config with default test pattern", () => {
        state.agentConfig = createTestAgentConfig();
      });
      And('a checkpoint with lastProcessedPosition 50 and status "stopped"', () => {
        state.loadState = vi.fn().mockResolvedValue(
          createTestState({
            checkpoint: createTestCheckpoint({
              lastProcessedPosition: 50,
              status: "stopped",
            }),
          })
        );
      });
      When("I invoke the handler with globalPosition 100", async () => {
        const handler = buildHandler();
        state.result = await handler({}, createTestHandlerArgs({ globalPosition: 100 }));
      });
      Then("the result is null", () => {
        expect(state.result).toBeNull();
      });
    });

    RuleScenario(
      "Returns null when agent status is error_recovery",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And('a checkpoint with lastProcessedPosition 50 and status "error_recovery"', () => {
          state.loadState = vi.fn().mockResolvedValue(
            createTestState({
              checkpoint: createTestCheckpoint({
                lastProcessedPosition: 50,
                status: "error_recovery",
              }),
            })
          );
        });
        When("I invoke the handler with globalPosition 100", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs({ globalPosition: 100 }));
        });
        Then("the result is null", () => {
          expect(state.result).toBeNull();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Normal processing for new events
  // ===========================================================================

  Rule("Normal processing for new events", ({ RuleScenario }) => {
    RuleScenario(
      "Processes normally when checkpoint is null (first event)",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When("I invoke the handler with globalPosition 1", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs({ globalPosition: 1 }));
        });
        Then("the result is not null", () => {
          expect(state.result).not.toBeNull();
        });
        And("the result has the following properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
          for (const row of rows) {
            expect((state.result as Record<string, unknown>)![row.property]).toBe(row.value);
          }
        });
        And("the decision is not null", () => {
          expect(state.result!.decision).not.toBeNull();
        });
      }
    );

    RuleScenario(
      "Returns rule-based analysis when pattern has no analyze function",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When("I invoke the handler with default args", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs());
        });
        Then("the result is not null", () => {
          expect(state.result).not.toBeNull();
        });
        And('the result analysisMethod is "rule-based"', () => {
          expect(state.result!.analysisMethod).toBe("rule-based");
        });
        And("the result llmMetrics is undefined", () => {
          expect(state.result!.llmMetrics).toBeUndefined();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Error propagation for Workpool retry
  // ===========================================================================

  Rule("Error propagation for Workpool retry", ({ RuleScenario }) => {
    RuleScenario("Re-throws when pattern trigger throws", ({ Given, And, When, Then }) => {
      Given('an agent config with a throwing pattern "Handler crashed"', () => {
        const throwingPattern: PatternDefinition = {
          name: "throws-pattern",
          window: { duration: "7d" },
          trigger: () => {
            throw new Error("Handler crashed");
          },
        };
        state.agentConfig = createTestAgentConfig({ patterns: [throwingPattern] });
      });
      And("a null checkpoint", () => {
        state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
      });
      When("I invoke the handler with default args expecting error", async () => {
        const handler = buildHandler();
        try {
          await handler({}, createTestHandlerArgs());
        } catch (err) {
          state.caughtError = err as Error;
        }
      });
      Then('the error message is "Handler crashed"', () => {
        expect(state.caughtError).not.toBeNull();
        expect(state.caughtError!.message).toBe("Handler crashed");
      });
    });

    RuleScenario("Propagates loadState errors for Workpool retry", ({ Given, And, When, Then }) => {
      Given("an agent config with default test pattern", () => {
        state.agentConfig = createTestAgentConfig();
      });
      And('a loadState that rejects with "DB connection lost"', () => {
        state.loadState = vi.fn().mockRejectedValue(new Error("DB connection lost"));
      });
      When("I invoke the handler with default args expecting error", async () => {
        const handler = buildHandler();
        try {
          await handler({}, createTestHandlerArgs());
        } catch (err) {
          state.caughtError = err as Error;
        }
      });
      Then('the error message is "DB connection lost"', () => {
        expect(state.caughtError).not.toBeNull();
        expect(state.caughtError!.message).toBe("DB connection lost");
      });
    });
  });

  // ===========================================================================
  // Rule: Deterministic decisionId format
  // ===========================================================================

  Rule("Deterministic decisionId format", ({ RuleScenario }) => {
    RuleScenario(
      "Generates deterministic decisionId from agentId and globalPosition",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When(
          'I invoke the handler with agentId "churn-risk-agent" and globalPosition 42',
          async () => {
            const handler = buildHandler();
            state.result = await handler(
              {},
              createTestHandlerArgs({ agentId: "churn-risk-agent", globalPosition: 42 })
            );
          }
        );
        Then("the result is not null", () => {
          expect(state.result).not.toBeNull();
        });
        And('the result decisionId is "dec_churn-risk-agent_42"', () => {
          expect(state.result!.decisionId).toBe("dec_churn-risk-agent_42");
        });
      }
    );

    RuleScenario(
      "Generates same decisionId for same inputs (deterministic)",
      ({ Given, And, When, Then }) => {
        Given("an agent config with default test pattern", () => {
          state.agentConfig = createTestAgentConfig();
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When(
          'I invoke the handler twice with agentId "agent-x" and globalPosition 99',
          async () => {
            const handler = buildHandler();
            state.result = await handler(
              {},
              createTestHandlerArgs({ agentId: "agent-x", globalPosition: 99 })
            );
            state.result2 = await handler(
              {},
              createTestHandlerArgs({ agentId: "agent-x", globalPosition: 99 })
            );
          }
        );
        Then('both results have decisionId "dec_agent-x_99"', () => {
          expect(state.result!.decisionId).toBe(state.result2!.decisionId);
          expect(state.result!.decisionId).toBe("dec_agent-x_99");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Patterns mode integration
  // ===========================================================================

  Rule("Patterns mode integration", ({ RuleScenario }) => {
    RuleScenario(
      "Returns patternId and rule-based decision when pattern triggers",
      ({ Given, And, When, Then }) => {
        Given('an agent config with a "churn-risk" pattern that always triggers', () => {
          const pattern: PatternDefinition = {
            name: "churn-risk",
            window: { duration: "7d" },
            trigger: () => true,
          };
          state.agentConfig = createTestAgentConfig({ patterns: [pattern] });
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When("I invoke the handler with default args", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs());
        });
        Then("the result is not null", () => {
          expect(state.result).not.toBeNull();
        });
        And(
          "the result has the following pattern properties:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
            for (const row of rows) {
              expect((state.result as Record<string, unknown>)![row.property]).toBe(row.value);
            }
          }
        );
        And("the decision is not null", () => {
          expect(state.result!.decision).not.toBeNull();
        });
        And("the decision command is null", () => {
          expect(state.result!.decision!.command).toBeNull();
        });
      }
    );

    RuleScenario(
      "Returns llm analysis method when pattern has analyze function",
      ({ Given, And, When, Then }) => {
        Given('an agent config with a "fraud-detection" pattern that has LLM analyze', () => {
          const pattern: PatternDefinition = {
            name: "fraud-detection",
            window: { duration: "7d" },
            trigger: () => true,
            analyze: vi.fn().mockResolvedValue({
              detected: true,
              confidence: 0.95,
              reasoning: "Fraud pattern detected by LLM",
              matchingEventIds: ["evt_test_123"],
              command: { type: "FlagFraud", payload: { severity: "high" } },
            }),
          };
          state.agentConfig = createTestAgentConfig({ patterns: [pattern] });
        });
        And("a null checkpoint", () => {
          state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
        });
        When("I invoke the handler with default args", async () => {
          const handler = buildHandler();
          state.result = await handler({}, createTestHandlerArgs());
        });
        Then("the result is not null", () => {
          expect(state.result).not.toBeNull();
        });
        And(
          "the result has the following pattern properties:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
            for (const row of rows) {
              expect((state.result as Record<string, unknown>)![row.property]).toBe(row.value);
            }
          }
        );
        And('the decision command is "FlagFraud"', () => {
          expect(state.result!.decision!.command).toBe("FlagFraud");
        });
        And("the decision confidence is 0.95", () => {
          expect(state.result!.decision!.confidence).toBe(0.95);
        });
      }
    );

    RuleScenario("Returns no patternId when no pattern matches", ({ Given, And, When, Then }) => {
      Given("an agent config with a pattern that never triggers", () => {
        const pattern: PatternDefinition = {
          name: "no-trigger",
          window: { duration: "7d" },
          trigger: () => false,
        };
        state.agentConfig = createTestAgentConfig({ patterns: [pattern] });
      });
      And("a null checkpoint", () => {
        state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
      });
      When("I invoke the handler with default args", async () => {
        const handler = buildHandler();
        state.result = await handler({}, createTestHandlerArgs());
      });
      Then("the result is not null", () => {
        expect(state.result).not.toBeNull();
      });
      And("the result patternId is undefined", () => {
        expect(state.result!.patternId).toBeUndefined();
      });
      And("the decision is null", () => {
        expect(state.result!.decision).toBeNull();
      });
    });

    RuleScenario("Does not invoke LLM enrichment via runtime", ({ Given, And, When, Then }) => {
      Given("an agent config with a rule-only pattern and a spy runtime", () => {
        const pattern: PatternDefinition = {
          name: "rule-only",
          window: { duration: "7d" },
          trigger: () => true,
        };
        state.agentConfig = createTestAgentConfig({ patterns: [pattern] });
        state.runtime = {
          analyze: vi.fn().mockResolvedValue({
            patterns: [],
            confidence: 0,
            reasoning: "Should not be called",
          }),
          reason: vi.fn(),
        };
      });
      And("a null checkpoint", () => {
        state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
      });
      When("I invoke the handler with default args", async () => {
        const handler = buildHandler();
        state.result = await handler({}, createTestHandlerArgs());
      });
      Then("the result is not null", () => {
        expect(state.result).not.toBeNull();
      });
      And("the runtime analyze was not called", () => {
        const rt = state.runtime as { analyze: ReturnType<typeof vi.fn> };
        expect(rt.analyze).not.toHaveBeenCalled();
      });
      And("the result llmMetrics is undefined", () => {
        expect(state.result!.llmMetrics).toBeUndefined();
      });
    });

    RuleScenario("Re-throws when pattern executor fails", ({ Given, And, When, Then }) => {
      Given('an agent config with a throwing pattern "Trigger exploded"', () => {
        const throwingPattern: PatternDefinition = {
          name: "throws-pattern",
          window: { duration: "7d" },
          trigger: () => {
            throw new Error("Trigger exploded");
          },
        };
        state.agentConfig = createTestAgentConfig({ patterns: [throwingPattern] });
      });
      And("a null checkpoint", () => {
        state.loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));
      });
      When("I invoke the handler with default args expecting error", async () => {
        const handler = buildHandler();
        try {
          await handler({}, createTestHandlerArgs());
        } catch (err) {
          state.caughtError = err as Error;
        }
      });
      Then('the error message is "Trigger exploded"', () => {
        expect(state.caughtError).not.toBeNull();
        expect(state.caughtError!.message).toBe("Trigger exploded");
      });
    });
  });
});
