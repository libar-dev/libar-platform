/**
 * Unit Tests for Event Upcaster Utilities
 *
 * Tests the event schema evolution utilities:
 * - createEventUpcaster: Chain-based migration for events
 * - createUpcasterRegistry: Centralized upcaster management
 * - Helper migrations: addFieldMigration, renameFieldMigration
 * - EventUpcasterError: Error handling
 */
import { describe, it, expect } from "vitest";
import {
  createEventUpcaster,
  createUpcasterRegistry,
  addFieldMigration,
  renameFieldMigration,
  EventUpcasterError,
} from "../../../src/events/upcaster";
import type { EnhancedDomainEvent } from "../../../src/events/types";

// Test event types for schema evolution scenarios
interface OrderCreatedV1Payload {
  orderId: string;
  customerId: string;
}

interface OrderCreatedV2Payload extends OrderCreatedV1Payload {
  createdAt: number;
}

interface OrderCreatedV3Payload extends OrderCreatedV2Payload {
  priority: "low" | "medium" | "high";
}

// Helper to create test events - always returns EnhancedDomainEvent
function createTestEvent<T>(payload: T, schemaVersion: number = 1): EnhancedDomainEvent<T> {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCreated",
    streamType: "Order",
    streamId: "order_456",
    version: 1,
    globalPosition: 1000,
    timestamp: Date.now(),
    correlationId: "corr_789",
    boundedContext: "orders",
    payload,
    category: "domain",
    schemaVersion,
  };
}

describe("createEventUpcaster", () => {
  describe("when event is at current version", () => {
    it("returns event as-is without migration", () => {
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
            },
            schemaVersion: 2,
          }),
        },
      });

      const event = createTestEvent<OrderCreatedV2Payload>(
        { orderId: "order_1", customerId: "cust_1", createdAt: 1234567890 },
        2
      );

      const result = upcaster(event);

      expect(result.wasUpcasted).toBe(false);
      expect(result.originalSchemaVersion).toBe(2);
      expect(result.currentSchemaVersion).toBe(2);
      expect(result.event.payload).toEqual(event.payload);
    });
  });

  describe("when event needs single migration", () => {
    it("applies migration from v1 to v2", () => {
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
            },
            schemaVersion: 2,
          }),
        },
      });

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      const result = upcaster(event);

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalSchemaVersion).toBe(1);
      expect(result.currentSchemaVersion).toBe(2);
      expect(result.event.payload.createdAt).toBeDefined();
    });
  });

  describe("when event needs multiple migrations", () => {
    it("applies migrations in order from v1 to v3", () => {
      const upcaster = createEventUpcaster<OrderCreatedV3Payload>({
        currentVersion: 3,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
            },
            schemaVersion: 2,
          }),
          2: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload,
              priority: "medium" as const,
            },
            schemaVersion: 3,
          }),
        },
      });

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      const result = upcaster(event);

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalSchemaVersion).toBe(1);
      expect(result.currentSchemaVersion).toBe(3);
      expect(result.event.payload.createdAt).toBeDefined();
      expect(result.event.payload.priority).toBe("medium");
    });
  });

  describe("error cases", () => {
    it("throws at creation time when migration chain is incomplete", () => {
      expect(() =>
        createEventUpcaster<OrderCreatedV3Payload>({
          currentVersion: 3,
          migrations: {
            1: (event) => ({
              ...event,
              schemaVersion: 2,
            }),
            // Missing migration from v2 to v3
          },
        })
      ).toThrow("Missing migration for version 2");
    });

    it("throws FUTURE_VERSION for events with future schema version", () => {
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({ ...event, schemaVersion: 2 }),
        },
      });

      const futureEvent = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        5 // Future version
      );

      expect(() => upcaster(futureEvent)).toThrow(EventUpcasterError);
      expect(() => upcaster(futureEvent)).toThrow("is newer than current version");
    });
  });

  describe("with validation function", () => {
    it("passes when validation succeeds", () => {
      const isValid = (event: unknown): event is EnhancedDomainEvent<OrderCreatedV2Payload> =>
        event !== null &&
        typeof event === "object" &&
        "payload" in event &&
        typeof (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt === "number";

      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: Date.now(),
            },
            schemaVersion: 2,
          }),
        },
        validate: isValid,
      });

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      const result = upcaster(event);
      expect(result.wasUpcasted).toBe(true);
      expect(result.event.payload.createdAt).toBeDefined();
    });

    it("throws when validation fails", () => {
      const isValid = (event: unknown): event is EnhancedDomainEvent<OrderCreatedV2Payload> =>
        event !== null &&
        typeof event === "object" &&
        "payload" in event &&
        typeof (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt ===
          "number" &&
        (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt > 0;

      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: -1, // Invalid: negative timestamp
            },
            schemaVersion: 2,
          }),
        },
        validate: isValid,
      });

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      expect(() => upcaster(event)).toThrow(EventUpcasterError);
      expect(() => upcaster(event)).toThrow("failed validation");
    });
  });
});

