/**
 * Agent Command Bridge Unit Tests
 *
 * Tests for createCommandBridgeHandler():
 * - Happy path: route found, registry has command, orchestrator executes
 * - Unknown route: command type not in route map
 * - Command not in registry: route exists but registry.has() returns false
 * - Transform failure: toOrchestratorArgs throws
 * - Orchestrator failure: orchestrator.execute() throws
 * - NO-THROW: audit failure does not propagate
 * - NO-THROW: status update failure does not propagate
 * - Optional updateStatus: handler skips status update when undefined
 * - patternId propagation: appears in audit event payload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCommandBridgeHandler,
  type RouteAgentCommandArgs,
} from "../../../src/agent/command-bridge.js";
import type { AgentComponentAPI } from "../../../src/agent/handler-types.js";
import type { AgentCommandRouteMap } from "../../../src/agent/command-router.js";
import { COMMAND_ROUTING_ERROR_CODES } from "../../../src/agent/command-router.js";
import { createMockLogger, createMockComponent } from "./_test-utils.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockComponentWithoutUpdateStatus(): AgentComponentAPI {
  const base = createMockComponent();
  return {
    ...base,
    commands: {
      record: base.commands.record,
      // No updateStatus -- optional field
    },
  };
}

function createMockRegistry(registered: string[]) {
  return {
    has: (type: string) => registered.includes(type),
    getConfig: (type: string) => (registered.includes(type) ? { type } : undefined),
  };
}

function createMockOrchestrator(shouldThrow?: Error) {
  return {
    execute: vi.fn().mockImplementation(async () => {
      if (shouldThrow) throw shouldThrow;
      return { success: true };
    }),
  };
}

function createTestRoutes(): AgentCommandRouteMap {
  return {
    SuggestCustomerOutreach: {
      commandType: "SuggestCustomerOutreach",
      boundedContext: "agent",
      toOrchestratorArgs: (cmd, ctx) => ({
        customerId: "cust-123",
        agentId: ctx.agentId,
        correlationId: ctx.correlationId,
      }),
    },
  };
}

function createTestArgs(overrides?: Partial<RouteAgentCommandArgs>): RouteAgentCommandArgs {
  return {
    decisionId: "dec_test_42",
    commandType: "SuggestCustomerOutreach",
    agentId: "test-agent",
    correlationId: "corr_123",
    ...overrides,
  };
}

// ============================================================================
// Happy Path Tests
// ============================================================================

describe("createCommandBridgeHandler - happy path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes command through registry, orchestrator, records audit, and updates status", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    await handler(mockCtx, createTestArgs());

    // Orchestrator should have been called
    expect(orchestrator.execute).toHaveBeenCalledOnce();
    expect(orchestrator.execute).toHaveBeenCalledWith(
      mockCtx,
      { type: "SuggestCustomerOutreach" },
      { customerId: "cust-123", agentId: "test-agent", correlationId: "corr_123" }
    );

    // Audit event should be AgentCommandRouted
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRouted",
      agentId: "test-agent",
      decisionId: "dec_test_42",
      timestamp: Date.now(),
      payload: {
        commandType: "SuggestCustomerOutreach",
        boundedContext: "agent",
        correlationId: "corr_123",
      },
    });

    // Status should be updated to "completed"
    const statusCall = calledRefs.find((c) => c.ref === comp.commands.updateStatus);
    expect(statusCall).toBeDefined();
    expect(statusCall!.args).toMatchObject({
      decisionId: "dec_test_42",
      status: "completed",
    });
  });
});

// ============================================================================
// Unknown Route Tests
// ============================================================================

describe("createCommandBridgeHandler - unknown route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records AgentCommandRoutingFailed audit and sets status to failed", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    // Use a command type that does NOT exist in the route map
    await handler(mockCtx, createTestArgs({ commandType: "NonExistentCommand" }));

    // Orchestrator should NOT have been called
    expect(orchestrator.execute).not.toHaveBeenCalled();

    // Audit event should be AgentCommandRoutingFailed
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRoutingFailed",
      agentId: "test-agent",
      decisionId: "dec_test_42",
    });
    expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
      COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE
    );

    // Status should be updated to "failed"
    const statusCall = calledRefs.find((c) => c.ref === comp.commands.updateStatus);
    expect(statusCall).toBeDefined();
    expect(statusCall!.args).toMatchObject({
      decisionId: "dec_test_42",
      status: "failed",
    });
  });
});

// ============================================================================
// Command Not in Registry Tests
// ============================================================================

describe("createCommandBridgeHandler - command not in registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records COMMAND_NOT_REGISTERED error in audit when registry.has() returns false", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    // Registry does NOT contain the command type that the route points to
    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry([]), // empty registry
      commandOrchestrator: orchestrator,
    });

    await handler(mockCtx, createTestArgs());

    // Orchestrator should NOT have been called
    expect(orchestrator.execute).not.toHaveBeenCalled();

    // Audit should record COMMAND_NOT_REGISTERED
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRoutingFailed",
    });
    expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
      COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED
    );
    expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
      "not registered in CommandRegistry"
    );

    // Status should be "failed"
    const statusCall = calledRefs.find((c) => c.ref === comp.commands.updateStatus);
    expect(statusCall).toBeDefined();
    expect(statusCall!.args.status).toBe("failed");
  });
});

// ============================================================================
// Transform Failure Tests
// ============================================================================

describe("createCommandBridgeHandler - transform failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records INVALID_TRANSFORM error in audit when toOrchestratorArgs throws", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    // Route with a throwing transform
    const throwingRoutes: AgentCommandRouteMap = {
      SuggestCustomerOutreach: {
        commandType: "SuggestCustomerOutreach",
        boundedContext: "agent",
        toOrchestratorArgs: () => {
          throw new Error("Missing required field: customerId");
        },
      },
    };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: throwingRoutes,
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    await handler(mockCtx, createTestArgs());

    // Orchestrator should NOT have been called
    expect(orchestrator.execute).not.toHaveBeenCalled();

    // Audit should record INVALID_TRANSFORM
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRoutingFailed",
    });
    expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
      COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM
    );
    expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
      "Transform failed"
    );
    expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
      "Missing required field: customerId"
    );

    // Status should be "failed"
    const statusCall = calledRefs.find((c) => c.ref === comp.commands.updateStatus);
    expect(statusCall).toBeDefined();
    expect(statusCall!.args.status).toBe("failed");
  });
});

// ============================================================================
// Orchestrator Failure Tests
// ============================================================================

describe("createCommandBridgeHandler - orchestrator failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records AgentCommandRoutingFailed audit and sets status to failed on execute error", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator(new Error("Orchestrator timeout"));
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    await handler(mockCtx, createTestArgs());

    // Orchestrator WAS called (and threw)
    expect(orchestrator.execute).toHaveBeenCalledOnce();

    // Audit should record AgentCommandRoutingFailed with the error message
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRoutingFailed",
      agentId: "test-agent",
      decisionId: "dec_test_42",
    });
    expect((auditCall!.args.payload as Record<string, unknown>).error).toBe("Orchestrator timeout");

    // Status should be "failed"
    const statusCall = calledRefs.find((c) => c.ref === comp.commands.updateStatus);
    expect(statusCall).toBeDefined();
    expect(statusCall!.args).toMatchObject({
      decisionId: "dec_test_42",
      status: "failed",
      error: "Orchestrator timeout",
    });
  });
});

// ============================================================================
// NO-THROW: Audit Failure Tests
// ============================================================================

describe("createCommandBridgeHandler - NO-THROW: audit failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not throw when audit recording fails on success path", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const logger = createMockLogger();

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === comp.audit.record) {
        throw new Error("Audit store unavailable");
      }
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
      logger,
    });

    // Should NOT throw
    await expect(handler(mockCtx, createTestArgs())).resolves.toBeUndefined();

    // Orchestrator was called successfully
    expect(orchestrator.execute).toHaveBeenCalledOnce();

    // Error should be logged
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to record AgentCommandRouted audit",
      expect.objectContaining({
        agentId: "test-agent",
        error: "Audit store unavailable",
      })
    );
  });
});

// ============================================================================
// NO-THROW: Status Update Failure Tests
// ============================================================================

describe("createCommandBridgeHandler - NO-THROW: status update failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not throw when updateStatus mutation fails on success path", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      if (ref === comp.commands.updateStatus) {
        throw new Error("Status update failed");
      }
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    // Should NOT throw
    await expect(handler(mockCtx, createTestArgs())).resolves.toBeUndefined();

    // Orchestrator was called successfully
    expect(orchestrator.execute).toHaveBeenCalledOnce();

    // Audit should still have been recorded
    const auditCall = mockRunMutation.mock.calls.find((call) => call[0] === comp.audit.record);
    expect(auditCall).toBeDefined();
  });
});

// ============================================================================
// Optional updateStatus Tests
// ============================================================================

describe("createCommandBridgeHandler - optional updateStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips status update without error when commands.updateStatus is undefined", async () => {
    const comp = createMockComponentWithoutUpdateStatus();
    const orchestrator = createMockOrchestrator();
    const calledRefs: unknown[] = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref) => {
      calledRefs.push(ref);
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    // Should NOT throw
    await expect(handler(mockCtx, createTestArgs())).resolves.toBeUndefined();

    // Orchestrator was called
    expect(orchestrator.execute).toHaveBeenCalledOnce();

    // Audit was recorded
    expect(calledRefs).toContain(comp.audit.record);

    // updateStatus should NOT have been called (it is undefined)
    expect(calledRefs).not.toContain(undefined);
    // More specifically, only audit.record should be in the calls
    expect(mockRunMutation).toHaveBeenCalledTimes(1);
  });

  it("skips status update on routing failure when commands.updateStatus is undefined", async () => {
    const comp = createMockComponentWithoutUpdateStatus();
    const orchestrator = createMockOrchestrator();

    const mockRunMutation = vi.fn().mockImplementation(async () => ({}));
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    // Use unknown command type to trigger routing failure
    await expect(
      handler(mockCtx, createTestArgs({ commandType: "NonExistent" }))
    ).resolves.toBeUndefined();

    // Only the audit call should have happened (no status update)
    expect(mockRunMutation).toHaveBeenCalledTimes(1);
    expect(mockRunMutation.mock.calls[0][0]).toBe(comp.audit.record);
  });
});

// ============================================================================
// patternId Propagation Tests
// ============================================================================

describe("createCommandBridgeHandler - patternId propagation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes patternId in the audit event payload when present in args", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    await handler(mockCtx, createTestArgs({ patternId: "churn-risk-v2" }));

    // Audit event should include patternId in payload
    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    expect(auditCall!.args).toMatchObject({
      eventType: "AgentCommandRouted",
      payload: {
        commandType: "SuggestCustomerOutreach",
        boundedContext: "agent",
        correlationId: "corr_123",
        patternId: "churn-risk-v2",
      },
    });
  });

  it("does not include patternId in audit payload when absent from args", async () => {
    const comp = createMockComponent();
    const orchestrator = createMockOrchestrator();
    const calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }> = [];

    const mockRunMutation = vi.fn().mockImplementation(async (ref, args) => {
      calledRefs.push({ ref, args });
      return {};
    });
    const mockCtx = { runMutation: mockRunMutation };

    const handler = createCommandBridgeHandler({
      agentComponent: comp,
      commandRoutes: createTestRoutes(),
      commandRegistry: createMockRegistry(["SuggestCustomerOutreach"]),
      commandOrchestrator: orchestrator,
    });

    // No patternId in args
    await handler(mockCtx, createTestArgs());

    const auditCall = calledRefs.find((c) => c.ref === comp.audit.record);
    expect(auditCall).toBeDefined();
    const payload = auditCall!.args.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("patternId");
  });
});
