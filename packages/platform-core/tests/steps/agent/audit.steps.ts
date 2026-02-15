/**
 * Agent Audit Trail - Step Definitions
 *
 * BDD step definitions for the agent audit trail functionality including:
 * - Decision ID generation
 * - Audit event factory functions
 * - Type guards
 * - Schema validation
 *
 * Mechanical migration from tests/unit/agent/audit.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  // Event types
  AGENT_AUDIT_EVENT_TYPES,
  isAgentAuditEventType,
  // Schemas
  AgentAuditEventTypeSchema,
  AuditLLMContextSchema,
  AuditActionSchema,
  PatternDetectedPayloadSchema,
  ApprovalGrantedPayloadSchema,
  ApprovalRejectedPayloadSchema,
  ApprovalExpiredPayloadSchema,
  AgentAuditEventSchema,
  // ID generation
  generateDecisionId,
  // Factory functions
  createPatternDetectedAudit,
  createApprovalGrantedAudit,
  createApprovalRejectedAudit,
  createApprovalExpiredAudit,
  createGenericAuditEvent,
  // Type guards
  isPatternDetectedEvent,
  isApprovalGrantedEvent,
  isApprovalRejectedEvent,
  // Validation
  validateAgentAuditEvent,
  // Types
  type AgentAuditEvent,
  type PatternDetectedPayload,
  type AuditAction,
} from "../../../src/agent/audit.js";
import type { LLMContext } from "../../../src/agent/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestLLMContext(overrides: Partial<LLMContext> = {}): LLMContext {
  return {
    model: "gpt-4",
    tokens: 1500,
    durationMs: 2500,
    ...overrides,
  };
}

function createTestAuditAction(overrides: Partial<AuditAction> = {}): AuditAction {
  return {
    type: "SuggestOutreach",
    executionMode: "flag-for-review",
    ...overrides,
  };
}

function createTestDecisionPayload(
  overrides: Partial<PatternDetectedPayload> = {}
): PatternDetectedPayload {
  return {
    patternDetected: "churn-risk",
    confidence: 0.85,
    reasoning: "Customer cancelled 3 orders in 30 days",
    action: createTestAuditAction(),
    triggeringEvents: ["evt-1", "evt-2", "evt-3"],
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  event: AgentAuditEvent | null;
  detection: AgentAuditEvent | null;
  approval: AgentAuditEvent | null;
  rejection: AgentAuditEvent | null;
  expiration: AgentAuditEvent | null;
  decisionId: string | null;
  decisionIds: Set<string>;
  llmContext: Record<string, unknown> | null;
  auditAction: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  approvalPayload: Record<string, unknown> | null;
  rejectedPayload: Record<string, unknown> | null;
  expiredPayload: Record<string, unknown> | null;
  fullEvent: Record<string, unknown> | null;
  requestedAt: number;
  fakeNow: number;
  useFakeTimers: boolean;
}

function createInitialState(): TestState {
  return {
    event: null,
    detection: null,
    approval: null,
    rejection: null,
    expiration: null,
    decisionId: null,
    decisionIds: new Set(),
    llmContext: null,
    auditAction: null,
    payload: null,
    approvalPayload: null,
    rejectedPayload: null,
    expiredPayload: null,
    fullEvent: null,
    requestedAt: 0,
    fakeNow: 0,
    useFakeTimers: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/audit.feature");

const FAKE_TIME = new Date("2024-01-15T12:00:00Z").getTime();

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    state.fakeNow = FAKE_TIME;
    state.useFakeTimers = true;
  });

  AfterEachScenario(() => {
    if (state.useFakeTimers) {
      vi.useRealTimers();
      state.useFakeTimers = false;
    }
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are done at module level
    });
  });

  // ===========================================================================
  // Rule: AGENT_AUDIT_EVENT_TYPES contains all canonical event types
  // ===========================================================================

  Rule("AGENT_AUDIT_EVENT_TYPES contains all canonical event types", ({ RuleScenario }) => {
    RuleScenario("Contains all DS-1 base event types", ({ Then }) => {
      Then(
        "AGENT_AUDIT_EVENT_TYPES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(AGENT_AUDIT_EVENT_TYPES).toContain(row.value);
          }
        }
      );
    });

    RuleScenario("Contains all DS-4 command routing event types", ({ Then }) => {
      Then(
        "AGENT_AUDIT_EVENT_TYPES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(AGENT_AUDIT_EVENT_TYPES).toContain(row.value);
          }
        }
      );
    });

    RuleScenario("Contains all DS-5 lifecycle event types", ({ Then }) => {
      Then(
        "AGENT_AUDIT_EVENT_TYPES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(AGENT_AUDIT_EVENT_TYPES).toContain(row.value);
          }
        }
      );
    });

    RuleScenario("Contains DS-6 failure tracking event type", ({ Then }) => {
      Then(
        "AGENT_AUDIT_EVENT_TYPES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(AGENT_AUDIT_EVENT_TYPES).toContain(row.value);
          }
        }
      );
    });

    RuleScenario("Has exactly 17 event types", ({ Then }) => {
      Then("AGENT_AUDIT_EVENT_TYPES has length 17", () => {
        expect(AGENT_AUDIT_EVENT_TYPES.length).toBe(17);
      });
    });
  });

  // ===========================================================================
  // Rule: isAgentAuditEventType validates event type strings
  // ===========================================================================

  Rule("isAgentAuditEventType validates event type strings", ({ RuleScenario }) => {
    RuleScenario("Returns true for all valid event type strings", ({ Then }) => {
      Then("isAgentAuditEventType returns true for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          expect(isAgentAuditEventType(row.value)).toBe(true);
        }
      });
    });

    RuleScenario("Returns false for invalid values", ({ Then }) => {
      Then("isAgentAuditEventType returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          expect(isAgentAuditEventType(row.value)).toBe(false);
        }
      });
    });

    RuleScenario("Returns false for non-string values", ({ Then }) => {
      Then("isAgentAuditEventType returns false for non-string values", () => {
        expect(isAgentAuditEventType(123)).toBe(false);
        expect(isAgentAuditEventType(null)).toBe(false);
        expect(isAgentAuditEventType(undefined)).toBe(false);
        expect(isAgentAuditEventType({})).toBe(false);
        expect(isAgentAuditEventType(["PatternDetected"])).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: AgentAuditEventTypeSchema validates via Zod
  // ===========================================================================

  Rule("AgentAuditEventTypeSchema validates via Zod", ({ RuleScenario }) => {
    RuleScenario("Accepts all valid event types", ({ Then }) => {
      Then("AgentAuditEventTypeSchema accepts all AGENT_AUDIT_EVENT_TYPES entries", () => {
        for (const eventType of AGENT_AUDIT_EVENT_TYPES) {
          const result = AgentAuditEventTypeSchema.safeParse(eventType);
          expect(result.success).toBe(true);
        }
      });
    });

    RuleScenario("Rejects invalid event types", ({ Then }) => {
      Then(
        "AgentAuditEventTypeSchema rejects the following values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            const result = AgentAuditEventTypeSchema.safeParse(row.value);
            expect(result.success).toBe(false);
          }
        }
      );
    });

    RuleScenario("Rejects non-string values via Zod", ({ Then }) => {
      Then("AgentAuditEventTypeSchema rejects numeric 123 and null", () => {
        expect(AgentAuditEventTypeSchema.safeParse(123).success).toBe(false);
        expect(AgentAuditEventTypeSchema.safeParse(null).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: AuditLLMContextSchema validates LLM context objects
  // ===========================================================================

  Rule("AuditLLMContextSchema validates LLM context objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid LLM context", ({ Given, Then }) => {
      Given('an LLM context with model "gpt-4" and tokens 1500 and duration 2500', () => {
        state.llmContext = { model: "gpt-4", tokens: 1500, duration: 2500 };
      });
      Then("the LLM context passes AuditLLMContextSchema validation", () => {
        expect(AuditLLMContextSchema.safeParse(state.llmContext).success).toBe(true);
      });
    });

    RuleScenario("Rejects negative tokens", ({ Given, Then }) => {
      Given('an LLM context with model "gpt-4" and tokens -100 and duration 2500', () => {
        state.llmContext = {
          model: "gpt-4",
          tokens: -100,
          duration: 2500,
        };
      });
      Then("the LLM context fails AuditLLMContextSchema validation", () => {
        expect(AuditLLMContextSchema.safeParse(state.llmContext).success).toBe(false);
      });
    });

    RuleScenario("Rejects negative duration", ({ Given, Then }) => {
      Given('an LLM context with model "gpt-4" and tokens 1500 and duration -100', () => {
        state.llmContext = {
          model: "gpt-4",
          tokens: 1500,
          duration: -100,
        };
      });
      Then("the LLM context fails AuditLLMContextSchema validation", () => {
        expect(AuditLLMContextSchema.safeParse(state.llmContext).success).toBe(false);
      });
    });

    RuleScenario("Rejects non-integer tokens", ({ Given, Then }) => {
      Given('an LLM context with model "gpt-4" and tokens 1500.5 and duration 2500', () => {
        state.llmContext = {
          model: "gpt-4",
          tokens: 1500.5,
          duration: 2500,
        };
      });
      Then("the LLM context fails AuditLLMContextSchema validation", () => {
        expect(AuditLLMContextSchema.safeParse(state.llmContext).success).toBe(false);
      });
    });

    RuleScenario("Accepts zero values", ({ Given, Then }) => {
      Given('an LLM context with model "test" and tokens 0 and duration 0', () => {
        state.llmContext = { model: "test", tokens: 0, duration: 0 };
      });
      Then("the LLM context passes AuditLLMContextSchema validation", () => {
        expect(AuditLLMContextSchema.safeParse(state.llmContext).success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: AuditActionSchema validates action objects
  // ===========================================================================

  Rule("AuditActionSchema validates action objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid action with flag-for-review", ({ Given, Then }) => {
      Given(
        'an audit action with type "SuggestOutreach" and executionMode "flag-for-review"',
        () => {
          state.auditAction = {
            type: "SuggestOutreach",
            executionMode: "flag-for-review",
          };
        }
      );
      Then("the audit action passes AuditActionSchema validation", () => {
        expect(AuditActionSchema.safeParse(state.auditAction).success).toBe(true);
      });
    });

    RuleScenario("Accepts valid action with auto-execute", ({ Given, Then }) => {
      Given('an audit action with type "LogEvent" and executionMode "auto-execute"', () => {
        state.auditAction = {
          type: "LogEvent",
          executionMode: "auto-execute",
        };
      });
      Then("the audit action passes AuditActionSchema validation", () => {
        expect(AuditActionSchema.safeParse(state.auditAction).success).toBe(true);
      });
    });

    RuleScenario("Rejects action with empty type", ({ Given, Then }) => {
      Given('an audit action with type "" and executionMode "flag-for-review"', () => {
        state.auditAction = {
          type: "",
          executionMode: "flag-for-review",
        };
      });
      Then("the audit action fails AuditActionSchema validation", () => {
        expect(AuditActionSchema.safeParse(state.auditAction).success).toBe(false);
      });
    });

    RuleScenario("Rejects action with invalid executionMode", ({ Given, Then }) => {
      Given('an audit action with type "SuggestOutreach" and executionMode "invalid"', () => {
        state.auditAction = {
          type: "SuggestOutreach",
          executionMode: "invalid",
        };
      });
      Then("the audit action fails AuditActionSchema validation", () => {
        expect(AuditActionSchema.safeParse(state.auditAction).success).toBe(false);
      });
    });

    RuleScenario("Rejects action with extra fields in strict mode", ({ Given, Then }) => {
      Given(
        'an audit action with type "Test" and executionMode "auto-execute" and extra field',
        () => {
          state.auditAction = {
            type: "Test",
            executionMode: "auto-execute",
            extra: "field",
          };
        }
      );
      Then("the audit action fails AuditActionSchema validation", () => {
        expect(AuditActionSchema.safeParse(state.auditAction).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: PatternDetectedPayloadSchema validates pattern payloads
  // ===========================================================================

  Rule("PatternDetectedPayloadSchema validates pattern payloads", ({ RuleScenario }) => {
    RuleScenario("Accepts valid payload with action", ({ Given, Then }) => {
      Given("a valid pattern detected payload", () => {
        state.payload = createTestDecisionPayload();
      });
      Then("the payload passes PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(true);
      });
    });

    RuleScenario("Accepts payload with null patternDetected", ({ Given, Then }) => {
      Given("a pattern detected payload with null patternDetected", () => {
        state.payload = createTestDecisionPayload({
          patternDetected: null,
        });
      });
      Then("the payload passes PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(true);
      });
    });

    RuleScenario("Accepts payload with null action", ({ Given, Then }) => {
      Given("a pattern detected payload with null action", () => {
        state.payload = createTestDecisionPayload({ action: null });
      });
      Then("the payload passes PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(true);
      });
    });

    RuleScenario("Accepts payload with LLM context", ({ Given, Then }) => {
      Given("a pattern detected payload with LLM context", () => {
        state.payload = {
          ...createTestDecisionPayload(),
          llmContext: { model: "gpt-4", tokens: 1500, duration: 2500 },
        };
      });
      Then("the payload passes PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(true);
      });
    });

    RuleScenario("Rejects payload with confidence below 0", ({ Given, Then }) => {
      Given("a pattern detected payload with confidence -0.1", () => {
        state.payload = createTestDecisionPayload({ confidence: -0.1 });
      });
      Then("the payload fails PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(false);
      });
    });

    RuleScenario("Rejects payload with confidence above 1", ({ Given, Then }) => {
      Given("a pattern detected payload with confidence 1.5", () => {
        state.payload = createTestDecisionPayload({ confidence: 1.5 });
      });
      Then("the payload fails PatternDetectedPayloadSchema validation", () => {
        expect(PatternDetectedPayloadSchema.safeParse(state.payload).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: ApprovalGrantedPayloadSchema validates approval payloads
  // ===========================================================================

  Rule("ApprovalGrantedPayloadSchema validates approval payloads", ({ RuleScenario }) => {
    RuleScenario("Accepts valid approval granted payload", ({ Given, Then }) => {
      Given("a valid approval granted payload", () => {
        state.approvalPayload = {
          actionId: "action-123",
          reviewerId: "user-456",
          reviewedAt: Date.now(),
        };
      });
      Then("the approval granted payload passes validation", () => {
        expect(ApprovalGrantedPayloadSchema.safeParse(state.approvalPayload).success).toBe(true);
      });
    });

    RuleScenario("Accepts payload with reviewNote", ({ Given, Then }) => {
      Given('an approval granted payload with reviewNote "Looks good!"', () => {
        state.approvalPayload = {
          actionId: "action-123",
          reviewerId: "user-456",
          reviewedAt: Date.now(),
          reviewNote: "Looks good!",
        };
      });
      Then("the approval granted payload passes validation", () => {
        expect(ApprovalGrantedPayloadSchema.safeParse(state.approvalPayload).success).toBe(true);
      });
    });

    RuleScenario("Rejects payload with empty actionId", ({ Given, Then }) => {
      Given("an approval granted payload with empty actionId", () => {
        state.approvalPayload = {
          actionId: "",
          reviewerId: "user-456",
          reviewedAt: Date.now(),
        };
      });
      Then("the approval granted payload fails validation", () => {
        expect(ApprovalGrantedPayloadSchema.safeParse(state.approvalPayload).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: ApprovalRejectedPayloadSchema validates rejection payloads
  // ===========================================================================

  Rule("ApprovalRejectedPayloadSchema validates rejection payloads", ({ RuleScenario }) => {
    RuleScenario("Accepts valid approval rejected payload", ({ Given, Then }) => {
      Given("a valid approval rejected payload", () => {
        state.rejectedPayload = {
          actionId: "action-123",
          reviewerId: "user-456",
          rejectionReason: "Customer already contacted",
        };
      });
      Then("the approval rejected payload passes validation", () => {
        expect(ApprovalRejectedPayloadSchema.safeParse(state.rejectedPayload).success).toBe(true);
      });
    });

    RuleScenario("Allows empty rejectionReason string", ({ Given, Then }) => {
      Given("an approval rejected payload with empty rejectionReason", () => {
        state.rejectedPayload = {
          actionId: "action-123",
          reviewerId: "user-456",
          rejectionReason: "",
        };
      });
      Then("the approval rejected payload passes validation", () => {
        // Empty string is allowed unless .min(1)
        expect(ApprovalRejectedPayloadSchema.safeParse(state.rejectedPayload).success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: ApprovalExpiredPayloadSchema validates expiration payloads
  // ===========================================================================

  Rule("ApprovalExpiredPayloadSchema validates expiration payloads", ({ RuleScenario }) => {
    RuleScenario("Accepts valid approval expired payload", ({ Given, Then }) => {
      Given("a valid approval expired payload", () => {
        state.expiredPayload = {
          actionId: "action-123",
          requestedAt: Date.now() - 86400000,
          expiredAt: Date.now(),
        };
      });
      Then("the approval expired payload passes validation", () => {
        expect(ApprovalExpiredPayloadSchema.safeParse(state.expiredPayload).success).toBe(true);
      });
    });

    RuleScenario("Rejects payload with empty actionId", ({ Given, Then }) => {
      Given("an approval expired payload with empty actionId", () => {
        state.expiredPayload = {
          actionId: "",
          requestedAt: Date.now(),
          expiredAt: Date.now(),
        };
      });
      Then("the approval expired payload fails validation", () => {
        expect(ApprovalExpiredPayloadSchema.safeParse(state.expiredPayload).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: AgentAuditEventSchema validates full audit event objects
  // ===========================================================================

  Rule("AgentAuditEventSchema validates full audit event objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid audit event", ({ Given, Then }) => {
      Given("a valid full audit event", () => {
        state.fullEvent = {
          eventType: "PatternDetected",
          agentId: "test-agent",
          decisionId: "dec_123_abcd",
          timestamp: Date.now(),
          payload: createTestDecisionPayload(),
        };
      });
      Then("the full audit event passes AgentAuditEventSchema validation", () => {
        expect(AgentAuditEventSchema.safeParse(state.fullEvent).success).toBe(true);
      });
    });

    RuleScenario("Rejects event with empty agentId", ({ Given, Then }) => {
      Given("a full audit event with empty agentId", () => {
        state.fullEvent = {
          eventType: "PatternDetected",
          agentId: "",
          decisionId: "dec_123",
          timestamp: Date.now(),
          payload: {},
        };
      });
      Then("the full audit event fails AgentAuditEventSchema validation", () => {
        expect(AgentAuditEventSchema.safeParse(state.fullEvent).success).toBe(false);
      });
    });

    RuleScenario("Rejects event with empty decisionId", ({ Given, Then }) => {
      Given("a full audit event with empty decisionId", () => {
        state.fullEvent = {
          eventType: "PatternDetected",
          agentId: "agent",
          decisionId: "",
          timestamp: Date.now(),
          payload: {},
        };
      });
      Then("the full audit event fails AgentAuditEventSchema validation", () => {
        expect(AgentAuditEventSchema.safeParse(state.fullEvent).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: generateDecisionId produces well-formed unique IDs
  // ===========================================================================

  Rule("generateDecisionId produces well-formed unique IDs", ({ RuleScenario }) => {
    RuleScenario("Generates IDs with dec_ prefix", ({ When, Then }) => {
      When("I generate a decision ID", () => {
        state.decisionId = generateDecisionId();
      });
      Then('the decision ID starts with "dec_"', () => {
        expect(state.decisionId!.startsWith("dec_")).toBe(true);
      });
    });

    RuleScenario("Generates IDs with expected format", ({ When, Then, And }) => {
      When("I generate a decision ID", () => {
        state.decisionId = generateDecisionId();
      });
      Then("the decision ID has three underscore-separated parts", () => {
        const parts = state.decisionId!.split("_");
        expect(parts.length).toBe(3);
      });
      And('the first part is "dec"', () => {
        const parts = state.decisionId!.split("_");
        expect(parts[0]).toBe("dec");
      });
      And("the second part is a numeric timestamp", () => {
        const parts = state.decisionId!.split("_");
        expect(Number(parts[1])).not.toBeNaN();
      });
      And("the third part is an 8-character hex suffix", () => {
        const parts = state.decisionId!.split("_");
        expect(parts[2].length).toBe(8);
      });
    });

    RuleScenario("Generates unique IDs over multiple calls", ({ When, Then }) => {
      When("I generate 3 decision IDs with small delays", async () => {
        vi.useRealTimers();
        state.useFakeTimers = false;
        for (let i = 0; i < 3; i++) {
          state.decisionIds.add(generateDecisionId());
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
      });
      Then("all 3 IDs are unique", () => {
        expect(state.decisionIds.size).toBe(3);
      });
    });

    RuleScenario("Includes timestamp in ID", ({ When, Then }) => {
      When('I generate a decision ID at fixed time "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.decisionId = generateDecisionId();
      });
      Then("the timestamp part equals the fixed time epoch", () => {
        const timestamp = state.decisionId!.split("_")[1];
        expect(Number(timestamp)).toBe(new Date("2024-01-15T12:00:00Z").getTime());
      });
    });
  });

  // ===========================================================================
  // Rule: createPatternDetectedAudit factory produces correct events
  // ===========================================================================

  Rule("createPatternDetectedAudit factory produces correct events", ({ RuleScenario }) => {
    RuleScenario("Creates event with PatternDetected type", ({ When, Then }) => {
      When('I create a pattern detected audit for agent "test-agent"', () => {
        state.event = createPatternDetectedAudit("test-agent", {
          patternDetected: "churn-risk",
          confidence: 0.85,
          reasoning: "Customer at risk",
          action: createTestAuditAction(),
          triggeringEvents: ["evt-1"],
        });
      });
      Then('the event type is "PatternDetected"', () => {
        expect(state.event.eventType).toBe("PatternDetected");
      });
    });

    RuleScenario("Includes all required fields", ({ When, Then, And }) => {
      When('I create a pattern detected audit for agent "test-agent" with full payload', () => {
        state.event = createPatternDetectedAudit("test-agent", {
          patternDetected: "churn-risk",
          confidence: 0.85,
          reasoning: "Customer at risk",
          action: createTestAuditAction(),
          triggeringEvents: ["evt-1", "evt-2"],
        });
      });
      Then("the event has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.event[row.property]).toBe(row.value);
        }
      });
      And("the decisionId matches the dec_ format", () => {
        expect(state.event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
      And("the timestamp equals current time", () => {
        expect(state.event.timestamp).toBe(state.fakeNow);
      });
      And('the payload has patternDetected "churn-risk"', () => {
        expect(state.event.payload.patternDetected).toBe("churn-risk");
      });
      And("the payload has confidence 0.85", () => {
        expect(state.event.payload.confidence).toBe(0.85);
      });
      And('the payload has reasoning "Customer at risk"', () => {
        expect(state.event.payload.reasoning).toBe("Customer at risk");
      });
      And("the payload has the expected action", () => {
        expect(state.event.payload.action).toEqual(createTestAuditAction());
      });
      And('the payload has triggering events "evt-1" and "evt-2"', () => {
        expect(state.event.payload.triggeringEvents).toEqual(["evt-1", "evt-2"]);
      });
    });

    RuleScenario("Includes LLM context when provided", ({ When, Then, And }) => {
      When("I create a pattern detected audit with LLM context", () => {
        const llmContext = createTestLLMContext();
        state.event = createPatternDetectedAudit(
          "agent",
          {
            patternDetected: null,
            confidence: 0.5,
            reasoning: "test",
            action: null,
            triggeringEvents: ["evt-1"],
          },
          llmContext
        );
      });
      Then("the payload LLM context is defined", () => {
        expect(state.event.payload.llmContext).toBeDefined();
      });
      And('the LLM context has model "gpt-4"', () => {
        expect(state.event.payload.llmContext?.model).toBe("gpt-4");
      });
      And("the LLM context has tokens 1500", () => {
        expect(state.event.payload.llmContext?.tokens).toBe(1500);
      });
      And("the LLM context has duration 2500", () => {
        expect(state.event.payload.llmContext?.duration).toBe(2500);
      });
    });

    RuleScenario("Does not include LLM context when not provided", ({ When, Then }) => {
      When("I create a pattern detected audit without LLM context", () => {
        state.event = createPatternDetectedAudit("agent", {
          patternDetected: null,
          confidence: 0.5,
          reasoning: "test",
          action: null,
          triggeringEvents: ["evt-1"],
        });
      });
      Then("the payload LLM context is undefined", () => {
        expect(state.event.payload.llmContext).toBeUndefined();
      });
    });

    RuleScenario("Handles null patternDetected", ({ When, Then }) => {
      When("I create a pattern detected audit with null patternDetected", () => {
        state.event = createPatternDetectedAudit("agent", {
          patternDetected: null,
          confidence: 0.5,
          reasoning: "No pattern found",
          action: null,
          triggeringEvents: ["evt-1"],
        });
      });
      Then("the payload patternDetected is null", () => {
        expect(state.event.payload.patternDetected).toBeNull();
      });
    });

    RuleScenario("Handles null action", ({ When, Then }) => {
      When("I create a pattern detected audit with null action", () => {
        state.event = createPatternDetectedAudit("agent", {
          patternDetected: "some-pattern",
          confidence: 0.5,
          reasoning: "No action needed",
          action: null,
          triggeringEvents: ["evt-1"],
        });
      });
      Then("the payload action is null", () => {
        expect(state.event.payload.action).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Rule: createApprovalGrantedAudit factory produces correct events
  // ===========================================================================

  Rule("createApprovalGrantedAudit factory produces correct events", ({ RuleScenario }) => {
    RuleScenario("Creates event with ApprovalGranted type", ({ When, Then }) => {
      When(
        'I create an approval granted audit for agent "agent" action "action-123" reviewer "user-456"',
        () => {
          state.event = createApprovalGrantedAudit("agent", "action-123", "user-456");
        }
      );
      Then('the event type is "ApprovalGranted"', () => {
        expect(state.event.eventType).toBe("ApprovalGranted");
      });
    });

    RuleScenario("Includes all required fields for approval granted", ({ When, Then, And }) => {
      When(
        'I create an approval granted audit for agent "test-agent" action "action-123" reviewer "user-456"',
        () => {
          state.event = createApprovalGrantedAudit("test-agent", "action-123", "user-456");
        }
      );
      Then("the event has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.event[row.property]).toBe(row.value);
        }
      });
      And("the decisionId matches the dec_ format", () => {
        expect(state.event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
      And("the timestamp equals current time", () => {
        expect(state.event.timestamp).toBe(state.fakeNow);
      });
      And('the payload actionId is "action-123"', () => {
        expect(state.event.payload.actionId).toBe("action-123");
      });
      And('the payload reviewerId is "user-456"', () => {
        expect(state.event.payload.reviewerId).toBe("user-456");
      });
      And("the payload reviewedAt equals current time", () => {
        expect(state.event.payload.reviewedAt).toBe(state.fakeNow);
      });
    });

    RuleScenario("Includes reviewNote when provided", ({ When, Then }) => {
      When(
        'I create an approval granted audit with reviewNote "Verified customer is at risk"',
        () => {
          state.event = createApprovalGrantedAudit(
            "agent",
            "action-123",
            "user-456",
            "Verified customer is at risk"
          );
        }
      );
      Then('the payload reviewNote is "Verified customer is at risk"', () => {
        expect(state.event.payload.reviewNote).toBe("Verified customer is at risk");
      });
    });

    RuleScenario("Does not include reviewNote when not provided", ({ When, Then }) => {
      When("I create an approval granted audit without reviewNote", () => {
        state.event = createApprovalGrantedAudit("agent", "action-123", "user-456");
      });
      Then("the payload reviewNote is undefined", () => {
        expect(state.event.payload.reviewNote).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // Rule: createApprovalRejectedAudit factory produces correct events
  // ===========================================================================

  Rule("createApprovalRejectedAudit factory produces correct events", ({ RuleScenario }) => {
    RuleScenario("Creates event with ApprovalRejected type", ({ When, Then }) => {
      When('I create an approval rejected audit for agent "agent"', () => {
        state.event = createApprovalRejectedAudit(
          "agent",
          "action-123",
          "user-456",
          "Customer already contacted"
        );
      });
      Then('the event type is "ApprovalRejected"', () => {
        expect(state.event.eventType).toBe("ApprovalRejected");
      });
    });

    RuleScenario("Includes all required fields for approval rejected", ({ When, Then, And }) => {
      When(
        'I create an approval rejected audit for agent "test-agent" with reason "Not appropriate"',
        () => {
          state.event = createApprovalRejectedAudit(
            "test-agent",
            "action-123",
            "user-456",
            "Not appropriate"
          );
        }
      );
      Then("the event has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.event[row.property]).toBe(row.value);
        }
      });
      And("the decisionId matches the dec_ format", () => {
        expect(state.event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
      And("the timestamp equals current time", () => {
        expect(state.event.timestamp).toBe(state.fakeNow);
      });
      And('the payload actionId is "action-123"', () => {
        expect(state.event.payload.actionId).toBe("action-123");
      });
      And('the payload reviewerId is "user-456"', () => {
        expect(state.event.payload.reviewerId).toBe("user-456");
      });
      And('the payload rejectionReason is "Not appropriate"', () => {
        expect(state.event.payload.rejectionReason).toBe("Not appropriate");
      });
    });
  });

  // ===========================================================================
  // Rule: createApprovalExpiredAudit factory produces correct events
  // ===========================================================================

  Rule("createApprovalExpiredAudit factory produces correct events", ({ RuleScenario }) => {
    RuleScenario("Creates event with ApprovalExpired type", ({ When, Then }) => {
      When('I create an approval expired audit for agent "agent"', () => {
        state.requestedAt = Date.now() - 86400000;
        state.event = createApprovalExpiredAudit("agent", "action-123", state.requestedAt);
      });
      Then('the event type is "ApprovalExpired"', () => {
        expect(state.event.eventType).toBe("ApprovalExpired");
      });
    });

    RuleScenario("Includes all required fields for approval expired", ({ When, Then, And }) => {
      When('I create an approval expired audit for agent "test-agent"', () => {
        state.requestedAt = Date.now() - 86400000;
        state.event = createApprovalExpiredAudit("test-agent", "action-123", state.requestedAt);
      });
      Then("the event has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.event[row.property]).toBe(row.value);
        }
      });
      And("the decisionId matches the dec_ format", () => {
        expect(state.event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
      And("the timestamp equals current time", () => {
        expect(state.event.timestamp).toBe(state.fakeNow);
      });
      And('the payload actionId is "action-123"', () => {
        expect(state.event.payload.actionId).toBe("action-123");
      });
      And("the payload requestedAt is the stored requested time", () => {
        expect(state.event.payload.requestedAt).toBe(state.requestedAt);
      });
      And("the payload expiredAt equals current time", () => {
        expect(state.event.payload.expiredAt).toBe(state.fakeNow);
      });
    });
  });

  // ===========================================================================
  // Rule: createGenericAuditEvent factory produces correct events
  // ===========================================================================

  Rule("createGenericAuditEvent factory produces correct events", ({ RuleScenario }) => {
    RuleScenario("Creates event with specified type", ({ When, Then }) => {
      When('I create a generic audit event with type "CommandEmitted"', () => {
        state.event = createGenericAuditEvent("agent", "CommandEmitted", {
          commandType: "test",
        });
      });
      Then('the event type is "CommandEmitted"', () => {
        expect(state.event.eventType).toBe("CommandEmitted");
      });
    });

    RuleScenario("Includes all required fields for generic event", ({ When, Then, And }) => {
      When('I create a generic audit event for agent "test-agent" with type "AgentStarted"', () => {
        state.event = createGenericAuditEvent("test-agent", "AgentStarted", { reason: "init" });
      });
      Then("the event has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.event[row.property]).toBe(row.value);
        }
      });
      And("the decisionId matches the dec_ format", () => {
        expect(state.event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
      And("the timestamp equals current time", () => {
        expect(state.event.timestamp).toBe(state.fakeNow);
      });
    });

    RuleScenario("Defaults payload to empty object when not provided", ({ When, Then }) => {
      When('I create a generic audit event with type "CheckpointUpdated" and no payload', () => {
        state.event = createGenericAuditEvent("agent", "CheckpointUpdated");
      });
      Then("the payload equals empty object", () => {
        expect(state.event.payload).toEqual({});
      });
    });

    RuleScenario("Works with DS-4 command routing types", ({ When, Then }) => {
      When('I create a generic audit event with type "AgentCommandRouted"', () => {
        state.event = createGenericAuditEvent("agent", "AgentCommandRouted", {
          routeTarget: "order-bc",
        });
      });
      Then('the event type is "AgentCommandRouted"', () => {
        expect(state.event.eventType).toBe("AgentCommandRouted");
      });
    });

    RuleScenario("Works with DS-5 lifecycle types", ({ When, Then }) => {
      When('I create a generic audit event with type "AgentErrorRecoveryStarted"', () => {
        state.event = createGenericAuditEvent("agent", "AgentErrorRecoveryStarted", {
          error: "timeout",
        });
      });
      Then('the event type is "AgentErrorRecoveryStarted"', () => {
        expect(state.event.eventType).toBe("AgentErrorRecoveryStarted");
      });
    });
  });

  // ===========================================================================
  // Rule: isPatternDetectedEvent type guard
  // ===========================================================================

  Rule(
    "isPatternDetectedEvent type guard identifies PatternDetected events",
    ({ RuleScenario }) => {
      RuleScenario("Returns true for PatternDetected event", ({ When, Then }) => {
        When("I create a pattern detected event for type guard test", () => {
          state.event = createPatternDetectedAudit("agent", {
            patternDetected: null,
            confidence: 0.5,
            reasoning: "test",
            action: null,
            triggeringEvents: ["evt-1"],
          });
        });
        Then("isPatternDetectedEvent returns true", () => {
          expect(isPatternDetectedEvent(state.event)).toBe(true);
        });
      });

      RuleScenario(
        "Returns false for ApprovalGranted event via isPatternDetected",
        ({ When, Then }) => {
          When("I create an approval granted event for type guard test", () => {
            state.event = createApprovalGrantedAudit("agent", "action", "user");
          });
          Then("isPatternDetectedEvent returns false", () => {
            expect(isPatternDetectedEvent(state.event)).toBe(false);
          });
        }
      );

      RuleScenario(
        "Returns false for ApprovalRejected event via isPatternDetected",
        ({ When, Then }) => {
          When("I create an approval rejected event for type guard test", () => {
            state.event = createApprovalRejectedAudit("agent", "action", "user", "reason");
          });
          Then("isPatternDetectedEvent returns false", () => {
            expect(isPatternDetectedEvent(state.event)).toBe(false);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: isApprovalGrantedEvent type guard
  // ===========================================================================

  Rule(
    "isApprovalGrantedEvent type guard identifies ApprovalGranted events",
    ({ RuleScenario }) => {
      RuleScenario("Returns true for ApprovalGranted event", ({ When, Then }) => {
        When("I create an approval granted event for type guard test", () => {
          state.event = createApprovalGrantedAudit("agent", "action", "user");
        });
        Then("isApprovalGrantedEvent returns true", () => {
          expect(isApprovalGrantedEvent(state.event)).toBe(true);
        });
      });

      RuleScenario(
        "Returns false for PatternDetected event via isApprovalGranted",
        ({ When, Then }) => {
          When("I create a pattern detected event for type guard test", () => {
            state.event = createPatternDetectedAudit("agent", {
              patternDetected: null,
              confidence: 0.5,
              reasoning: "test",
              action: null,
              triggeringEvents: ["evt-1"],
            });
          });
          Then("isApprovalGrantedEvent returns false", () => {
            expect(isApprovalGrantedEvent(state.event)).toBe(false);
          });
        }
      );

      RuleScenario(
        "Returns false for ApprovalRejected event via isApprovalGranted",
        ({ When, Then }) => {
          When("I create an approval rejected event for type guard test", () => {
            state.event = createApprovalRejectedAudit("agent", "action", "user", "reason");
          });
          Then("isApprovalGrantedEvent returns false", () => {
            expect(isApprovalGrantedEvent(state.event)).toBe(false);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: isApprovalRejectedEvent type guard
  // ===========================================================================

  Rule(
    "isApprovalRejectedEvent type guard identifies ApprovalRejected events",
    ({ RuleScenario }) => {
      RuleScenario("Returns true for ApprovalRejected event", ({ When, Then }) => {
        When("I create an approval rejected event for type guard test", () => {
          state.event = createApprovalRejectedAudit("agent", "action", "user", "reason");
        });
        Then("isApprovalRejectedEvent returns true", () => {
          expect(isApprovalRejectedEvent(state.event)).toBe(true);
        });
      });

      RuleScenario(
        "Returns false for ApprovalGranted event via isApprovalRejected",
        ({ When, Then }) => {
          When("I create an approval granted event for type guard test", () => {
            state.event = createApprovalGrantedAudit("agent", "action", "user");
          });
          Then("isApprovalRejectedEvent returns false", () => {
            expect(isApprovalRejectedEvent(state.event)).toBe(false);
          });
        }
      );

      RuleScenario(
        "Returns false for PatternDetected event via isApprovalRejected",
        ({ When, Then }) => {
          When("I create a pattern detected event for type guard test", () => {
            state.event = createPatternDetectedAudit("agent", {
              patternDetected: null,
              confidence: 0.5,
              reasoning: "test",
              action: null,
              triggeringEvents: ["evt-1"],
            });
          });
          Then("isApprovalRejectedEvent returns false", () => {
            expect(isApprovalRejectedEvent(state.event)).toBe(false);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: validateAgentAuditEvent validates full event objects
  // ===========================================================================

  Rule("validateAgentAuditEvent validates full event objects", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid pattern detected audit event", ({ When, Then }) => {
      When("I create a pattern detected event for validation", () => {
        state.event = createPatternDetectedAudit("agent", {
          patternDetected: "test",
          confidence: 0.5,
          reasoning: "reason",
          action: null,
          triggeringEvents: ["evt-1"],
        });
      });
      Then("validateAgentAuditEvent returns true", () => {
        expect(validateAgentAuditEvent(state.event)).toBe(true);
      });
    });

    RuleScenario("Returns true for valid approval granted audit event", ({ When, Then }) => {
      When("I create an approval granted event for validation", () => {
        state.event = createApprovalGrantedAudit("agent", "action", "user");
      });
      Then("validateAgentAuditEvent returns true", () => {
        expect(validateAgentAuditEvent(state.event)).toBe(true);
      });
    });

    RuleScenario("Returns true for valid approval rejected audit event", ({ When, Then }) => {
      When("I create an approval rejected event for validation", () => {
        state.event = createApprovalRejectedAudit("agent", "action", "user", "reason");
      });
      Then("validateAgentAuditEvent returns true", () => {
        expect(validateAgentAuditEvent(state.event)).toBe(true);
      });
    });

    RuleScenario("Returns true for valid approval expired audit event", ({ When, Then }) => {
      When("I create an approval expired event for validation", () => {
        state.event = createApprovalExpiredAudit("agent", "action", Date.now() - 1000);
      });
      Then("validateAgentAuditEvent returns true", () => {
        expect(validateAgentAuditEvent(state.event)).toBe(true);
      });
    });

    RuleScenario("Returns false for null", ({ Then }) => {
      Then("validateAgentAuditEvent returns false for null", () => {
        expect(validateAgentAuditEvent(null)).toBe(false);
      });
    });

    RuleScenario("Returns false for undefined", ({ Then }) => {
      Then("validateAgentAuditEvent returns false for undefined", () => {
        expect(validateAgentAuditEvent(undefined)).toBe(false);
      });
    });

    RuleScenario("Returns false for empty object", ({ Then }) => {
      Then("validateAgentAuditEvent returns false for empty object", () => {
        expect(validateAgentAuditEvent({})).toBe(false);
      });
    });

    RuleScenario("Returns false for invalid event type", ({ Then }) => {
      Then("validateAgentAuditEvent returns false for invalid event type", () => {
        const event = {
          eventType: "InvalidType",
          agentId: "agent",
          decisionId: "dec_123",
          timestamp: Date.now(),
          payload: {},
        };
        expect(validateAgentAuditEvent(event)).toBe(false);
      });
    });

    RuleScenario("Returns false for missing required fields", ({ Then }) => {
      Then("validateAgentAuditEvent returns false for missing required fields", () => {
        const event = {
          eventType: "PatternDetected",
          // Missing agentId, decisionId, etc.
        };
        expect(validateAgentAuditEvent(event)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Audit trail flows create consistent event sequences
  // ===========================================================================

  Rule("Audit trail flows create consistent event sequences", ({ RuleScenario }) => {
    RuleScenario("Creates complete audit trail for approved action", ({ When, Then, And }) => {
      When('I create a detection then approval flow for agent "churn-risk-agent"', () => {
        state.detection = createPatternDetectedAudit(
          "churn-risk-agent",
          {
            patternDetected: "churn-risk",
            confidence: 0.85,
            reasoning: "Customer cancelled 3 orders",
            action: {
              type: "SuggestOutreach",
              executionMode: "flag-for-review",
            },
            triggeringEvents: ["evt-1", "evt-2", "evt-3"],
          },
          createTestLLMContext()
        );

        vi.advanceTimersByTime(3600000); // 1 hour later

        state.approval = createApprovalGrantedAudit(
          "churn-risk-agent",
          "action-from-decision",
          "reviewer-123",
          "Verified customer is at risk"
        );
      });
      Then("the detection passes isPatternDetectedEvent", () => {
        expect(isPatternDetectedEvent(state.detection)).toBe(true);
      });
      And("the detection passes validateAgentAuditEvent", () => {
        expect(validateAgentAuditEvent(state.detection)).toBe(true);
      });
      And("the approval passes isApprovalGrantedEvent", () => {
        expect(isApprovalGrantedEvent(state.approval)).toBe(true);
      });
      And("the approval passes validateAgentAuditEvent", () => {
        expect(validateAgentAuditEvent(state.approval)).toBe(true);
      });
      And("the approval timestamp is greater than the detection timestamp", () => {
        expect(state.approval.timestamp).toBeGreaterThan(state.detection.timestamp);
      });
    });

    RuleScenario("Creates complete audit trail for rejected action", ({ When, Then, And }) => {
      When('I create a detection then rejection flow for agent "inventory-agent"', () => {
        state.detection = createPatternDetectedAudit("inventory-agent", {
          patternDetected: "low-stock",
          confidence: 0.7,
          reasoning: "Stock levels below threshold",
          action: {
            type: "ReorderStock",
            executionMode: "flag-for-review",
          },
          triggeringEvents: ["evt-stock-1"],
        });

        vi.advanceTimersByTime(1800000); // 30 minutes later

        state.rejection = createApprovalRejectedAudit(
          "inventory-agent",
          "action-from-decision",
          "reviewer-456",
          "Order already placed by manager"
        );
      });
      Then("the rejection passes isApprovalRejectedEvent", () => {
        expect(isApprovalRejectedEvent(state.rejection)).toBe(true);
      });
      And("the rejection passes validateAgentAuditEvent", () => {
        expect(validateAgentAuditEvent(state.rejection)).toBe(true);
      });
      And('the rejection reason is "Order already placed by manager"', () => {
        expect(state.rejection.payload.rejectionReason).toBe("Order already placed by manager");
      });
    });

    RuleScenario("Creates audit trail for expired action", ({ When, Then, And }) => {
      When('I create a detection then expiration flow for agent "notification-agent"', () => {
        state.requestedAt = Date.now();

        createPatternDetectedAudit("notification-agent", {
          patternDetected: "user-inactive",
          confidence: 0.9,
          reasoning: "User has not logged in for 7 days",
          action: {
            type: "SendReminder",
            executionMode: "flag-for-review",
          },
          triggeringEvents: ["evt-login-1"],
        });

        vi.advanceTimersByTime(86400000); // 24 hours later

        state.expiration = createApprovalExpiredAudit(
          "notification-agent",
          "action-123",
          state.requestedAt
        );
      });
      Then('the expiration event type is "ApprovalExpired"', () => {
        expect(state.expiration.eventType).toBe("ApprovalExpired");
      });
      And("the expiration requestedAt is less than expiredAt", () => {
        expect(state.expiration.payload.requestedAt).toBeLessThan(
          state.expiration.payload.expiredAt
        );
      });
      And("the expiration passes validateAgentAuditEvent", () => {
        expect(validateAgentAuditEvent(state.expiration)).toBe(true);
      });
    });
  });
});
