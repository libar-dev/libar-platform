/**
 * Unit tests for command logging helpers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockLogger } from "../../../src/logging/testing.js";
import {
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandFailed,
  logCommandError,
  type BaseCommandLogContext,
} from "../../../src/logging/commands.js";

describe("Command Logging Helpers", () => {
  const mockLogger = createMockLogger();
  const baseContext: BaseCommandLogContext = {
    commandType: "CreateOrder",
    commandId: "cmd-123",
    correlationId: "corr-456",
    orderId: "order-789", // Entity-specific field
  };

  beforeEach(() => {
    mockLogger.clear();
  });

  describe("logCommandStart", () => {
    it("logs command start at INFO level", () => {
      logCommandStart(mockLogger, baseContext);

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("INFO");
      expect(mockLogger.calls[0].message).toBe("Command started");
      expect(mockLogger.calls[0].data).toEqual(baseContext);
    });

    it("includes entity-specific fields in log data", () => {
      const contextWithMultipleFields: BaseCommandLogContext = {
        ...baseContext,
        customerId: "cust-111",
        amount: 100.5,
      };

      logCommandStart(mockLogger, contextWithMultipleFields);

      expect(mockLogger.calls[0].data).toEqual(contextWithMultipleFields);
    });
  });

  describe("logCommandSuccess", () => {
    it("logs command success with version and eventType at INFO level", () => {
      const result = { version: 1, eventType: "OrderCreated" };

      logCommandSuccess(mockLogger, baseContext, result);

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("INFO");
      expect(mockLogger.calls[0].message).toBe("Command succeeded");
      expect(mockLogger.calls[0].data).toEqual({
        ...baseContext,
        version: 1,
        eventType: "OrderCreated",
      });
    });

    it("preserves context fields alongside result fields", () => {
      const result = { version: 5, eventType: "OrderConfirmed" };

      logCommandSuccess(mockLogger, baseContext, result);

      const data = mockLogger.calls[0].data;
      expect(data).toHaveProperty("commandType", "CreateOrder");
      expect(data).toHaveProperty("commandId", "cmd-123");
      expect(data).toHaveProperty("correlationId", "corr-456");
      expect(data).toHaveProperty("orderId", "order-789");
      expect(data).toHaveProperty("version", 5);
      expect(data).toHaveProperty("eventType", "OrderConfirmed");
    });
  });

  describe("logCommandRejected", () => {
    it("logs command rejection with code and message at WARN level", () => {
      const reason = { code: "INVALID_STATE", message: "Order already confirmed" };

      logCommandRejected(mockLogger, baseContext, reason);

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("WARN");
      expect(mockLogger.calls[0].message).toBe("Command rejected");
      expect(mockLogger.calls[0].data).toEqual({
        ...baseContext,
        rejectionCode: "INVALID_STATE",
        rejectionMessage: "Order already confirmed",
      });
    });

    it("uses rejectionCode and rejectionMessage field names", () => {
      const reason = { code: "DUPLICATE", message: "Order ID already exists" };

      logCommandRejected(mockLogger, baseContext, reason);

      const data = mockLogger.calls[0].data;
      expect(data).toHaveProperty("rejectionCode", "DUPLICATE");
      expect(data).toHaveProperty("rejectionMessage", "Order ID already exists");
      expect(data).not.toHaveProperty("code");
      expect(data).not.toHaveProperty("message");
    });
  });

  describe("logCommandFailed", () => {
    it("logs business failure with eventType and reason at WARN level", () => {
      const failure = { eventType: "ReservationFailed", reason: "Insufficient stock" };

      logCommandFailed(mockLogger, baseContext, failure);

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("WARN");
      expect(mockLogger.calls[0].message).toBe("Command failed (business)");
      expect(mockLogger.calls[0].data).toEqual({
        ...baseContext,
        eventType: "ReservationFailed",
        failureReason: "Insufficient stock",
      });
    });

    it("uses failureReason field name to distinguish from error", () => {
      const failure = { eventType: "PaymentFailed", reason: "Card declined" };

      logCommandFailed(mockLogger, baseContext, failure);

      const data = mockLogger.calls[0].data;
      expect(data).toHaveProperty("failureReason", "Card declined");
      expect(data).not.toHaveProperty("reason");
    });
  });

  describe("logCommandError", () => {
    it("logs unexpected error at ERROR level with Error message and stack", () => {
      const error = new Error("Database connection failed");

      logCommandError(mockLogger, baseContext, error);

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("ERROR");
      expect(mockLogger.calls[0].message).toBe("Command failed");

      const data = mockLogger.calls[0].data;
      expect(data).toMatchObject({
        ...baseContext,
        error: {
          message: "Database connection failed",
          stack: expect.stringContaining("Error: Database connection failed"),
        },
      });
    });

    it("logs unexpected error at ERROR level with string error", () => {
      logCommandError(mockLogger, baseContext, "Something went wrong");

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0].level).toBe("ERROR");
      expect(mockLogger.calls[0].message).toBe("Command failed");
      expect(mockLogger.calls[0].data).toEqual({
        ...baseContext,
        error: "Something went wrong",
      });
    });

    it("converts non-string, non-Error values to string", () => {
      logCommandError(mockLogger, baseContext, { custom: "error object" });

      expect(mockLogger.calls[0].data).toHaveProperty("error", "[object Object]");
    });

    it("handles null error value", () => {
      logCommandError(mockLogger, baseContext, null);

      expect(mockLogger.calls[0].data).toHaveProperty("error", "null");
    });

    it("handles undefined error value", () => {
      logCommandError(mockLogger, baseContext, undefined);

      expect(mockLogger.calls[0].data).toHaveProperty("error", "undefined");
    });

    it("preserves stack trace for debugging", () => {
      const error = new Error("Test error");

      logCommandError(mockLogger, baseContext, error);

      const errorData = mockLogger.calls[0].data?.["error"] as { message: string; stack?: string };
      expect(errorData).toHaveProperty("stack");
      expect(errorData.stack).toContain("Test error");
    });
  });

  describe("integration patterns", () => {
    it("logs full command lifecycle", () => {
      // Start
      logCommandStart(mockLogger, baseContext);

      // Success
      logCommandSuccess(mockLogger, baseContext, { version: 1, eventType: "OrderCreated" });

      expect(mockLogger.calls).toHaveLength(2);
      expect(mockLogger.calls[0].message).toBe("Command started");
      expect(mockLogger.calls[1].message).toBe("Command succeeded");
    });

    it("logs command lifecycle with rejection", () => {
      // Start
      logCommandStart(mockLogger, baseContext);

      // Rejection
      logCommandRejected(mockLogger, baseContext, {
        code: "INVALID_STATE",
        message: "Cannot modify confirmed order",
      });

      expect(mockLogger.calls).toHaveLength(2);
      expect(mockLogger.getCallsAtLevel("INFO")).toHaveLength(1);
      expect(mockLogger.getCallsAtLevel("WARN")).toHaveLength(1);
    });

    it("logs command lifecycle with error", () => {
      // Start
      logCommandStart(mockLogger, baseContext);

      // Error
      logCommandError(mockLogger, baseContext, new Error("Unexpected failure"));

      expect(mockLogger.calls).toHaveLength(2);
      expect(mockLogger.getCallsAtLevel("INFO")).toHaveLength(1);
      expect(mockLogger.getCallsAtLevel("ERROR")).toHaveLength(1);
    });
  });
});
