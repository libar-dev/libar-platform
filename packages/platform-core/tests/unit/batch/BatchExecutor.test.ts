/**
 * Unit Tests for BatchExecutor
 *
 * Tests batch command execution in atomic and partial modes.
 */
import { describe, it, expect, vi } from "vitest";
import { BatchExecutor, createBatchExecutor } from "../../../src/batch/BatchExecutor";
import type { BatchCommand, CommandExecutor } from "../../../src/batch/types";
import type { CommandHandlerResult } from "../../../src/orchestration/types";

// Mock executor that succeeds for all commands
function createMockExecutor(
  results: Record<string, CommandHandlerResult<unknown>> = {}
): CommandExecutor {
  return vi.fn(async (commandType, _args, options) => {
    if (results[commandType]) {
      return results[commandType];
    }
    return {
      status: "success" as const,
      data: { executed: true },
      version: 1,
      event: {
        eventId: `evt_${options.commandId}`,
        eventType: `${commandType}Completed`,
        streamType: "test",
        streamId: "test_1",
        payload: {},
        metadata: {
          correlationId: options.correlationId,
          causationId: options.commandId,
        },
      },
    };
  });
}

// Mock executor that fails after N commands
function createFailingExecutor(failAfter: number): CommandExecutor {
  let count = 0;
  return vi.fn(async (commandType, _args, options) => {
    count++;
    if (count > failAfter) {
      return {
        status: "rejected" as const,
        code: "TEST_FAILURE",
        reason: `Command ${count} failed`,
      };
    }
    return {
      status: "success" as const,
      data: { executed: true, count },
      version: count,
      event: {
        eventId: `evt_${count}`,
        eventType: `${commandType}Completed`,
        streamType: "test",
        streamId: "test_1",
        payload: {},
        metadata: {
          correlationId: options.correlationId,
          causationId: options.commandId,
        },
      },
    };
  });
}

// Mock registry
const mockRegistry = {
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
};

const getRegistration = (type: string) => mockRegistry[type as keyof typeof mockRegistry];

