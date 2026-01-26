/**
 * Unit Tests for withPMCheckpoint Helper
 *
 * Tests the PM checkpoint-based idempotency pattern:
 * - Skip already-processed events (globalPosition check)
 * - Skip terminal states (completed PM)
 * - Process new events with lifecycle transitions
 * - Command emission tracking
 * - Dead letter recording on failures
 * - createPMCheckpointHelper factory
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withPMCheckpoint,
  createPMCheckpointHelper,
  type EmittedCommand,
} from "../../../src/processManager/withPMCheckpoint";
import type { ProcessManagerState } from "../../../src/processManager/types";

describe("withPMCheckpoint", () => {
  // Mock context (can be any type)
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  // Mock PM state storage
  let pmStateStore: Map<string, ProcessManagerState>;
  let deadLetters: Array<{ pmName: string; instanceId: string; error: string }>;
  let emittedCommands: EmittedCommand[];

  // Helper to create mock storage functions
  const createMockStorage = () => ({
    getPMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
    }),
    getOrCreatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        initial?: { triggerEventId?: string; correlationId?: string }
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
          triggerEventId: initial?.triggerEventId,
          correlationId: initial?.correlationId,
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
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        error: string,
        attemptCount: number,
        context?: Record<string, unknown>
      ) => {
        deadLetters.push({ pmName, instanceId, error, attemptCount, context });
      }
    ),
  });

  const createMockProcess = () =>
    vi.fn(async (_pmState: ProcessManagerState): Promise<EmittedCommand[]> => {
      return [
        {
          commandType: "SendNotification",
          payload: { email: "test@example.com" },
          causationId: "evt_123",
          correlationId: "corr_123",
        },
      ];
    });

  const createMockEmitCommands = () =>
    vi.fn(async (_ctx: MockCtx, commands: EmittedCommand[]) => {
      emittedCommands.push(...commands);
    });

  beforeEach(() => {
    pmStateStore = new Map();
    deadLetters = [];
    emittedCommands = [];
    vi.clearAllMocks();
  });

  describe("new event processing", () => {
    it("processes event when no PM state exists", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("processed");
      if (result.status === "processed") {
        expect(result.commandsEmitted).toEqual(["SendNotification"]);
      }
      expect(process).toHaveBeenCalledTimes(1);
      expect(emitCommands).toHaveBeenCalledTimes(1);
      expect(emittedCommands).toHaveLength(1);
    });

    it("processes event when globalPosition is greater than checkpoint", async () => {
      // Setup: existing PM state at position 1000
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "idle",
        lastGlobalPosition: 1000,
        commandsEmitted: 1,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now() - 5000,
        lastUpdatedAt: Date.now() - 5000,
      });

      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // New event at position 2000
      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 2000,
        eventId: "evt_002",
        correlationId: "corr_002",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("processed");
      expect(process).toHaveBeenCalledTimes(1);
    });

    it("updates PM state after processing", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // Verify state was updated to completed
      const savedState = pmStateStore.get("orderNotification:ord_123");
      expect(savedState).toBeDefined();
      expect(savedState?.status).toBe("completed");
      expect(savedState?.lastGlobalPosition).toBe(1000);
      expect(savedState?.commandsEmitted).toBe(1);
    });
  });

  describe("idempotency - duplicate event skipping", () => {
    it("skips event when globalPosition equals checkpoint", async () => {
      // Setup: existing checkpoint at position 1000
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "idle",
        lastGlobalPosition: 1000,
        commandsEmitted: 1,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      });

      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // Same event replayed (same position)
      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.reason).toBe("already_processed");
      }
      expect(process).not.toHaveBeenCalled();
      expect(emitCommands).not.toHaveBeenCalled();
    });

    it("skips event when globalPosition is less than checkpoint", async () => {
      // Setup: existing checkpoint at position 2000
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "idle",
        lastGlobalPosition: 2000,
        commandsEmitted: 2,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      });

      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // Older event arrives out of order
      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.reason).toBe("already_processed");
      }
      expect(process).not.toHaveBeenCalled();
    });
  });

  describe("terminal state handling", () => {
    it("skips event when PM is in completed state", async () => {
      // Setup: PM already completed
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "completed",
        lastGlobalPosition: 1000,
        commandsEmitted: 1,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      });

      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // New event arrives but PM is terminal
      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 2000,
        eventId: "evt_002",
        correlationId: "corr_002",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.reason).toBe("terminal_state");
      }
      expect(process).not.toHaveBeenCalled();
    });
  });

  describe("instance isolation", () => {
    it("maintains separate states per instance", async () => {
      const storage = createMockStorage();
      const process1 = createMockProcess();
      const process2 = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // Process event for instance 1
      await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_001",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process: process1,
        emitCommands,
      });

      // Process event for instance 2
      await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_002",
        globalPosition: 500,
        eventId: "evt_002",
        correlationId: "corr_002",
        ...storage,
        process: process2,
        emitCommands,
      });

      // Both should be processed
      expect(process1).toHaveBeenCalledTimes(1);
      expect(process2).toHaveBeenCalledTimes(1);

      // States should be independent
      const state1 = pmStateStore.get("orderNotification:ord_001");
      const state2 = pmStateStore.get("orderNotification:ord_002");

      expect(state1?.lastGlobalPosition).toBe(1000);
      expect(state2?.lastGlobalPosition).toBe(500);
    });
  });

  describe("retry after failure", () => {
    /**
     * CRITICAL BUG TEST: Verifies that retries work after emitCommands() failure.
     *
     * The bug: In withPMCheckpoint, the "processing" transition updates lastGlobalPosition
     * BEFORE commands are emitted. If emitCommands() fails:
     * 1. PM state ends up: {status: "failed", lastGlobalPosition: 100}
     * 2. On retry with same event (globalPosition=100):
     * 3. Check: 100 <= 100 → TRUE → EVENT SKIPPED!
     * 4. Commands are never emitted - DATA LOSS
     *
     * Expected behavior: Retry should be able to re-process the event because
     * lastGlobalPosition should only be updated on successful completion.
     */
    it("should allow retry when processing transition succeeded but emitCommands failed", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      let emitCallCount = 0;
      const emitCommands = vi.fn(async (_ctx: MockCtx, commands: EmittedCommand[]) => {
        emitCallCount++;
        if (emitCallCount === 1) {
          // First call fails (simulates crash/timeout)
          throw new Error("Command emission failed: queue unavailable");
        }
        // Second call succeeds
        emittedCommands.push(...commands);
      });

      // First call - emitCommands fails after process() succeeds
      const result1 = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 100,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result1.status).toBe("failed");
      if (result1.status === "failed") {
        expect(result1.error).toContain("queue unavailable");
      }

      // Verify PM is in failed state
      const stateAfterFailure = pmStateStore.get("orderNotification:ord_123");
      expect(stateAfterFailure?.status).toBe("failed");

      // Second call (retry) - same globalPosition
      // BUG: This will incorrectly skip due to lastGlobalPosition already being set
      const result2 = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 100, // Same event being retried
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // EXPECTED: Retry should process the event (not skip it)
      // The bug causes this to fail - it returns "skipped" instead of "processed"
      expect(result2.status).toBe("processed");
      if (result2.status === "processed") {
        expect(result2.commandsEmitted).toEqual(["SendNotification"]);
      }

      // Commands should have been emitted on retry
      expect(emittedCommands).toHaveLength(1);
    });

    it("should allow retry when handler crashed mid-processing (status stuck in processing)", async () => {
      // Simulate scenario where handler crashed AFTER transitioning to "processing"
      // but BEFORE completing. The PM is "stuck" in processing state.
      pmStateStore.set("orderNotification:ord_123", {
        processManagerName: "orderNotification",
        instanceId: "ord_123",
        status: "processing",
        lastGlobalPosition: 100, // BUG: This was set in the "processing" transition
        commandsEmitted: 0,
        commandsFailed: 0,
        stateVersion: 1,
        createdAt: Date.now() - 5000,
        lastUpdatedAt: Date.now() - 5000,
      });

      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      // Retry with same event
      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 100, // Same event being retried
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // EXPECTED: Retry should process the event because commands were never emitted
      // BUG: The globalPosition check (100 <= 100) causes this to skip
      expect(result.status).toBe("processed");
      if (result.status === "processed") {
        expect(result.commandsEmitted).toEqual(["SendNotification"]);
      }

      // Commands should have been emitted
      expect(emittedCommands).toHaveLength(1);
    });
  });

  describe("input validation", () => {
    it("returns failure for negative globalPosition", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: -1, // Invalid negative position
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.error).toContain("Invalid globalPosition");
        expect(result.error).toContain("-1");
      }
      // Process should not be called for invalid input
      expect(process).not.toHaveBeenCalled();
      expect(emitCommands).not.toHaveBeenCalled();
    });

    it("handles globalPosition of 0 correctly (edge case)", async () => {
      // When PM state has lastGlobalPosition=0 (initial) and we receive event with
      // globalPosition=0, the check "0 <= 0" is true, so it should skip (idempotent).
      // This is correct behavior: the initial state acts as if position 0 was processed.
      //
      // In production, globalPosition uses formula `timestamp * 1_000_000 + ...`
      // so real events always have positions in millions, never 0.
      // The 0 init serves as a sentinel meaning "no events processed yet".
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 0,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // globalPosition=0 with initial lastGlobalPosition=0 → 0 <= 0 → skip
      // This is NOT a failure case, just an edge case that's handled correctly
      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.reason).toBe("already_processed");
      }
    });

    it("processes first real event after initialization", async () => {
      // In practice, first event always has globalPosition > 0 (millions)
      // This test verifies normal first-event processing works
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000000000, // Realistic first event position
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // Should process successfully
      expect(result.status).toBe("processed");
      expect(process).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling and dead letters", () => {
    it("records dead letter when process() throws", async () => {
      const storage = createMockStorage();
      const process = vi.fn(async () => {
        throw new Error("Handler failed: external service unavailable");
      });
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.error).toContain("external service unavailable");
      }

      // Verify dead letter was recorded
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0]?.pmName).toBe("orderNotification");
      expect(deadLetters[0]?.instanceId).toBe("ord_123");

      // Verify PM state is failed
      const savedState = pmStateStore.get("orderNotification:ord_123");
      expect(savedState?.status).toBe("failed");
    });

    it("records dead letter when emitCommands() throws", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = vi.fn(async () => {
        throw new Error("Command emission failed: queue unavailable");
      });

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("failed");
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0]?.error).toContain("Command emission failed");
    });

    it("tracks commandsFailed counter on failure", async () => {
      const storage = createMockStorage();
      const process = createMockProcess();
      const emitCommands = vi.fn(async () => {
        throw new Error("Emission failed");
      });

      await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      // Verify commandsFailed was incremented
      const savedState = pmStateStore.get("orderNotification:ord_123");
      expect(savedState?.commandsFailed).toBe(1);
    });
  });

  describe("command tracking", () => {
    it("tracks commandsEmitted counter", async () => {
      const storage = createMockStorage();
      const process = vi.fn(
        async (): Promise<EmittedCommand[]> => [
          { commandType: "Cmd1", payload: {}, causationId: "evt_1" },
          { commandType: "Cmd2", payload: {}, causationId: "evt_1" },
          { commandType: "Cmd3", payload: {}, causationId: "evt_1" },
        ]
      );
      const emitCommands = createMockEmitCommands();

      await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      const savedState = pmStateStore.get("orderNotification:ord_123");
      expect(savedState?.commandsEmitted).toBe(3);
    });

    it("returns command types in result", async () => {
      const storage = createMockStorage();
      const process = vi.fn(
        async (): Promise<EmittedCommand[]> => [
          { commandType: "SendEmail", payload: {}, causationId: "evt_1" },
          { commandType: "UpdateCRM", payload: {}, causationId: "evt_1" },
        ]
      );
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("processed");
      if (result.status === "processed") {
        expect(result.commandsEmitted).toEqual(["SendEmail", "UpdateCRM"]);
      }
    });

    it("handles empty command list (no-op PM)", async () => {
      const storage = createMockStorage();
      const process = vi.fn(async (): Promise<EmittedCommand[]> => []);
      const emitCommands = createMockEmitCommands();

      const result = await withPMCheckpoint(mockCtx, {
        pmName: "orderNotification",
        instanceId: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        correlationId: "corr_001",
        ...storage,
        process,
        emitCommands,
      });

      expect(result.status).toBe("processed");
      if (result.status === "processed") {
        expect(result.commandsEmitted).toEqual([]);
      }
      // emitCommands should not be called for empty list
      expect(emitCommands).not.toHaveBeenCalled();
    });
  });
});

