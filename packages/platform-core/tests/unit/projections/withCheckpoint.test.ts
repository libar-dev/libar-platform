/**
 * Unit Tests for withCheckpoint Helper
 *
 * Tests the checkpoint-based projection idempotency pattern:
 * - Skip already-processed events
 * - Process new events
 * - Atomic checkpoint updates
 * - createCheckpointHelper factory
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withCheckpoint, createCheckpointHelper } from "../../../src/projections/withCheckpoint";
import type { ProjectionCheckpoint } from "../../../src/projections/types";

describe("withCheckpoint", () => {
  // Mock context (can be any type)
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  // Mock checkpoint storage
  let checkpointStore: Map<string, ProjectionCheckpoint>;
  let processedEvents: string[];

  // Helper to create mock functions
  const createMockFns = () => ({
    getCheckpoint: vi.fn(async (_ctx: MockCtx, partitionKey: string) => {
      return checkpointStore.get(partitionKey) ?? null;
    }),
    updateCheckpoint: vi.fn(
      async (_ctx: MockCtx, partitionKey: string, checkpoint: ProjectionCheckpoint) => {
        checkpointStore.set(partitionKey, checkpoint);
      }
    ),
    process: vi.fn(async () => {
      // Simulate projection logic
      processedEvents.push("event_processed");
    }),
  });

  beforeEach(() => {
    checkpointStore = new Map();
    processedEvents = [];
    vi.clearAllMocks();
  });

  describe("new event processing", () => {
    it("processes event when no checkpoint exists", async () => {
      const mocks = createMockFns();

      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks,
      });

      expect(result.status).toBe("processed");
      expect(mocks.process).toHaveBeenCalledTimes(1);
      expect(mocks.updateCheckpoint).toHaveBeenCalledTimes(1);
      expect(processedEvents).toEqual(["event_processed"]);
    });

    it("processes event when globalPosition is greater than checkpoint", async () => {
      // Setup: existing checkpoint at position 1000
      checkpointStore.set("ord_123", {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        lastGlobalPosition: 1000,
        lastEventId: "evt_001",
        updatedAt: Date.now() - 5000,
      });

      const mocks = createMockFns();

      // New event at position 2000
      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 2000,
        eventId: "evt_002",
        ...mocks,
      });

      expect(result.status).toBe("processed");
      expect(mocks.process).toHaveBeenCalledTimes(1);
    });

    it("updates checkpoint after processing", async () => {
      const mocks = createMockFns();
      const beforeTime = Date.now();

      await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks,
      });

      const savedCheckpoint = checkpointStore.get("ord_123");
      expect(savedCheckpoint).toBeDefined();
      expect(savedCheckpoint?.projectionName).toBe("orderSummary");
      expect(savedCheckpoint?.partitionKey).toBe("ord_123");
      expect(savedCheckpoint?.lastGlobalPosition).toBe(1000);
      expect(savedCheckpoint?.lastEventId).toBe("evt_001");
      expect(savedCheckpoint?.updatedAt).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe("duplicate event skipping", () => {
    it("skips event when globalPosition equals checkpoint", async () => {
      // Setup: existing checkpoint at position 1000
      checkpointStore.set("ord_123", {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        lastGlobalPosition: 1000,
        lastEventId: "evt_001",
        updatedAt: Date.now(),
      });

      const mocks = createMockFns();

      // Same event replayed (same position)
      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks,
      });

      expect(result.status).toBe("skipped");
      expect(mocks.process).not.toHaveBeenCalled();
      expect(mocks.updateCheckpoint).not.toHaveBeenCalled();
    });

    it("skips event when globalPosition is less than checkpoint", async () => {
      // Setup: existing checkpoint at position 2000
      checkpointStore.set("ord_123", {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        lastGlobalPosition: 2000,
        lastEventId: "evt_002",
        updatedAt: Date.now(),
      });

      const mocks = createMockFns();

      // Older event arrives out of order (position 1000)
      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks,
      });

      expect(result.status).toBe("skipped");
      expect(mocks.process).not.toHaveBeenCalled();
    });
  });

  describe("partition isolation", () => {
    it("maintains separate checkpoints per partition", async () => {
      const mocks1 = createMockFns();
      const mocks2 = createMockFns();

      // Process event for partition 1
      await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_001",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks1,
      });

      // Process event for partition 2
      await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_002",
        globalPosition: 500,
        eventId: "evt_002",
        ...mocks2,
      });

      // Both should be processed
      expect(mocks1.process).toHaveBeenCalledTimes(1);
      expect(mocks2.process).toHaveBeenCalledTimes(1);

      // Checkpoints should be independent
      const cp1 = checkpointStore.get("ord_001");
      const cp2 = checkpointStore.get("ord_002");

      expect(cp1?.lastGlobalPosition).toBe(1000);
      expect(cp2?.lastGlobalPosition).toBe(500);
    });

    it("does not skip event in different partition with same position", async () => {
      // Setup: checkpoint for partition 1 at position 1000
      checkpointStore.set("ord_001", {
        projectionName: "orderSummary",
        partitionKey: "ord_001",
        lastGlobalPosition: 1000,
        lastEventId: "evt_001",
        updatedAt: Date.now(),
      });

      const mocks = createMockFns();

      // Event for different partition at same position
      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_002", // Different partition
        globalPosition: 1000, // Same position
        eventId: "evt_002",
        ...mocks,
      });

      expect(result.status).toBe("processed");
      expect(mocks.process).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("does not update checkpoint when process() throws", async () => {
      const mocks = createMockFns();
      mocks.process = vi.fn(async () => {
        throw new Error("Process failed: database unavailable");
      });

      await expect(
        withCheckpoint(mockCtx, {
          projectionName: "orderSummary",
          partitionKey: "ord_123",
          globalPosition: 1000,
          eventId: "evt_001",
          ...mocks,
        })
      ).rejects.toThrow("Process failed: database unavailable");

      // Checkpoint should NOT be updated when process fails
      expect(mocks.updateCheckpoint).not.toHaveBeenCalled();
      // Event should not be in the checkpoint store
      expect(checkpointStore.get("ord_123")).toBeUndefined();
    });

    it("allows retry after process() failure", async () => {
      let callCount = 0;
      const mocks = createMockFns();
      mocks.process = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Transient failure");
        }
        processedEvents.push("success_on_retry");
      });

      // First attempt - fails
      await expect(
        withCheckpoint(mockCtx, {
          projectionName: "orderSummary",
          partitionKey: "ord_123",
          globalPosition: 1000,
          eventId: "evt_001",
          ...mocks,
        })
      ).rejects.toThrow("Transient failure");

      // No checkpoint stored after failure
      expect(checkpointStore.get("ord_123")).toBeUndefined();

      // Second attempt (retry) - succeeds
      const result = await withCheckpoint(mockCtx, {
        projectionName: "orderSummary",
        partitionKey: "ord_123",
        globalPosition: 1000,
        eventId: "evt_001",
        ...mocks,
      });

      expect(result.status).toBe("processed");
      expect(processedEvents).toEqual(["success_on_retry"]);
      expect(checkpointStore.get("ord_123")?.lastGlobalPosition).toBe(1000);
    });
  });

  describe("checkpoint data integrity", () => {
    it("stores all checkpoint fields correctly", async () => {
      const mocks = createMockFns();

      await withCheckpoint(mockCtx, {
        projectionName: "productCatalog",
        partitionKey: "prod_xyz",
        globalPosition: 12345,
        eventId: "evt_abc123",
        ...mocks,
      });

      // Verify the checkpoint was stored with correct fields
      expect(mocks.updateCheckpoint).toHaveBeenCalledWith(
        mockCtx,
        "prod_xyz",
        expect.objectContaining({
          projectionName: "productCatalog",
          partitionKey: "prod_xyz",
          lastGlobalPosition: 12345,
          lastEventId: "evt_abc123",
          updatedAt: expect.any(Number),
        })
      );
    });
  });
});

describe("createCheckpointHelper", () => {
  type MockCtx = { db: "mock" };
  const mockCtx: MockCtx = { db: "mock" };

  let checkpointStore: Map<string, ProjectionCheckpoint>;
  let processedEvents: string[];

  beforeEach(() => {
    checkpointStore = new Map();
    processedEvents = [];
  });

  it("creates a reusable checkpoint helper", async () => {
    // Create configured helper
    const withOrderCheckpoint = createCheckpointHelper<MockCtx>(
      async (_ctx, partitionKey) => checkpointStore.get(partitionKey) ?? null,
      async (_ctx, partitionKey, checkpoint) => {
        checkpointStore.set(partitionKey, checkpoint);
      }
    );

    // Use the helper
    const result = await withOrderCheckpoint(mockCtx, {
      projectionName: "orderSummary",
      partitionKey: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      process: async () => {
        processedEvents.push("processed");
      },
    });

    expect(result.status).toBe("processed");
    expect(processedEvents).toEqual(["processed"]);
    expect(checkpointStore.get("ord_123")?.lastGlobalPosition).toBe(1000);
  });

  it("helper maintains checkpoint semantics", async () => {
    // Create configured helper
    const withOrderCheckpoint = createCheckpointHelper<MockCtx>(
      async (_ctx, partitionKey) => checkpointStore.get(partitionKey) ?? null,
      async (_ctx, partitionKey, checkpoint) => {
        checkpointStore.set(partitionKey, checkpoint);
      }
    );

    // First call - should process
    await withOrderCheckpoint(mockCtx, {
      projectionName: "orderSummary",
      partitionKey: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      process: async () => {
        processedEvents.push("first");
      },
    });

    // Second call same position - should skip
    const result2 = await withOrderCheckpoint(mockCtx, {
      projectionName: "orderSummary",
      partitionKey: "ord_123",
      globalPosition: 1000,
      eventId: "evt_001",
      process: async () => {
        processedEvents.push("second");
      },
    });

    // Third call higher position - should process
    await withOrderCheckpoint(mockCtx, {
      projectionName: "orderSummary",
      partitionKey: "ord_123",
      globalPosition: 2000,
      eventId: "evt_002",
      process: async () => {
        processedEvents.push("third");
      },
    });

    expect(result2.status).toBe("skipped");
    expect(processedEvents).toEqual(["first", "third"]);
  });
});

describe("checkpoint.ts pure functions", () => {
  // Import pure functions (inline import due to ESM)
  // Note: These are imported at top level in a real codebase, but we use
  // lazy import here to test the pure functions from checkpoint.ts
  let shouldProcessEvent: (
    eventGlobalPosition: number,
    checkpointGlobalPosition: number
  ) => boolean;
  let createInitialCheckpoint: (
    projectionName: string,
    partitionKey: string
  ) => ProjectionCheckpoint;

  beforeEach(async () => {
    const checkpoint = await import("../../../src/projections/checkpoint");
    shouldProcessEvent = checkpoint.shouldProcessEvent;
    createInitialCheckpoint = checkpoint.createInitialCheckpoint;
  });

  describe("shouldProcessEvent", () => {
    it("returns true when event position is greater than checkpoint", () => {
      expect(shouldProcessEvent(1000, 500)).toBe(true);
    });

    it("returns false when event position equals checkpoint", () => {
      expect(shouldProcessEvent(1000, 1000)).toBe(false);
    });

    it("returns false when event position is less than checkpoint", () => {
      expect(shouldProcessEvent(500, 1000)).toBe(false);
    });

    it("handles zero checkpoint (no events processed)", () => {
      expect(shouldProcessEvent(1, 0)).toBe(true);
    });

    it("handles sentinel value -1 (initial state)", () => {
      expect(shouldProcessEvent(0, -1)).toBe(true);
      expect(shouldProcessEvent(1, -1)).toBe(true);
    });
  });

  describe("createInitialCheckpoint", () => {
    it("creates checkpoint with sentinel values", () => {
      const checkpoint = createInitialCheckpoint("orderSummary", "ord_123");

      expect(checkpoint.projectionName).toBe("orderSummary");
      expect(checkpoint.partitionKey).toBe("ord_123");
      expect(checkpoint.lastGlobalPosition).toBe(-1); // Sentinel value
      expect(checkpoint.lastEventId).toBe(""); // Empty string
      expect(checkpoint.updatedAt).toBeGreaterThan(0);
    });

    it("creates unique updatedAt for each call", async () => {
      const cp1 = createInitialCheckpoint("test", "key1");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const cp2 = createInitialCheckpoint("test", "key2");

      expect(cp2.updatedAt).toBeGreaterThanOrEqual(cp1.updatedAt);
    });
  });
});
