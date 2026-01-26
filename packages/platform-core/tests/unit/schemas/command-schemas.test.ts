/**
 * Unit Tests for Command Schemas
 *
 * Tests Zod schemas in commands/schemas.ts:
 * - createCommandSchema factory
 * - CommandResultSchema discriminated union
 * - CommandMetadataSchema validation
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createCommandSchema,
  CommandResultSchema,
  CommandMetadataSchema,
  CommandSuccessResultSchema,
  CommandRejectedResultSchema,
  CommandConflictResultSchema,
  CommandErrorResultSchema,
} from "../../../src/commands/schemas";

describe("CommandMetadataSchema", () => {
  it("validates complete metadata", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      timestamp: Date.now(),
    });

    expect(result.success).toBe(true);
  });

  it("validates metadata with optional userId", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      userId: "user_789",
      timestamp: Date.now(),
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-integer timestamp", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      timestamp: 1234.56,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative timestamp", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      timestamp: -1000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero timestamp", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      timestamp: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = CommandMetadataSchema.safeParse({
      commandId: "cmd_123",
      // missing commandType, correlationId, timestamp
    });

    expect(result.success).toBe(false);
  });
});

describe("createCommandSchema", () => {
  const TestPayloadSchema = z.object({
    foo: z.string(),
    bar: z.number().optional(),
  });

  const TestCommandSchema = createCommandSchema("TestCommand", TestPayloadSchema);

  it("validates complete command", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: { foo: "bar" },
    });

    expect(result.success).toBe(true);
  });

  it("validates command with optional payload fields", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: { foo: "bar", bar: 42 },
    });

    expect(result.success).toBe(true);
  });

  it("rejects wrong commandType literal", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "WrongType",
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: { foo: "bar" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid payload type", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: { foo: 123 }, // Should be string
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing payload fields", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: {}, // Missing required 'foo'
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing targetContext", () => {
    const result = TestCommandSchema.safeParse({
      commandId: "cmd_123",
      commandType: "TestCommand",
      correlationId: "corr_456",
      timestamp: Date.now(),
      payload: { foo: "bar" },
    });

    expect(result.success).toBe(false);
  });

  it("provides type inference for commandType literal", () => {
    const validCommand = {
      commandId: "cmd_123",
      commandType: "TestCommand" as const,
      correlationId: "corr_456",
      targetContext: "test",
      timestamp: Date.now(),
      payload: { foo: "bar" },
    };

    type InferredCommand = z.infer<typeof TestCommandSchema>;

    // This compile-time check ensures the inferred type has the literal
    const typedCommand: InferredCommand = validCommand;
    expect(typedCommand.commandType).toBe("TestCommand");
  });
});

describe("CommandResultSchema (discriminated union)", () => {
  describe("success result", () => {
    it("validates success with version and data", () => {
      const result = CommandSuccessResultSchema.safeParse({
        status: "success",
        version: 1,
        data: { id: "123" },
      });

      expect(result.success).toBe(true);
    });

    it("validates success with undefined data", () => {
      const result = CommandSuccessResultSchema.safeParse({
        status: "success",
        version: 5,
        data: undefined,
      });

      expect(result.success).toBe(true);
    });

    it("rejects success without version", () => {
      const result = CommandSuccessResultSchema.safeParse({
        status: "success",
        data: { id: "123" },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("rejected result", () => {
    it("validates rejected with code and reason", () => {
      const result = CommandRejectedResultSchema.safeParse({
        status: "rejected",
        code: "VALIDATION_ERROR",
        reason: "Invalid input data",
      });

      expect(result.success).toBe(true);
    });

    it("validates rejected with optional context", () => {
      const result = CommandRejectedResultSchema.safeParse({
        status: "rejected",
        code: "BUSINESS_RULE_VIOLATION",
        reason: "Cannot cancel completed order",
        context: { orderId: "123", currentStatus: "completed" },
      });

      expect(result.success).toBe(true);
    });

    it("rejects rejected without reason", () => {
      const result = CommandRejectedResultSchema.safeParse({
        status: "rejected",
        code: "VALIDATION_ERROR",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("conflict result", () => {
    it("validates conflict with CONCURRENT_MODIFICATION code", () => {
      const result = CommandConflictResultSchema.safeParse({
        status: "conflict",
        code: "CONCURRENT_MODIFICATION",
        currentVersion: 5,
      });

      expect(result.success).toBe(true);
    });

    it("rejects conflict with wrong code", () => {
      const result = CommandConflictResultSchema.safeParse({
        status: "conflict",
        code: "OTHER_CODE",
        currentVersion: 5,
      });

      expect(result.success).toBe(false);
    });

    it("rejects conflict without currentVersion", () => {
      const result = CommandConflictResultSchema.safeParse({
        status: "conflict",
        code: "CONCURRENT_MODIFICATION",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("error result", () => {
    it("validates error with message", () => {
      const result = CommandErrorResultSchema.safeParse({
        status: "error",
        message: "Unexpected database error",
      });

      expect(result.success).toBe(true);
    });

    it("rejects error without message", () => {
      const result = CommandErrorResultSchema.safeParse({
        status: "error",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("union discrimination", () => {
    it("correctly discriminates success", () => {
      const result = CommandResultSchema.safeParse({
        status: "success",
        version: 1,
        data: null,
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.status === "success") {
        expect(result.data.version).toBe(1);
      }
    });

    it("correctly discriminates rejected", () => {
      const result = CommandResultSchema.safeParse({
        status: "rejected",
        code: "ERROR",
        reason: "Something went wrong",
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.status === "rejected") {
        expect(result.data.code).toBe("ERROR");
        expect(result.data.reason).toBe("Something went wrong");
      }
    });

    it("correctly discriminates conflict", () => {
      const result = CommandResultSchema.safeParse({
        status: "conflict",
        code: "CONCURRENT_MODIFICATION",
        currentVersion: 10,
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.status === "conflict") {
        expect(result.data.currentVersion).toBe(10);
      }
    });

    it("correctly discriminates error", () => {
      const result = CommandResultSchema.safeParse({
        status: "error",
        message: "Internal error",
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.status === "error") {
        expect(result.data.message).toBe("Internal error");
      }
    });

    it("rejects unknown status", () => {
      const result = CommandResultSchema.safeParse({
        status: "unknown",
        data: {},
      });

      expect(result.success).toBe(false);
    });
  });
});
