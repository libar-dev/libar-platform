/**
 * Commands Module Unit Tests
 *
 * Tests for the agent command emission functionality including:
 * - Command validation
 * - Factory functions
 * - Type guards
 * - Decision to command conversion
 */

import { describe, it, expect } from "vitest";
import {
  // Error codes
  COMMAND_EMISSION_ERROR_CODES,
  // Schemas
  EmittedAgentCommandMetadataSchema,
  EmittedAgentCommandSchema,
  // Validation
  validateAgentCommand,
  // Factory functions
  createEmittedAgentCommand,
  createCommandFromDecision,
  // Type guards
  isEmittedAgentCommand,
  hasPatternId,
  hasAnalysisData,
  // Types
  type EmittedAgentCommand,
  type EmittedAgentCommandMetadata,
} from "../../../src/agent/commands.js";
import type { AgentDecision } from "../../../src/agent/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestMetadata(
  overrides: Partial<EmittedAgentCommandMetadata> = {}
): EmittedAgentCommandMetadata {
  return {
    agentId: "test-agent",
    decisionId: "dec_123_abcd1234",
    confidence: 0.85,
    reason: "Test reason for command",
    eventIds: ["evt-1", "evt-2"],
    ...overrides,
  };
}

function createTestCommand(overrides: Partial<EmittedAgentCommand> = {}): EmittedAgentCommand {
  return {
    type: "TestCommand",
    payload: { key: "value" },
    metadata: createTestMetadata(),
    ...overrides,
  };
}

function createTestDecision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    command: "SuggestOutreach",
    payload: { customerId: "cust-123" },
    confidence: 0.85,
    reason: "Customer cancelled 3 orders",
    requiresApproval: false,
    triggeringEvents: ["evt-1", "evt-2", "evt-3"],
    ...overrides,
  };
}

// ============================================================================
// Error Codes Tests
// ============================================================================

