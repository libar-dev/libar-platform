/**
 * Agent Lifecycle Handlers Unit Tests
 *
 * Tests for all 5 lifecycle handlers and the createLifecycleHandlers factory:
 *
 * handleStartAgent:
 * - Happy path: stopped -> active, audit recorded with AgentStarted
 * - Invalid: active -> START rejected with INVALID_LIFECYCLE_TRANSITION
 * - Invalid: paused -> START rejected
 *
 * handlePauseAgent:
 * - Happy path: active -> paused, audit recorded with AgentPaused + reason
 * - Invalid: stopped -> PAUSE rejected
 *
 * handleResumeAgent:
 * - Happy path: paused -> active, audit recorded with AgentResumed + resumeFromPosition
 * - Invalid: stopped -> RESUME rejected
 *
 * handleStopAgent:
 * - Happy path: active -> stopped, audit recorded with AgentStopped
 * - Happy path: paused -> stopped (universal escape hatch)
 * - Happy path: error_recovery -> stopped
 * - Invalid: stopped -> STOP rejected (already stopped)
 *
 * handleReconfigureAgent:
 * - Happy path: active -> active, configOverrides patched, audit with AgentReconfigured
 * - Happy path: paused -> active, configOverrides patched
 * - Invalid: stopped -> RECONFIGURE rejected
 *
 * createLifecycleHandlers:
 * - Factory returns all 5 handler functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleStartAgent,
  handlePauseAgent,
  handleResumeAgent,
  handleStopAgent,
  handleReconfigureAgent,
  createLifecycleHandlers,
  type LifecycleHandlerConfig,
} from "../../../src/agent/lifecycle-handlers.js";
import type { AgentComponentAPI } from "../../../src/agent/handler-types.js";
import { AGENT_LIFECYCLE_ERROR_CODES } from "../../../src/agent/lifecycle-commands.js";
import { createMockLogger, createMockComponent } from "./_test-utils.js";

/**
 * Create a mock mutation context that routes by ref string and returns
 * a checkpoint with the given status and optional overrides.
 */
function createMockCtx(
  component: AgentComponentAPI,
  checkpointStatus: string,
  options?: {
    lastProcessedPosition?: number;
    eventsProcessed?: number;
    configOverrides?: unknown;
  }
) {
  const mockRunMutation = vi.fn().mockImplementation(async (ref: unknown) => {
    if (ref === component.checkpoints.loadOrCreate) {
      return {
        checkpoint: {
          status: checkpointStatus,
          lastProcessedPosition: options?.lastProcessedPosition ?? 10,
          lastEventId: "evt_last",
          eventsProcessed: options?.eventsProcessed ?? 5,
          configOverrides: options?.configOverrides,
        },
      };
    }
    return {};
  });

  return { runMutation: mockRunMutation };
}

// ============================================================================
// handleStartAgent Tests
// ============================================================================

describe("handleStartAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions stopped -> active and records AgentStarted audit", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped", { lastProcessedPosition: 25 });
    const logger = createMockLogger();

    const handler = handleStartAgent({ agentComponent: component, logger });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_001",
    });

    // Success result
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.agentId).toBe("test-agent");
      expect(result.previousState).toBe("stopped");
      expect(result.newState).toBe("active");
    }

    // Atomic transitionLifecycle called with active status + AgentStarted audit
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "active",
      auditEvent: {
        eventType: "AgentStarted",
        payload: {
          previousState: "stopped",
          correlationId: "corr_001",
          resumeFromPosition: 26, // lastProcessedPosition + 1
        },
      },
    });

    // Logger called
    expect(logger.info).toHaveBeenCalledWith(
      "Agent started",
      expect.objectContaining({
        agentId: "test-agent",
        previousState: "stopped",
        newState: "active",
      })
    );
  });

  it("rejects START from active state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active");

    const handler = handleStartAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_002",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.message).toContain("START");
      expect(result.message).toContain("active");
      expect(result.currentState).toBe("active");
    }

    // No transitionLifecycle should be called
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeUndefined();
  });

  it("rejects START from paused state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "paused");

    const handler = handleStartAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_003",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.currentState).toBe("paused");
    }
  });
});

// ============================================================================
// handlePauseAgent Tests
// ============================================================================

