/**
 * Unit Tests for Command Bus Client
 *
 * Tests the CommandBus client class and type exports:
 * - CommandBus class instantiation
 * - Type exports (RecordCommandResult, CommandStatusInfo, etc.)
 * - Interface compliance for idempotency pattern
 *
 * Note: Actual mutation/query behavior is tested in integration tests
 * since they require Convex runtime.
 */
import { describe, it, expect } from "vitest";
import { CommandBus } from "../../src/client/index";
import type {
  RecordCommandArgs,
  RecordCommandResult,
  UpdateCommandResultArgs,
  GetCommandStatusArgs,
  GetByCorrelationArgs,
  CleanupExpiredArgs,
  CommandStatusInfo,
  CommandByCorrelationInfo,
  CommandBusApi,
} from "../../src/client/index";

describe("CommandBus Client", () => {
  describe("CommandBus class", () => {
    it("can be instantiated with a component API", () => {
      // Create a mock component API (type-only check)
      const mockApi = {
        lib: {
          recordCommand: {} as CommandBusApi["lib"]["recordCommand"],
          updateCommandResult: {} as CommandBusApi["lib"]["updateCommandResult"],
          getCommandStatus: {} as CommandBusApi["lib"]["getCommandStatus"],
          getByCorrelation: {} as CommandBusApi["lib"]["getByCorrelation"],
          cleanupExpired: {} as CommandBusApi["lib"]["cleanupExpired"],
        },
      };

      const commandBus = new CommandBus(mockApi);

      expect(commandBus).toBeInstanceOf(CommandBus);
      expect(commandBus.component).toBe(mockApi);
    });
  });

  describe("RecordCommandArgs interface", () => {
    it("requires all core fields", () => {
      const args: RecordCommandArgs = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        payload: { customerId: "cust_456", items: [] },
        metadata: {
          correlationId: "corr_789",
          timestamp: Date.now(),
        },
      };

      expect(args.commandId).toBe("cmd_123");
      expect(args.commandType).toBe("CreateOrder");
      expect(args.targetContext).toBe("orders");
      expect(args.metadata.correlationId).toBe("corr_789");
    });

    it("supports optional userId in metadata", () => {
      const args: RecordCommandArgs = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        payload: {},
        metadata: {
          userId: "user_abc",
          correlationId: "corr_789",
          timestamp: Date.now(),
        },
      };

      expect(args.metadata.userId).toBe("user_abc");
    });

    it("supports optional ttl", () => {
      const args: RecordCommandArgs = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        payload: {},
        metadata: {
          correlationId: "corr_789",
          timestamp: Date.now(),
        },
        ttl: 86400000, // 24 hours
      };

      expect(args.ttl).toBe(86400000);
    });
  });

  describe("RecordCommandResult type", () => {
    it("can be new status", () => {
      const result: RecordCommandResult = { status: "new" };

      expect(result.status).toBe("new");
    });

    it("can be duplicate with pending status", () => {
      const result: RecordCommandResult = {
        status: "duplicate",
        commandStatus: "pending",
      };

      expect(result.status).toBe("duplicate");
      if (result.status === "duplicate") {
        expect(result.commandStatus).toBe("pending");
        expect(result.result).toBeUndefined();
      }
    });

    it("can be duplicate with executed status and result", () => {
      const result: RecordCommandResult = {
        status: "duplicate",
        commandStatus: "executed",
        result: { orderId: "ord_123", status: "success" },
      };

      expect(result.status).toBe("duplicate");
      if (result.status === "duplicate") {
        expect(result.commandStatus).toBe("executed");
        expect(result.result).toEqual({ orderId: "ord_123", status: "success" });
      }
    });

    it("can be duplicate with rejected status", () => {
      const result: RecordCommandResult = {
        status: "duplicate",
        commandStatus: "rejected",
        result: { code: "INVALID_INPUT", reason: "Missing items" },
      };

      if (result.status === "duplicate") {
        expect(result.commandStatus).toBe("rejected");
      }
    });

    it("can be duplicate with failed status", () => {
      const result: RecordCommandResult = {
        status: "duplicate",
        commandStatus: "failed",
        result: { reason: "Insufficient stock" },
      };

      if (result.status === "duplicate") {
        expect(result.commandStatus).toBe("failed");
      }
    });
  });

  describe("UpdateCommandResultArgs interface", () => {
    it("supports executed status", () => {
      const args: UpdateCommandResultArgs = {
        commandId: "cmd_123",
        status: "executed",
        result: { orderId: "ord_456" },
      };

      expect(args.status).toBe("executed");
      expect(args.result).toEqual({ orderId: "ord_456" });
    });

    it("supports rejected status", () => {
      const args: UpdateCommandResultArgs = {
        commandId: "cmd_123",
        status: "rejected",
        result: { code: "VALIDATION_ERROR", reason: "Invalid input" },
      };

      expect(args.status).toBe("rejected");
    });

    it("supports failed status", () => {
      const args: UpdateCommandResultArgs = {
        commandId: "cmd_123",
        status: "failed",
        result: { reason: "Business failure" },
      };

      expect(args.status).toBe("failed");
    });

    it("result is optional", () => {
      const args: UpdateCommandResultArgs = {
        commandId: "cmd_123",
        status: "executed",
      };

      expect(args.result).toBeUndefined();
    });
  });

  describe("CommandStatusInfo interface", () => {
    it("includes all required fields", () => {
      const info: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "executed",
        result: { orderId: "ord_456" },
        executedAt: Date.now(),
      };

      expect(info.commandId).toBe("cmd_123");
      expect(info.commandType).toBe("CreateOrder");
      expect(info.targetContext).toBe("orders");
      expect(info.status).toBe("executed");
    });

    it("status can be pending", () => {
      const info: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "pending",
      };

      expect(info.status).toBe("pending");
      expect(info.result).toBeUndefined();
      expect(info.executedAt).toBeUndefined();
    });

    it("status can be rejected", () => {
      const info: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "rejected",
        result: { code: "VALIDATION_ERROR" },
      };

      expect(info.status).toBe("rejected");
    });

    it("status can be failed", () => {
      const info: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "failed",
        result: { reason: "Business failure" },
      };

      expect(info.status).toBe("failed");
    });
  });

  describe("Query argument interfaces", () => {
    it("GetCommandStatusArgs requires commandId", () => {
      const args: GetCommandStatusArgs = {
        commandId: "cmd_123",
      };

      expect(args.commandId).toBe("cmd_123");
    });

    it("GetByCorrelationArgs requires correlationId", () => {
      const args: GetByCorrelationArgs = {
        correlationId: "corr_789",
      };

      expect(args.correlationId).toBe("corr_789");
    });

    it("CleanupExpiredArgs supports optional batchSize", () => {
      const args: CleanupExpiredArgs = {
        batchSize: 100,
      };

      expect(args.batchSize).toBe(100);
    });

    it("CleanupExpiredArgs can be empty", () => {
      const args: CleanupExpiredArgs = {};

      expect(args.batchSize).toBeUndefined();
    });
  });

  describe("CommandByCorrelationInfo interface", () => {
    it("extends CommandStatusInfo with timestamp", () => {
      const info: CommandByCorrelationInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "executed",
        result: { orderId: "ord_456" },
        executedAt: Date.now(),
        timestamp: Date.now() - 1000,
      };

      expect(info.timestamp).toBeDefined();
      expect(info.timestamp).toBeLessThan(info.executedAt!);
    });
  });
});