describe("createPMCheckpointHelper", () => {
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  let pmStateStore: Map<string, ProcessManagerState>;
  let deadLetters: Array<{ pmName: string; instanceId: string; error: string }>;
  let emittedCommands: EmittedCommand[];

  beforeEach(() => {
    pmStateStore = new Map();
    deadLetters = [];
    emittedCommands = [];
  });

  it("creates a reusable PM checkpoint helper", async () => {
    const withOrderPMCheckpoint = createPMCheckpointHelper<MockCtx>({
      getPMState: async (_ctx, pmName, instanceId) => {
        return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
      },
      getOrCreatePMState: async (_ctx, pmName, instanceId) => {
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
      },
      updatePMState: async (_ctx, pmName, instanceId, updates) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) {
          pmStateStore.set(key, { ...existing, ...updates, lastUpdatedAt: Date.now() });
        }
      },
      recordDeadLetter: async (_ctx, pmName, instanceId, error) => {
        deadLetters.push({ pmName, instanceId, error });
      },
    });

    const result = await withOrderPMCheckpoint(mockCtx, {
      pmName: "orderNotification",
      instanceId: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      correlationId: "corr_001",
      process: async (_pmState) => [
        {
          commandType: "SendNotification",
          payload: { test: true },
          causationId: "evt_001",
        },
      ],
      emitCommands: async (_ctx, commands) => {
        emittedCommands.push(...commands);
      },
    });

    expect(result.status).toBe("processed");
    expect(emittedCommands).toHaveLength(1);
    expect(pmStateStore.get("orderNotification:ord_123")?.lastGlobalPosition).toBe(1000);
  });

  it("helper maintains PM semantics (idempotency)", async () => {
    const withOrderPMCheckpoint = createPMCheckpointHelper<MockCtx>({
      getPMState: async (_ctx, pmName, instanceId) => {
        return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
      },
      getOrCreatePMState: async (_ctx, pmName, instanceId) => {
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
      },
      updatePMState: async (_ctx, pmName, instanceId, updates) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) {
          pmStateStore.set(key, { ...existing, ...updates, lastUpdatedAt: Date.now() });
        }
      },
      recordDeadLetter: async (_ctx, pmName, instanceId, error) => {
        deadLetters.push({ pmName, instanceId, error });
      },
    });

    // First call - should process
    await withOrderPMCheckpoint(mockCtx, {
      pmName: "orderNotification",
      instanceId: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      correlationId: "corr_001",
      process: async (_pmState) => [{ commandType: "Cmd1", payload: {}, causationId: "evt_001" }],
      emitCommands: async (_ctx, commands) => {
        emittedCommands.push(...commands);
      },
    });

    // Second call - should skip (completed state)
    const result2 = await withOrderPMCheckpoint(mockCtx, {
      pmName: "orderNotification",
      instanceId: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      correlationId: "corr_001",
      process: async (_pmState) => [{ commandType: "Cmd2", payload: {}, causationId: "evt_001" }],
      emitCommands: async (_ctx, commands) => {
        emittedCommands.push(...commands);
      },
    });

    // PM is now in completed (terminal) state
    expect(result2.status).toBe("skipped");
    expect(emittedCommands).toHaveLength(1);
    expect(emittedCommands[0]?.commandType).toBe("Cmd1");
  });
});
