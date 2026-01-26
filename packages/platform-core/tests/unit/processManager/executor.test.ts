/**
 * Unit Tests for ProcessManagerExecutor
 *
 * Tests the PM executor functionality:
 * - createProcessManagerExecutor factory
 * - Event type filtering
 * - Instance ID resolution
 * - Storage callback delegation
 * - Command emission
 * - createMultiPMExecutor for multiple PMs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createProcessManagerExecutor,
  createMultiPMExecutor,
  type PMDomainEvent,
  type EmittedCommand,
  type ProcessManagerExecutor,
} from "../../../src/processManager/executor";
import type { ProcessManagerState } from "../../../src/processManager/types";

describe("createProcessManagerExecutor", () => {
  // Mock context
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  // Mock state storage
  let pmStateStore: Map<string, ProcessManagerState>;
  let emittedCommands: EmittedCommand[];
  let deadLetters: Array<{ pmName: string; error: string }>;

  // Create mock storage
  const createMockStorage = () => ({
    getPMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
    }),
    getOrCreatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        _initial?: { triggerEventId?: string; correlationId?: string }
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) return existing;

        const newState: ProcessManagerState = {
          processManagerName: pmName,
          instanceId,
          status: "idle",
          lastGlobalPosition: 0,
          commandsEmitted: 0,
          commandsFailed: 0,
          stateVersion: 1,
          createdAt: Date.now(),
          lastUpdatedAt: Date.now(),
        };
        pmStateStore.set(key, newState);
        return newState;
      }
    ),
    updatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        updates: Partial<ProcessManagerState>
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) {
          pmStateStore.set(key, { ...existing, ...updates, lastUpdatedAt: Date.now() });
        }
      }
    ),
    recordDeadLetter: vi.fn(
      async (_ctx: MockCtx, pmName: string, _instanceId: string, error: string) => {
        deadLetters.push({ pmName, error });
      }
    ),
  });

  // Create mock event
  const createMockEvent = (overrides?: Partial<PMDomainEvent>): PMDomainEvent => ({
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    correlationId: "corr_001",
    streamType: "Order",
    streamId: "ord_123",
    payload: { orderId: "ord_123", customerId: "cust_456" },
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    pmStateStore = new Map();
    emittedCommands = [];
    deadLetters = [];
    vi.clearAllMocks();
  });

  describe("factory creation", () => {
    it("creates executor with correct properties", () => {
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => [],
      });

      expect(executor.pmName).toBe("orderNotification");
      expect(executor.eventSubscriptions).toEqual(["OrderConfirmed", "OrderShipped"]);
    });

    it("handles() returns true for subscribed event types", () => {
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => [],
      });

      expect(executor.handles("OrderConfirmed")).toBe(true);
      expect(executor.handles("OrderShipped")).toBe(true);
      expect(executor.handles("OrderCancelled")).toBe(false);
    });
  });

  describe("event processing", () => {
    it("processes event and emits commands", async () => {
      const handler = vi.fn(
        async (): Promise<EmittedCommand[]> => [
          {
            commandType: "SendNotification",
            payload: { email: "test@example.com" },
            causationId: "evt_001",
            correlationId: "corr_001",
          },
        ]
      );

      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler,
      });

      const event = createMockEvent();
      const result = await executor.process(mockCtx, event);

      expect(result.status).toBe("processed");
      expect(handler).toHaveBeenCalledWith(mockCtx, event, undefined);
      expect(emittedCommands).toHaveLength(1);
      expect(emittedCommands[0]?.commandType).toBe("SendNotification");
    });

    it("skips event that is not subscribed with not_subscribed reason", async () => {
      const handler = vi.fn(async (): Promise<EmittedCommand[]> => []);

      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler,
      });

      const event = createMockEvent({ eventType: "OrderCancelled" });
      const result = await executor.process(mockCtx, event);

      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.reason).toBe("not_subscribed");
      }
      expect(handler).not.toHaveBeenCalled();
    });

    it("passes custom state to handler", async () => {
      const customState = { notificationsSent: 5 };
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "idle",
        lastGlobalPosition: 500,
        commandsEmitted: 5,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        customState,
      });

      let receivedCustomState: unknown;
      const handler = vi.fn(async (_ctx, _event, state): Promise<EmittedCommand[]> => {
        receivedCustomState = state;
        return [];
      });

      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler,
      });

      const event = createMockEvent();
      await executor.process(mockCtx, event);

      expect(receivedCustomState).toEqual(customState);
    });
  });

  describe("instance ID resolution", () => {
    it("uses default resolver (streamId) when not specified", async () => {
      const storage = createMockStorage();
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage,
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => [],
      });

      const event = createMockEvent({ streamId: "ord_custom_id" });
      await executor.process(mockCtx, event);

      // Verify the storage was called with streamId as instanceId
      expect(storage.getPMState).toHaveBeenCalledWith(
        mockCtx,
        "orderNotification",
        "ord_custom_id"
      );
    });

    it("uses custom instance ID resolver", async () => {
      const storage = createMockStorage();
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage,
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => [],
        instanceIdResolver: (event) => {
          const payload = event.payload as { customerId?: string };
          return `customer:${payload.customerId ?? "unknown"}`;
        },
      });

      const event = createMockEvent({
        payload: { orderId: "ord_123", customerId: "cust_789" },
      });
      await executor.process(mockCtx, event);

      // Verify custom instance ID was used
      expect(storage.getPMState).toHaveBeenCalledWith(
        mockCtx,
        "orderNotification",
        "customer:cust_789"
      );
    });
  });

  describe("error handling", () => {
    it("returns failed status when handler throws", async () => {
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => {
          throw new Error("Handler failed");
        },
      });

      const event = createMockEvent();
      const result = await executor.process(mockCtx, event);

      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.error).toContain("Handler failed");
      }
      expect(deadLetters).toHaveLength(1);
    });

    it("returns failed status when command emitter throws", async () => {
      const executor = createProcessManagerExecutor<MockCtx>({
        pmName: "orderNotification",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async () => {
          throw new Error("Emission failed");
        },
        handler: async () => [
          { commandType: "SendNotification", payload: {}, causationId: "evt_1" },
        ],
      });

      const event = createMockEvent();
      const result = await executor.process(mockCtx, event);

      expect(result.status).toBe("failed");
      expect(deadLetters).toHaveLength(1);
    });
  });
});

describe("createMultiPMExecutor", () => {
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  let pmStateStore: Map<string, ProcessManagerState>;
  let emittedCommands: EmittedCommand[];

  const createMockStorage = () => ({
    getPMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
    }),
    getOrCreatePMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      const key = `${pmName}:${instanceId}`;
      const existing = pmStateStore.get(key);
      if (existing) return existing;

      const newState: ProcessManagerState = {
        processManagerName: pmName,
        instanceId,
        status: "idle",
        lastGlobalPosition: 0,
        commandsEmitted: 0,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };
      pmStateStore.set(key, newState);
      return newState;
    }),
    updatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        updates: Partial<ProcessManagerState>
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) {
          pmStateStore.set(key, { ...existing, ...updates, lastUpdatedAt: Date.now() });
        }
      }
    ),
    recordDeadLetter: vi.fn(),
  });

  const createMockEvent = (overrides?: Partial<PMDomainEvent>): PMDomainEvent => ({
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    correlationId: "corr_001",
    streamType: "Order",
    streamId: "ord_123",
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  });

  let notificationExecutor: ProcessManagerExecutor<MockCtx>;
  let analyticsExecutor: ProcessManagerExecutor<MockCtx>;

  beforeEach(() => {
    pmStateStore = new Map();
    emittedCommands = [];
    vi.clearAllMocks();

    notificationExecutor = createProcessManagerExecutor<MockCtx>({
      pmName: "orderNotification",
      eventSubscriptions: ["OrderConfirmed"] as const,
      storage: createMockStorage(),
      commandEmitter: async (_ctx, commands) => {
        emittedCommands.push(...commands);
      },
      handler: async () => [{ commandType: "SendEmail", payload: {}, causationId: "evt_1" }],
    });

    analyticsExecutor = createProcessManagerExecutor<MockCtx>({
      pmName: "orderAnalytics",
      eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
      storage: createMockStorage(),
      commandEmitter: async (_ctx, commands) => {
        emittedCommands.push(...commands);
      },
      handler: async () => [{ commandType: "TrackEvent", payload: {}, causationId: "evt_1" }],
    });
  });

  describe("executor routing", () => {
    it("returns all PM names", () => {
      const multiExecutor = createMultiPMExecutor([notificationExecutor, analyticsExecutor]);

      expect(multiExecutor.pmNames).toEqual(["orderNotification", "orderAnalytics"]);
    });

    it("finds executors by event type", () => {
      const multiExecutor = createMultiPMExecutor([notificationExecutor, analyticsExecutor]);

      // OrderConfirmed matches both
      const confirmedExecutors = multiExecutor.findExecutors("OrderConfirmed");
      expect(confirmedExecutors).toHaveLength(2);

      // OrderShipped matches only analytics
      const shippedExecutors = multiExecutor.findExecutors("OrderShipped");
      expect(shippedExecutors).toHaveLength(1);
      expect(shippedExecutors[0]?.pmName).toBe("orderAnalytics");

      // OrderCancelled matches none
      const cancelledExecutors = multiExecutor.findExecutors("OrderCancelled");
      expect(cancelledExecutors).toHaveLength(0);
    });
  });

  describe("processAll", () => {
    it("processes event through all matching executors", async () => {
      const multiExecutor = createMultiPMExecutor([notificationExecutor, analyticsExecutor]);

      const event = createMockEvent({ eventType: "OrderConfirmed" });
      const results = await multiExecutor.processAll(mockCtx, event);

      expect(results).toHaveLength(2);
      expect(results[0]?.pmName).toBe("orderNotification");
      expect(results[0]?.result.status).toBe("processed");
      expect(results[1]?.pmName).toBe("orderAnalytics");
      expect(results[1]?.result.status).toBe("processed");

      // Both emitted commands
      expect(emittedCommands).toHaveLength(2);
    });

    it("returns empty array for unsubscribed event", async () => {
      const multiExecutor = createMultiPMExecutor([notificationExecutor, analyticsExecutor]);

      const event = createMockEvent({ eventType: "OrderCancelled" });
      const results = await multiExecutor.processAll(mockCtx, event);

      expect(results).toHaveLength(0);
      expect(emittedCommands).toHaveLength(0);
    });

    it("processes single matching executor", async () => {
      const multiExecutor = createMultiPMExecutor([notificationExecutor, analyticsExecutor]);

      const event = createMockEvent({ eventType: "OrderShipped" });
      const results = await multiExecutor.processAll(mockCtx, event);

      expect(results).toHaveLength(1);
      expect(results[0]?.pmName).toBe("orderAnalytics");
      expect(emittedCommands).toHaveLength(1);
      expect(emittedCommands[0]?.commandType).toBe("TrackEvent");
    });

    it("isolates exceptions - one executor throwing does not prevent others from running", async () => {
      // Create an executor that throws unexpectedly
      const throwingExecutor = createProcessManagerExecutor<MockCtx>({
        pmName: "throwingPM",
        eventSubscriptions: ["OrderConfirmed"] as const,
        storage: createMockStorage(),
        commandEmitter: async (_ctx, commands) => {
          emittedCommands.push(...commands);
        },
        handler: async () => {
          throw new Error("Unexpected executor error");
        },
      });

      const multiExecutor = createMultiPMExecutor([
        throwingExecutor,
        notificationExecutor, // Should still run despite previous failure
        analyticsExecutor, // Should still run
      ]);

      const event = createMockEvent({ eventType: "OrderConfirmed" });
      const results = await multiExecutor.processAll(mockCtx, event);

      // All three executors should have results
      expect(results).toHaveLength(3);

      // First executor failed
      expect(results[0]?.pmName).toBe("throwingPM");
      expect(results[0]?.result.status).toBe("failed");
      if (results[0]?.result.status === "failed") {
        expect(results[0].result.error).toContain("Unexpected executor error");
      }

      // Second and third executors should have succeeded
      expect(results[1]?.pmName).toBe("orderNotification");
      expect(results[1]?.result.status).toBe("processed");

      expect(results[2]?.pmName).toBe("orderAnalytics");
      expect(results[2]?.result.status).toBe("processed");

      // Commands from successful executors should have been emitted
      expect(emittedCommands).toHaveLength(2);
    });

    it("handles empty executors array gracefully", async () => {
      const multiExecutor = createMultiPMExecutor<MockCtx>([]);

      expect(multiExecutor.pmNames).toEqual([]);

      const event = createMockEvent({ eventType: "OrderConfirmed" });
      const results = await multiExecutor.processAll(mockCtx, event);

      expect(results).toEqual([]);
      expect(multiExecutor.findExecutors("OrderConfirmed")).toEqual([]);
    });
  });
});