describe("handlePauseAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions active -> paused and records AgentPaused audit with reason", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active", {
      lastProcessedPosition: 50,
      eventsProcessed: 20,
    });
    const logger = createMockLogger();

    const handler = handlePauseAgent({ agentComponent: component, logger });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_010",
      reason: "Maintenance window",
    });

    // Success result
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("active");
      expect(result.newState).toBe("paused");
    }

    // Atomic transitionLifecycle called with paused status + AgentPaused audit
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "paused",
      auditEvent: {
        eventType: "AgentPaused",
        payload: {
          reason: "Maintenance window",
          correlationId: "corr_010",
          pausedAtPosition: 50,
          eventsProcessedAtPause: 20,
        },
      },
    });
  });

  it("rejects PAUSE from stopped state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped");

    const handler = handlePauseAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_011",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.message).toContain("PAUSE");
      expect(result.message).toContain("stopped");
      expect(result.currentState).toBe("stopped");
    }
  });
});

// ============================================================================
// handleResumeAgent Tests
// ============================================================================

describe("handleResumeAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions paused -> active and records AgentResumed audit with resumeFromPosition", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "paused", { lastProcessedPosition: 75 });
    const logger = createMockLogger();

    const handler = handleResumeAgent({ agentComponent: component, logger });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_020",
    });

    // Success result
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("paused");
      expect(result.newState).toBe("active");
    }

    // Atomic transitionLifecycle called with active status + AgentResumed audit
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "active",
      auditEvent: {
        eventType: "AgentResumed",
        payload: {
          resumeFromPosition: 76, // lastProcessedPosition + 1
          correlationId: "corr_020",
        },
      },
    });
  });

  it("rejects RESUME from stopped state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped");

    const handler = handleResumeAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_021",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.message).toContain("RESUME");
      expect(result.message).toContain("stopped");
      expect(result.currentState).toBe("stopped");
    }
  });
});

// ============================================================================
// handleStopAgent Tests
// ============================================================================

describe("handleStopAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions active -> stopped and records AgentStopped audit", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active", { lastProcessedPosition: 100 });
    const logger = createMockLogger();

    const handler = handleStopAgent({ agentComponent: component, logger });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_030",
      reason: "Decommissioning",
    });

    // Success result
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("active");
      expect(result.newState).toBe("stopped");
    }

    // Atomic transitionLifecycle called with stopped status + AgentStopped audit
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "stopped",
      auditEvent: {
        eventType: "AgentStopped",
        payload: {
          previousState: "active",
          reason: "Decommissioning",
          correlationId: "corr_030",
          stoppedAtPosition: 100,
        },
      },
    });
  });

  it("transitions paused -> stopped (universal escape hatch)", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "paused", { lastProcessedPosition: 60 });

    const handler = handleStopAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_031",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("paused");
      expect(result.newState).toBe("stopped");
    }

    // transitionLifecycle captures paused -> stopped
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      status: "stopped",
      auditEvent: {
        eventType: "AgentStopped",
        payload: {
          previousState: "paused",
          stoppedAtPosition: 60,
        },
      },
    });
  });

  it("transitions error_recovery -> stopped", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "error_recovery", { lastProcessedPosition: 88 });

    const handler = handleStopAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_032",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("error_recovery");
      expect(result.newState).toBe("stopped");
    }
  });

  it("rejects STOP from already stopped state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped");

    const handler = handleStopAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_033",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.message).toContain("STOP");
      expect(result.message).toContain("stopped");
      expect(result.currentState).toBe("stopped");
    }
  });
});

// ============================================================================
// handleReconfigureAgent Tests
// ============================================================================