describe("createUpcasterRegistry", () => {
  describe("register and has", () => {
    it("registers upcasters by event type", () => {
      const registry = createUpcasterRegistry();
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({ ...event, schemaVersion: 2 }),
        },
      });

      registry.register("OrderCreated", upcaster);

      expect(registry.has("OrderCreated")).toBe(true);
      expect(registry.has("UnregisteredEvent")).toBe(false);
    });
  });

  describe("getRegisteredTypes", () => {
    it("returns all registered event types", () => {
      const registry = createUpcasterRegistry();
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({ ...event, schemaVersion: 2 }),
        },
      });

      registry.register("OrderCreated", upcaster);
      registry.register("OrderSubmitted", upcaster);

      const types = registry.getRegisteredTypes();
      expect(types).toContain("OrderCreated");
      expect(types).toContain("OrderSubmitted");
      expect(types).toHaveLength(2);
    });
  });

  describe("register override behavior", () => {
    it("overwrites previously registered upcaster for same event type", () => {
      const registry = createUpcasterRegistry();

      // First upcaster: migrates to v2 only
      const upcaster1 = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: 1000,
            },
            schemaVersion: 2,
          }),
        },
      });

      // Second upcaster: migrates to v3
      const upcaster2 = createEventUpcaster<OrderCreatedV3Payload>({
        currentVersion: 3,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: 2000,
            },
            schemaVersion: 2,
          }),
          2: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload,
              priority: "high" as const,
            },
            schemaVersion: 3,
          }),
        },
      });

      // Register first, then override with second
      registry.register("OrderCreated", upcaster1);
      registry.register("OrderCreated", upcaster2);

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      const result = registry.upcast(event);

      // Should use the second upcaster (v3), not the first (v2)
      expect(result.currentSchemaVersion).toBe(3);
      // createdAt should be 2000 (from second upcaster), not 1000 (from first)
      expect((result.event.payload as OrderCreatedV2Payload).createdAt).toBe(2000);
      // priority should be added by second upcaster
      expect((result.event.payload as OrderCreatedV3Payload).priority).toBe("high");
    });
  });

  describe("upcast", () => {
    it("upcasts events using registered upcaster", () => {
      const registry = createUpcasterRegistry();
      const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
        currentVersion: 2,
        migrations: {
          1: (event) => ({
            ...event,
            payload: {
              ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
              createdAt: Date.now(),
            },
            schemaVersion: 2,
          }),
        },
      });

      registry.register("OrderCreated", upcaster);

      const event = createTestEvent<OrderCreatedV1Payload>(
        { orderId: "order_1", customerId: "cust_1" },
        1
      );

      const result = registry.upcast(event);

      expect(result.wasUpcasted).toBe(true);
      expect(result.currentSchemaVersion).toBe(2);
    });

    it("returns events without registered upcaster as-is", () => {
      const registry = createUpcasterRegistry();

      // Event for unregistered type - returned unchanged
      const event: EnhancedDomainEvent<{ data: string }> = {
        eventId: "evt_1",
        eventType: "UnregisteredEvent",
        streamType: "Test",
        streamId: "test_1",
        version: 1,
        globalPosition: 1000,
        timestamp: Date.now(),
        correlationId: "corr_1",
        boundedContext: "test",
        category: "domain",
        schemaVersion: 1,
        payload: { data: "test" },
      };

      const result = registry.upcast(event);

      expect(result.wasUpcasted).toBe(false);
      expect(result.event.category).toBe("domain");
      expect(result.event.schemaVersion).toBe(1);
    });
  });
});

