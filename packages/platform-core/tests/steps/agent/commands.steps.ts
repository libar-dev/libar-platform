/**
 * Agent Commands Module - Step Definitions
 *
 * BDD step definitions for agent command emission functionality including:
 * - Error codes validation
 * - Zod schema validation (metadata and command)
 * - Command argument validation
 * - Factory functions (createEmittedAgentCommand, createCommandFromDecision)
 * - Type guards (isEmittedAgentCommand, hasPatternId, hasAnalysisData)
 * - End-to-end command creation flow
 *
 * Mechanical migration from tests/unit/agent/commands.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

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
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  schemaResult: { success: boolean } | null;
  commandSchemaResult: { success: boolean } | null;
  validationResult: { valid: boolean; code?: string; message?: string } | null;
  createdCommand: EmittedAgentCommand | null;
  decisionCommand: EmittedAgentCommand | null;
  eventIdsOriginal: string[] | null;
}

function createInitialState(): TestState {
  return {
    schemaResult: null,
    commandSchemaResult: null,
    validationResult: null,
    createdCommand: null,
    decisionCommand: null,
    eventIdsOriginal: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/commands.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, Background }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module is imported at the top of this file
    });
  });

  // ===========================================================================
  // Rule: COMMAND_EMISSION_ERROR_CODES contains all expected codes
  // ===========================================================================

  Rule("COMMAND_EMISSION_ERROR_CODES contains all expected codes", ({ RuleScenario }) => {
    RuleScenario("Contains all expected error codes", ({ Then }) => {
      Then(
        "COMMAND_EMISSION_ERROR_CODES contains the following codes:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string }>(dataTable);
          for (const row of rows) {
            const code = row["code"];
            expect(
              COMMAND_EMISSION_ERROR_CODES[code as keyof typeof COMMAND_EMISSION_ERROR_CODES]
            ).toBe(code);
          }
        }
      );
    });

    RuleScenario("Has exactly 5 error codes", ({ Then }) => {
      Then("COMMAND_EMISSION_ERROR_CODES has exactly 5 entries", () => {
        expect(Object.keys(COMMAND_EMISSION_ERROR_CODES).length).toBe(5);
      });
    });
  });

  // ===========================================================================
  // Rule: EmittedAgentCommandMetadataSchema validates metadata
  // ===========================================================================

  Rule("EmittedAgentCommandMetadataSchema validates metadata", ({ RuleScenario }) => {
    RuleScenario("Accepts valid metadata", ({ When, Then }) => {
      When("I parse valid metadata through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(createTestMetadata());
      });

      Then("the schema result is successful", () => {
        expect(state.schemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Accepts metadata with optional patternId", ({ When, Then }) => {
      When('I parse metadata with patternId "pattern-1" through the schema', () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ patternId: "pattern-1" })
        );
      });

      Then("the schema result is successful", () => {
        expect(state.schemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Accepts metadata with optional analysis", ({ When, Then }) => {
      When("I parse metadata with analysis through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ analysis: { rawResponse: "LLM output" } })
        );
      });

      Then("the schema result is successful", () => {
        expect(state.schemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Rejects metadata with empty agentId", ({ When, Then }) => {
      When("I parse metadata with empty agentId through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse({
          ...createTestMetadata(),
          agentId: "",
        });
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects metadata with empty decisionId", ({ When, Then }) => {
      When("I parse metadata with empty decisionId through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse({
          ...createTestMetadata(),
          decisionId: "",
        });
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects metadata with confidence below 0", ({ When, Then }) => {
      When("I parse metadata with confidence -0.1 through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ confidence: -0.1 })
        );
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects metadata with confidence above 1", ({ When, Then }) => {
      When("I parse metadata with confidence 1.5 through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ confidence: 1.5 })
        );
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects metadata with empty reason", ({ When, Then }) => {
      When("I parse metadata with empty reason through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse({
          ...createTestMetadata(),
          reason: "",
        });
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects metadata with empty eventIds array", ({ When, Then }) => {
      When("I parse metadata with empty eventIds through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse({
          ...createTestMetadata(),
          eventIds: [],
        });
      });

      Then("the schema result is a failure", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Accepts confidence at boundaries 0 and 1", ({ When, Then, And }) => {
      When("I parse metadata with confidence 0 through the schema", () => {
        state.schemaResult = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ confidence: 0 })
        );
      });

      Then("the schema result is successful", () => {
        expect(state.schemaResult!.success).toBe(true);
      });

      And("I parse metadata with confidence 1 and it is also successful", () => {
        const result = EmittedAgentCommandMetadataSchema.safeParse(
          createTestMetadata({ confidence: 1 })
        );
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: EmittedAgentCommandSchema validates commands
  // ===========================================================================

  Rule("EmittedAgentCommandSchema validates commands", ({ RuleScenario }) => {
    RuleScenario("Accepts valid command", ({ When, Then }) => {
      When("I parse a valid command through the command schema", () => {
        state.commandSchemaResult = EmittedAgentCommandSchema.safeParse(createTestCommand());
      });

      Then("the command schema result is successful", () => {
        expect(state.commandSchemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Rejects command with empty type", ({ When, Then }) => {
      When("I parse a command with empty type through the command schema", () => {
        state.commandSchemaResult = EmittedAgentCommandSchema.safeParse({
          ...createTestCommand(),
          type: "",
        });
      });

      Then("the command schema result is a failure", () => {
        expect(state.commandSchemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Accepts command with any payload type", ({ Then }) => {
      Then("the command schema accepts all payload types:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ payloadDescription: string }>(dataTable);
        const payloadMap: Record<string, unknown> = {
          null: null,
          string: "string",
          number: 123,
          array: [1, 2, 3],
        };
        for (const row of rows) {
          const payload = payloadMap[row["payloadDescription"]];
          const result = EmittedAgentCommandSchema.safeParse(createTestCommand({ payload }));
          expect(result.success).toBe(true);
        }
      });
    });

    RuleScenario("Rejects command with invalid metadata", ({ When, Then }) => {
      When("I parse a command with invalid metadata through the command schema", () => {
        state.commandSchemaResult = EmittedAgentCommandSchema.safeParse({
          type: "TestCommand",
          payload: {},
          metadata: { agentId: "" },
        });
      });

      Then("the command schema result is a failure", () => {
        expect(state.commandSchemaResult!.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: validateAgentCommand validates command arguments
  // ===========================================================================

  Rule("validateAgentCommand validates command arguments", ({ RuleScenario }) => {
    RuleScenario("Returns invalid when type is undefined", ({ When, Then, And }) => {
      When("I validate a command without type", () => {
        state.validationResult = validateAgentCommand({
          confidence: 0.85,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "INVALID_COMMAND_TYPE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(
          COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE
        );
      });

      And('validation message contains "non-empty string"', () => {
        expect(state.validationResult!.message).toContain("non-empty string");
      });
    });

    RuleScenario("Returns invalid when type is empty string", ({ When, Then }) => {
      When("I validate a command with empty type", () => {
        state.validationResult = validateAgentCommand({
          type: "",
          confidence: 0.85,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "INVALID_COMMAND_TYPE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(
          COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE
        );
      });
    });

    RuleScenario("Returns invalid when type is whitespace only", ({ When, Then }) => {
      When("I validate a command with whitespace-only type", () => {
        state.validationResult = validateAgentCommand({
          type: "   ",
          confidence: 0.85,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "INVALID_COMMAND_TYPE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(
          COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE
        );
      });
    });

    RuleScenario("Returns invalid when confidence is undefined", ({ When, Then, And }) => {
      When("I validate a command without confidence", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "CONFIDENCE_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.CONFIDENCE_REQUIRED);
      });

      And('validation message contains "Confidence score is required"', () => {
        expect(state.validationResult!.message).toContain("Confidence score is required");
      });
    });

    RuleScenario("Returns invalid when confidence is below 0", ({ When, Then, And }) => {
      When("I validate a command with confidence -0.1", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: -0.1,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "INVALID_CONFIDENCE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE);
      });

      And('validation message contains "between 0 and 1"', () => {
        expect(state.validationResult!.message).toContain("between 0 and 1");
      });
    });

    RuleScenario("Returns invalid when confidence is above 1", ({ When, Then }) => {
      When("I validate a command with confidence 1.5", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 1.5,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "INVALID_CONFIDENCE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE);
      });
    });

    RuleScenario("Accepts confidence at boundary values", ({ Then }) => {
      Then("validation accepts confidence at boundaries:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ confidence: string }>(dataTable);
        for (const row of rows) {
          const result = validateAgentCommand({
            type: "TestCommand",
            confidence: Number(row["confidence"]),
            reason: "test",
            eventIds: ["evt-1"],
          });
          expect(result.valid).toBe(true);
        }
      });
    });

    RuleScenario("Returns invalid when reason is undefined", ({ When, Then }) => {
      When("I validate a command without reason", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "REASON_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when reason is empty string", ({ When, Then }) => {
      When("I validate a command with empty reason", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "REASON_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when reason is whitespace only", ({ When, Then }) => {
      When("I validate a command with whitespace-only reason", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "   ",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "REASON_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when eventIds is undefined", ({ When, Then, And }) => {
      When("I validate a command without eventIds", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "test",
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "EVENTS_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED);
      });

      And('validation message contains "At least one triggering event"', () => {
        expect(state.validationResult!.message).toContain("At least one triggering event");
      });
    });

    RuleScenario("Returns invalid when eventIds is empty array", ({ When, Then }) => {
      When("I validate a command with empty eventIds", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "test",
          eventIds: [],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then('validation result is invalid with code "EVENTS_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED);
      });
    });

    RuleScenario("Accepts single event ID", ({ When, Then }) => {
      When("I validate a command with a single event ID", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "test",
          eventIds: ["evt-1"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Accepts multiple event IDs", ({ When, Then }) => {
      When("I validate a command with multiple event IDs", () => {
        state.validationResult = validateAgentCommand({
          type: "TestCommand",
          confidence: 0.85,
          reason: "test",
          eventIds: ["evt-1", "evt-2", "evt-3"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns valid for complete command args", ({ When, Then }) => {
      When("I validate a complete command", () => {
        state.validationResult = validateAgentCommand({
          type: "SuggestOutreach",
          confidence: 0.85,
          reason: "Customer cancelled 3 orders in 30 days",
          eventIds: ["evt-1", "evt-2", "evt-3"],
        }) as { valid: boolean; code?: string; message?: string };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: createEmittedAgentCommand factory creates commands
  // ===========================================================================

  Rule("createEmittedAgentCommand factory creates commands", ({ RuleScenario }) => {
    RuleScenario("Creates command with all required fields", ({ When, Then }) => {
      When("I create an emitted agent command with standard args", () => {
        state.createdCommand = createEmittedAgentCommand(
          "churn-risk-agent",
          "SuggestOutreach",
          { customerId: "cust-123" },
          0.85,
          "Customer cancelled 3 orders",
          ["evt-1", "evt-2"]
        );
      });

      Then("the created command has all expected fields", () => {
        expect(state.createdCommand!.type).toBe("SuggestOutreach");
        expect(state.createdCommand!.payload).toEqual({
          customerId: "cust-123",
        });
        expect(state.createdCommand!.metadata.agentId).toBe("churn-risk-agent");
        expect(state.createdCommand!.metadata.confidence).toBe(0.85);
        expect(state.createdCommand!.metadata.reason).toBe("Customer cancelled 3 orders");
        expect(state.createdCommand!.metadata.eventIds).toEqual(["evt-1", "evt-2"]);
      });
    });

    RuleScenario("Generates unique decisionId", ({ When, Then }) => {
      When("I create an emitted agent command with standard args", () => {
        state.createdCommand = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", [
          "evt-1",
        ]);
      });

      Then('the decisionId matches the pattern "dec_DIGITS_HEX"', () => {
        expect(state.createdCommand!.metadata.decisionId).toBeDefined();
        expect(state.createdCommand!.metadata.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
      });
    });

    RuleScenario("Includes patternId when provided in options", ({ When, Then }) => {
      When('I create an emitted agent command with patternId "churn-risk"', () => {
        state.createdCommand = createEmittedAgentCommand(
          "agent",
          "Command",
          {},
          0.5,
          "reason",
          ["evt-1"],
          { patternId: "churn-risk" }
        );
      });

      Then('the created command metadata patternId is "churn-risk"', () => {
        expect(state.createdCommand!.metadata.patternId).toBe("churn-risk");
      });
    });

    RuleScenario("Does not include patternId when not provided", ({ When, Then }) => {
      When("I create an emitted agent command without options", () => {
        state.createdCommand = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", [
          "evt-1",
        ]);
      });

      Then("the created command metadata patternId is undefined", () => {
        expect(state.createdCommand!.metadata.patternId).toBeUndefined();
      });
    });

    RuleScenario("Includes analysis when provided in options", ({ When, Then }) => {
      When("I create an emitted agent command with analysis data", () => {
        state.createdCommand = createEmittedAgentCommand(
          "agent",
          "Command",
          {},
          0.5,
          "reason",
          ["evt-1"],
          { analysis: { rawResponse: "LLM output", tokens: 150 } }
        );
      });

      Then("the created command metadata analysis matches the provided data", () => {
        expect(state.createdCommand!.metadata.analysis).toEqual({
          rawResponse: "LLM output",
          tokens: 150,
        });
      });
    });

    RuleScenario("Does not include analysis when not provided", ({ When, Then }) => {
      When("I create an emitted agent command without options", () => {
        state.createdCommand = createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", [
          "evt-1",
        ]);
      });

      Then("the created command metadata analysis is undefined", () => {
        expect(state.createdCommand!.metadata.analysis).toBeUndefined();
      });
    });

    RuleScenario("Includes both patternId and analysis when provided", ({ When, Then, And }) => {
      When('I create an emitted agent command with patternId "pattern-1" and analysis', () => {
        state.createdCommand = createEmittedAgentCommand(
          "agent",
          "Command",
          {},
          0.5,
          "reason",
          ["evt-1"],
          { patternId: "pattern-1", analysis: { data: "value" } }
        );
      });

      Then('the created command metadata patternId is "pattern-1"', () => {
        expect(state.createdCommand!.metadata.patternId).toBe("pattern-1");
      });

      And("the created command metadata analysis matches the combined data", () => {
        expect(state.createdCommand!.metadata.analysis).toEqual({
          data: "value",
        });
      });
    });

    RuleScenario("Copies eventIds array without reference sharing", ({ When, Then }) => {
      When("I create an emitted agent command and mutate the original eventIds", () => {
        const eventIds = ["evt-1", "evt-2"];
        state.eventIdsOriginal = eventIds;
        state.createdCommand = createEmittedAgentCommand(
          "agent",
          "Command",
          {},
          0.5,
          "reason",
          eventIds
        );
        eventIds.push("evt-3"); // Modify original
      });

      Then("the created command eventIds are unchanged", () => {
        expect(state.createdCommand!.metadata.eventIds).toEqual(["evt-1", "evt-2"]);
      });
    });

    RuleScenario("Throws error for empty type", ({ Then }) => {
      Then(
        'creating a command with empty type throws "Command type must be a non-empty string"',
        () => {
          expect(() =>
            createEmittedAgentCommand("agent", "", {}, 0.5, "reason", ["evt-1"])
          ).toThrow("Command type must be a non-empty string");
        }
      );
    });

    RuleScenario("Throws error for invalid confidence", ({ Then }) => {
      Then(
        'creating a command with confidence 1.5 throws "Confidence must be between 0 and 1"',
        () => {
          expect(() =>
            createEmittedAgentCommand("agent", "Command", {}, 1.5, "reason", ["evt-1"])
          ).toThrow("Confidence must be between 0 and 1");
        }
      );
    });

    RuleScenario("Throws error for empty reason", ({ Then }) => {
      Then('creating a command with empty reason throws "Reason is required"', () => {
        expect(() => createEmittedAgentCommand("agent", "Command", {}, 0.5, "", ["evt-1"])).toThrow(
          "Reason is required"
        );
      });
    });

    RuleScenario("Throws error for empty eventIds", ({ Then }) => {
      Then('creating a command with empty eventIds throws "At least one triggering event"', () => {
        expect(() => createEmittedAgentCommand("agent", "Command", {}, 0.5, "reason", [])).toThrow(
          "At least one triggering event"
        );
      });
    });

    RuleScenario("Includes error code in thrown message", ({ Then }) => {
      Then('creating a command with empty type throws error code "INVALID_COMMAND_TYPE"', () => {
        expect(() => createEmittedAgentCommand("agent", "", {}, 0.5, "reason", ["evt-1"])).toThrow(
          COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE
        );
      });
    });
  });

  // ===========================================================================
  // Rule: createCommandFromDecision converts decisions to commands
  // ===========================================================================

  Rule("createCommandFromDecision converts decisions to commands", ({ RuleScenario }) => {
    RuleScenario("Creates command from decision with command", ({ When, Then }) => {
      When("I create a command from a standard test decision", () => {
        const decision = createTestDecision();
        state.decisionCommand = createCommandFromDecision("churn-agent", decision);
      });

      Then("the decision-created command has all expected fields", () => {
        expect(state.decisionCommand).not.toBeNull();
        expect(state.decisionCommand!.type).toBe("SuggestOutreach");
        expect(state.decisionCommand!.payload).toEqual({
          customerId: "cust-123",
        });
        expect(state.decisionCommand!.metadata.agentId).toBe("churn-agent");
        expect(state.decisionCommand!.metadata.confidence).toBe(0.85);
        expect(state.decisionCommand!.metadata.reason).toBe("Customer cancelled 3 orders");
        expect(state.decisionCommand!.metadata.eventIds).toEqual(["evt-1", "evt-2", "evt-3"]);
      });
    });

    RuleScenario("Returns null when decision has no command", ({ When, Then }) => {
      When("I create a command from a decision with null command", () => {
        const decision = createTestDecision({ command: null });
        state.decisionCommand = createCommandFromDecision("agent", decision);
      });

      Then("the result is null", () => {
        expect(state.decisionCommand).toBeNull();
      });
    });

    RuleScenario("Includes patternId when provided", ({ When, Then }) => {
      When('I create a command from a decision with patternId "churn-risk"', () => {
        const decision = createTestDecision();
        state.decisionCommand = createCommandFromDecision("agent", decision, {
          patternId: "churn-risk",
        });
      });

      Then('the decision-created command metadata patternId is "churn-risk"', () => {
        expect(state.decisionCommand!.metadata.patternId).toBe("churn-risk");
      });
    });

    RuleScenario("Includes analysis when provided", ({ When, Then }) => {
      When("I create a command from a decision with analysis data", () => {
        const decision = createTestDecision();
        const analysis = { rawResponse: "LLM analysis" };
        state.decisionCommand = createCommandFromDecision("agent", decision, { analysis });
      });

      Then("the decision-created command metadata analysis matches the provided analysis", () => {
        expect(state.decisionCommand!.metadata.analysis).toEqual({
          rawResponse: "LLM analysis",
        });
      });
    });

    RuleScenario("Maps all decision fields correctly", ({ When, Then }) => {
      When("I create a command from a decision with specific fields", () => {
        const decision = createTestDecision({
          command: "SpecificCommand",
          payload: { specific: "data", nested: { value: 123 } },
          confidence: 0.99,
          reason: "Detailed reason for command",
          triggeringEvents: ["evt-a", "evt-b"],
        });
        state.decisionCommand = createCommandFromDecision("my-agent", decision);
      });

      Then("the decision-created command maps all fields correctly", () => {
        expect(state.decisionCommand!.type).toBe("SpecificCommand");
        expect(state.decisionCommand!.payload).toEqual({
          specific: "data",
          nested: { value: 123 },
        });
        expect(state.decisionCommand!.metadata.confidence).toBe(0.99);
        expect(state.decisionCommand!.metadata.reason).toBe("Detailed reason for command");
        expect(state.decisionCommand!.metadata.eventIds).toEqual(["evt-a", "evt-b"]);
      });
    });
  });

  // ===========================================================================
  // Rule: isEmittedAgentCommand type guard validates objects
  // ===========================================================================

  Rule("isEmittedAgentCommand type guard validates objects", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid command", ({ Then }) => {
      Then("isEmittedAgentCommand returns true for a valid command", () => {
        const command = createTestCommand();
        expect(isEmittedAgentCommand(command)).toBe(true);
      });
    });

    RuleScenario("Returns true for command with optional fields", ({ Then }) => {
      Then("isEmittedAgentCommand returns true for a command with optional fields", () => {
        const command = createTestCommand({
          metadata: createTestMetadata({
            patternId: "pattern-1",
            analysis: { data: "value" },
          }),
        });
        expect(isEmittedAgentCommand(command)).toBe(true);
      });
    });

    RuleScenario("Returns false for non-command values", ({ Then }) => {
      Then("isEmittedAgentCommand returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ valueDescription: string }>(dataTable);
        const valueMap: Record<string, unknown> = {
          null: null,
          undefined: undefined,
          "string primitive": "command",
          "number primitive": 123,
          "boolean primitive": true,
          "object without type": {
            payload: {},
            metadata: createTestMetadata(),
          },
          "object with empty type": {
            type: "",
            payload: {},
            metadata: createTestMetadata(),
          },
          "object invalid metadata": {
            type: "Command",
            payload: {},
            metadata: { agentId: "" },
          },
          "object missing metadata": {
            type: "Command",
            payload: {},
          },
        };
        for (const row of rows) {
          const value = valueMap[row["valueDescription"]];
          expect(isEmittedAgentCommand(value)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: hasPatternId type guard checks for patternId presence
  // ===========================================================================

  Rule("hasPatternId type guard checks for patternId presence", ({ RuleScenario }) => {
    RuleScenario("Returns true when command has patternId", ({ Then }) => {
      Then('hasPatternId returns true for a command with patternId "churn-risk"', () => {
        const command = createTestCommand({
          metadata: createTestMetadata({ patternId: "churn-risk" }),
        });
        expect(hasPatternId(command)).toBe(true);
      });
    });

    RuleScenario("Returns false when command has no patternId", ({ Then }) => {
      Then("hasPatternId returns false for a command without patternId", () => {
        const command = createTestCommand();
        expect(hasPatternId(command)).toBe(false);
      });
    });

    RuleScenario("Returns false when patternId is undefined explicitly", ({ Then }) => {
      Then("hasPatternId returns false for a command with explicit undefined patternId", () => {
        const command = createTestCommand({
          metadata: createTestMetadata({ patternId: undefined }),
        });
        expect(hasPatternId(command)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: hasAnalysisData type guard checks for analysis presence
  // ===========================================================================

  Rule("hasAnalysisData type guard checks for analysis presence", ({ RuleScenario }) => {
    RuleScenario("Returns true when command has analysis", ({ Then }) => {
      Then("hasAnalysisData returns true for a command with analysis", () => {
        const command = createTestCommand({
          metadata: createTestMetadata({
            analysis: { data: "value" },
          }),
        });
        expect(hasAnalysisData(command)).toBe(true);
      });
    });

    RuleScenario("Returns false when command has no analysis", ({ Then }) => {
      Then("hasAnalysisData returns false for a command without analysis", () => {
        const command = createTestCommand();
        expect(hasAnalysisData(command)).toBe(false);
      });
    });

    RuleScenario("Returns false when analysis is undefined explicitly", ({ Then }) => {
      Then("hasAnalysisData returns false for a command with explicit undefined analysis", () => {
        const command = createTestCommand({
          metadata: createTestMetadata({ analysis: undefined }),
        });
        expect(hasAnalysisData(command)).toBe(false);
      });
    });

    RuleScenario("Returns true for null analysis", ({ Then }) => {
      Then("hasAnalysisData returns true for a command with null analysis", () => {
        const command = createTestCommand({
          metadata: { ...createTestMetadata(), analysis: null },
        });
        expect(hasAnalysisData(command)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: End-to-end command creation flow validates and verifies
  // ===========================================================================

  Rule("End-to-end command creation flow validates and verifies", ({ RuleScenario }) => {
    RuleScenario("Validates, creates, and verifies command", ({ When, Then }) => {
      When("I validate args, create a command, and verify with type guard and schema", () => {
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
        state.createdCommand = createEmittedAgentCommand(
          "churn-agent",
          args.type,
          { customerId: "cust-123" },
          args.confidence,
          args.reason,
          args.eventIds
        );
      });

      Then("all steps succeed", () => {
        // Step 3: Verify with type guard
        expect(isEmittedAgentCommand(state.createdCommand)).toBe(true);

        // Step 4: Verify with schema
        const schemaResult = EmittedAgentCommandSchema.safeParse(state.createdCommand);
        expect(schemaResult.success).toBe(true);
      });
    });

    RuleScenario("Creates command from decision and verifies", ({ When, Then }) => {
      When("I create a command from a decision with options and verify", () => {
        const decision = createTestDecision();
        state.decisionCommand = createCommandFromDecision("agent", decision, {
          patternId: "churn-risk",
          analysis: { tokens: 150 },
        });
      });

      Then("the command passes type guard and has patternId and analysis", () => {
        expect(state.decisionCommand).not.toBeNull();
        expect(isEmittedAgentCommand(state.decisionCommand)).toBe(true);
        expect(hasPatternId(state.decisionCommand!)).toBe(true);
        expect(hasAnalysisData(state.decisionCommand!)).toBe(true);
      });
    });
  });
});