describe("handleReconfigureAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconfigures active agent (active -> active) with merged overrides", async () => {
    const existingOverrides = {
      confidenceThreshold: 0.8,
      patternWindowDuration: "30d",
    };
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active", {
      configOverrides: existingOverrides,
    });
    const logger = createMockLogger();

    const handler = handleReconfigureAgent({ agentComponent: component, logger });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_040",
      configOverrides: {
        confidenceThreshold: 0.9,
      },
    });

    // Success result
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("active");
      expect(result.newState).toBe("active");
    }

    // patchConfigOverrides called with merged overrides
    const patchCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.patchConfigOverrides
    );
    expect(patchCall).toBeDefined();
    expect(patchCall![1]).toMatchObject({
      agentId: "test-agent",
      configOverrides: {
        confidenceThreshold: 0.9, // overridden
        patternWindowDuration: "30d", // preserved from existing
      },
    });

    // Atomic transitionLifecycle called with active status + AgentReconfigured audit
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "active",
      auditEvent: {
        eventType: "AgentReconfigured",
        payload: {
          previousState: "active",
          previousOverrides: existingOverrides,
          newOverrides: { confidenceThreshold: 0.9 },
          correlationId: "corr_040",
        },
      },
    });
  });

  it("reconfigures paused agent (paused -> active) with config overrides", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "paused");

    const handler = handleReconfigureAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_041",
      configOverrides: {
        patternWindowDuration: "7d",
        rateLimits: { maxRequestsPerMinute: 30 },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.previousState).toBe("paused");
      expect(result.newState).toBe("active");
    }

    // patchConfigOverrides called with new overrides
    const patchCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.patchConfigOverrides
    );
    expect(patchCall).toBeDefined();
    expect(patchCall![1]).toMatchObject({
      agentId: "test-agent",
      configOverrides: {
        patternWindowDuration: "7d",
        rateLimits: { maxRequestsPerMinute: 30 },
      },
    });

    // Atomic transitionLifecycle called with active status
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      agentId: "test-agent",
      status: "active",
    });
  });

  it("rejects RECONFIGURE from stopped state", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped");

    const handler = handleReconfigureAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_042",
      configOverrides: { confidenceThreshold: 0.7 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
      expect(result.message).toContain("RECONFIGURE");
      expect(result.message).toContain("stopped");
      expect(result.currentState).toBe("stopped");
    }
  });

  it("handles first-time config overrides when checkpoint has no existing overrides", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active", {
      configOverrides: undefined,
    });

    const handler = handleReconfigureAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_043",
      configOverrides: { confidenceThreshold: 0.85 },
    });

    expect(result.success).toBe(true);

    // patchConfigOverrides called with new overrides (no prior overrides to merge)
    const patchCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.patchConfigOverrides
    );
    expect(patchCall).toBeDefined();
    expect(patchCall![1]).toMatchObject({
      configOverrides: {
        confidenceThreshold: 0.85,
      },
    });

    // transitionLifecycle audit captures undefined previousOverrides
    const transitionCall = ctx.runMutation.mock.calls.find(
      (call: unknown[]) => call[0] === component.checkpoints.transitionLifecycle
    );
    expect(transitionCall).toBeDefined();
    expect(transitionCall![1]).toMatchObject({
      auditEvent: {
        payload: {
          previousOverrides: undefined,
          newOverrides: { confidenceThreshold: 0.85 },
        },
      },
    });
  });
});

// ============================================================================
// createLifecycleHandlers Factory Tests
// ============================================================================

describe("createLifecycleHandlers", () => {
  it("returns all 5 handler functions", () => {
    const component = createMockComponent();
    const config: LifecycleHandlerConfig = { agentComponent: component };

    const handlers = createLifecycleHandlers(config);

    expect(typeof handlers.handleStartAgent).toBe("function");
    expect(typeof handlers.handlePauseAgent).toBe("function");
    expect(typeof handlers.handleResumeAgent).toBe("function");
    expect(typeof handlers.handleStopAgent).toBe("function");
    expect(typeof handlers.handleReconfigureAgent).toBe("function");
  });

  it("factory handlers work correctly (start -> pause -> stop round trip)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));

    const component = createMockComponent();
    const config: LifecycleHandlerConfig = { agentComponent: component };
    const handlers = createLifecycleHandlers(config);

    // Start from stopped
    const startCtx = createMockCtx(component, "stopped");
    const startResult = await handlers.handleStartAgent(startCtx, {
      agentId: "round-trip-agent",
      correlationId: "corr_100",
    });
    expect(startResult.success).toBe(true);

    // Pause from active
    const pauseCtx = createMockCtx(component, "active");
    const pauseResult = await handlers.handlePauseAgent(pauseCtx, {
      agentId: "round-trip-agent",
      correlationId: "corr_101",
      reason: "Maintenance",
    });
    expect(pauseResult.success).toBe(true);

    // Stop from paused
    const stopCtx = createMockCtx(component, "paused");
    const stopResult = await handlers.handleStopAgent(stopCtx, {
      agentId: "round-trip-agent",
      correlationId: "corr_102",
    });
    expect(stopResult.success).toBe(true);

    vi.useRealTimers();
  });
});

// ============================================================================
// Logger Behavior Tests
// ============================================================================

describe("lifecycle handlers - logger behavior", () => {
  it("uses no-op logger when none provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));

    const component = createMockComponent();
    const ctx = createMockCtx(component, "stopped");

    // No logger in config -- should not throw
    const handler = handleStartAgent({ agentComponent: component });
    const result = await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_200",
    });

    expect(result.success).toBe(true);
    vi.useRealTimers();
  });

  it("logs warning on invalid transition", async () => {
    const component = createMockComponent();
    const ctx = createMockCtx(component, "active");
    const logger = createMockLogger();

    const handler = handleStartAgent({ agentComponent: component, logger });
    await handler(ctx, {
      agentId: "test-agent",
      correlationId: "corr_201",
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Invalid lifecycle transition",
      expect.objectContaining({
        agentId: "test-agent",
        command: "StartAgent",
        currentState: "active",
      })
    );
  });
});
