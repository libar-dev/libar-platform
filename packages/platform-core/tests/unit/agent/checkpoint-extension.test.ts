/**
 * Checkpoint Extension Unit Tests
 *
 * Tests for lifecycle-related checkpoint extensions including:
 * - isAgentInErrorRecovery — true for error_recovery, false for others
 * - resolveEffectiveConfig — base config, partial overrides, full overrides, deep merge
 * - applyCheckpointUpdate with configOverrides — merge behavior and preservation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isAgentInErrorRecovery,
  resolveEffectiveConfig,
  applyCheckpointUpdate,
  createInitialAgentCheckpoint,
  type AgentCheckpoint,
  type AgentCheckpointUpdate,
} from "../../../src/agent/checkpoint.js";

// ============================================================================
// Test Helpers
// ============================================================================

function makeCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    lastProcessedPosition: 10,
    lastEventId: "evt-010",
    status: "active",
    eventsProcessed: 10,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

// ============================================================================
// isAgentInErrorRecovery
// ============================================================================

describe("isAgentInErrorRecovery", () => {
  it("returns true for error_recovery status", () => {
    const checkpoint = makeCheckpoint({ status: "error_recovery" });
    expect(isAgentInErrorRecovery(checkpoint)).toBe(true);
  });

  it("returns false for active status", () => {
    const checkpoint = makeCheckpoint({ status: "active" });
    expect(isAgentInErrorRecovery(checkpoint)).toBe(false);
  });

  it("returns false for paused status", () => {
    const checkpoint = makeCheckpoint({ status: "paused" });
    expect(isAgentInErrorRecovery(checkpoint)).toBe(false);
  });

  it("returns false for stopped status", () => {
    const checkpoint = makeCheckpoint({ status: "stopped" });
    expect(isAgentInErrorRecovery(checkpoint)).toBe(false);
  });
});

// ============================================================================
// resolveEffectiveConfig — no overrides
// ============================================================================

describe("resolveEffectiveConfig — no overrides", () => {
  it("returns base config values when overrides are undefined", () => {
    const result = resolveEffectiveConfig({
      confidenceThreshold: 0.8,
      patternWindow: { duration: "30d" },
    });

    expect(result.confidenceThreshold).toBe(0.8);
    expect(result.patternWindowDuration).toBe("30d");
  });

  it("passes through base rateLimits when no overrides", () => {
    const result = resolveEffectiveConfig({
      confidenceThreshold: 0.75,
      patternWindow: { duration: "7d" },
      rateLimits: {
        maxRequestsPerMinute: 60,
        maxConcurrent: 5,
        costBudget: { daily: 100, alertThreshold: 0.8 },
      },
    });

    expect(result.rateLimits?.maxRequestsPerMinute).toBe(60);
    expect(result.rateLimits?.maxConcurrent).toBe(5);
    expect(result.rateLimits?.costBudget?.daily).toBe(100);
    expect(result.rateLimits?.costBudget?.alertThreshold).toBe(0.8);
  });

  it("omits rateLimits when base has none and no overrides", () => {
    const result = resolveEffectiveConfig({
      confidenceThreshold: 0.5,
      patternWindow: { duration: "1d" },
    });

    expect(result.rateLimits).toBeUndefined();
  });
});

// ============================================================================
// resolveEffectiveConfig — with partial overrides
// ============================================================================

describe("resolveEffectiveConfig — partial overrides", () => {
  it("overrides confidenceThreshold while preserving patternWindowDuration", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
      },
      { confidenceThreshold: 0.95 }
    );

    expect(result.confidenceThreshold).toBe(0.95);
    expect(result.patternWindowDuration).toBe("30d");
  });

  it("overrides patternWindowDuration while preserving confidenceThreshold", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
      },
      { patternWindowDuration: "7d" }
    );

    expect(result.confidenceThreshold).toBe(0.8);
    expect(result.patternWindowDuration).toBe("7d");
  });

  it("overrides rateLimits.maxRequestsPerMinute while preserving base costBudget", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
        rateLimits: {
          maxRequestsPerMinute: 60,
          costBudget: { daily: 100, alertThreshold: 0.8 },
        },
      },
      { rateLimits: { maxRequestsPerMinute: 120 } }
    );

    expect(result.rateLimits?.maxRequestsPerMinute).toBe(120);
    expect(result.rateLimits?.costBudget?.daily).toBe(100);
    expect(result.rateLimits?.costBudget?.alertThreshold).toBe(0.8);
  });
});

// ============================================================================
// resolveEffectiveConfig — deep merge of rateLimits.costBudget
// ============================================================================

describe("resolveEffectiveConfig — deep merge costBudget", () => {
  it("deep-merges costBudget.daily while preserving costBudget.alertThreshold", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
        rateLimits: {
          maxRequestsPerMinute: 60,
          costBudget: { daily: 100, alertThreshold: 0.8 },
        },
      },
      {
        rateLimits: {
          costBudget: { daily: 200 },
        },
      }
    );

    expect(result.rateLimits?.costBudget?.daily).toBe(200);
    expect(result.rateLimits?.costBudget?.alertThreshold).toBe(0.8);
  });

  it("deep-merges costBudget.alertThreshold while preserving costBudget.daily", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
        rateLimits: {
          maxRequestsPerMinute: 60,
          costBudget: { daily: 100, alertThreshold: 0.8 },
        },
      },
      {
        rateLimits: {
          costBudget: { alertThreshold: 0.95 },
        },
      }
    );

    expect(result.rateLimits?.costBudget?.daily).toBe(100);
    expect(result.rateLimits?.costBudget?.alertThreshold).toBe(0.95);
  });
});

// ============================================================================
// resolveEffectiveConfig — full overrides
// ============================================================================

describe("resolveEffectiveConfig — full overrides", () => {
  it("fully overrides all config values", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
        rateLimits: {
          maxRequestsPerMinute: 60,
          maxConcurrent: 5,
          costBudget: { daily: 100, alertThreshold: 0.8 },
        },
      },
      {
        confidenceThreshold: 0.99,
        patternWindowDuration: "1d",
        rateLimits: {
          maxRequestsPerMinute: 10,
          maxConcurrent: 2,
          queueDepth: 50,
          costBudget: { daily: 25, alertThreshold: 0.5 },
        },
      }
    );

    expect(result.confidenceThreshold).toBe(0.99);
    expect(result.patternWindowDuration).toBe("1d");
    expect(result.rateLimits?.maxRequestsPerMinute).toBe(10);
    expect(result.rateLimits?.maxConcurrent).toBe(2);
    expect(result.rateLimits?.queueDepth).toBe(50);
    expect(result.rateLimits?.costBudget?.daily).toBe(25);
    expect(result.rateLimits?.costBudget?.alertThreshold).toBe(0.5);
  });
});

// ============================================================================
// resolveEffectiveConfig — edge: overrides add rateLimits to base without
// ============================================================================

describe("resolveEffectiveConfig — edge cases", () => {
  it("adds rateLimits via overrides when base has none", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
      },
      {
        rateLimits: {
          maxRequestsPerMinute: 30,
          costBudget: { daily: 50, alertThreshold: 0.9 },
        },
      }
    );

    expect(result.rateLimits?.maxRequestsPerMinute).toBe(30);
    expect(result.rateLimits?.costBudget?.daily).toBe(50);
  });

  it("empty overrides object returns base config values", () => {
    const result = resolveEffectiveConfig(
      {
        confidenceThreshold: 0.8,
        patternWindow: { duration: "30d" },
        rateLimits: { maxRequestsPerMinute: 60 },
      },
      {}
    );

    expect(result.confidenceThreshold).toBe(0.8);
    expect(result.patternWindowDuration).toBe("30d");
    // Note: empty overrides still trigger the override path;
    // base rateLimits are preserved since overRL is falsy ({}.rateLimits === undefined)
    expect(result.rateLimits?.maxRequestsPerMinute).toBe(60);
  });
});

// ============================================================================
// applyCheckpointUpdate with configOverrides
// ============================================================================

describe("applyCheckpointUpdate — configOverrides merge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies configOverrides to a checkpoint without existing overrides", () => {
    const checkpoint = makeCheckpoint();
    const update: AgentCheckpointUpdate = {
      configOverrides: { confidenceThreshold: 0.95 },
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides?.confidenceThreshold).toBe(0.95);
  });

  it("merges new configOverrides with existing overrides", () => {
    const checkpoint = makeCheckpoint({
      configOverrides: { confidenceThreshold: 0.8 },
    });
    const update: AgentCheckpointUpdate = {
      configOverrides: { patternWindowDuration: "7d" },
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides?.confidenceThreshold).toBe(0.8);
    expect(result.configOverrides?.patternWindowDuration).toBe("7d");
  });

  it("update overrides take precedence over existing", () => {
    const checkpoint = makeCheckpoint({
      configOverrides: { confidenceThreshold: 0.8 },
    });
    const update: AgentCheckpointUpdate = {
      configOverrides: { confidenceThreshold: 0.99 },
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides?.confidenceThreshold).toBe(0.99);
  });

  it("preserves existing configOverrides when update has no overrides", () => {
    const checkpoint = makeCheckpoint({
      configOverrides: {
        confidenceThreshold: 0.9,
        rateLimits: { maxRequestsPerMinute: 30 },
      },
    });
    const update: AgentCheckpointUpdate = {
      status: "paused",
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides?.confidenceThreshold).toBe(0.9);
    expect(result.configOverrides?.rateLimits?.maxRequestsPerMinute).toBe(30);
    expect(result.status).toBe("paused");
  });

  it("deep-merges rateLimits.costBudget in checkpoint overrides", () => {
    const checkpoint = makeCheckpoint({
      configOverrides: {
        rateLimits: {
          maxRequestsPerMinute: 60,
          costBudget: { daily: 100, alertThreshold: 0.8 },
        },
      },
    });
    const update: AgentCheckpointUpdate = {
      configOverrides: {
        rateLimits: {
          costBudget: { daily: 200 },
        },
      },
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides?.rateLimits?.costBudget?.daily).toBe(200);
    expect(result.configOverrides?.rateLimits?.costBudget?.alertThreshold).toBe(0.8);
  });

  it("updates updatedAt timestamp", () => {
    const checkpoint = makeCheckpoint();
    const update: AgentCheckpointUpdate = {
      lastProcessedPosition: 20,
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.updatedAt).toBe(Date.now());
  });

  it("increments eventsProcessed count", () => {
    const checkpoint = makeCheckpoint({ eventsProcessed: 10 });
    const update: AgentCheckpointUpdate = {
      incrementEventsProcessed: 5,
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.eventsProcessed).toBe(15);
  });

  it("preserves eventsProcessed when no increment provided", () => {
    const checkpoint = makeCheckpoint({ eventsProcessed: 10 });
    const update: AgentCheckpointUpdate = {
      status: "paused",
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.eventsProcessed).toBe(10);
  });

  it("does not add configOverrides key when neither existing nor update have them", () => {
    const checkpoint = makeCheckpoint(); // no configOverrides
    const update: AgentCheckpointUpdate = {
      lastProcessedPosition: 20,
    };

    const result = applyCheckpointUpdate(checkpoint, update);

    expect(result.configOverrides).toBeUndefined();
  });
});

// ============================================================================
// createInitialAgentCheckpoint
// ============================================================================

describe("createInitialAgentCheckpoint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a checkpoint with sentinel lastProcessedPosition of -1", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.lastProcessedPosition).toBe(-1);
  });

  it("creates a checkpoint with active status", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.status).toBe("active");
  });

  it("creates a checkpoint with zero events processed", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.eventsProcessed).toBe(0);
  });

  it("creates a checkpoint with empty lastEventId", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.lastEventId).toBe("");
  });

  it("sets updatedAt to current time", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.updatedAt).toBe(Date.now());
  });

  it("preserves agentId and subscriptionId", () => {
    const checkpoint = createInitialAgentCheckpoint("my-agent", "my-sub");
    expect(checkpoint.agentId).toBe("my-agent");
    expect(checkpoint.subscriptionId).toBe("my-sub");
  });

  it("does not include configOverrides", () => {
    const checkpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
    expect(checkpoint.configOverrides).toBeUndefined();
  });
});
