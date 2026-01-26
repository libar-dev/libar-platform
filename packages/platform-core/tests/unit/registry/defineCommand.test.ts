/**
 * Unit Tests for defineCommand Helpers
 *
 * Tests the helper functions that reduce boilerplate:
 * - defineAggregateCommand
 * - defineProcessCommand
 * - defineSystemCommand
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  defineAggregateCommand,
  defineProcessCommand,
  defineSystemCommand,
  CommandRegistry,
} from "../../../src/registry";
import type { CommandHandlerResult } from "../../../src/orchestration/types";

// Helper to create a mock FunctionReference
const mockMutationRef = <TArgs, TResult>() =>
  ({}) as never as import("convex/server").FunctionReference<
    "mutation",
    "internal",
    TArgs,
    TResult
  >;

describe("defineAggregateCommand", () => {
  beforeEach(() => {
    CommandRegistry.resetForTesting();
  });

  afterEach(() => {
    CommandRegistry.resetForTesting();
  });

  it("creates a command config with correct structure", () => {
    const schema = z.object({
      orderId: z.string(),
      customerId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef<
        { orderId: string; customerId: string; commandId: string; correlationId: string },
        CommandHandlerResult<{ orderId: string }>
      >(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: (args, result, globalPosition) => ({
          orderId: args.orderId,
          eventId: result.event.eventId,
          globalPosition,
        }),
      },
      autoRegister: false,
    });

    expect(result.config.commandType).toBe("CreateOrder");
    expect(result.config.boundedContext).toBe("orders");
    expect(result.config.projection.projectionName).toBe("orderSummary");
  });

  it("generates toHandlerArgs that adds commandId and correlationId", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    const handlerArgs = result.config.toHandlerArgs({ orderId: "ord_123" }, "cmd_456", "corr_789");

    expect(handlerArgs).toEqual({
      orderId: "ord_123",
      commandId: "cmd_456",
      correlationId: "corr_789",
    });
  });

  it("generates default partition key from aggregateIdField", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    const partitionKey = result.config.projection.getPartitionKey({
      orderId: "ord_123",
    });

    expect(partitionKey).toEqual({
      name: "orderId",
      value: "ord_123",
    });
  });

  it("allows custom partition key", () => {
    const schema = z.object({
      orderId: z.string(),
      customerId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
        getPartitionKey: (args) => ({
          name: "customerId",
          value: args.customerId as string,
        }),
      },
      autoRegister: false,
    });

    const partitionKey = result.config.projection.getPartitionKey({
      orderId: "ord_123",
      customerId: "cust_456",
    });

    expect(partitionKey).toEqual({
      name: "customerId",
      value: "cust_456",
    });
  });

  it("sets correct metadata for aggregate command", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      description: "Creates a new order",
      schemaVersion: 2,
      tags: ["orders", "create"],
      autoRegister: false,
    });

    expect(result.metadata.category).toBe("aggregate");
    expect(result.metadata.targetAggregate).toEqual({
      type: "Order",
      idField: "orderId",
    });
    expect(result.metadata.description).toBe("Creates a new order");
    expect(result.metadata.schemaVersion).toBe(2);
    expect(result.metadata.tags).toEqual(["orders", "create"]);
  });

  it("auto-registers with global registry by default", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
    });

    const registry = CommandRegistry.getInstance();
    expect(registry.has("CreateOrder")).toBe(true);
  });

  it("respects autoRegister: false", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    const registry = CommandRegistry.getInstance();
    expect(registry.has("CreateOrder")).toBe(false);
  });

  it("handles secondary projections", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      secondaryProjections: [
        {
          handler: mockMutationRef(),
          projectionName: "orderStats",
          toProjectionArgs: () => ({}),
        },
      ],
      autoRegister: false,
    });

    expect(result.config.secondaryProjections).toHaveLength(1);
    expect(result.config.secondaryProjections?.[0].projectionName).toBe("orderStats");
  });

  it("handles saga routing", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      sagaRoute: {
        router: mockMutationRef(),
        getEventType: () => "OrderCreated",
      },
      autoRegister: false,
    });

    expect(result.config.sagaRoute).toBeDefined();
    expect(result.config.sagaRoute?.getEventType({ orderId: "ord_123" })).toBe("OrderCreated");
  });

  it("preserves sagaRoute.onComplete for dead letter tracking", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const sagaOnComplete = mockMutationRef();

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      sagaRoute: {
        router: mockMutationRef(),
        getEventType: () => "OrderCreated",
        onComplete: sagaOnComplete,
      },
      autoRegister: false,
    });

    expect(result.config.sagaRoute).toBeDefined();
    expect(result.config.sagaRoute?.onComplete).toBe(sagaOnComplete);
  });

  it("handles failed projection", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      failedProjection: {
        handler: mockMutationRef(),
        projectionName: "orderFailures",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    expect(result.config.failedProjection).toBeDefined();
    expect(result.config.failedProjection?.projectionName).toBe("orderFailures");
  });

  it("defaults schemaVersion to 1", () => {
    const schema = z.object({
      orderId: z.string(),
    });

    const result = defineAggregateCommand({
      commandType: "CreateOrder",
      boundedContext: "orders",
      targetAggregate: "Order",
      aggregateIdField: "orderId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "orderSummary",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    expect(result.metadata.schemaVersion).toBe(1);
  });
});

describe("defineProcessCommand", () => {
  beforeEach(() => {
    CommandRegistry.resetForTesting();
  });

  afterEach(() => {
    CommandRegistry.resetForTesting();
  });

  it("creates a process command with correct category", () => {
    const schema = z.object({
      processId: z.string(),
      orderId: z.string(),
    });

    const result = defineProcessCommand({
      commandType: "StartOrderFulfillment",
      boundedContext: "fulfillment",
      targetProcess: "OrderFulfillment",
      processIdField: "processId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "fulfillmentStatus",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    expect(result.metadata.category).toBe("process");
    expect(result.metadata.targetProcess).toBe("OrderFulfillment");
    expect(result.metadata.targetAggregate).toBeUndefined();
  });

  it("uses processIdField for partition key", () => {
    const schema = z.object({
      processId: z.string(),
    });

    const result = defineProcessCommand({
      commandType: "StartOrderFulfillment",
      boundedContext: "fulfillment",
      targetProcess: "OrderFulfillment",
      processIdField: "processId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "fulfillmentStatus",
        toProjectionArgs: () => ({}),
      },
      autoRegister: false,
    });

    const partitionKey = result.config.projection.getPartitionKey({
      processId: "proc_123",
    });

    expect(partitionKey).toEqual({
      name: "processId",
      value: "proc_123",
    });
  });

  it("auto-registers by default", () => {
    const schema = z.object({
      processId: z.string(),
    });

    defineProcessCommand({
      commandType: "StartOrderFulfillment",
      boundedContext: "fulfillment",
      targetProcess: "OrderFulfillment",
      processIdField: "processId",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "fulfillmentStatus",
        toProjectionArgs: () => ({}),
      },
    });

    const registry = CommandRegistry.getInstance();
    expect(registry.has("StartOrderFulfillment")).toBe(true);
    const info = registry.list().find((c) => c.commandType === "StartOrderFulfillment");
    expect(info?.category).toBe("process");
    expect(info?.targetProcess).toBe("OrderFulfillment");
  });
});

describe("defineSystemCommand", () => {
  beforeEach(() => {
    CommandRegistry.resetForTesting();
  });

  afterEach(() => {
    CommandRegistry.resetForTesting();
  });

  it("creates a system command with correct category", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
      description: "Cleans up expired command records",
    });

    expect(result.metadata.category).toBe("system");
    expect(result.metadata.subsystem).toBe("cleanup");
    expect(result.metadata.description).toBe("Cleans up expired command records");
  });

  it("generates toHandlerArgs correctly", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
    });

    const handlerArgs = result.config.toHandlerArgs(
      { olderThanMs: 86400000 },
      "cmd_123",
      "corr_456"
    );

    expect(handlerArgs).toEqual({
      olderThanMs: 86400000,
      commandId: "cmd_123",
      correlationId: "corr_456",
    });
  });

  it("works without projection", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
    });

    expect(result.config.commandType).toBe("CleanupExpiredCommands");
    // Config should not have projection property
    expect("projection" in result.config).toBe(false);
  });

  it("supports optional projection", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "cleanupStats",
        toProjectionArgs: () => ({}),
      },
    });

    expect(result.config.projection?.projectionName).toBe("cleanupStats");
  });

  it("uses system partition key when no projection key specified", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "cleanupStats",
        toProjectionArgs: () => ({}),
      },
    });

    const partitionKey = result.config.projection?.getPartitionKey({
      olderThanMs: 86400000,
    });

    expect(partitionKey).toEqual({
      name: "system",
      value: "CleanupExpiredCommands",
    });
  });

  it("registers only when projection is provided", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    // Without projection - should not register
    defineSystemCommand({
      commandType: "CleanupExpiredCommandsNoProj",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
      autoRegister: true, // Explicitly true but no projection
    });

    const registry = CommandRegistry.getInstance();
    expect(registry.has("CleanupExpiredCommandsNoProj")).toBe(false);

    // With projection - should register
    defineSystemCommand({
      commandType: "CleanupExpiredCommandsWithProj",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
      projection: {
        handler: mockMutationRef(),
        projectionName: "cleanupStats",
        toProjectionArgs: () => ({}),
      },
      autoRegister: true,
    });

    expect(registry.has("CleanupExpiredCommandsWithProj")).toBe(true);
  });

  it("defaults schemaVersion to 1", () => {
    const schema = z.object({
      olderThanMs: z.number(),
    });

    const result = defineSystemCommand({
      commandType: "CleanupExpiredCommands",
      boundedContext: "system",
      subsystem: "cleanup",
      argsSchema: schema,
      handler: mockMutationRef(),
    });

    expect(result.metadata.schemaVersion).toBe(1);
  });
});
