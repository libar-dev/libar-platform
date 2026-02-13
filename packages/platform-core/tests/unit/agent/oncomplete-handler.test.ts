/**
 * Agent onComplete Handler Unit Tests
 *
 * Tests for createAgentOnCompleteHandler() including:
 * - Canceled result handling (no-op)
 * - Failed result handling (dead letter + audit, no checkpoint)
 * - Success with null returnValue (skipped event)
 * - Success with decision (audit, command, approval, checkpoint)
 * - Success without command (skip command + approval recording)
 * - Idempotency (checkpoint position already advanced)
 * - NO-THROW behavior (catch-all with dead letter fallback)
 * - NO-THROW when dead letter also fails
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgentOnCompleteHandler,
  type AgentOnCompleteArgs,
  type AgentWorkpoolContext,
  type AgentComponentAPI,
} from "../../../src/agent/oncomplete-handler.js";
import type { AgentActionResult } from "../../../src/agent/action-handler.js";
import { createMockLogger } from "./_test-utils.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestContext(overrides: Partial<AgentWorkpoolContext> = {}): AgentWorkpoolContext {
  return {
    agentId: "test-agent",
    subscriptionId: "sub_test-agent",
    eventId: "evt_123",
    eventType: "OrderCancelled",
    globalPosition: 42,
    correlationId: "corr_123",
    causationId: "evt_123",
    streamId: "order_456",
    streamType: "Order",
    boundedContext: "orders",
    ...overrides,
  };
}

function createTestArgs(overrides?: Partial<AgentOnCompleteArgs>): AgentOnCompleteArgs {
  return {
    workId: "work_123",
    context: createTestContext(),
    result: { kind: "success", returnValue: null },
    ...overrides,
  };
}

function createMockComponent(): AgentComponentAPI {
  return {
    checkpoints: {
      loadOrCreate:
        "mock_loadOrCreate" as unknown as AgentComponentAPI["checkpoints"]["loadOrCreate"],
      update: "mock_update" as unknown as AgentComponentAPI["checkpoints"]["update"],
    },
    audit: {
      record: "mock_audit_record" as unknown as AgentComponentAPI["audit"]["record"],
    },
    commands: {
      record: "mock_commands_record" as unknown as AgentComponentAPI["commands"]["record"],
    },
    approvals: {
      create: "mock_approvals_create" as unknown as AgentComponentAPI["approvals"]["create"],
    },
    deadLetters: {
      record: "mock_deadLetters_record" as unknown as AgentComponentAPI["deadLetters"]["record"],
    },
  };
}

function createTestActionResult(overrides: Partial<AgentActionResult> = {}): AgentActionResult {
  return {
    decisionId: "dec_test-agent_42",
    decision: {
      command: "SuggestOutreach",
      payload: { customerId: "cust-123" },
      confidence: 0.95,
      reason: "Churn risk detected",
      requiresApproval: false,
      triggeringEvents: ["evt_1", "evt_2"],
    },
    analysisMethod: "rule-based",
    ...overrides,
  };
}

// ============================================================================
// Canceled Result Tests
// ============================================================================

describe("createAgentOnCompleteHandler - canceled result", () => {
  it("returns immediately without calling any mutations", async () => {
    const mockRunMutation = vi.fn();
    const mockCtx = { runMutation: mockRunMutation };
    const mockComponent = createMockComponent();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const args = createTestArgs({
      result: { kind: "canceled" },
    });

    await handler(mockCtx, args);

    expect(mockRunMutation).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Failed Result Tests
// ============================================================================

describe("createAgentOnCompleteHandler - failed result", () => {
  it("records dead letter and audit event, does NOT advance checkpoint", async () => {
    const mockComponent = createMockComponent();
    const mockRunMutation = vi.fn().mockResolvedValue({});
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const args = createTestArgs({
      result: { kind: "failed", error: "LLM timeout after 30s" },
    });

    await handler(mockCtx, args);

    // Dead letter should be recorded
    const deadLetterCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.deadLetters.record
    );
    expect(deadLetterCall).toBeDefined();
    expect(deadLetterCall![1]).toMatchObject({
      agentId: "test-agent",
      subscriptionId: "sub_test-agent",
      eventId: "evt_123",
      globalPosition: 42,
      error: "LLM timeout after 30s",
    });

    // Audit should be recorded with AgentAnalysisFailed
    const auditCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.audit.record
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toMatchObject({
      eventType: "AgentAnalysisFailed",
      agentId: "test-agent",
    });

    // Checkpoint should NOT be updated
    const checkpointCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.checkpoints.update
    );
    expect(checkpointCall).toBeUndefined();

    // loadOrCreate should NOT be called either
    const loadOrCreateCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.checkpoints.loadOrCreate
    );
    expect(loadOrCreateCall).toBeUndefined();
  });
});

// ============================================================================
// Success with Null ReturnValue Tests
// ============================================================================

describe("createAgentOnCompleteHandler - success with null returnValue", () => {
  it("returns immediately when returnValue is null (skipped event)", async () => {
    const mockRunMutation = vi.fn();
    const mockCtx = { runMutation: mockRunMutation };
    const mockComponent = createMockComponent();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: null },
    });

    await handler(mockCtx, args);

    expect(mockRunMutation).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Success with Decision Tests
// ============================================================================

describe("createAgentOnCompleteHandler - success with decision", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists audit, command, approval, and checkpoint in correct order", async () => {
    const mockComponent = createMockComponent();
    const callOrder: string[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        callOrder.push("loadOrCreate");
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      if (ref === mockComponent.audit.record) {
        callOrder.push("audit");
        return {};
      }
      if (ref === mockComponent.commands.record) {
        callOrder.push("commands");
        return {};
      }
      if (ref === mockComponent.approvals.create) {
        callOrder.push("approvals");
        return {};
      }
      if (ref === mockComponent.checkpoints.update) {
        callOrder.push("checkpoint_update");
        return {};
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: "SuggestOutreach",
        payload: { customerId: "cust-123" },
        confidence: 0.95,
        reason: "Churn risk detected",
        requiresApproval: true,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    // Verify persistence order: loadOrCreate -> audit -> commands -> approvals -> checkpoint_update
    expect(callOrder).toEqual([
      "loadOrCreate",
      "audit",
      "commands",
      "approvals",
      "checkpoint_update",
    ]);
  });

  it("skips command and approval recording when decision has no command", async () => {
    const mockComponent = createMockComponent();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: null,
        payload: null,
        confidence: 0.0,
        reason: "No pattern detected",
        requiresApproval: false,
        triggeringEvents: [],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    // Audit IS called for the decision
    expect(calledRefs).toContain(mockComponent.audit.record);
    // Commands and approvals should NOT be called
    expect(calledRefs).not.toContain(mockComponent.commands.record);
    expect(calledRefs).not.toContain(mockComponent.approvals.create);
    // Checkpoint update IS called
    expect(calledRefs).toContain(mockComponent.checkpoints.update);
  });

  it("updates checkpoint with correct args", async () => {
    const mockComponent = createMockComponent();
    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult();
    const args = createTestArgs({
      context: createTestContext({
        agentId: "my-agent",
        subscriptionId: "sub_my-agent",
        eventId: "evt_999",
        globalPosition: 150,
      }),
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    const checkpointUpdateCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.checkpoints.update
    );
    expect(checkpointUpdateCall).toBeDefined();
    expect(checkpointUpdateCall![1]).toMatchObject({
      agentId: "my-agent",
      subscriptionId: "sub_my-agent",
      lastProcessedPosition: 150,
      lastEventId: "evt_999",
      incrementEventsProcessed: true,
    });
  });

  it("uses default 24h timeout for approval expiresAt when no approvalTimeoutMs configured", async () => {
    const mockComponent = createMockComponent();
    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: "SuggestOutreach",
        payload: { customerId: "cust-123" },
        confidence: 0.85,
        reason: "Churn risk detected",
        requiresApproval: true,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    const approvalCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.approvals.create
    );
    expect(approvalCall).toBeDefined();
    // Default: Date.now() (fake: 2024-01-15T12:00:00Z = 1705320000000) + 24h (86400000)
    expect(approvalCall![1].expiresAt).toBe(Date.now() + 24 * 60 * 60 * 1000);
  });

  it("records command but NOT approval when requiresApproval is false", async () => {
    const mockComponent = createMockComponent();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: "SuggestOutreach",
        payload: { customerId: "cust-123" },
        confidence: 0.9,
        reason: "Pattern detected",
        requiresApproval: false,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    // Command IS recorded
    expect(calledRefs).toContain(mockComponent.commands.record);
    // Approval is NOT created
    expect(calledRefs).not.toContain(mockComponent.approvals.create);
  });

  it("does NOT create approval when requiresApproval is true but command is null (M3 guard)", async () => {
    const mockComponent = createMockComponent();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: null,
        payload: null,
        confidence: 0.5,
        reason: "Ambiguous signal",
        requiresApproval: true,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    // Approvals should NOT be created (M3 guard: requiresApproval && command)
    expect(calledRefs).not.toContain(mockComponent.approvals.create);
    // Commands should NOT be recorded (no command)
    expect(calledRefs).not.toContain(mockComponent.commands.record);
    // Checkpoint IS updated
    expect(calledRefs).toContain(mockComponent.checkpoints.update);
  });

  it("uses custom approvalTimeoutMs for approval expiresAt when configured", async () => {
    const mockComponent = createMockComponent();
    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };
    const oneHourMs = 60 * 60 * 1000;

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
      approvalTimeoutMs: oneHourMs,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: "SuggestOutreach",
        payload: { customerId: "cust-123" },
        confidence: 0.85,
        reason: "Churn risk detected",
        requiresApproval: true,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    const approvalCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.approvals.create
    );
    expect(approvalCall).toBeDefined();
    // Custom: Date.now() + 1 hour
    expect(approvalCall![1].expiresAt).toBe(Date.now() + oneHourMs);
  });
});

// ============================================================================
// Idempotency Tests
// ============================================================================

describe("createAgentOnCompleteHandler - idempotency", () => {
  it("skips when checkpoint position >= event position", async () => {
    const mockComponent = createMockComponent();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        // Checkpoint already at position 42, event is also at 42
        return { checkpoint: { lastProcessedPosition: 42 } };
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
    });

    const actionResult = createTestActionResult();
    const args = createTestArgs({
      context: createTestContext({ globalPosition: 42 }),
      result: { kind: "success", returnValue: actionResult },
    });

    await handler(mockCtx, args);

    // Only loadOrCreate should be called
    expect(calledRefs).toContain(mockComponent.checkpoints.loadOrCreate);
    // Checkpoint update should NOT be called
    expect(calledRefs).not.toContain(mockComponent.checkpoints.update);
    // No audit, command, or approval recording
    expect(calledRefs).not.toContain(mockComponent.audit.record);
    expect(calledRefs).not.toContain(mockComponent.commands.record);
    expect(calledRefs).not.toContain(mockComponent.approvals.create);
  });
});

// ============================================================================
// NO-THROW Behavior Tests
// ============================================================================

describe("createAgentOnCompleteHandler - NO-THROW zone", () => {
  it("catches errors and creates dead letter instead of throwing", async () => {
    const mockComponent = createMockComponent();

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        throw new Error("Database connection lost");
      }
      // Dead letter recording should succeed
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };
    const logger = createMockLogger();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
      logger,
    });

    const actionResult = createTestActionResult();
    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    // Should NOT throw
    await expect(handler(mockCtx, args)).resolves.toBeUndefined();

    // Dead letter should be recorded as fallback
    const deadLetterCall = mockRunMutation.mock.calls.find(
      (call) => call[0] === mockComponent.deadLetters.record
    );
    expect(deadLetterCall).toBeDefined();
    expect(deadLetterCall![1]).toMatchObject({
      agentId: "test-agent",
      eventId: "evt_123",
      error: "Database connection lost",
    });

    // Error should be logged
    expect(logger.error).toHaveBeenCalledWith(
      "Unexpected error in agent onComplete",
      expect.objectContaining({
        agentId: "test-agent",
        error: "Database connection lost",
      })
    );
  });

  it("continues to record commands and checkpoint when audit throws", async () => {
    const mockComponent = createMockComponent();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        return { checkpoint: { lastProcessedPosition: 0 } };
      }
      if (ref === mockComponent.audit.record) {
        throw new Error("Audit store unavailable");
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };
    const logger = createMockLogger();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
      logger,
    });

    const actionResult = createTestActionResult({
      decision: {
        command: "SuggestOutreach",
        payload: { customerId: "cust-123" },
        confidence: 0.9,
        reason: "Churn risk",
        requiresApproval: false,
        triggeringEvents: ["evt_1"],
      },
    });

    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    // Should NOT throw (NO-THROW zone)
    await expect(handler(mockCtx, args)).resolves.toBeUndefined();

    // Audit was attempted (and failed)
    expect(calledRefs).toContain(mockComponent.audit.record);
    // Commands and checkpoint should still have been called
    expect(calledRefs).toContain(mockComponent.commands.record);
    expect(calledRefs).toContain(mockComponent.checkpoints.update);
    // Error should be logged
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to record audit in onComplete",
      expect.objectContaining({
        agentId: "test-agent",
        error: "Audit store unavailable",
      })
    );
  });

  it("does not throw even when dead letter recording also fails", async () => {
    const mockComponent = createMockComponent();

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.checkpoints.loadOrCreate) {
        throw new Error("Primary failure");
      }
      if (ref === mockComponent.deadLetters.record) {
        throw new Error("Dead letter also failed");
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };
    const logger = createMockLogger();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
      logger,
    });

    const actionResult = createTestActionResult();
    const args = createTestArgs({
      result: { kind: "success", returnValue: actionResult },
    });

    // Should STILL not throw
    await expect(handler(mockCtx, args)).resolves.toBeUndefined();

    // Both errors should be logged
    expect(logger.error).toHaveBeenCalledWith(
      "Unexpected error in agent onComplete",
      expect.any(Object)
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to record dead letter in catch-all",
      expect.objectContaining({
        agentId: "test-agent",
        eventId: "evt_123",
      })
    );
  });

  it("does not throw when failed result dead letter recording fails", async () => {
    const mockComponent = createMockComponent();

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === mockComponent.deadLetters.record) {
        throw new Error("Dead letter store unavailable");
      }
      return {};
    });

    const mockCtx = { runMutation: mockRunMutation };
    const logger = createMockLogger();

    const handler = createAgentOnCompleteHandler({
      agentComponent: mockComponent,
      logger,
    });

    const args = createTestArgs({
      result: { kind: "failed", error: "Action failed" },
    });

    // Should NOT throw
    await expect(handler(mockCtx, args)).resolves.toBeUndefined();

    // Error logged for dead letter failure
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to record dead letter for action failure",
      expect.objectContaining({
        agentId: "test-agent",
        error: "Dead letter store unavailable",
      })
    );
  });
});
