/**
 * Checkpoint Module Unit Tests
 *
 * Tests for the agent checkpoint functionality including:
 * - Checkpoint creation and initialization
 * - Position tracking and idempotency
 * - Status management
 * - Update operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Status types
  AGENT_CHECKPOINT_STATUSES,
  // Schemas
  AgentCheckpointStatusSchema,
  AgentCheckpointSchema,
  // Factory functions
  createInitialAgentCheckpoint,
  applyCheckpointUpdate,
  // Helper functions
  shouldProcessAgentEvent,
  isAgentActive,
  isAgentPaused,
  isAgentStopped,
  isValidAgentCheckpoint,
  // Types
  type AgentCheckpoint,
  type AgentCheckpointUpdate,
} from "../../../src/agent/checkpoint.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    lastProcessedPosition: 100,
    lastEventId: "evt_test_123",
    status: "active",
    eventsProcessed: 50,
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Status Types Tests
// ============================================================================

describe("AGENT_CHECKPOINT_STATUSES", () => {
  it("contains all three statuses", () => {
    expect(AGENT_CHECKPOINT_STATUSES).toEqual(["active", "paused", "stopped"]);
  });

  it("is a readonly tuple with 3 elements", () => {
    expect(Array.isArray(AGENT_CHECKPOINT_STATUSES)).toBe(true);
    expect(AGENT_CHECKPOINT_STATUSES.length).toBe(3);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("AgentCheckpointStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of AGENT_CHECKPOINT_STATUSES) {
      const result = AgentCheckpointStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid statuses", () => {
    const invalidValues = ["running", "ACTIVE", "Paused", "", 123, null, undefined];
    for (const value of invalidValues) {
      const result = AgentCheckpointStatusSchema.safeParse(value);
      expect(result.success).toBe(false);
    }
  });
});

describe("AgentCheckpointSchema", () => {
  it("accepts valid checkpoint objects", () => {
    const checkpoint = createTestCheckpoint();
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(true);
  });

  it("accepts checkpoint with sentinel position (-1)", () => {
    const checkpoint = createTestCheckpoint({ lastProcessedPosition: -1 });
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(true);
  });

  it("rejects checkpoint with position below -1", () => {
    const checkpoint = createTestCheckpoint({ lastProcessedPosition: -2 });
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
  });

  it("rejects checkpoint with negative eventsProcessed", () => {
    const checkpoint = createTestCheckpoint({ eventsProcessed: -1 });
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
  });

  it("rejects checkpoint with empty agentId", () => {
    const checkpoint = { ...createTestCheckpoint(), agentId: "" };
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
  });

  it("rejects checkpoint with empty subscriptionId", () => {
    const checkpoint = { ...createTestCheckpoint(), subscriptionId: "" };
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
  });

  it("rejects checkpoint with missing required fields", () => {
    const invalid = { agentId: "test" }; // missing other fields
    const result = AgentCheckpointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("createInitialAgentCheckpoint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates checkpoint with correct agentId", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.agentId).toBe("my-agent");
  });

  it("creates checkpoint with correct subscriptionId", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.subscriptionId).toBe("sub-001");
  });

  it("initializes lastProcessedPosition to -1 (sentinel value)", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.lastProcessedPosition).toBe(-1);
  });

  it("initializes lastEventId to empty string", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.lastEventId).toBe("");
  });

  it("initializes status to active", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.status).toBe("active");
  });

  it("initializes eventsProcessed to 0", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.eventsProcessed).toBe(0);
  });

  it("sets updatedAt to current time", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    expect(checkpoint.updatedAt).toBe(Date.now());
  });

  it("creates valid checkpoint that passes schema validation", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
    const result = AgentCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(true);
  });
});

describe("applyCheckpointUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates lastProcessedPosition", () => {
    const checkpoint = createTestCheckpoint({ lastProcessedPosition: 100 });
    const update: AgentCheckpointUpdate = { lastProcessedPosition: 150 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.lastProcessedPosition).toBe(150);
  });

  it("updates lastEventId", () => {
    const checkpoint = createTestCheckpoint({ lastEventId: "evt_old" });
    const update: AgentCheckpointUpdate = { lastEventId: "evt_new" };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.lastEventId).toBe("evt_new");
  });

  it("updates status", () => {
    const checkpoint = createTestCheckpoint({ status: "active" });
    const update: AgentCheckpointUpdate = { status: "paused" };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.status).toBe("paused");
  });

  it("increments eventsProcessed", () => {
    const checkpoint = createTestCheckpoint({ eventsProcessed: 50 });
    const update: AgentCheckpointUpdate = { incrementEventsProcessed: 5 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.eventsProcessed).toBe(55);
  });

  it("increments eventsProcessed by 1 for single event", () => {
    const checkpoint = createTestCheckpoint({ eventsProcessed: 100 });
    const update: AgentCheckpointUpdate = { incrementEventsProcessed: 1 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.eventsProcessed).toBe(101);
  });

  it("does not increment eventsProcessed when not specified", () => {
    const checkpoint = createTestCheckpoint({ eventsProcessed: 50 });
    const update: AgentCheckpointUpdate = { lastProcessedPosition: 101 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.eventsProcessed).toBe(50);
  });

  it("preserves unchanged fields", () => {
    const checkpoint = createTestCheckpoint({
      agentId: "my-agent",
      subscriptionId: "sub-001",
      lastProcessedPosition: 100,
      lastEventId: "evt_123",
      status: "active",
      eventsProcessed: 50,
    });
    const update: AgentCheckpointUpdate = { lastProcessedPosition: 101 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.agentId).toBe("my-agent");
    expect(result.subscriptionId).toBe("sub-001");
    expect(result.lastEventId).toBe("evt_123");
    expect(result.status).toBe("active");
    expect(result.eventsProcessed).toBe(50);
  });

  it("updates updatedAt to current time", () => {
    const oldTime = Date.now() - 10000;
    const checkpoint = createTestCheckpoint({ updatedAt: oldTime });
    const update: AgentCheckpointUpdate = { lastProcessedPosition: 101 };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.updatedAt).toBe(Date.now());
    expect(result.updatedAt).not.toBe(oldTime);
  });

  it("applies multiple updates at once", () => {
    const checkpoint = createTestCheckpoint({
      lastProcessedPosition: 100,
      lastEventId: "evt_old",
      status: "active",
      eventsProcessed: 50,
    });
    const update: AgentCheckpointUpdate = {
      lastProcessedPosition: 101,
      lastEventId: "evt_new",
      status: "paused",
      incrementEventsProcessed: 1,
    };
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.lastProcessedPosition).toBe(101);
    expect(result.lastEventId).toBe("evt_new");
    expect(result.status).toBe("paused");
    expect(result.eventsProcessed).toBe(51);
  });

  it("handles empty update (only updates timestamp)", () => {
    const checkpoint = createTestCheckpoint();
    const update: AgentCheckpointUpdate = {};
    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.lastProcessedPosition).toBe(checkpoint.lastProcessedPosition);
    expect(result.lastEventId).toBe(checkpoint.lastEventId);
    expect(result.status).toBe(checkpoint.status);
    expect(result.eventsProcessed).toBe(checkpoint.eventsProcessed);
    expect(result.updatedAt).toBe(Date.now());
  });
});

// ============================================================================
// shouldProcessAgentEvent Tests (CRITICAL - Idempotency)
// ============================================================================

describe("shouldProcessAgentEvent", () => {
  describe("basic position comparison", () => {
    it("returns true when event position is greater than checkpoint", () => {
      expect(shouldProcessAgentEvent(101, 100)).toBe(true);
    });

    it("returns false when event position equals checkpoint (duplicate)", () => {
      expect(shouldProcessAgentEvent(100, 100)).toBe(false);
    });

    it("returns false when event position is less than checkpoint (already processed)", () => {
      expect(shouldProcessAgentEvent(50, 100)).toBe(false);
    });
  });

  describe("sentinel value handling (-1)", () => {
    it("returns true for position 0 when checkpoint is -1 (new agent)", () => {
      // This is the critical case: a new agent with sentinel value -1
      // should process the very first event at position 0
      expect(shouldProcessAgentEvent(0, -1)).toBe(true);
    });

    it("returns true for position 1 when checkpoint is -1", () => {
      expect(shouldProcessAgentEvent(1, -1)).toBe(true);
    });

    it("returns true for any positive position when checkpoint is -1", () => {
      expect(shouldProcessAgentEvent(100, -1)).toBe(true);
      expect(shouldProcessAgentEvent(1000000, -1)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns true for position 1 when checkpoint is 0", () => {
      expect(shouldProcessAgentEvent(1, 0)).toBe(true);
    });

    it("returns false for position 0 when checkpoint is 0", () => {
      expect(shouldProcessAgentEvent(0, 0)).toBe(false);
    });

    it("handles large position values", () => {
      expect(shouldProcessAgentEvent(1000001, 1000000)).toBe(true);
      expect(shouldProcessAgentEvent(1000000, 1000000)).toBe(false);
    });
  });

  describe("typical usage patterns", () => {
    it("processes sequential events correctly", () => {
      let checkpointPosition = -1; // New agent

      // First event
      expect(shouldProcessAgentEvent(0, checkpointPosition)).toBe(true);
      checkpointPosition = 0;

      // Second event
      expect(shouldProcessAgentEvent(1, checkpointPosition)).toBe(true);
      checkpointPosition = 1;

      // Third event
      expect(shouldProcessAgentEvent(2, checkpointPosition)).toBe(true);
      checkpointPosition = 2;

      // Duplicate of third event (should skip)
      expect(shouldProcessAgentEvent(2, checkpointPosition)).toBe(false);

      // Fourth event
      expect(shouldProcessAgentEvent(3, checkpointPosition)).toBe(true);
    });

    it("handles gaps in event positions", () => {
      const checkpointPosition = 100;

      // Gap in positions (e.g., from filtering)
      expect(shouldProcessAgentEvent(150, checkpointPosition)).toBe(true);
      expect(shouldProcessAgentEvent(200, 150)).toBe(true);
    });
  });
});

// ============================================================================
// Status Helper Functions Tests
// ============================================================================

describe("isAgentActive", () => {
  it("returns true for active status", () => {
    const checkpoint = createTestCheckpoint({ status: "active" });
    expect(isAgentActive(checkpoint)).toBe(true);
  });

  it("returns false for paused status", () => {
    const checkpoint = createTestCheckpoint({ status: "paused" });
    expect(isAgentActive(checkpoint)).toBe(false);
  });

  it("returns false for stopped status", () => {
    const checkpoint = createTestCheckpoint({ status: "stopped" });
    expect(isAgentActive(checkpoint)).toBe(false);
  });
});

describe("isAgentPaused", () => {
  it("returns true for paused status", () => {
    const checkpoint = createTestCheckpoint({ status: "paused" });
    expect(isAgentPaused(checkpoint)).toBe(true);
  });

  it("returns false for active status", () => {
    const checkpoint = createTestCheckpoint({ status: "active" });
    expect(isAgentPaused(checkpoint)).toBe(false);
  });

  it("returns false for stopped status", () => {
    const checkpoint = createTestCheckpoint({ status: "stopped" });
    expect(isAgentPaused(checkpoint)).toBe(false);
  });
});

describe("isAgentStopped", () => {
  it("returns true for stopped status", () => {
    const checkpoint = createTestCheckpoint({ status: "stopped" });
    expect(isAgentStopped(checkpoint)).toBe(true);
  });

  it("returns false for active status", () => {
    const checkpoint = createTestCheckpoint({ status: "active" });
    expect(isAgentStopped(checkpoint)).toBe(false);
  });

  it("returns false for paused status", () => {
    const checkpoint = createTestCheckpoint({ status: "paused" });
    expect(isAgentStopped(checkpoint)).toBe(false);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("isValidAgentCheckpoint", () => {
  it("returns true for valid checkpoint", () => {
    const checkpoint = createTestCheckpoint();
    expect(isValidAgentCheckpoint(checkpoint)).toBe(true);
  });

  it("returns true for checkpoint with sentinel position", () => {
    const checkpoint = createTestCheckpoint({ lastProcessedPosition: -1 });
    expect(isValidAgentCheckpoint(checkpoint)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidAgentCheckpoint(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidAgentCheckpoint(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isValidAgentCheckpoint({})).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isValidAgentCheckpoint("not an object")).toBe(false);
    expect(isValidAgentCheckpoint(123)).toBe(false);
    expect(isValidAgentCheckpoint(true)).toBe(false);
  });

  it("returns false for checkpoint with invalid status", () => {
    const invalid = { ...createTestCheckpoint(), status: "invalid" };
    expect(isValidAgentCheckpoint(invalid)).toBe(false);
  });

  it("returns false for checkpoint with position below -1", () => {
    const invalid = { ...createTestCheckpoint(), lastProcessedPosition: -2 };
    expect(isValidAgentCheckpoint(invalid)).toBe(false);
  });

  it("returns false for checkpoint with negative eventsProcessed", () => {
    const invalid = { ...createTestCheckpoint(), eventsProcessed: -1 };
    expect(isValidAgentCheckpoint(invalid)).toBe(false);
  });
});

// ============================================================================
// Integration-style Tests (Realistic Usage)
// ============================================================================

describe("checkpoint lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("simulates new agent processing first events", () => {
    // New agent starts with sentinel value
    let checkpoint = createInitialAgentCheckpoint("new-agent", "sub-001");
    expect(checkpoint.lastProcessedPosition).toBe(-1);
    expect(checkpoint.eventsProcessed).toBe(0);
    expect(isAgentActive(checkpoint)).toBe(true);

    // First event at position 0
    expect(shouldProcessAgentEvent(0, checkpoint.lastProcessedPosition)).toBe(true);
    checkpoint = applyCheckpointUpdate(checkpoint, {
      lastProcessedPosition: 0,
      lastEventId: "evt_0",
      incrementEventsProcessed: 1,
    });
    expect(checkpoint.lastProcessedPosition).toBe(0);
    expect(checkpoint.eventsProcessed).toBe(1);

    // Second event at position 1
    expect(shouldProcessAgentEvent(1, checkpoint.lastProcessedPosition)).toBe(true);
    checkpoint = applyCheckpointUpdate(checkpoint, {
      lastProcessedPosition: 1,
      lastEventId: "evt_1",
      incrementEventsProcessed: 1,
    });
    expect(checkpoint.lastProcessedPosition).toBe(1);
    expect(checkpoint.eventsProcessed).toBe(2);
  });

  it("simulates agent pause and resume", () => {
    let checkpoint = createTestCheckpoint({
      status: "active",
      lastProcessedPosition: 100,
      eventsProcessed: 100,
    });

    // Pause the agent
    checkpoint = applyCheckpointUpdate(checkpoint, { status: "paused" });
    expect(isAgentPaused(checkpoint)).toBe(true);
    expect(isAgentActive(checkpoint)).toBe(false);

    // Position and count preserved
    expect(checkpoint.lastProcessedPosition).toBe(100);
    expect(checkpoint.eventsProcessed).toBe(100);

    // Resume the agent
    checkpoint = applyCheckpointUpdate(checkpoint, { status: "active" });
    expect(isAgentActive(checkpoint)).toBe(true);
  });

  it("simulates agent restart recovery", () => {
    // Agent was processing and persisted checkpoint at position 500
    const persistedCheckpoint = createTestCheckpoint({
      lastProcessedPosition: 500,
      lastEventId: "evt_500",
      eventsProcessed: 500,
    });

    // After restart, agent loads checkpoint and should:
    // - Skip events <= 500
    // - Process events > 500

    expect(shouldProcessAgentEvent(500, persistedCheckpoint.lastProcessedPosition)).toBe(false);
    expect(shouldProcessAgentEvent(499, persistedCheckpoint.lastProcessedPosition)).toBe(false);
    expect(shouldProcessAgentEvent(501, persistedCheckpoint.lastProcessedPosition)).toBe(true);
  });

  it("simulates duplicate event delivery (idempotency)", () => {
    let checkpoint = createTestCheckpoint({
      lastProcessedPosition: 100,
      eventsProcessed: 100,
    });

    // Event at position 101 arrives
    expect(shouldProcessAgentEvent(101, checkpoint.lastProcessedPosition)).toBe(true);
    checkpoint = applyCheckpointUpdate(checkpoint, {
      lastProcessedPosition: 101,
      incrementEventsProcessed: 1,
    });

    // Same event delivered again (duplicate)
    expect(shouldProcessAgentEvent(101, checkpoint.lastProcessedPosition)).toBe(false);
    // No update needed - count stays at 101
    expect(checkpoint.eventsProcessed).toBe(101);

    // Next event
    expect(shouldProcessAgentEvent(102, checkpoint.lastProcessedPosition)).toBe(true);
  });
});