describe("COMMAND_EMISSION_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED).toBe("REASON_REQUIRED");
    expect(COMMAND_EMISSION_ERROR_CODES.CONFIDENCE_REQUIRED).toBe("CONFIDENCE_REQUIRED");
    expect(COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED).toBe("EVENTS_REQUIRED");
    expect(COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE).toBe("INVALID_COMMAND_TYPE");
    expect(COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE).toBe("INVALID_CONFIDENCE");
  });

  it("has 5 error codes", () => {
    expect(Object.keys(COMMAND_EMISSION_ERROR_CODES).length).toBe(5);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("EmittedAgentCommandMetadataSchema", () => {
  it("accepts valid metadata", () => {
    const metadata = createTestMetadata();
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it("accepts metadata with optional patternId", () => {
    const metadata = createTestMetadata({ patternId: "pattern-1" });
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it("accepts metadata with optional analysis", () => {
    const metadata = createTestMetadata({ analysis: { rawResponse: "LLM output" } });
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it("rejects metadata with empty agentId", () => {
    const metadata = { ...createTestMetadata(), agentId: "" };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("rejects metadata with empty decisionId", () => {
    const metadata = { ...createTestMetadata(), decisionId: "" };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("rejects metadata with confidence below 0", () => {
    const metadata = { ...createTestMetadata(), confidence: -0.1 };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("rejects metadata with confidence above 1", () => {
    const metadata = { ...createTestMetadata(), confidence: 1.5 };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("rejects metadata with empty reason", () => {
    const metadata = { ...createTestMetadata(), reason: "" };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("rejects metadata with empty eventIds array", () => {
    const metadata = { ...createTestMetadata(), eventIds: [] };
    const result = EmittedAgentCommandMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });

  it("accepts confidence at boundaries (0 and 1)", () => {
    expect(
      EmittedAgentCommandMetadataSchema.safeParse(createTestMetadata({ confidence: 0 })).success
    ).toBe(true);
    expect(
      EmittedAgentCommandMetadataSchema.safeParse(createTestMetadata({ confidence: 1 })).success
    ).toBe(true);
  });
});

describe("EmittedAgentCommandSchema", () => {
  it("accepts valid command", () => {
    const command = createTestCommand();
    const result = EmittedAgentCommandSchema.safeParse(command);
    expect(result.success).toBe(true);
  });

  it("rejects command with empty type", () => {
    const command = { ...createTestCommand(), type: "" };
    const result = EmittedAgentCommandSchema.safeParse(command);
    expect(result.success).toBe(false);
  });

  it("accepts command with any payload type", () => {
    expect(EmittedAgentCommandSchema.safeParse(createTestCommand({ payload: null })).success).toBe(
      true
    );
    expect(
      EmittedAgentCommandSchema.safeParse(createTestCommand({ payload: "string" })).success
    ).toBe(true);
    expect(EmittedAgentCommandSchema.safeParse(createTestCommand({ payload: 123 })).success).toBe(
      true
    );
    expect(
      EmittedAgentCommandSchema.safeParse(createTestCommand({ payload: [1, 2, 3] })).success
    ).toBe(true);
  });

  it("rejects command with invalid metadata", () => {
    const command = {
      type: "TestCommand",
      payload: {},
      metadata: { agentId: "" }, // Invalid metadata
    };
    const result = EmittedAgentCommandSchema.safeParse(command);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("validateAgentCommand", () => {
  describe("type validation", () => {
    it("returns invalid when type is undefined", () => {
      const result = validateAgentCommand({
        confidence: 0.85,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE);
        expect(result.message).toContain("non-empty string");
      }
    });

    it("returns invalid when type is empty string", () => {
      const result = validateAgentCommand({
        type: "",
        confidence: 0.85,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE);
      }
    });

    it("returns invalid when type is whitespace only", () => {
      const result = validateAgentCommand({
        type: "   ",
        confidence: 0.85,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE);
      }
    });
  });

  describe("confidence validation", () => {
    it("returns invalid when confidence is undefined", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.CONFIDENCE_REQUIRED);
        expect(result.message).toContain("Confidence score is required");
      }
    });

    it("returns invalid when confidence is below 0", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: -0.1,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE);
        expect(result.message).toContain("between 0 and 1");
      }
    });

    it("returns invalid when confidence is above 1", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 1.5,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE);
      }
    });

    it("accepts confidence at boundaries", () => {
      expect(
        validateAgentCommand({
          type: "TestCommand",
          confidence: 0,
          reason: "test",
          eventIds: ["evt-1"],
        }).valid
      ).toBe(true);

      expect(
        validateAgentCommand({
          type: "TestCommand",
          confidence: 1,
          reason: "test",
          eventIds: ["evt-1"],
        }).valid
      ).toBe(true);
    });
  });

  describe("reason validation", () => {
    it("returns invalid when reason is undefined", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      }
    });

    it("returns invalid when reason is empty string", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      }
    });

    it("returns invalid when reason is whitespace only", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "   ",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      }
    });
  });

  describe("eventIds validation", () => {
    it("returns invalid when eventIds is undefined", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "test",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED);
        expect(result.message).toContain("At least one triggering event");
      }
    });

    it("returns invalid when eventIds is empty array", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "test",
        eventIds: [],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED);
      }
    });

    it("accepts single event ID", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "test",
        eventIds: ["evt-1"],
      });
      expect(result.valid).toBe(true);
    });

    it("accepts multiple event IDs", () => {
      const result = validateAgentCommand({
        type: "TestCommand",
        confidence: 0.85,
        reason: "test",
        eventIds: ["evt-1", "evt-2", "evt-3"],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("valid commands", () => {
    it("returns valid for complete command args", () => {
      const result = validateAgentCommand({
        type: "SuggestOutreach",
        confidence: 0.85,
        reason: "Customer cancelled 3 orders in 30 days",
        eventIds: ["evt-1", "evt-2", "evt-3"],
      });
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("createEmittedAgentCommand", () => {
  it("creates command with all required fields", () => {
    const command = createEmittedAgentCommand(
      "churn-risk-agent",
      "SuggestOutreach",
      { customerId: "cust-123" },
      0.85,
      "Customer cancelled 3 orders",
      ["evt-1", "evt-2"]
    );

    expect(command.type).toBe("SuggestOutreach");
    expect(command.payload).toEqual({ customerId: "cust-123" });
    expect(command.metadata.agentId).toBe("churn-risk-agent");
    expect(command.metadata.confidence).toBe(0.85);
    expect(command.metadata.reason).toBe("Customer cancelled 3 orders");
    expect(command.metadata.eventIds).toEqual(["evt-1", "evt-2"]);
  });

  it("generates unique decisionId", () => {
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"]);
    expect(command.metadata.decisionId).toBeDefined();
    expect(command.metadata.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
  });

  it("includes patternId when provided in options", () => {
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"], {
      patternId: "churn-risk",
    });
    expect(command.metadata.patternId).toBe("churn-risk");
  });

  it("does not include patternId when not provided", () => {
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"]);
    expect(command.metadata.patternId).toBeUndefined();
  });

  it("includes analysis when provided in options", () => {
    const analysis = { rawResponse: "LLM output", tokens: 150 };
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"], {
      analysis,
    });
    expect(command.metadata.analysis).toEqual(analysis);
  });

  it("does not include analysis when not provided", () => {
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"]);
    expect(command.metadata.analysis).toBeUndefined();
  });

  it("includes both patternId and analysis when provided", () => {
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", ["evt-1"], {
      patternId: "pattern-1",
      analysis: { data: "value" },
    });
    expect(command.metadata.patternId).toBe("pattern-1");
    expect(command.metadata.analysis).toEqual({ data: "value" });
  });

  it("copies eventIds array (no reference sharing)", () => {
    const eventIds = ["evt-1", "evt-2"];
    const command = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", eventIds);
    eventIds.push("evt-3"); // Modify original
    expect(command.metadata.eventIds).toEqual(["evt-1", "evt-2"]); // Should be unchanged
  });

  describe("validation errors", () => {
    it("throws error for empty type", () => {
      expect(() => createEmittedAgentCommand("agent", "", {}, 0.5, "reason", ["evt-1"])).toThrow(
        "Command type must be a non-empty string"
      );
    });

    it("throws error for invalid confidence", () => {
      expect(() =>
        createEmittedAgentCommand("agent", "Command", {}, 1.5, "reason", ["evt-1"])
      ).toThrow("Confidence must be between 0 and 1");
    });

    it("throws error for empty reason", () => {
      expect(() => createEmittedAgentCommand("agent", "Command", {}, 0.5, "", ["evt-1"])).toThrow(
        "Reason is required"
      );
    });

    it("throws error for empty eventIds", () => {
      expect(() => createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", [])).toThrow(
        "At least one triggering event"
      );
    });

    it("includes error code in thrown message", () => {
      expect(() => createEmittedAgentCommand("agent", "", {}, 0.5, "reason", ["evt-1"])).toThrow(
        COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE
      );
    });
  });
});

describe("createCommandFromDecision", () => {
  it("creates command from decision with command", () => {
    const decision = createTestDecision();
    const command = createCommandFromDecision("churn-agent", decision);

    expect(command).not.toBeNull();
    expect(command!.type).toBe("SuggestOutreach");
    expect(command!.payload).toEqual({ customerId: "cust-123" });
    expect(command!.metadata.agentId).toBe("churn-agent");
    expect(command!.metadata.confidence).toBe(0.85);
    expect(command!.metadata.reason).toBe("Customer cancelled 3 orders");
    expect(command!.metadata.eventIds).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("returns null when decision has no command", () => {
    const decision = createTestDecision({ command: null });
    const command = createCommandFromDecision("agent", decision);
    expect(command).toBeNull();
  });

  it("includes patternId when provided", () => {
    const decision = createTestDecision();
    const command = createCommandFromDecision("agent", decision, { patternId: "churn-risk" });

    expect(command!.metadata.patternId).toBe("churn-risk");
  });

  it("includes analysis when provided", () => {
    const decision = createTestDecision();
    const analysis = { rawResponse: "LLM analysis" };
    const command = createCommandFromDecision("agent", decision, { analysis });

    expect(command!.metadata.analysis).toEqual(analysis);
  });

  it("maps all decision fields correctly", () => {
    const decision = createTestDecision({
      command: "SpecificCommand",
      payload: { specific: "data", nested: { value: 123 } },
      confidence: 0.99,
      reason: "Detailed reason for command",
      triggeringEvents: ["evt-a", "evt-b"],
    });

    const command = createCommandFromDecision("my-agent", decision);

    expect(command!.type).toBe("SpecificCommand");
    expect(command!.payload).toEqual({ specific: "data", nested: { value: 123 } });
    expect(command!.metadata.confidence).toBe(0.99);
    expect(command!.metadata.reason).toBe("Detailed reason for command");
    expect(command!.metadata.eventIds).toEqual(["evt-a", "evt-b"]);
  });
});

// ============================================================================
// Type Guards Tests
// ============================================================================

describe("isEmittedAgentCommand", () => {
  it("returns true for valid command", () => {
    const command = createTestCommand();
    expect(isEmittedAgentCommand(command)).toBe(true);
  });

  it("returns true for command with optional fields", () => {
    const command = createTestCommand({
      metadata: createTestMetadata({
        patternId: "pattern-1",
        analysis: { data: "value" },
      }),
    });
    expect(isEmittedAgentCommand(command)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isEmittedAgentCommand(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isEmittedAgentCommand(undefined)).toBe(false);
  });

  it("returns false for primitive values", () => {
    expect(isEmittedAgentCommand("command")).toBe(false);
    expect(isEmittedAgentCommand(123)).toBe(false);
    expect(isEmittedAgentCommand(true)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isEmittedAgentCommand({ payload: {}, metadata: createTestMetadata() })).toBe(false);
  });

  it("returns false for object with empty type", () => {
    expect(isEmittedAgentCommand({ type: "", payload: {}, metadata: createTestMetadata() })).toBe(
      false
    );
  });

  it("returns false for object with invalid metadata", () => {
    expect(
      isEmittedAgentCommand({
        type: "Command",
        payload: {},
        metadata: { agentId: "" }, // Invalid
      })
    ).toBe(false);
  });

  it("returns false for object with missing metadata", () => {
    expect(isEmittedAgentCommand({ type: "Command", payload: {} })).toBe(false);
  });
});

describe("hasPatternId", () => {
  it("returns true when command has patternId", () => {
    const command = createTestCommand({
      metadata: createTestMetadata({ patternId: "churn-risk" }),
    });
    expect(hasPatternId(command)).toBe(true);
  });

  it("returns false when command has no patternId", () => {
    const command = createTestCommand(); // No patternId in default metadata
    expect(hasPatternId(command)).toBe(false);
  });

  it("returns false when patternId is undefined explicitly", () => {
    const command = createTestCommand({
      metadata: createTestMetadata({ patternId: undefined }),
    });
    expect(hasPatternId(command)).toBe(false);
  });
});

describe("hasAnalysisData", () => {
  it("returns true when command has analysis", () => {
    const command = createTestCommand({
      metadata: createTestMetadata({ analysis: { data: "value" } }),
    });
    expect(hasAnalysisData(command)).toBe(true);
  });

  it("returns false when command has no analysis", () => {
    const command = createTestCommand();
    expect(hasAnalysisData(command)).toBe(false);
  });

  it("returns false when analysis is undefined explicitly", () => {
    const command = createTestCommand({
      metadata: createTestMetadata({ analysis: undefined }),
    });
    expect(hasAnalysisData(command)).toBe(false);
  });

  it("returns true for null analysis (null is a value)", () => {
    const command = createTestCommand({
      metadata: { ...createTestMetadata(), analysis: null },
    });
    // analysis: null means it's defined (not undefined)
    // The type guard checks !== undefined
    expect(hasAnalysisData(command)).toBe(true);
  });
});

// ============================================================================
// Integration Tests - Command Creation Flow
// ============================================================================

describe("command creation flow", () => {
  it("validates, creates, and verifies command", () => {
    // Step 1: Validate args
    const args = {
      type: "SuggestOutreach",
      confidence: 0.85,
      reason: "Customer cancelled 3 orders",
      eventIds: ["evt-1", "evt-2"],
    };
    const validation = validateAgentCommand(args);
    expect(validation.valid).toBe(true);

    // Step 2: Create command
    const command = createEmittedAgentCommand(
      "churn-agent",
      args.type,
      { customerId: "cust-123" },
      args.confidence,
      args.reason,
      args.eventIds
    );

    // Step 3: Verify with type guard
    expect(isEmittedAgentCommand(command)).toBe(true);

    // Step 4: Verify with schema
    const schemaResult = EmittedAgentCommandSchema.safeParse(command);
    expect(schemaResult.success).toBe(true);
  });

  it("creates command from decision and verifies", () => {
    const decision = createTestDecision();
    const command = createCommandFromDecision("agent", decision, {
      patternId: "churn-risk",
      analysis: { tokens: 150 },
    });

    expect(command).not.toBeNull();
    expect(isEmittedAgentCommand(command)).toBe(true);
    expect(hasPatternId(command!)).toBe(true);
    expect(hasAnalysisData(command!)).toBe(true);
  });
});
