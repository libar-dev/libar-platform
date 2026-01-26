/**
 * Unit Tests for Event Schema Factories
 *
 * Tests the 5 schema factory functions from schemas.ts:
 * - createEventSchema: Basic event with typed eventType and payload
 * - createDomainEventSchema: Domain events with category "domain"
 * - createIntegrationEventSchema: Integration events with category "integration"
 * - createTriggerEventSchema: Minimal events with entityIdField only
 * - createFatEventSchema: Full state snapshot events with category "fat"
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createEventSchema,
  createDomainEventSchema,
  createIntegrationEventSchema,
  createTriggerEventSchema,
  createFatEventSchema,
  EventMetadataSchema,
  EnhancedEventMetadataSchema,
  DomainEventSchema,
  EnhancedDomainEventSchema,
} from "../../../src/events/schemas";

// Helper to create valid event metadata for testing
function createValidEventMetadata() {
  return {
    eventId: "evt_123",
    eventType: "TestEvent",
    streamType: "Test",
    streamId: "test_456",
    version: 1,
    globalPosition: 100,
    timestamp: Date.now(),
    correlationId: "corr_789",
    boundedContext: "testing",
  };
}

// Helper to create valid enhanced event metadata for testing
function createValidEnhancedEventMetadata() {
  return {
    ...createValidEventMetadata(),
    category: "domain" as const,
    schemaVersion: 1,
  };
}

describe("EventMetadataSchema", () => {
  it("validates correct event metadata", () => {
    const metadata = createValidEventMetadata();
    const result = EventMetadataSchema.parse(metadata);

    expect(result.eventId).toBe(metadata.eventId);
    expect(result.eventType).toBe(metadata.eventType);
    expect(result.streamType).toBe(metadata.streamType);
    expect(result.streamId).toBe(metadata.streamId);
    expect(result.version).toBe(metadata.version);
    expect(result.globalPosition).toBe(metadata.globalPosition);
    expect(result.correlationId).toBe(metadata.correlationId);
    expect(result.boundedContext).toBe(metadata.boundedContext);
  });

  it("rejects missing required fields", () => {
    expect(() => EventMetadataSchema.parse({})).toThrow();
    expect(() =>
      EventMetadataSchema.parse({
        eventId: "evt_123",
        // missing other required fields
      })
    ).toThrow();
  });

  it("allows optional causationId", () => {
    const metadata = createValidEventMetadata();

    // Without causationId
    const result1 = EventMetadataSchema.parse(metadata);
    expect(result1.causationId).toBeUndefined();

    // With causationId
    const result2 = EventMetadataSchema.parse({
      ...metadata,
      causationId: "cause_123",
    });
    expect(result2.causationId).toBe("cause_123");
  });

  it("rejects invalid version (must be positive integer)", () => {
    const metadata = createValidEventMetadata();

    expect(() => EventMetadataSchema.parse({ ...metadata, version: 0 })).toThrow();
    expect(() => EventMetadataSchema.parse({ ...metadata, version: -1 })).toThrow();
    expect(() => EventMetadataSchema.parse({ ...metadata, version: 1.5 })).toThrow();
  });

  it("allows zero globalPosition (nonnegative)", () => {
    const metadata = createValidEventMetadata();
    const result = EventMetadataSchema.parse({ ...metadata, globalPosition: 0 });
    expect(result.globalPosition).toBe(0);
  });
});

describe("EnhancedEventMetadataSchema", () => {
  it("extends EventMetadataSchema with category and schemaVersion", () => {
    const metadata = createValidEnhancedEventMetadata();
    const result = EnhancedEventMetadataSchema.parse(metadata);

    expect(result.category).toBe("domain");
    expect(result.schemaVersion).toBe(1);
  });

  it("defaults category to 'domain' when not provided", () => {
    const metadata = createValidEventMetadata();
    const result = EnhancedEventMetadataSchema.parse(metadata);
    expect(result.category).toBe("domain");
  });

  it("defaults schemaVersion to 1 when not provided", () => {
    const metadata = createValidEventMetadata();
    const result = EnhancedEventMetadataSchema.parse(metadata);
    expect(result.schemaVersion).toBe(1);
  });

  it("accepts all valid categories", () => {
    const metadata = createValidEventMetadata();

    expect(EnhancedEventMetadataSchema.parse({ ...metadata, category: "domain" }).category).toBe(
      "domain"
    );
    expect(
      EnhancedEventMetadataSchema.parse({ ...metadata, category: "integration" }).category
    ).toBe("integration");
    expect(EnhancedEventMetadataSchema.parse({ ...metadata, category: "trigger" }).category).toBe(
      "trigger"
    );
    expect(EnhancedEventMetadataSchema.parse({ ...metadata, category: "fat" }).category).toBe(
      "fat"
    );
  });

  it("rejects invalid categories", () => {
    const metadata = createValidEventMetadata();
    expect(() => EnhancedEventMetadataSchema.parse({ ...metadata, category: "invalid" })).toThrow();
  });
});

describe("createEventSchema", () => {
  it("creates schema with literal eventType", () => {
    const OrderCreatedSchema = createEventSchema(
      "OrderCreated",
      z.object({
        orderId: z.string(),
        customerId: z.string(),
      })
    );

    const validEvent = {
      ...createValidEventMetadata(),
      eventType: "OrderCreated",
      payload: {
        orderId: "order_123",
        customerId: "customer_456",
      },
    };

    const result = OrderCreatedSchema.parse(validEvent);
    expect(result.eventType).toBe("OrderCreated");
    expect(result.payload.orderId).toBe("order_123");
    expect(result.payload.customerId).toBe("customer_456");
  });

  it("rejects events with wrong eventType", () => {
    const OrderCreatedSchema = createEventSchema("OrderCreated", z.object({ orderId: z.string() }));

    const wrongTypeEvent = {
      ...createValidEventMetadata(),
      eventType: "WrongEvent", // Should be "OrderCreated"
      payload: { orderId: "order_123" },
    };

    expect(() => OrderCreatedSchema.parse(wrongTypeEvent)).toThrow();
  });

  it("validates payload schema", () => {
    const OrderCreatedSchema = createEventSchema(
      "OrderCreated",
      z.object({
        orderId: z.string(),
        quantity: z.number().positive(),
      })
    );

    const invalidPayload = {
      ...createValidEventMetadata(),
      eventType: "OrderCreated",
      payload: {
        orderId: "order_123",
        quantity: -5, // Should be positive
      },
    };

    expect(() => OrderCreatedSchema.parse(invalidPayload)).toThrow();
  });

  it("allows optional metadata", () => {
    const TestSchema = createEventSchema("Test", z.object({ id: z.string() }));

    // Without metadata
    const event1 = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
    };
    expect(TestSchema.parse(event1).metadata).toBeUndefined();

    // With metadata
    const event2 = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
      metadata: { source: "api", requestId: "req_123" },
    };
    expect(TestSchema.parse(event2).metadata).toEqual({ source: "api", requestId: "req_123" });
  });
});

describe("createDomainEventSchema", () => {
  it("creates schema with category 'domain'", () => {
    const OrderSubmittedSchema = createDomainEventSchema({
      eventType: "OrderSubmitted",
      payloadSchema: z.object({
        orderId: z.string(),
        totalAmount: z.number(),
      }),
    });

    const event = {
      ...createValidEnhancedEventMetadata(),
      eventType: "OrderSubmitted",
      payload: {
        orderId: "order_123",
        totalAmount: 99.99,
      },
    };

    const result = OrderSubmittedSchema.parse(event);
    expect(result.eventType).toBe("OrderSubmitted");
    expect(result.category).toBe("domain");
    expect(result.payload.orderId).toBe("order_123");
    expect(result.payload.totalAmount).toBe(99.99);
  });

  it("defaults category to 'domain' when not provided in input", () => {
    const Schema = createDomainEventSchema({
      eventType: "Test",
      payloadSchema: z.object({ id: z.string() }),
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
      // category not provided
    };

    const result = Schema.parse(event);
    expect(result.category).toBe("domain");
  });

  it("defaults schemaVersion to 1 when not specified in config", () => {
    const Schema = createDomainEventSchema({
      eventType: "Test",
      payloadSchema: z.object({ id: z.string() }),
      // schemaVersion not provided
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
    };

    const result = Schema.parse(event);
    expect(result.schemaVersion).toBe(1);
  });

  it("accepts custom schemaVersion in config", () => {
    const SchemaV2 = createDomainEventSchema({
      eventType: "Test",
      payloadSchema: z.object({ id: z.string(), newField: z.string() }),
      schemaVersion: 2,
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123", newField: "value" },
    };

    const result = SchemaV2.parse(event);
    expect(result.schemaVersion).toBe(2);
  });

  it("enforces literal schemaVersion matching config", () => {
    const SchemaV2 = createDomainEventSchema({
      eventType: "Test",
      payloadSchema: z.object({ id: z.string() }),
      schemaVersion: 2,
    });

    // Providing wrong schemaVersion should fail
    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
      schemaVersion: 3, // Should be 2
    };

    expect(() => SchemaV2.parse(event)).toThrow();
  });
});

describe("createIntegrationEventSchema", () => {
  it("creates schema with category 'integration'", () => {
    const OrderPlacedIntegrationSchema = createIntegrationEventSchema({
      eventType: "OrderPlacedIntegration",
      sourceContext: "orders",
      payloadSchema: z.object({
        orderId: z.string(),
        customerId: z.string(),
        totalAmount: z.number(),
      }),
    });

    const event = {
      ...createValidEnhancedEventMetadata(),
      eventType: "OrderPlacedIntegration",
      category: "integration" as const,
      payload: {
        orderId: "order_123",
        customerId: "customer_456",
        totalAmount: 199.99,
      },
    };

    const result = OrderPlacedIntegrationSchema.parse(event);
    expect(result.eventType).toBe("OrderPlacedIntegration");
    expect(result.category).toBe("integration");
    expect(result.payload.totalAmount).toBe(199.99);
  });

  it("defaults category to 'integration' when not provided in input", () => {
    const Schema = createIntegrationEventSchema({
      eventType: "TestIntegration",
      sourceContext: "test",
      payloadSchema: z.object({ id: z.string() }),
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "TestIntegration",
      payload: { id: "123" },
      // category not provided - should default to integration
    };

    const result = Schema.parse(event);
    expect(result.category).toBe("integration");
  });

  it("defaults schemaVersion to 1", () => {
    const Schema = createIntegrationEventSchema({
      eventType: "TestIntegration",
      sourceContext: "test",
      payloadSchema: z.object({ id: z.string() }),
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "TestIntegration",
      payload: { id: "123" },
    };

    const result = Schema.parse(event);
    expect(result.schemaVersion).toBe(1);
  });
});

describe("createTriggerEventSchema", () => {
  it("creates schema with category 'trigger' and minimal payload", () => {
    const OrderShipmentStartedSchema = createTriggerEventSchema({
      eventType: "OrderShipmentStarted",
      entityIdField: "orderId",
    });

    const event = {
      ...createValidEnhancedEventMetadata(),
      eventType: "OrderShipmentStarted",
      category: "trigger" as const,
      payload: {
        orderId: "order_123",
      },
    };

    const result = OrderShipmentStartedSchema.parse(event);
    expect(result.eventType).toBe("OrderShipmentStarted");
    expect(result.category).toBe("trigger");
    expect(result.payload.orderId).toBe("order_123");
  });

  it("only allows the specified entityIdField in payload", () => {
    const Schema = createTriggerEventSchema({
      eventType: "ItemUpdated",
      entityIdField: "itemId",
    });

    // Valid - only itemId
    const validEvent = {
      ...createValidEventMetadata(),
      eventType: "ItemUpdated",
      payload: { itemId: "item_123" },
    };
    expect(Schema.parse(validEvent).payload.itemId).toBe("item_123");

    // Invalid - missing itemId
    const missingIdEvent = {
      ...createValidEventMetadata(),
      eventType: "ItemUpdated",
      payload: {},
    };
    expect(() => Schema.parse(missingIdEvent)).toThrow();
  });

  it("defaults category to 'trigger' when not provided", () => {
    const Schema = createTriggerEventSchema({
      eventType: "Test",
      entityIdField: "testId",
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { testId: "123" },
    };

    const result = Schema.parse(event);
    expect(result.category).toBe("trigger");
  });

  it("supports custom schemaVersion", () => {
    const Schema = createTriggerEventSchema({
      eventType: "Test",
      entityIdField: "testId",
      schemaVersion: 3,
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { testId: "123" },
    };

    const result = Schema.parse(event);
    expect(result.schemaVersion).toBe(3);
  });
});

describe("createFatEventSchema", () => {
  it("creates schema with category 'fat' and full payload", () => {
    const OrderSnapshotSchema = createFatEventSchema({
      eventType: "OrderSnapshot",
      payloadSchema: z.object({
        orderId: z.string(),
        customerId: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number(),
            price: z.number(),
          })
        ),
        totalAmount: z.number(),
        status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
        createdAt: z.number(),
      }),
    });

    const event = {
      ...createValidEnhancedEventMetadata(),
      eventType: "OrderSnapshot",
      category: "fat" as const,
      payload: {
        orderId: "order_123",
        customerId: "customer_456",
        items: [{ productId: "prod_1", quantity: 2, price: 50 }],
        totalAmount: 100,
        status: "confirmed" as const,
        createdAt: Date.now(),
      },
    };

    const result = OrderSnapshotSchema.parse(event);
    expect(result.eventType).toBe("OrderSnapshot");
    expect(result.category).toBe("fat");
    expect(result.payload.orderId).toBe("order_123");
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.status).toBe("confirmed");
  });

  it("defaults category to 'fat' when not provided", () => {
    const Schema = createFatEventSchema({
      eventType: "TestSnapshot",
      payloadSchema: z.object({
        id: z.string(),
        data: z.record(z.string(), z.unknown()),
      }),
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "TestSnapshot",
      payload: { id: "123", data: { foo: "bar" } },
    };

    const result = Schema.parse(event);
    expect(result.category).toBe("fat");
  });

  it("validates complex nested payload structures", () => {
    const ComplexSchema = createFatEventSchema({
      eventType: "ComplexSnapshot",
      payloadSchema: z.object({
        nested: z.object({
          level2: z.object({
            value: z.number().positive(),
          }),
        }),
        optionalField: z.string().optional(),
      }),
    });

    // Valid
    const validEvent = {
      ...createValidEventMetadata(),
      eventType: "ComplexSnapshot",
      payload: {
        nested: { level2: { value: 42 } },
      },
    };
    expect(ComplexSchema.parse(validEvent).payload.nested.level2.value).toBe(42);

    // Invalid - negative value
    const invalidEvent = {
      ...createValidEventMetadata(),
      eventType: "ComplexSnapshot",
      payload: {
        nested: { level2: { value: -1 } },
      },
    };
    expect(() => ComplexSchema.parse(invalidEvent)).toThrow();
  });

  it("supports custom schemaVersion", () => {
    const SchemaV5 = createFatEventSchema({
      eventType: "Test",
      payloadSchema: z.object({ id: z.string() }),
      schemaVersion: 5,
    });

    const event = {
      ...createValidEventMetadata(),
      eventType: "Test",
      payload: { id: "123" },
    };

    const result = SchemaV5.parse(event);
    expect(result.schemaVersion).toBe(5);
  });
});

describe("DomainEventSchema and EnhancedDomainEventSchema", () => {
  it("DomainEventSchema accepts any payload", () => {
    const event = {
      ...createValidEventMetadata(),
      payload: { anyField: "anyValue", nested: { deep: true } },
    };

    const result = DomainEventSchema.parse(event);
    expect(result.payload).toEqual({ anyField: "anyValue", nested: { deep: true } });
  });

  it("EnhancedDomainEventSchema includes category and schemaVersion with defaults", () => {
    const event = {
      ...createValidEventMetadata(),
      payload: { data: "test" },
    };

    const result = EnhancedDomainEventSchema.parse(event);
    expect(result.category).toBe("domain");
    expect(result.schemaVersion).toBe(1);
    expect(result.payload).toEqual({ data: "test" });
  });

  it("EnhancedDomainEventSchema allows optional metadata", () => {
    const event = {
      ...createValidEventMetadata(),
      payload: {},
      metadata: { source: "test", requestId: "req_123" },
    };

    const result = EnhancedDomainEventSchema.parse(event);
    expect(result.metadata).toEqual({ source: "test", requestId: "req_123" });
  });
});
