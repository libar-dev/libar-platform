/**
 * Unit Tests for Batch Validation
 *
 * Tests pre-flight validation for batch command execution,
 * including single-aggregate scope for atomic mode.
 */
import { describe, it, expect } from "vitest";
import {
  validateBatch,
  extractAggregateId,
  groupByAggregateId,
} from "../../../src/batch/validation";
import type { BatchCommand } from "../../../src/batch/types";

// Mock registry for testing
const mockRegistry = (
  registrations: Record<
    string,
    {
      category: string;
      boundedContext: string;
      targetAggregate?: { type: string; idField: string };
    }
  >
) => {
  return (commandType: string) => registrations[commandType];
};

describe("validateBatch", () => {
  describe("empty batch validation", () => {
    it("rejects empty batch", () => {
      const result = validateBatch([], { mode: "partial" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("EMPTY_BATCH");
      }
    });
  });

  describe("partial mode validation", () => {
    it("accepts valid commands without registry", () => {
      const commands: BatchCommand[] = [
        { commandType: "CreateOrder", args: { orderId: "ord_1" } },
        { commandType: "CreateOrder", args: { orderId: "ord_2" } },
      ];
      const result = validateBatch(commands, { mode: "partial" });
      expect(result.valid).toBe(true);
    });

    it("accepts commands in different bounded contexts", () => {
      const commands: BatchCommand[] = [
        { commandType: "CreateOrder", args: { orderId: "ord_1" } },
        { commandType: "ReserveStock", args: { productId: "prod_1" } },
      ];
      const registry = mockRegistry({
        CreateOrder: {
          category: "aggregate",
          boundedContext: "orders",
          targetAggregate: { type: "Order", idField: "orderId" },
        },
        ReserveStock: {
          category: "aggregate",
          boundedContext: "inventory",
          targetAggregate: { type: "Stock", idField: "productId" },
        },
      });
      const result = validateBatch(commands, { mode: "partial" }, registry);
      expect(result.valid).toBe(true);
    });
  });

  describe("atomic mode validation without registry", () => {
    it("requires aggregateId option", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
      ];
      const result = validateBatch(commands, { mode: "atomic" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("MISSING_AGGREGATE_ID");
      }
    });

    it("requires aggregateIdField option", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
      ];
      const result = validateBatch(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("MISSING_AGGREGATE_ID");
      }
    });

    it("accepts when all commands target same aggregate", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
      ];
      const result = validateBatch(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
        aggregateIdField: "orderId",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects when commands target different aggregates", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } },
      ];
      const result = validateBatch(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
        aggregateIdField: "orderId",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
        expect(result.errors[0]?.commandIndex).toBe(1);
      }
    });
  });

  describe("atomic mode validation with registry", () => {
    const registry = mockRegistry({
      AddOrderItem: {
        category: "aggregate",
        boundedContext: "orders",
        targetAggregate: { type: "Order", idField: "orderId" },
      },
      RemoveOrderItem: {
        category: "aggregate",
        boundedContext: "orders",
        targetAggregate: { type: "Order", idField: "orderId" },
      },
      ReserveStock: {
        category: "aggregate",
        boundedContext: "inventory",
        targetAggregate: { type: "Stock", idField: "productId" },
      },
      SendNotification: {
        category: "system",
        boundedContext: "notifications",
      },
    });

    it("accepts commands targeting same aggregate with explicit aggregateId", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
        { commandType: "RemoveOrderItem", args: { orderId: "ord_1", itemId: "item_1" } },
      ];
      const result = validateBatch(
        commands,
        {
          mode: "atomic",
          aggregateId: "ord_1",
        },
        registry
      );
      expect(result.valid).toBe(true);
    });

    it("infers aggregate ID from first command when not specified", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
      ];
      const result = validateBatch(commands, { mode: "atomic" }, registry);
      expect(result.valid).toBe(true);
    });

    it("rejects when commands target different aggregate instances", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } },
      ];
      const result = validateBatch(commands, { mode: "atomic" }, registry);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
      }
    });

    it("rejects when commands target different aggregate types", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "ReserveStock", args: { productId: "prod_1", quantity: 1 } },
      ];
      const result = validateBatch(commands, { mode: "atomic" }, registry);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
      }
    });

    it("rejects non-aggregate commands in atomic mode", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "SendNotification", args: { message: "hello" } },
      ];
      const result = validateBatch(commands, { mode: "atomic" }, registry);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("WRONG_CATEGORY");
      }
    });

    it("rejects unregistered commands", () => {
      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1" } },
        { commandType: "UnknownCommand", args: {} },
      ];
      const result = validateBatch(commands, { mode: "atomic" }, registry);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("UNREGISTERED_COMMAND");
        expect(result.errors[0]?.commandIndex).toBe(1);
      }
    });
  });

  describe("bounded context filtering", () => {
    const registry = mockRegistry({
      CreateOrder: {
        category: "aggregate",
        boundedContext: "orders",
        targetAggregate: { type: "Order", idField: "orderId" },
      },
      ReserveStock: {
        category: "aggregate",
        boundedContext: "inventory",
        targetAggregate: { type: "Stock", idField: "productId" },
      },
    });

    it("accepts commands matching specified bounded context", () => {
      const commands: BatchCommand[] = [{ commandType: "CreateOrder", args: { orderId: "ord_1" } }];
      const result = validateBatch(
        commands,
        {
          mode: "partial",
          boundedContext: "orders",
        },
        registry
      );
      expect(result.valid).toBe(true);
    });

    it("rejects commands from wrong bounded context", () => {
      const commands: BatchCommand[] = [
        { commandType: "CreateOrder", args: { orderId: "ord_1" } },
        { commandType: "ReserveStock", args: { productId: "prod_1" } },
      ];
      const result = validateBatch(
        commands,
        {
          mode: "partial",
          boundedContext: "orders",
        },
        registry
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.code).toBe("WRONG_BOUNDED_CONTEXT");
        expect(result.errors[0]?.commandIndex).toBe(1);
      }
    });
  });
});

