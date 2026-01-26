/**
 * Unit Tests for Handler Result Helpers
 *
 * Tests the result helper functions for dual-write command handlers:
 * - successResult: Create success results with event data
 * - rejectedResult: Create rejection results for invariant failures
 * - failedResult: Create failure results that still emit events
 */
import { describe, it, expect } from "vitest";
import { successResult, rejectedResult, failedResult } from "../../../src/handlers/result";
import type { EventData } from "../../../src/orchestration/types";

// Test event data factory
function createTestEventData(overrides?: Partial<EventData>): EventData {
  return {
    eventId: "evt_123",
    eventType: "TestEventOccurred",
    streamType: "Test",
    streamId: "test_456",
    payload: { value: 42 },
    metadata: {
      correlationId: "corr_789",
      causationId: "cmd_101",
    },
    ...overrides,
  };
}

describe("successResult", () => {
  it("creates a success result with correct structure", () => {
    const data = { orderId: "order_123", customerId: "cust_456" };
    const event = createTestEventData();
    const version = 5;

    const result = successResult(data, version, event);

    expect(result).toEqual({
      status: "success",
      data: { orderId: "order_123", customerId: "cust_456" },
      version: 5,
      event,
    });
  });

  it("preserves typed data in the result", () => {
    interface CreateOrderData {
      orderId: string;
      customerId: string;
    }

    const data: CreateOrderData = { orderId: "order_123", customerId: "cust_456" };
    const result = successResult(data, 1, createTestEventData());

    // TypeScript should infer the correct type
    expect(result.data.orderId).toBe("order_123");
    expect(result.data.customerId).toBe("cust_456");
  });

  it("returns status as 'success' literal type", () => {
    const result = successResult({}, 0, createTestEventData());
    expect(result.status).toBe("success");
  });
});

describe("rejectedResult", () => {
  it("creates a rejected result with code and reason", () => {
    const result = rejectedResult("ORDER_NOT_FOUND", "Order not found");

    expect(result).toEqual({
      status: "rejected",
      code: "ORDER_NOT_FOUND",
      reason: "Order not found",
    });
  });

  it("includes context when provided", () => {
    const result = rejectedResult("ORDER_NOT_FOUND", "Order not found", {
      orderId: "order_123",
      searchedAt: Date.now(),
    });

    expect(result.status).toBe("rejected");
    expect(result.code).toBe("ORDER_NOT_FOUND");
    expect(result.context).toEqual({
      orderId: "order_123",
      searchedAt: expect.any(Number),
    });
  });

  it("omits context property when not provided (exactOptionalPropertyTypes)", () => {
    const result = rejectedResult("VALIDATION_ERROR", "Invalid input");

    // Should not have context property at all (not even undefined)
    expect("context" in result).toBe(false);
  });

  it("returns status as 'rejected' literal type", () => {
    const result = rejectedResult("ERROR", "message");
    expect(result.status).toBe("rejected");
  });
});

describe("failedResult", () => {
  it("creates a failed result with event data", () => {
    const event = createTestEventData({ eventType: "ReservationFailed" });
    const result = failedResult("Insufficient stock", event);

    expect(result).toEqual({
      status: "failed",
      reason: "Insufficient stock",
      event,
    });
  });

  it("includes expectedVersion when provided", () => {
    const event = createTestEventData();
    const result = failedResult("Operation failed", event, 10);

    expect(result.status).toBe("failed");
    expect(result.expectedVersion).toBe(10);
  });

  it("includes context when provided", () => {
    const event = createTestEventData();
    const result = failedResult("Operation failed", event, undefined, {
      attemptedQuantity: 100,
      availableStock: 50,
    });

    expect(result.context).toEqual({
      attemptedQuantity: 100,
      availableStock: 50,
    });
  });

  it("includes both expectedVersion and context when provided", () => {
    const event = createTestEventData();
    const result = failedResult("Operation failed", event, 5, {
      detail: "extra info",
    });

    expect(result.expectedVersion).toBe(5);
    expect(result.context).toEqual({ detail: "extra info" });
  });

  it("omits optional properties when not provided", () => {
    const event = createTestEventData();
    const result = failedResult("Simple failure", event);

    expect("expectedVersion" in result).toBe(false);
    expect("context" in result).toBe(false);
  });

  it("returns status as 'failed' literal type", () => {
    const result = failedResult("message", createTestEventData());
    expect(result.status).toBe("failed");
  });
});