describe("BatchExecutor", () => {
  describe("atomic mode", () => {
    it("executes commands sequentially", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_3" } },
      ];

      const result = await batch.execute(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
      });

      expect(result.status).toBe("success");
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it("stops on first failure and skips remaining", async () => {
      const executor = createFailingExecutor(1); // Fail after first command
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_3" } },
      ];

      const result = await batch.execute(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
      });

      expect(result.status).toBe("failed");
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.rejected).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(executor).toHaveBeenCalledTimes(2); // Only first two commands attempted
    });

    it("rejects batch for cross-aggregate commands", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } }, // Different order
      ];

      const result = await batch.execute(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
      });

      expect(result.status).toBe("failed");
      expect(result.results.every((r) => r.status === "rejected")).toBe(true);
      expect(executor).not.toHaveBeenCalled(); // Validation prevents execution
    });

    it("uses shared correlationId", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
      ];

      const result = await batch.execute(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
        correlationId: "batch_corr_123",
      });

      expect(result.correlationId).toBe("batch_corr_123");
      expect(executor).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ correlationId: "batch_corr_123" })
      );
    });

    it("allows command-level correlationId override", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        {
          commandType: "AddOrderItem",
          args: { orderId: "ord_1", productId: "prod_1" },
          correlationId: "cmd_corr_1",
        },
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_2" } },
      ];

      await batch.execute(commands, {
        mode: "atomic",
        aggregateId: "ord_1",
        correlationId: "batch_corr",
      });

      // First command should use its own correlationId
      expect(executor).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ correlationId: "cmd_corr_1" })
      );

      // Second command should use batch correlationId
      expect(executor).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ correlationId: "batch_corr" })
      );
    });
  });

  describe("partial mode", () => {
    it("executes all commands even with failures", async () => {
      const executor = createFailingExecutor(1); // Fail after first command
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_3", productId: "prod_3" } },
      ];

      const result = await batch.execute(commands, {
        mode: "partial",
      });

      expect(result.status).toBe("partial");
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.rejected).toBe(2);
      expect(executor).toHaveBeenCalledTimes(3); // All commands executed
    });

    it("returns success when all commands succeed", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
      });

      const commands: BatchCommand[] = [
        { commandType: "CreateOrder", args: { orderId: "ord_1" } },
        { commandType: "CreateOrder", args: { orderId: "ord_2" } },
      ];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.status).toBe("success");
      expect(result.summary.succeeded).toBe(2);
    });

    it("allows cross-aggregate commands", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({
        executor,
        getRegistration,
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "AddOrderItem", args: { orderId: "ord_2", productId: "prod_2" } }, // Different order
      ];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.status).toBe("success");
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it("respects maxConcurrency", async () => {
      const executionOrder: number[] = [];
      let currentConcurrency = 0;
      let maxObservedConcurrency = 0;

      const executor: CommandExecutor = vi.fn(async (_type, _args, options) => {
        currentConcurrency++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
        executionOrder.push(parseInt(options.commandId.replace("cmd_", "")));

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));

        currentConcurrency--;
        return {
          status: "success" as const,
          data: {},
          version: 1,
          event: {
            eventId: `evt_${options.commandId}`,
            eventType: "TestCompleted",
            streamType: "test",
            streamId: "test_1",
            payload: {},
            metadata: {
              correlationId: options.correlationId,
              causationId: options.commandId,
            },
          },
        };
      });

      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = Array.from({ length: 10 }, (_, i) => ({
        commandType: "Test",
        args: {},
        commandId: `cmd_${i}`,
      }));

      await batch.execute(commands, {
        mode: "partial",
        maxConcurrency: 3,
      });

      expect(executor).toHaveBeenCalledTimes(10);
      expect(maxObservedConcurrency).toBeLessThanOrEqual(3);
    });

    it("stops on failure when continueOnError is false", async () => {
      const executor = createFailingExecutor(1);
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = [
        { commandType: "Test", args: {}, commandId: "cmd_1" },
        { commandType: "Test", args: {}, commandId: "cmd_2" },
        { commandType: "Test", args: {}, commandId: "cmd_3" },
      ];

      const result = await batch.execute(commands, {
        mode: "partial",
        maxConcurrency: 1,
        continueOnError: false,
      });

      expect(result.status).toBe("partial");
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.rejected).toBe(1);
      expect(result.summary.skipped).toBe(1);
    });
  });

  describe("result tracking", () => {
    it("tracks individual command results", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = [
        { commandType: "TestA", args: { id: 1 } },
        { commandType: "TestB", args: { id: 2 } },
      ];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.commandType).toBe("TestA");
      expect(result.results[0]?.index).toBe(0);
      expect(result.results[1]?.commandType).toBe("TestB");
      expect(result.results[1]?.index).toBe(1);
    });

    it("includes duration for each command", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = [{ commandType: "Test", args: {} }];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.results[0]?.durationMs).toBeDefined();
      expect(typeof result.results[0]?.durationMs).toBe("number");
    });

    it("includes error message for failed commands", async () => {
      const executor: CommandExecutor = vi.fn(async () => ({
        status: "rejected" as const,
        code: "TEST_ERROR",
        reason: "Something went wrong",
      }));
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = [{ commandType: "Test", args: {} }];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.results[0]?.error).toBe("Something went wrong");
    });

    it("calculates correct summary statistics", async () => {
      const executor = createFailingExecutor(2);
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = Array.from({ length: 5 }, (_, i) => ({
        commandType: "Test",
        args: { id: i },
      }));

      const result = await batch.execute(commands, {
        mode: "partial",
        maxConcurrency: 1, // Sequential to ensure predictable failure
      });

      expect(result.summary.total).toBe(5);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.rejected).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("error handling", () => {
    it("handles executor throwing errors", async () => {
      const executor: CommandExecutor = vi.fn(async () => {
        throw new Error("Executor crashed");
      });
      const batch = new BatchExecutor({ executor });

      const commands: BatchCommand[] = [{ commandType: "Test", args: {} }];

      const result = await batch.execute(commands, { mode: "partial" });

      expect(result.status).toBe("failed");
      expect(result.results[0]?.status).toBe("failed");
      expect(result.results[0]?.error).toBe("Executor crashed");
    });

    it("handles validation errors gracefully", async () => {
      const executor = createMockExecutor();
      const batch = new BatchExecutor({ executor });

      const result = await batch.execute([], { mode: "partial" });

      expect(result.status).toBe("failed");
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe("defaultBoundedContext", () => {
    it("uses default bounded context for validation", async () => {
      const executor = createMockExecutor();

      // This should fail because ReserveStock is in "inventory" context
      const getRegWithInventory = (type: string) => {
        if (type === "ReserveStock") {
          return {
            category: "aggregate",
            boundedContext: "inventory",
            targetAggregate: { type: "Stock", idField: "productId" },
          };
        }
        return mockRegistry[type as keyof typeof mockRegistry];
      };

      const batchWithRegistry = new BatchExecutor({
        executor,
        getRegistration: getRegWithInventory,
        defaultBoundedContext: "orders",
      });

      const commands: BatchCommand[] = [
        { commandType: "AddOrderItem", args: { orderId: "ord_1", productId: "prod_1" } },
        { commandType: "ReserveStock", args: { productId: "prod_1" } }, // Wrong context
      ];

      const result = await batchWithRegistry.execute(commands, { mode: "partial" });

      expect(result.status).toBe("failed");
      expect(result.results[1]?.error).toContain("validation failed");
    });
  });
});

describe("createBatchExecutor", () => {
  it("creates a BatchExecutor instance", () => {
    const executor = createMockExecutor();
    const batch = createBatchExecutor({ executor });

    expect(batch).toBeInstanceOf(BatchExecutor);
  });
});
