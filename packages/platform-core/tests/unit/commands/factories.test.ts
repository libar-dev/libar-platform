/**
 * Unit Tests for Command Category Factories
 *
 * Tests the category-specific factory functions:
 * - createAggregateCommandSchema
 * - createProcessCommandSchema
 * - createSystemCommandSchema
 * - createBatchCommandSchema
 * - getCommandCategoryFromSchema
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createAggregateCommandSchema,
  createProcessCommandSchema,
  createSystemCommandSchema,
  createBatchCommandSchema,
  getCommandCategoryFromSchema,
} from "../../../src/commands/factories";

describe("createAggregateCommandSchema", () => {
  it("creates schema with aggregate category", () => {
    const schema = createAggregateCommandSchema({
      commandType: "CreateOrder",
      payloadSchema: z.object({
        orderId: z.string(),
        customerId: z.string(),
      }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "CreateOrder",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "orders",
      payload: {
        orderId: "order_789",
        customerId: "cust_012",
      },
    });

    expect(result.category).toBe("aggregate");
    expect(result.commandType).toBe("CreateOrder");
  });

  it("includes aggregate target when provided", () => {
    const schema = createAggregateCommandSchema({
      commandType: "AddOrderItem",
      payloadSchema: z.object({
        orderId: z.string(),
        productId: z.string(),
      }),
      aggregateTarget: {
        type: "Order",
        idField: "orderId",
      },
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "AddOrderItem",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "orders",
      payload: {
        orderId: "order_789",
        productId: "prod_012",
      },
    });

    expect(result.aggregateTarget).toEqual({
      type: "Order",
      idField: "orderId",
    });
  });

  it("makes aggregate target optional when not provided", () => {
    const schema = createAggregateCommandSchema({
      commandType: "CreateOrder",
      payloadSchema: z.object({
        orderId: z.string(),
      }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "CreateOrder",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "orders",
      payload: { orderId: "order_123" },
    });

    expect(result.aggregateTarget).toBeUndefined();
  });

  it("enforces literal command type", () => {
    const schema = createAggregateCommandSchema({
      commandType: "CreateOrder",
      payloadSchema: z.object({ orderId: z.string() }),
    });

    expect(() =>
      schema.parse({
        commandId: "cmd_123",
        commandType: "WrongType",
        correlationId: "corr_456",
        timestamp: Date.now(),
        targetContext: "orders",
        payload: { orderId: "order_123" },
      })
    ).toThrow();
  });

  describe("required fields validation", () => {
    const schema = createAggregateCommandSchema({
      commandType: "CreateOrder",
      payloadSchema: z.object({ orderId: z.string() }),
    });

    it("rejects command missing commandId", () => {
      expect(() =>
        schema.parse({
          // missing commandId
          commandType: "CreateOrder",
          correlationId: "corr_456",
          timestamp: Date.now(),
          targetContext: "orders",
          payload: { orderId: "order_123" },
        })
      ).toThrow();
    });

    it("rejects command missing correlationId", () => {
      expect(() =>
        schema.parse({
          commandId: "cmd_123",
          commandType: "CreateOrder",
          // missing correlationId
          timestamp: Date.now(),
          targetContext: "orders",
          payload: { orderId: "order_123" },
        })
      ).toThrow();
    });

    it("rejects command missing timestamp", () => {
      expect(() =>
        schema.parse({
          commandId: "cmd_123",
          commandType: "CreateOrder",
          correlationId: "corr_456",
          // missing timestamp
          targetContext: "orders",
          payload: { orderId: "order_123" },
        })
      ).toThrow();
    });

    it("rejects command missing targetContext", () => {
      expect(() =>
        schema.parse({
          commandId: "cmd_123",
          commandType: "CreateOrder",
          correlationId: "corr_456",
          timestamp: Date.now(),
          // missing targetContext
          payload: { orderId: "order_123" },
        })
      ).toThrow();
    });

    it("rejects command missing payload", () => {
      expect(() =>
        schema.parse({
          commandId: "cmd_123",
          commandType: "CreateOrder",
          correlationId: "corr_456",
          timestamp: Date.now(),
          targetContext: "orders",
          // missing payload
        })
      ).toThrow();
    });
  });
});

describe("createProcessCommandSchema", () => {
  it("creates schema with process category", () => {
    const schema = createProcessCommandSchema({
      commandType: "StartOrderFulfillment",
      payloadSchema: z.object({
        orderId: z.string(),
        warehouseId: z.string(),
      }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "StartOrderFulfillment",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "sagas",
      payload: {
        orderId: "order_789",
        warehouseId: "wh_012",
      },
    });

    expect(result.category).toBe("process");
    expect(result.commandType).toBe("StartOrderFulfillment");
  });

  it("includes process type when provided", () => {
    const schema = createProcessCommandSchema({
      commandType: "StartOrderFulfillment",
      payloadSchema: z.object({ orderId: z.string() }),
      processType: "OrderFulfillmentSaga",
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "StartOrderFulfillment",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "sagas",
      payload: { orderId: "order_123" },
    });

    expect(result.processType).toBe("OrderFulfillmentSaga");
  });

  it("makes process type optional when not provided", () => {
    const schema = createProcessCommandSchema({
      commandType: "StartProcess",
      payloadSchema: z.object({ id: z.string() }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "StartProcess",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "processes",
      payload: { id: "proc_123" },
    });

    expect(result.processType).toBeUndefined();
  });
});

describe("createSystemCommandSchema", () => {
  it("creates schema with system category", () => {
    const schema = createSystemCommandSchema({
      commandType: "CleanupExpiredCommands",
      payloadSchema: z.object({
        olderThanDays: z.number(),
      }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "CleanupExpiredCommands",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "system",
      payload: { olderThanDays: 30 },
    });

    expect(result.category).toBe("system");
    expect(result.commandType).toBe("CleanupExpiredCommands");
  });

  it("sets requiresIdempotency to false by default", () => {
    const schema = createSystemCommandSchema({
      commandType: "RunHealthCheck",
      payloadSchema: z.object({}),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "RunHealthCheck",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "system",
      payload: {},
    });

    expect(result.requiresIdempotency).toBe(false);
  });

  it("allows overriding requiresIdempotency", () => {
    const schema = createSystemCommandSchema({
      commandType: "MigrateData",
      payloadSchema: z.object({ batchSize: z.number() }),
      requiresIdempotency: true,
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "MigrateData",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "system",
      payload: { batchSize: 100 },
    });

    expect(result.requiresIdempotency).toBe(true);
  });
});

describe("createBatchCommandSchema", () => {
  it("creates schema with batch category", () => {
    const schema = createBatchCommandSchema({
      commandType: "BulkCreateOrders",
      itemPayloadSchema: z.object({
        customerId: z.string(),
        productId: z.string(),
      }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "BulkCreateOrders",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "orders",
      payload: {
        items: [
          { customerId: "c1", productId: "p1" },
          { customerId: "c2", productId: "p2" },
        ],
      },
    });

    expect(result.category).toBe("batch");
    expect(result.payload.items).toHaveLength(2);
  });

  it("includes batch config when provided", () => {
    const schema = createBatchCommandSchema({
      commandType: "BulkUpdateProducts",
      itemPayloadSchema: z.object({ productId: z.string() }),
      batchConfig: {
        maxItems: 100,
        continueOnError: true,
      },
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "BulkUpdateProducts",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "inventory",
      payload: {
        items: [{ productId: "p1" }],
      },
    });

    expect(result.batchConfig).toEqual({
      maxItems: 100,
      continueOnError: true,
    });
  });

  it("validates items array against item schema", () => {
    const schema = createBatchCommandSchema({
      commandType: "BulkProcess",
      itemPayloadSchema: z.object({
        id: z.string(),
        value: z.number().positive(),
      }),
    });

    expect(() =>
      schema.parse({
        commandId: "cmd_123",
        commandType: "BulkProcess",
        correlationId: "corr_456",
        timestamp: Date.now(),
        targetContext: "batch",
        payload: {
          items: [{ id: "1", value: -5 }], // negative value should fail
        },
      })
    ).toThrow();
  });

  it("allows empty items array", () => {
    const schema = createBatchCommandSchema({
      commandType: "BulkProcess",
      itemPayloadSchema: z.object({ id: z.string() }),
    });

    const result = schema.parse({
      commandId: "cmd_123",
      commandType: "BulkProcess",
      correlationId: "corr_456",
      timestamp: Date.now(),
      targetContext: "batch",
      payload: { items: [] },
    });

    expect(result.payload.items).toEqual([]);
  });
});

describe("getCommandCategoryFromSchema", () => {
  it("extracts aggregate category", () => {
    const schema = createAggregateCommandSchema({
      commandType: "Test",
      payloadSchema: z.object({}),
    });

    expect(getCommandCategoryFromSchema(schema)).toBe("aggregate");
  });

  it("extracts process category", () => {
    const schema = createProcessCommandSchema({
      commandType: "Test",
      payloadSchema: z.object({}),
    });

    expect(getCommandCategoryFromSchema(schema)).toBe("process");
  });

  it("extracts system category", () => {
    const schema = createSystemCommandSchema({
      commandType: "Test",
      payloadSchema: z.object({}),
    });

    expect(getCommandCategoryFromSchema(schema)).toBe("system");
  });

  it("extracts batch category", () => {
    const schema = createBatchCommandSchema({
      commandType: "Test",
      itemPayloadSchema: z.object({}),
    });

    expect(getCommandCategoryFromSchema(schema)).toBe("batch");
  });

  it("returns undefined for non-object schemas", () => {
    expect(getCommandCategoryFromSchema(z.string())).toBeUndefined();
    expect(getCommandCategoryFromSchema(z.number())).toBeUndefined();
  });

  it("returns undefined for object schemas without category", () => {
    const schema = z.object({
      name: z.string(),
    });

    expect(getCommandCategoryFromSchema(schema)).toBeUndefined();
  });
});
