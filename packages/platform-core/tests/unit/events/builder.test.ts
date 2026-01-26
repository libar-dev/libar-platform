/**
 * Unit Tests for Event Data Builder Utilities
 *
 * Tests the 2 builder functions from builder.ts:
 * - createEventData: Creates event data with auto-generated eventId
 * - createEventDataWithId: Creates event data with pre-generated eventId
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEventData, createEventDataWithId } from "../../../src/events/builder";

// Mock the generateEventId function
vi.mock("../../../src/ids/index.js", () => ({
  generateEventId: vi.fn((context: string) => `${context}_event_mock-uuid-v7`),
}));

describe("createEventData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates eventId with bounded context prefix", () => {
    const input = {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload: { orderId: "order_123", customerId: "cust_456" },
      correlationId: "corr_789",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.eventId).toBe("orders_event_mock-uuid-v7");
  });

  it("copies eventType correctly", () => {
    const input = {
      eventType: "OrderSubmitted",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload: { orderId: "order_123" },
      correlationId: "corr_789",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.eventType).toBe("OrderSubmitted");
  });

  it("copies streamType and streamId correctly", () => {
    const input = {
      eventType: "ProductCreated",
      streamType: "Product",
      streamId: "prod_456",
      boundedContext: "inventory",
      payload: { productId: "prod_456" },
      correlationId: "corr_789",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.streamType).toBe("Product");
    expect(result.streamId).toBe("prod_456");
  });

  it("copies boundedContext correctly", () => {
    const input = {
      eventType: "ReservationCreated",
      streamType: "Reservation",
      streamId: "res_789",
      boundedContext: "inventory",
      payload: { reservationId: "res_789" },
      correlationId: "corr_789",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.boundedContext).toBe("inventory");
  });

  it("copies payload correctly", () => {
    const payload = {
      orderId: "order_123",
      customerId: "cust_456",
      items: [{ productId: "prod_1", quantity: 2 }],
      totalAmount: 99.99,
    };

    const input = {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload,
      correlationId: "corr_789",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.payload).toEqual(payload);
  });

  it("includes correlationId in metadata", () => {
    const input = {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload: { orderId: "order_123" },
      correlationId: "corr_unique_123",
      causationId: "cmd_001",
    };

    const result = createEventData(input);

    expect(result.metadata.correlationId).toBe("corr_unique_123");
  });

  it("includes causationId in metadata", () => {
    const input = {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload: { orderId: "order_123" },
      correlationId: "corr_789",
      causationId: "cmd_unique_456",
    };

    const result = createEventData(input);

    expect(result.metadata.causationId).toBe("cmd_unique_456");
  });

  it("generates different eventIds for different bounded contexts", async () => {
    const { generateEventId } = await vi.importMock<{
      generateEventId: (context: string) => string;
    }>("../../../src/ids/index.js");

    const ordersInput = {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      boundedContext: "orders",
      payload: {},
      correlationId: "corr_1",
      causationId: "cmd_1",
    };

    const inventoryInput = {
      eventType: "ProductCreated",
      streamType: "Product",
      streamId: "prod_456",
      boundedContext: "inventory",
      payload: {},
      correlationId: "corr_2",
      causationId: "cmd_2",
    };

    createEventData(ordersInput);
    createEventData(inventoryInput);

    expect(generateEventId).toHaveBeenCalledWith("orders");
    expect(generateEventId).toHaveBeenCalledWith("inventory");
  });

  it("returns complete NewEventData structure", () => {
    const input = {
      eventType: "OrderCancelled",
      streamType: "Order",
      streamId: "order_999",
      boundedContext: "orders",
      payload: { orderId: "order_999", reason: "Customer request" },
      correlationId: "corr_cancel",
      causationId: "cmd_cancel",
    };

    const result = createEventData(input);

    // Verify all required fields are present
    expect(result).toHaveProperty("eventId");
    expect(result).toHaveProperty("eventType");
    expect(result).toHaveProperty("streamType");
    expect(result).toHaveProperty("streamId");
    expect(result).toHaveProperty("boundedContext");
    expect(result).toHaveProperty("payload");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("correlationId");
    expect(result.metadata).toHaveProperty("causationId");
  });
});

describe("createEventDataWithId", () => {
  it("uses provided eventId without generating new one", () => {
    const preGeneratedId = "orders_event_pre-generated-uuid";

    const result = createEventDataWithId(preGeneratedId, {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      payload: { orderId: "order_123" },
      correlationId: "corr_789",
      causationId: "cmd_001",
    });

    expect(result.eventId).toBe(preGeneratedId);
  });

  it("extracts boundedContext from eventId when not provided", () => {
    const eventId = "inventory_event_some-uuid";

    const result = createEventDataWithId(eventId, {
      eventType: "ProductCreated",
      streamType: "Product",
      streamId: "prod_123",
      payload: { productId: "prod_123" },
      correlationId: "corr_789",
      causationId: "cmd_001",
      // boundedContext not provided
    });

    expect(result.boundedContext).toBe("inventory");
  });

  it("uses provided boundedContext when explicitly set", () => {
    const eventId = "orders_event_some-uuid";

    const result = createEventDataWithId(eventId, {
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_123",
      payload: { orderId: "order_123" },
      correlationId: "corr_789",
      causationId: "cmd_001",
      boundedContext: "custom-context", // Explicitly provided
    });

    expect(result.boundedContext).toBe("custom-context");
  });

  it("uses full eventId as boundedContext when no underscore present", () => {
    const malformedId = "malformed-event-id"; // No underscore

    const result = createEventDataWithId(malformedId, {
      eventType: "TestEvent",
      streamType: "Test",
      streamId: "test_123",
      payload: {},
      correlationId: "corr_789",
      causationId: "cmd_001",
    });

    expect(result.boundedContext).toBe("malformed-event-id");
  });

  it("copies all other fields correctly", () => {
    const eventId = "orders_event_custom-uuid";
    const payload = {
      orderId: "order_123",
      items: [{ productId: "prod_1", quantity: 3 }],
    };

    const result = createEventDataWithId(eventId, {
      eventType: "OrderItemAdded",
      streamType: "Order",
      streamId: "order_123",
      payload,
      correlationId: "corr_add_item",
      causationId: "cmd_add_item",
    });

    expect(result.eventType).toBe("OrderItemAdded");
    expect(result.streamType).toBe("Order");
    expect(result.streamId).toBe("order_123");
    expect(result.payload).toEqual(payload);
    expect(result.metadata.correlationId).toBe("corr_add_item");
    expect(result.metadata.causationId).toBe("cmd_add_item");
  });

  it("handles eventId with multiple underscores correctly", () => {
    // eventId format: {context}_event_{uuid}
    const eventId = "my_bounded_context_event_uuid-v7";

    const result = createEventDataWithId(eventId, {
      eventType: "TestEvent",
      streamType: "Test",
      streamId: "test_123",
      payload: {},
      correlationId: "corr_789",
      causationId: "cmd_001",
    });

    // Should extract only the first part before underscore
    expect(result.boundedContext).toBe("my");
  });

  it("returns complete NewEventData structure", () => {
    const eventId = "orders_event_test-uuid";

    const result = createEventDataWithId(eventId, {
      eventType: "OrderConfirmed",
      streamType: "Order",
      streamId: "order_999",
      payload: { orderId: "order_999" },
      correlationId: "corr_confirm",
      causationId: "cmd_confirm",
    });

    // Verify all required fields are present
    expect(result).toHaveProperty("eventId");
    expect(result).toHaveProperty("eventType");
    expect(result).toHaveProperty("streamType");
    expect(result).toHaveProperty("streamId");
    expect(result).toHaveProperty("boundedContext");
    expect(result).toHaveProperty("payload");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("correlationId");
    expect(result.metadata).toHaveProperty("causationId");
  });
});