describe("Idempotency Pattern", () => {
  describe("command lifecycle", () => {
    it("supports the full command lifecycle flow", () => {
      // This test documents the expected idempotency flow

      // Step 1: First call records command as new
      const recordResult1: RecordCommandResult = { status: "new" };
      expect(recordResult1.status).toBe("new");

      // Step 2: After execution, update to executed
      const updateArgs: UpdateCommandResultArgs = {
        commandId: "cmd_123",
        status: "executed",
        result: { success: true },
      };
      expect(updateArgs.status).toBe("executed");

      // Step 3: Second call with same commandId returns duplicate
      const recordResult2: RecordCommandResult = {
        status: "duplicate",
        commandStatus: "executed",
        result: { success: true },
      };
      expect(recordResult2.status).toBe("duplicate");
      if (recordResult2.status === "duplicate") {
        expect(recordResult2.commandStatus).toBe("executed");
        expect(recordResult2.result).toEqual({ success: true });
      }
    });

    it("supports status transition: pending -> executed", () => {
      const statusBefore: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "pending",
      };

      const statusAfter: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "executed",
        result: { orderId: "ord_456" },
        executedAt: Date.now(),
      };

      expect(statusBefore.status).toBe("pending");
      expect(statusAfter.status).toBe("executed");
      expect(statusAfter.executedAt).toBeDefined();
    });

    it("supports status transition: pending -> rejected", () => {
      const statusBefore: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "pending",
      };

      const statusAfter: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "rejected",
        result: { code: "VALIDATION_ERROR", reason: "Invalid input" },
      };

      expect(statusBefore.status).toBe("pending");
      expect(statusAfter.status).toBe("rejected");
    });

    it("supports status transition: pending -> failed", () => {
      const statusBefore: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "pending",
      };

      const statusAfter: CommandStatusInfo = {
        commandId: "cmd_123",
        commandType: "CreateOrder",
        targetContext: "orders",
        status: "failed",
        result: { reason: "Insufficient stock" },
      };

      expect(statusBefore.status).toBe("pending");
      expect(statusAfter.status).toBe("failed");
    });
  });
});
