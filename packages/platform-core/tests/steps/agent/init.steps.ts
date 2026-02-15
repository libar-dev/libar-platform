/**
 * Agent Init - Step Definitions
 *
 * BDD step definitions for agent initialization and configuration:
 * - validateAgentBCConfig: field validation, error codes
 * - toAgentHandlerArgs: event + correlation chain transformation
 * - generateSubscriptionId: deterministic ID generation
 * - initializeAgentBC: bootstrap, checkpoint creation, error handling
 *
 * Mechanical migration from tests/unit/agent/init.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  toAgentHandlerArgs,
  generateSubscriptionId,
  initializeAgentBC,
  AGENT_INIT_ERROR_CODES,
} from "../../../src/agent/init.js";
import type { AgentBCConfig } from "../../../src/agent/types.js";
import { validateAgentBCConfig, AGENT_CONFIG_ERROR_CODES } from "../../../src/agent/types.js";
import type { EventBus, PublishedEvent } from "../../../src/eventbus/types.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { AgentEventHandlerArgs } from "../../../src/agent/init.js";
import type { CorrelationChain } from "../../../src/correlation/types.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const testPattern: PatternDefinition = {
  name: "test-pattern",
  window: { duration: "7d" },
  trigger: () => true,
};

function createValidConfig(overrides: Partial<AgentBCConfig> = {}): Partial<AgentBCConfig> {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled"],
    patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
    confidenceThreshold: 0.9,
    patterns: [testPattern],
    ...overrides,
  };
}

function createTestPublishedEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_001",
    eventType: "OrderCancelled",
    streamType: "Order",
    streamId: "order-001",
    category: "domain",
    schemaVersion: 1,
    boundedContext: "orders",
    globalPosition: 100,
    timestamp: 1705320000000,
    payload: { orderId: "order-001", reason: "customer_request" },
    correlation: {
      correlationId: "corr_001",
      causationId: "cause_001",
    },
    ...overrides,
  };
}

function createTestCorrelationChain(): CorrelationChain {
  return {
    commandId: "cmd_001",
    correlationId: "corr_chain_001",
    causationId: "cause_chain_001",
    initiatedAt: 1705320000000,
  };
}

function createValidAgentConfig(overrides: Partial<AgentBCConfig> = {}): AgentBCConfig {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled"],
    patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
    confidenceThreshold: 0.9,
    patterns: [testPattern],
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  config: Partial<AgentBCConfig> | null;
  validationResult: { valid: boolean; code?: string; message?: string } | null;
  event: PublishedEvent | null;
  chain: CorrelationChain | null;
  handlerArgs: AgentEventHandlerArgs | null;
  subscriptionId: string | null;
  subscriptionId2: string | null;
  initResult: {
    success: boolean;
    handle?: {
      agentId: string;
      config: AgentBCConfig;
      subscription: { agentId: string; subscriptionName: string };
      checkpoint: {
        agentId: string;
        lastProcessedPosition: number;
        eventsProcessed: number;
        status: string;
      };
    };
    code?: string;
  } | null;
  mockEventBus: EventBus | null;
  mockHandler: FunctionReference<
    "mutation",
    FunctionVisibility,
    AgentEventHandlerArgs,
    void
  > | null;
  existingCheckpoint: {
    agentId: string;
    subscriptionId: string;
    lastProcessedPosition: number;
    lastEventId: string;
    status: "active";
    eventsProcessed: number;
    updatedAt: number;
  } | null;
}

function createInitialState(): TestState {
  return {
    config: null,
    validationResult: null,
    event: null,
    chain: null,
    handlerArgs: null,
    subscriptionId: null,
    subscriptionId2: null,
    initResult: null,
    mockEventBus: null,
    mockHandler: null,
    existingCheckpoint: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/init.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterAllScenarios }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterAllScenarios(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects invalid agent ID
  // ===========================================================================

  Rule("validateAgentBCConfig rejects invalid agent ID", ({ RuleScenario }) => {
    RuleScenario("Rejects empty string id", ({ Given, When, Then }) => {
      Given('a valid agent config with id overridden to ""', () => {
        state.config = createValidConfig({ id: "" });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "AGENT_ID_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
        }
      });
    });

    RuleScenario("Rejects undefined id", ({ Given, When, Then }) => {
      Given("a valid agent config with id deleted", () => {
        state.config = createValidConfig();
        delete (state.config as Record<string, unknown>).id;
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "AGENT_ID_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
        }
      });
    });

    RuleScenario("Rejects whitespace-only id", ({ Given, When, Then }) => {
      Given('a valid agent config with id overridden to "   "', () => {
        state.config = createValidConfig({ id: "   " });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "AGENT_ID_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects missing subscriptions
  // ===========================================================================

  Rule("validateAgentBCConfig rejects missing subscriptions", ({ RuleScenario }) => {
    RuleScenario("Rejects empty subscriptions array", ({ Given, When, Then }) => {
      Given("a valid agent config with subscriptions overridden to empty array", () => {
        state.config = createValidConfig({ subscriptions: [] });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "NO_SUBSCRIPTIONS"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_SUBSCRIPTIONS);
        }
      });
    });

    RuleScenario("Rejects undefined subscriptions", ({ Given, When, Then }) => {
      Given("a valid agent config with subscriptions deleted", () => {
        state.config = createValidConfig();
        delete (state.config as Record<string, unknown>).subscriptions;
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "NO_SUBSCRIPTIONS"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_SUBSCRIPTIONS);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects invalid confidence threshold
  // ===========================================================================

  Rule("validateAgentBCConfig rejects invalid confidence threshold", ({ RuleScenario }) => {
    RuleScenario("Rejects negative threshold", ({ Given, When, Then }) => {
      Given("a valid agent config with confidenceThreshold overridden to -0.1", () => {
        state.config = createValidConfig({ confidenceThreshold: -0.1 });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "INVALID_CONFIDENCE_THRESHOLD"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(
            AGENT_CONFIG_ERROR_CODES.INVALID_CONFIDENCE_THRESHOLD
          );
        }
      });
    });

    RuleScenario("Rejects threshold greater than 1", ({ Given, When, Then }) => {
      Given("a valid agent config with confidenceThreshold overridden to 1.5", () => {
        state.config = createValidConfig({ confidenceThreshold: 1.5 });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "INVALID_CONFIDENCE_THRESHOLD"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(
            AGENT_CONFIG_ERROR_CODES.INVALID_CONFIDENCE_THRESHOLD
          );
        }
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects invalid pattern window
  // ===========================================================================

  Rule("validateAgentBCConfig rejects invalid pattern window", ({ RuleScenario }) => {
    RuleScenario("Rejects empty pattern window duration", ({ Given, When, Then }) => {
      Given('a valid agent config with patternWindow duration overridden to ""', () => {
        state.config = createValidConfig({
          patternWindow: { duration: "" },
        });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "INVALID_PATTERN_WINDOW"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(
            AGENT_CONFIG_ERROR_CODES.INVALID_PATTERN_WINDOW
          );
        }
      });
    });

    RuleScenario("Rejects whitespace-only pattern window duration", ({ Given, When, Then }) => {
      Given('a valid agent config with patternWindow duration overridden to "   "', () => {
        state.config = createValidConfig({
          patternWindow: { duration: "   " },
        });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "INVALID_PATTERN_WINDOW"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(
            AGENT_CONFIG_ERROR_CODES.INVALID_PATTERN_WINDOW
          );
        }
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects conflicting approval rules
  // ===========================================================================

  Rule("validateAgentBCConfig rejects conflicting approval rules", ({ RuleScenario }) => {
    RuleScenario(
      "Rejects action in both requiresApproval and autoApprove",
      ({ Given, When, Then, And }) => {
        Given('a valid agent config with conflicting approval rules for "DeleteCustomer"', () => {
          state.config = createValidConfig({
            humanInLoop: {
              requiresApproval: ["DeleteCustomer", "TransferFunds"],
              autoApprove: ["DeleteCustomer"],
            },
          });
        });

        When("I validate the agent config", () => {
          state.validationResult = validateAgentBCConfig(
            state.config!
          ) as TestState["validationResult"];
        });

        Then('the validation result is invalid with code "CONFLICTING_APPROVAL_RULES"', () => {
          expect(state.validationResult!.valid).toBe(false);
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.code).toBe(
              AGENT_CONFIG_ERROR_CODES.CONFLICTING_APPROVAL_RULES
            );
          }
        });

        And('the validation error message contains "DeleteCustomer"', () => {
          expect(state.validationResult!.message).toContain("DeleteCustomer");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig rejects missing patterns
  // ===========================================================================

  Rule("validateAgentBCConfig rejects missing patterns", ({ RuleScenario }) => {
    RuleScenario("Rejects config with no patterns array", ({ Given, When, Then }) => {
      Given("a valid agent config with patterns deleted", () => {
        state.config = createValidConfig();
        delete (state.config as Record<string, unknown>).patterns;
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "NO_PATTERNS"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_PATTERNS);
        }
      });
    });

    RuleScenario("Rejects config with empty patterns array", ({ Given, When, Then }) => {
      Given("a valid agent config with patterns overridden to empty array", () => {
        state.config = createValidConfig({ patterns: [] });
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then('the validation result is invalid with code "NO_PATTERNS"', () => {
        expect(state.validationResult!.valid).toBe(false);
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_PATTERNS);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentBCConfig accepts valid configurations
  // ===========================================================================

  Rule("validateAgentBCConfig accepts valid configurations", ({ RuleScenario }) => {
    RuleScenario("Accepts valid config with patterns", ({ Given, When, Then }) => {
      Given("a valid agent config with default values", () => {
        state.config = createValidConfig();
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Accepts config without confidenceThreshold", ({ Given, When, Then }) => {
      Given("a valid agent config with confidenceThreshold deleted", () => {
        state.config = createValidConfig();
        delete (state.config as Record<string, unknown>).confidenceThreshold;
      });

      When("I validate the agent config", () => {
        state.validationResult = validateAgentBCConfig(
          state.config!
        ) as TestState["validationResult"];
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: toAgentHandlerArgs transforms event and correlation chain
  // ===========================================================================

  Rule("toAgentHandlerArgs transforms event and correlation chain", ({ RuleScenario }) => {
    RuleScenario("Transforms a standard event correctly", ({ Given, When, Then, And }) => {
      Given("a standard published event and correlation chain", () => {
        state.event = createTestPublishedEvent();
        state.chain = createTestCorrelationChain();
      });

      When('I transform to agent handler args with agentId "my-agent"', () => {
        state.handlerArgs = toAgentHandlerArgs(state.event!, state.chain!, "my-agent");
      });

      Then("the handler args contain the expected fields:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          field: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const field = row.field;
          const expected = row.value;
          const actual = (state.handlerArgs as unknown as Record<string, unknown>)[field];
          // Compare as strings since DataTable values are strings
          expect(String(actual)).toBe(expected);
        }
      });

      And("the handler args payload matches the event payload", () => {
        expect(state.handlerArgs!.payload).toEqual({
          orderId: "order-001",
          reason: "customer_request",
        });
      });
    });

    RuleScenario("Wraps array payload in _raw wrapper", ({ Given, When, Then }) => {
      Given("a published event with array payload", () => {
        state.event = createTestPublishedEvent({ payload: [1, 2, 3] });
        state.chain = createTestCorrelationChain();
      });

      When('I transform to agent handler args with agentId "agent-1"', () => {
        state.handlerArgs = toAgentHandlerArgs(state.event!, state.chain!, "agent-1");
      });

      Then("the handler args payload equals raw-wrapped array", () => {
        expect(state.handlerArgs!.payload).toEqual({ _raw: [1, 2, 3] });
      });
    });

    RuleScenario("Wraps null payload in _raw wrapper", ({ Given, When, Then }) => {
      Given("a published event with null payload", () => {
        state.event = createTestPublishedEvent({ payload: null });
        state.chain = createTestCorrelationChain();
      });

      When('I transform to agent handler args with agentId "agent-1"', () => {
        state.handlerArgs = toAgentHandlerArgs(state.event!, state.chain!, "agent-1");
      });

      Then("the handler args payload equals raw-wrapped null", () => {
        expect(state.handlerArgs!.payload).toEqual({ _raw: null });
      });
    });

    RuleScenario("Passes through object payloads without wrapping", ({ Given, When, Then }) => {
      Given("a published event with nested object payload", () => {
        state.event = createTestPublishedEvent({
          payload: { key: "value", nested: { a: 1 } },
        });
        state.chain = createTestCorrelationChain();
      });

      When('I transform to agent handler args with agentId "agent-1"', () => {
        state.handlerArgs = toAgentHandlerArgs(state.event!, state.chain!, "agent-1");
      });

      Then("the handler args payload matches the event payload", () => {
        expect(state.handlerArgs!.payload).toEqual({
          key: "value",
          nested: { a: 1 },
        });
      });
    });

    RuleScenario(
      "Uses correlationId from the chain not from the event",
      ({ Given, When, Then }) => {
        Given('a published event with its own correlationId "event_corr"', () => {
          state.event = createTestPublishedEvent({
            correlation: {
              correlationId: "event_corr",
              causationId: "event_cause",
            },
          });
          state.chain = createTestCorrelationChain();
        });

        When('I transform to agent handler args with agentId "agent-1"', () => {
          state.handlerArgs = toAgentHandlerArgs(state.event!, state.chain!, "agent-1");
        });

        Then('the handler args correlationId is "corr_chain_001"', () => {
          expect(state.handlerArgs!.correlationId).toBe("corr_chain_001");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: generateSubscriptionId produces deterministic agent-scoped IDs
  // ===========================================================================

  Rule("generateSubscriptionId produces deterministic agent-scoped IDs", ({ RuleScenario }) => {
    RuleScenario("Subscription ID starts with sub_ prefix", ({ Given, When, Then }) => {
      Given('the system time is fixed at "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
      });

      When('I generate a subscription ID for "my-agent"', () => {
        state.subscriptionId = generateSubscriptionId("my-agent");
      });

      Then('the subscription ID starts with "sub_"', () => {
        expect(state.subscriptionId!.startsWith("sub_")).toBe(true);
      });
    });

    RuleScenario("Subscription ID contains the agentId", ({ Given, When, Then }) => {
      Given('the system time is fixed at "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
      });

      When('I generate a subscription ID for "churn-risk-agent"', () => {
        state.subscriptionId = generateSubscriptionId("churn-risk-agent");
      });

      Then('the subscription ID contains "churn-risk-agent"', () => {
        expect(state.subscriptionId!).toContain("churn-risk-agent");
      });
    });

    RuleScenario("Subscription ID contains a timestamp segment", ({ Given, When, Then }) => {
      Given('the system time is fixed at "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
      });

      When('I generate a subscription ID for "my-agent"', () => {
        state.subscriptionId = generateSubscriptionId("my-agent");
      });

      Then("the subscription ID contains the current timestamp", () => {
        const timestamp = String(Date.now());
        expect(state.subscriptionId!).toContain(timestamp);
      });
    });

    RuleScenario("Produces different IDs when timestamp differs", ({ Given, When, Then }) => {
      Given('the system time is fixed at "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
      });

      When('I generate two subscription IDs for "my-agent" with 1ms between them', () => {
        state.subscriptionId = generateSubscriptionId("my-agent");
        vi.advanceTimersByTime(1);
        state.subscriptionId2 = generateSubscriptionId("my-agent");
      });

      Then("the two subscription IDs are different", () => {
        expect(state.subscriptionId).not.toBe(state.subscriptionId2);
      });
    });
  });

  // ===========================================================================
  // Rule: initializeAgentBC returns success handle for valid config
  // ===========================================================================

  Rule("initializeAgentBC returns success handle for valid config", ({ RuleScenario }) => {
    RuleScenario("Returns success with handle for a valid config", ({ Given, When, Then, And }) => {
      Given('a valid agent BC config with id "test-agent"', () => {
        state.config = createValidAgentConfig();
      });

      And("mock eventBus and handler dependencies", () => {
        state.mockEventBus = {} as EventBus;
        state.mockHandler = {} as FunctionReference<
          "mutation",
          FunctionVisibility,
          AgentEventHandlerArgs,
          void
        >;
      });

      When("I initialize the agent BC", () => {
        state.initResult = initializeAgentBC(state.config as AgentBCConfig, {
          eventBus: state.mockEventBus!,
          handler: state.mockHandler!,
        }) as TestState["initResult"];
      });

      Then("the initialization is successful", () => {
        expect(state.initResult!.success).toBe(true);
      });

      And("the handle has the expected properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        const handle = state.initResult!.handle!;
        for (const row of rows) {
          const prop = row.property;
          const expected = row.value;
          if (prop === "agentId") {
            expect(handle.agentId).toBe(expected);
          } else if (prop === "subscription.agentId") {
            expect(handle.subscription.agentId).toBe(expected);
          } else if (prop === "subscription.subscriptionName") {
            expect(handle.subscription.subscriptionName).toBe(expected);
          } else if (prop === "checkpoint.status") {
            expect(handle.checkpoint.status).toBe(expected);
          }
        }
      });
    });
  });

  // ===========================================================================
  // Rule: initializeAgentBC returns error for invalid config
  // ===========================================================================

  Rule("initializeAgentBC returns error for invalid config", ({ RuleScenario }) => {
    RuleScenario(
      "Returns error with INVALID_CONFIG code for invalid config",
      ({ Given, When, Then, And }) => {
        Given('a valid agent BC config with id ""', () => {
          state.config = createValidAgentConfig({ id: "" });
        });

        And("mock eventBus and handler dependencies", () => {
          state.mockEventBus = {} as EventBus;
          state.mockHandler = {} as FunctionReference<
            "mutation",
            FunctionVisibility,
            AgentEventHandlerArgs,
            void
          >;
        });

        When("I initialize the agent BC", () => {
          state.initResult = initializeAgentBC(state.config as AgentBCConfig, {
            eventBus: state.mockEventBus!,
            handler: state.mockHandler!,
          }) as TestState["initResult"];
        });

        Then('the initialization failed with code "INVALID_CONFIG"', () => {
          expect(state.initResult!.success).toBe(false);
          if (!state.initResult!.success) {
            expect(state.initResult!.code).toBe(AGENT_INIT_ERROR_CODES.INVALID_CONFIG);
          }
        });
      }
    );
  });

  // ===========================================================================
  // Rule: initializeAgentBC uses existing checkpoint when provided
  // ===========================================================================

  Rule("initializeAgentBC uses existing checkpoint when provided", ({ RuleScenario }) => {
    RuleScenario("Uses existing checkpoint when provided", ({ Given, When, Then, And }) => {
      Given('a valid agent BC config with id "test-agent"', () => {
        state.config = createValidAgentConfig();
      });

      And("mock eventBus and handler dependencies", () => {
        state.mockEventBus = {} as EventBus;
        state.mockHandler = {} as FunctionReference<
          "mutation",
          FunctionVisibility,
          AgentEventHandlerArgs,
          void
        >;
      });

      And("an existing checkpoint with lastProcessedPosition 200", () => {
        state.existingCheckpoint = {
          agentId: "test-agent",
          subscriptionId: "sub_existing",
          lastProcessedPosition: 200,
          lastEventId: "evt_200",
          status: "active" as const,
          eventsProcessed: 200,
          updatedAt: Date.now(),
        };
      });

      When("I initialize the agent BC with the existing checkpoint", () => {
        state.initResult = initializeAgentBC(state.config as AgentBCConfig, {
          eventBus: state.mockEventBus!,
          handler: state.mockHandler!,
          existingCheckpoint: state.existingCheckpoint!,
        }) as TestState["initResult"];
      });

      Then("the initialization is successful", () => {
        expect(state.initResult!.success).toBe(true);
      });

      And("the handle checkpoint has lastProcessedPosition 200", () => {
        expect(state.initResult!.handle!.checkpoint.lastProcessedPosition).toBe(200);
      });

      And('the handle checkpoint has status "active"', () => {
        expect(state.initResult!.handle!.checkpoint.status).toBe("active");
      });
    });
  });

  // ===========================================================================
  // Rule: initializeAgentBC creates new checkpoint when none provided
  // ===========================================================================

  Rule("initializeAgentBC creates new checkpoint when none provided", ({ RuleScenario }) => {
    RuleScenario(
      "Creates a new checkpoint when no existing checkpoint provided",
      ({ Given, When, Then, And }) => {
        Given('a valid agent BC config with id "fresh-agent"', () => {
          state.config = createValidAgentConfig({ id: "fresh-agent" });
        });

        And("mock eventBus and handler dependencies", () => {
          state.mockEventBus = {} as EventBus;
          state.mockHandler = {} as FunctionReference<
            "mutation",
            FunctionVisibility,
            AgentEventHandlerArgs,
            void
          >;
        });

        When("I initialize the agent BC", () => {
          state.initResult = initializeAgentBC(state.config as AgentBCConfig, {
            eventBus: state.mockEventBus!,
            handler: state.mockHandler!,
          }) as TestState["initResult"];
        });

        Then("the initialization is successful", () => {
          expect(state.initResult!.success).toBe(true);
        });

        And('the handle checkpoint has agentId "fresh-agent"', () => {
          expect(state.initResult!.handle!.checkpoint.agentId).toBe("fresh-agent");
        });

        And("the handle checkpoint has lastProcessedPosition -1", () => {
          expect(state.initResult!.handle!.checkpoint.lastProcessedPosition).toBe(-1);
        });

        And("the handle checkpoint has eventsProcessed 0", () => {
          expect(state.initResult!.handle!.checkpoint.eventsProcessed).toBe(0);
        });

        And('the handle checkpoint has status "active"', () => {
          expect(state.initResult!.handle!.checkpoint.status).toBe("active");
        });
      }
    );
  });
});