describe("addFieldMigration", () => {
  it("adds field with static default value", () => {
    const migration = addFieldMigration("priority", "medium", 2);

    const event: EnhancedDomainEvent<{ orderId: string }> = {
      eventId: "evt_1",
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_1",
      version: 1,
      globalPosition: 1000,
      timestamp: Date.now(),
      correlationId: "corr_1",
      boundedContext: "orders",
      category: "domain",
      schemaVersion: 1,
      payload: { orderId: "order_1" },
    };

    const result = migration(event);

    expect((result.payload as Record<string, unknown>).priority).toBe("medium");
    expect(result.schemaVersion).toBe(2);
  });

  it("adds field with computed default value", () => {
    const migration = addFieldMigration("createdAt", (e) => e.timestamp, 2);

    const event: EnhancedDomainEvent<{ orderId: string }> = {
      eventId: "evt_1",
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_1",
      version: 1,
      globalPosition: 1000,
      timestamp: 1234567890,
      correlationId: "corr_1",
      boundedContext: "orders",
      category: "domain",
      schemaVersion: 1,
      payload: { orderId: "order_1" },
    };

    const result = migration(event);

    expect((result.payload as Record<string, unknown>).createdAt).toBe(1234567890);
    expect(result.schemaVersion).toBe(2);
  });
});

describe("renameFieldMigration", () => {
  it("renames field in payload", () => {
    const migration = renameFieldMigration("userId", "customerId", 2);

    const event: EnhancedDomainEvent<{ userId: string }> = {
      eventId: "evt_1",
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: "order_1",
      version: 1,
      globalPosition: 1000,
      timestamp: Date.now(),
      correlationId: "corr_1",
      boundedContext: "orders",
      category: "domain",
      schemaVersion: 1,
      payload: { userId: "user_123" },
    };

    const result = migration(event);

    expect((result.payload as Record<string, unknown>).customerId).toBe("user_123");
    expect((result.payload as Record<string, unknown>).userId).toBeUndefined();
    expect(result.schemaVersion).toBe(2);
  });
});

describe("EventUpcasterError", () => {
  it("has correct name", () => {
    const error = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Test error");
    expect(error.name).toBe("EventUpcasterError");
  });

  it("has correct code", () => {
    const error = new EventUpcasterError("MISSING_MIGRATION", "Test error");
    expect(error.code).toBe("MISSING_MIGRATION");
  });

  it("has correct message", () => {
    const error = new EventUpcasterError("INVALID_EVENT", "Custom message");
    expect(error.message).toBe("Custom message");
  });

  it("stores context when provided", () => {
    const error = new EventUpcasterError("INVALID_EVENT", "Error", {
      eventType: "OrderCreated",
      schemaVersion: 5,
    });
    expect(error.context).toEqual({
      eventType: "OrderCreated",
      schemaVersion: 5,
    });
  });

  it("has undefined context when not provided", () => {
    const error = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Error");
    expect(error.context).toBeUndefined();
  });

  it("is instanceof Error", () => {
    const error = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Error");
    expect(error).toBeInstanceOf(Error);
  });
});
