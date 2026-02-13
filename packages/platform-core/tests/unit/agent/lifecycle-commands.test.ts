/**
 * Lifecycle Commands Unit Tests
 *
 * Tests for agent lifecycle command types, error codes, result types,
 * and Convex validator exports including:
 * - Command type construction with discriminated unions
 * - AGENT_LIFECYCLE_ERROR_CODES constants
 * - Success and failure result type construction
 * - Convex validators exist and are defined
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_LIFECYCLE_ERROR_CODES,
  lifecycleStateValidator,
  costBudgetOverridesValidator,
  rateLimitOverridesValidator,
  configOverridesValidator,
  startAgentArgsValidator,
  pauseAgentArgsValidator,
  resumeAgentArgsValidator,
  stopAgentArgsValidator,
  reconfigureAgentArgsValidator,
  type StartAgentCommand,
  type PauseAgentCommand,
  type ResumeAgentCommand,
  type StopAgentCommand,
  type ReconfigureAgentCommand,
  type AgentLifecycleCommand,
  type AgentLifecycleSuccess,
  type AgentLifecycleFailure,
  type AgentLifecycleResult,
  type AgentConfigOverrides,
} from "../../../src/agent/lifecycle-commands.js";

// ============================================================================
// Command Type Construction
// ============================================================================

describe("command type construction", () => {
  it("constructs a StartAgentCommand", () => {
    const cmd: StartAgentCommand = {
      type: "StartAgent",
      commandId: "cmd-001",
      agentId: "agent-001",
      correlationId: "corr-001",
    };

    expect(cmd.type).toBe("StartAgent");
    expect(cmd.commandId).toBe("cmd-001");
    expect(cmd.agentId).toBe("agent-001");
    expect(cmd.correlationId).toBe("corr-001");
  });

  it("constructs a PauseAgentCommand with optional reason", () => {
    const cmd: PauseAgentCommand = {
      type: "PauseAgent",
      commandId: "cmd-002",
      agentId: "agent-001",
      correlationId: "corr-002",
      reason: "maintenance window",
    };

    expect(cmd.type).toBe("PauseAgent");
    expect(cmd.reason).toBe("maintenance window");
  });

  it("constructs a PauseAgentCommand without reason", () => {
    const cmd: PauseAgentCommand = {
      type: "PauseAgent",
      commandId: "cmd-003",
      agentId: "agent-001",
      correlationId: "corr-003",
    };

    expect(cmd.reason).toBeUndefined();
  });

  it("constructs a ResumeAgentCommand", () => {
    const cmd: ResumeAgentCommand = {
      type: "ResumeAgent",
      commandId: "cmd-004",
      agentId: "agent-001",
      correlationId: "corr-004",
    };

    expect(cmd.type).toBe("ResumeAgent");
  });

  it("constructs a StopAgentCommand with optional reason", () => {
    const cmd: StopAgentCommand = {
      type: "StopAgent",
      commandId: "cmd-005",
      agentId: "agent-001",
      correlationId: "corr-005",
      reason: "budget exceeded",
    };

    expect(cmd.type).toBe("StopAgent");
    expect(cmd.reason).toBe("budget exceeded");
  });

  it("constructs a ReconfigureAgentCommand with configOverrides", () => {
    const overrides: AgentConfigOverrides = {
      confidenceThreshold: 0.95,
      patternWindowDuration: "14d",
      rateLimits: {
        maxRequestsPerMinute: 30,
        costBudget: {
          daily: 50,
          alertThreshold: 0.9,
        },
      },
    };

    const cmd: ReconfigureAgentCommand = {
      type: "ReconfigureAgent",
      commandId: "cmd-006",
      agentId: "agent-001",
      correlationId: "corr-006",
      configOverrides: overrides,
    };

    expect(cmd.type).toBe("ReconfigureAgent");
    expect(cmd.configOverrides.confidenceThreshold).toBe(0.95);
    expect(cmd.configOverrides.rateLimits?.maxRequestsPerMinute).toBe(30);
    expect(cmd.configOverrides.rateLimits?.costBudget?.daily).toBe(50);
  });

  it("discriminated union narrows by type field", () => {
    const cmd: AgentLifecycleCommand = {
      type: "PauseAgent",
      commandId: "cmd-007",
      agentId: "agent-001",
      correlationId: "corr-007",
      reason: "test",
    };

    // This verifies the discriminated union works at runtime
    if (cmd.type === "PauseAgent") {
      expect(cmd.reason).toBe("test");
    }
    if (cmd.type === "ReconfigureAgent") {
      // This branch should not execute
      expect.unreachable("Should not reach ReconfigureAgent branch");
    }
  });
});

// ============================================================================
// AgentConfigOverrides
// ============================================================================

describe("AgentConfigOverrides", () => {
  it("allows all fields to be optional", () => {
    const empty: AgentConfigOverrides = {};
    expect(empty.confidenceThreshold).toBeUndefined();
    expect(empty.patternWindowDuration).toBeUndefined();
    expect(empty.rateLimits).toBeUndefined();
  });

  it("allows partial rateLimits", () => {
    const overrides: AgentConfigOverrides = {
      rateLimits: {
        maxRequestsPerMinute: 10,
      },
    };
    expect(overrides.rateLimits?.maxRequestsPerMinute).toBe(10);
    expect(overrides.rateLimits?.maxConcurrent).toBeUndefined();
    expect(overrides.rateLimits?.costBudget).toBeUndefined();
  });

  it("allows nested costBudget overrides", () => {
    const overrides: AgentConfigOverrides = {
      rateLimits: {
        costBudget: {
          daily: 25,
        },
      },
    };
    expect(overrides.rateLimits?.costBudget?.daily).toBe(25);
    expect(overrides.rateLimits?.costBudget?.alertThreshold).toBeUndefined();
  });
});

// ============================================================================
// Error Codes
// ============================================================================

describe("AGENT_LIFECYCLE_ERROR_CODES", () => {
  it("has INVALID_LIFECYCLE_TRANSITION code", () => {
    expect(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION).toBe(
      "INVALID_LIFECYCLE_TRANSITION"
    );
  });

  it("has AGENT_NOT_FOUND code", () => {
    expect(AGENT_LIFECYCLE_ERROR_CODES.AGENT_NOT_FOUND).toBe("AGENT_NOT_FOUND");
  });

  it("has exactly 2 error codes", () => {
    expect(Object.keys(AGENT_LIFECYCLE_ERROR_CODES)).toHaveLength(2);
  });
});

// ============================================================================
// Result Types
// ============================================================================

describe("result types", () => {
  it("constructs a success result", () => {
    const result: AgentLifecycleSuccess = {
      success: true,
      agentId: "agent-001",
      previousState: "stopped",
      newState: "active",
    };

    expect(result.success).toBe(true);
    expect(result.agentId).toBe("agent-001");
    expect(result.previousState).toBe("stopped");
    expect(result.newState).toBe("active");
  });

  it("constructs a failure result with error code", () => {
    const result: AgentLifecycleFailure = {
      success: false,
      agentId: "agent-001",
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: "Cannot PAUSE from stopped state",
      currentState: "stopped",
    };

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_LIFECYCLE_TRANSITION");
    expect(result.message).toContain("PAUSE");
    expect(result.currentState).toBe("stopped");
  });

  it("constructs a failure result without currentState (agent not found)", () => {
    const result: AgentLifecycleFailure = {
      success: false,
      agentId: "nonexistent",
      code: "AGENT_NOT_FOUND",
      message: "Agent not found",
    };

    expect(result.currentState).toBeUndefined();
  });

  it("discriminated union narrows on success field", () => {
    const result: AgentLifecycleResult = {
      success: true,
      agentId: "agent-001",
      previousState: "active",
      newState: "paused",
    };

    if (result.success) {
      expect(result.previousState).toBe("active");
      expect(result.newState).toBe("paused");
    } else {
      expect.unreachable("Should not reach failure branch");
    }
  });

  it("discriminated union narrows to failure branch", () => {
    const result: AgentLifecycleResult = {
      success: false,
      agentId: "agent-001",
      code: "AGENT_NOT_FOUND",
      message: "Agent not found",
    };

    if (!result.success) {
      expect(result.code).toBe("AGENT_NOT_FOUND");
    } else {
      expect.unreachable("Should not reach success branch");
    }
  });
});

// ============================================================================
// Convex Validators (existence and shape checks)
// ============================================================================

describe("Convex validators", () => {
  it("exports lifecycleStateValidator", () => {
    expect(lifecycleStateValidator).toBeDefined();
  });

  it("exports costBudgetOverridesValidator", () => {
    expect(costBudgetOverridesValidator).toBeDefined();
  });

  it("exports rateLimitOverridesValidator", () => {
    expect(rateLimitOverridesValidator).toBeDefined();
  });

  it("exports configOverridesValidator", () => {
    expect(configOverridesValidator).toBeDefined();
  });

  it("exports startAgentArgsValidator", () => {
    expect(startAgentArgsValidator).toBeDefined();
  });

  it("exports pauseAgentArgsValidator", () => {
    expect(pauseAgentArgsValidator).toBeDefined();
  });

  it("exports resumeAgentArgsValidator", () => {
    expect(resumeAgentArgsValidator).toBeDefined();
  });

  it("exports stopAgentArgsValidator", () => {
    expect(stopAgentArgsValidator).toBeDefined();
  });

  it("exports reconfigureAgentArgsValidator", () => {
    expect(reconfigureAgentArgsValidator).toBeDefined();
  });
});