describe("extractAggregateId", () => {
  it("extracts ID from command args", () => {
    const command: BatchCommand = {
      commandType: "AddOrderItem",
      args: { orderId: "ord_123", productId: "prod_456" },
    };
    expect(extractAggregateId(command, "orderId")).toBe("ord_123");
  });

  it("returns undefined for missing field", () => {
    const command: BatchCommand = {
      commandType: "AddOrderItem",
      args: { productId: "prod_456" },
    };
    expect(extractAggregateId(command, "orderId")).toBeUndefined();
  });

  it("returns undefined for non-string value", () => {
    const command: BatchCommand = {
      commandType: "AddOrderItem",
      args: { orderId: 123 },
    };
    expect(extractAggregateId(command, "orderId")).toBeUndefined();
  });
});

describe("groupByAggregateId", () => {
  it("groups commands by aggregate ID", () => {
    const commands: BatchCommand[] = [
      { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
      { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } },
      { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_3" } },
    ];
    const groups = groupByAggregateId(commands, "orderId");

    expect(groups.size).toBe(2);
    expect(groups.get("ord_1")?.length).toBe(2);
    expect(groups.get("ord_2")?.length).toBe(1);
  });

  it("uses placeholder for missing IDs", () => {
    const commands: BatchCommand[] = [
      { commandType: "AddOrderItem", args: { orderId: "ord_1" } },
      { commandType: "AddOrderItem", args: { productId: "prod_1" } }, // No orderId
    ];
    const groups = groupByAggregateId(commands, "orderId");

    expect(groups.size).toBe(2);
    expect(groups.get("ord_1")?.length).toBe(1);
    expect(groups.get("__no_id__")?.length).toBe(1);
  });
});
