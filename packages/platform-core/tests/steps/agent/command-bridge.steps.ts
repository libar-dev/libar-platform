/**
 * Agent Command Bridge - Step Definitions
 *
 * BDD step definitions for createCommandBridgeHandler() including:
 * - Happy path: route found, registry has command, orchestrator executes
 * - Unknown route: command type not in route map
 * - Command not in registry: route exists but registry.has() returns false
 * - Transform failure: toOrchestratorArgs throws
 * - Orchestrator failure: orchestrator.execute() throws
 * - NO-THROW: audit failure does not propagate
 * - NO-THROW: status update failure does not propagate
 * - Optional updateStatus: handler skips status update when undefined
 * - patternId propagation: appears in audit event payload
 *
 * Mechanical migration from tests/unit/agent/command-bridge.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi, type Mock } from "vitest";

import {
  createCommandBridgeHandler,
  type RouteAgentCommandArgs,
} from "../../../src/agent/command-bridge.js";
import type { AgentComponentAPI } from "../../../src/agent/handler-types.js";
import type { AgentCommandRouteMap } from "../../../src/agent/command-router.js";
import { COMMAND_ROUTING_ERROR_CODES } from "../../../src/agent/command-router.js";
import type { Logger } from "../../../src/logging/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    flush: vi.fn(),
  };
}

function createMockComponent(): AgentComponentAPI {
  return {
    checkpoints: {
      loadOrCreate:
        "mock_loadOrCreate" as unknown as AgentComponentAPI["checkpoints"]["loadOrCreate"],
      update: "mock_update" as unknown as AgentComponentAPI["checkpoints"]["update"],
      transitionLifecycle:
        "mock_transitionLifecycle" as unknown as AgentComponentAPI["checkpoints"]["transitionLifecycle"],
      patchConfigOverrides:
        "mock_patchConfigOverrides" as unknown as AgentComponentAPI["checkpoints"]["patchConfigOverrides"],
    },
    audit: {
      record: "mock_audit_record" as unknown as AgentComponentAPI["audit"]["record"],
    },
    commands: {
      record: "mock_commands_record" as unknown as AgentComponentAPI["commands"]["record"],
      updateStatus:
        "mock_commands_updateStatus" as unknown as AgentComponentAPI["commands"]["updateStatus"],
    },
    approvals: {
      create: "mock_approvals_create" as unknown as AgentComponentAPI["approvals"]["create"],
    },
    deadLetters: {
      record: "mock_deadLetters_record" as unknown as AgentComponentAPI["deadLetters"]["record"],
    },
  };
}

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

function createThrowingRoutes(): AgentCommandRouteMap {
  return {
    SuggestCustomerOutreach: {
      commandType: "SuggestCustomerOutreach",
      boundedContext: "agent",
      toOrchestratorArgs: () => {
        throw new Error("Missing required field: customerId");
      },
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

// =============================================================================
// State
// =============================================================================

interface TestState {
  comp: AgentComponentAPI;
  orchestrator: ReturnType<typeof createMockOrchestrator>;
  registry: ReturnType<typeof createMockRegistry>;
  routes: AgentCommandRouteMap;
  logger: Logger | undefined;
  calledRefs: Array<{ ref: unknown; args: Record<string, unknown> }>;
  mockRunMutation: Mock;
  mockCtx: { runMutation: Mock };
  handlerResult: Promise<void> | undefined;
  auditThrowMessage: string | undefined;
  statusThrowMessage: string | undefined;
}

function createInitialState(): TestState {
  const mockRunMutation = vi.fn().mockImplementation(async (ref: unknown, args: unknown) => {
    state.calledRefs.push({ ref, args: args as Record<string, unknown> });
    return {};
  });
  return {
    comp: createMockComponent(),
    orchestrator: createMockOrchestrator(),
    registry: createMockRegistry([]),
    routes: createTestRoutes(),
    logger: undefined,
    calledRefs: [],
    mockRunMutation,
    mockCtx: { runMutation: mockRunMutation },
    handlerResult: undefined,
    auditThrowMessage: undefined,
    statusThrowMessage: undefined,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/command-bridge.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
    state = createInitialState();
  });

  // NOTE: vitest-cucumber does not support AfterEachScenario, so we restore
  // timers in a cleanup pattern at the end of each scenario's last Then step.
  // Actually, we can just let BeforeEachScenario reset timers.

  Background((ctx) => {
    ctx.Given("the module is imported from platform-core", () => {
      // Module imported at top of file
    });
  });

  // ===========================================================================
  // Rule: Happy path routes command through the full pipeline
  // ===========================================================================
  Rule("Happy path routes command through the full pipeline", ({ RuleScenario }) => {
    RuleScenario(
      "Routes command through registry, orchestrator, records audit, and updates status",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs());
        });

        Then("the orchestrator was called once with the correct arguments", () => {
          expect(state.orchestrator.execute).toHaveBeenCalledOnce();
          expect(state.orchestrator.execute).toHaveBeenCalledWith(
            state.mockCtx,
            { type: "SuggestCustomerOutreach" },
            { customerId: "cust-123", agentId: "test-agent", correlationId: "corr_123" }
          );
        });

        And(
          "an AgentCommandRouted audit event was recorded with:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
            const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
            expect(auditCall).toBeDefined();

            // Build expected payload from DataTable
            const expectedPayload: Record<string, string> = {};
            const expectedTop: Record<string, string> = {};
            for (const row of rows) {
              if (["commandType", "boundedContext", "correlationId"].includes(row.field)) {
                expectedPayload[row.field] = row.value;
              } else {
                expectedTop[row.field] = row.value;
              }
            }

            expect(auditCall!.args).toMatchObject({
              eventType: "AgentCommandRouted",
              agentId: expectedTop.agentId,
              decisionId: expectedTop.decisionId,
              timestamp: Date.now(),
              payload: expectedPayload,
            });
          }
        );

        And('the decision status was updated to "completed"', () => {
          const statusCall = state.calledRefs.find(
            (c) => c.ref === state.comp.commands.updateStatus
          );
          expect(statusCall).toBeDefined();
          expect(statusCall!.args).toMatchObject({
            decisionId: "dec_test_42",
            status: "completed",
          });
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Unknown route records routing failure
  // ===========================================================================
  Rule("Unknown route records routing failure", ({ RuleScenario }) => {
    RuleScenario(
      "Records AgentCommandRoutingFailed audit and sets status to failed for unknown route",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When('the bridge handler is invoked with commandType "NonExistentCommand"', async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs({ commandType: "NonExistentCommand" }));
        });

        Then("the orchestrator was not called", () => {
          expect(state.orchestrator.execute).not.toHaveBeenCalled();
        });

        And(
          'an AgentCommandRoutingFailed audit event was recorded for agent "test-agent" decision "dec_test_42"',
          () => {
            const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
            expect(auditCall).toBeDefined();
            expect(auditCall!.args).toMatchObject({
              eventType: "AgentCommandRoutingFailed",
              agentId: "test-agent",
              decisionId: "dec_test_42",
            });
          }
        );

        And('the audit payload code is "UNKNOWN_ROUTE"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
            COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE
          );
        });

        And('the decision status was updated to "failed"', () => {
          const statusCall = state.calledRefs.find(
            (c) => c.ref === state.comp.commands.updateStatus
          );
          expect(statusCall).toBeDefined();
          expect(statusCall!.args).toMatchObject({
            decisionId: "dec_test_42",
            status: "failed",
          });
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Command not in registry records routing failure
  // ===========================================================================
  Rule("Command not in registry records routing failure", ({ RuleScenario }) => {
    RuleScenario(
      "Records COMMAND_NOT_REGISTERED error when registry does not contain the command",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And("an empty mock registry", () => {
          state.registry = createMockRegistry([]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs());
        });

        Then("the orchestrator was not called", () => {
          expect(state.orchestrator.execute).not.toHaveBeenCalled();
        });

        And("an AgentCommandRoutingFailed audit event was recorded", () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect(auditCall).toBeDefined();
          expect(auditCall!.args).toMatchObject({
            eventType: "AgentCommandRoutingFailed",
          });
        });

        And('the audit payload code is "COMMAND_NOT_REGISTERED"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
            COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED
          );
        });

        And('the audit payload error contains "not registered in CommandRegistry"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
            "not registered in CommandRegistry"
          );
        });

        And('the decision status was updated to "failed"', () => {
          const statusCall = state.calledRefs.find(
            (c) => c.ref === state.comp.commands.updateStatus
          );
          expect(statusCall).toBeDefined();
          expect(statusCall!.args.status).toBe("failed");
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Transform failure records routing failure
  // ===========================================================================
  Rule("Transform failure records routing failure", ({ RuleScenario }) => {
    RuleScenario(
      "Records INVALID_TRANSFORM error when toOrchestratorArgs throws",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And('a route map with a throwing transform for "SuggestCustomerOutreach"', () => {
          state.routes = createThrowingRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs());
        });

        Then("the orchestrator was not called", () => {
          expect(state.orchestrator.execute).not.toHaveBeenCalled();
        });

        And("an AgentCommandRoutingFailed audit event was recorded", () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect(auditCall).toBeDefined();
          expect(auditCall!.args).toMatchObject({
            eventType: "AgentCommandRoutingFailed",
          });
        });

        And('the audit payload code is "INVALID_TRANSFORM"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).code).toBe(
            COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM
          );
        });

        And('the audit payload error contains "Transform failed"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
            "Transform failed"
          );
        });

        And('the audit payload error contains "Missing required field: customerId"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).error).toContain(
            "Missing required field: customerId"
          );
        });

        And('the decision status was updated to "failed"', () => {
          const statusCall = state.calledRefs.find(
            (c) => c.ref === state.comp.commands.updateStatus
          );
          expect(statusCall).toBeDefined();
          expect(statusCall!.args.status).toBe("failed");
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Orchestrator failure records routing failure with error details
  // ===========================================================================
  Rule("Orchestrator failure records routing failure with error details", ({ RuleScenario }) => {
    RuleScenario(
      "Records AgentCommandRoutingFailed audit and sets status to failed on orchestrator error",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And('a mock orchestrator that throws "Orchestrator timeout"', () => {
          state.orchestrator = createMockOrchestrator(new Error("Orchestrator timeout"));
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs());
        });

        Then("the orchestrator was called once", () => {
          expect(state.orchestrator.execute).toHaveBeenCalledOnce();
        });

        And(
          'an AgentCommandRoutingFailed audit event was recorded for agent "test-agent" decision "dec_test_42"',
          () => {
            const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
            expect(auditCall).toBeDefined();
            expect(auditCall!.args).toMatchObject({
              eventType: "AgentCommandRoutingFailed",
              agentId: "test-agent",
              decisionId: "dec_test_42",
            });
          }
        );

        And('the audit payload error is "Orchestrator timeout"', () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect((auditCall!.args.payload as Record<string, unknown>).error).toBe(
            "Orchestrator timeout"
          );
        });

        And('the decision status was updated to "failed" with error "Orchestrator timeout"', () => {
          const statusCall = state.calledRefs.find(
            (c) => c.ref === state.comp.commands.updateStatus
          );
          expect(statusCall).toBeDefined();
          expect(statusCall!.args).toMatchObject({
            decisionId: "dec_test_42",
            status: "failed",
            error: "Orchestrator timeout",
          });
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Audit failure does not propagate to caller
  // ===========================================================================
  Rule("Audit failure does not propagate to caller", ({ RuleScenario }) => {
    RuleScenario(
      "Does not throw when audit recording fails on success path",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        And('the audit mutation will throw "Audit store unavailable"', () => {
          state.mockRunMutation.mockImplementation(async (ref: unknown) => {
            if (ref === state.comp.audit.record) {
              throw new Error("Audit store unavailable");
            }
            return {};
          });
        });

        And("a mock logger is provided", () => {
          state.logger = createMockLogger();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
            logger: state.logger,
          });
          state.handlerResult = handler(state.mockCtx, createTestArgs());
        });

        Then("the handler resolves without throwing", async () => {
          await expect(state.handlerResult).resolves.toBeUndefined();
        });

        And("the orchestrator was called once", () => {
          expect(state.orchestrator.execute).toHaveBeenCalledOnce();
        });

        And(
          'the logger recorded an error "Failed to record AgentCommandRouted audit" with agentId "test-agent" and error "Audit store unavailable"',
          () => {
            expect(state.logger!.error as Mock).toHaveBeenCalledWith(
              "Failed to record AgentCommandRouted audit",
              expect.objectContaining({
                agentId: "test-agent",
                error: "Audit store unavailable",
              })
            );
            vi.useRealTimers();
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: Status update failure does not propagate to caller
  // ===========================================================================
  Rule("Status update failure does not propagate to caller", ({ RuleScenario }) => {
    RuleScenario(
      "Does not throw when updateStatus mutation fails on success path",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        And('the updateStatus mutation will throw "Status update failed"', () => {
          state.mockRunMutation.mockImplementation(async (ref: unknown) => {
            if (ref === state.comp.commands.updateStatus) {
              throw new Error("Status update failed");
            }
            state.calledRefs.push({ ref, args: {} });
            return {};
          });
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          state.handlerResult = handler(state.mockCtx, createTestArgs());
        });

        Then("the handler resolves without throwing", async () => {
          await expect(state.handlerResult).resolves.toBeUndefined();
        });

        And("the orchestrator was called once", () => {
          expect(state.orchestrator.execute).toHaveBeenCalledOnce();
        });

        And("the audit mutation was still called", () => {
          const auditCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.comp.audit.record
          );
          expect(auditCall).toBeDefined();
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Optional updateStatus is gracefully skipped
  // ===========================================================================
  Rule("Optional updateStatus is gracefully skipped", ({ RuleScenario }) => {
    RuleScenario(
      "Skips status update without error when updateStatus is undefined on success path",
      ({ Given, When, Then, And }) => {
        Given("a mock component without updateStatus", () => {
          state.comp = createMockComponentWithoutUpdateStatus();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          state.handlerResult = handler(state.mockCtx, createTestArgs());
        });

        Then("the handler resolves without throwing", async () => {
          await expect(state.handlerResult).resolves.toBeUndefined();
        });

        And("the orchestrator was called once", () => {
          expect(state.orchestrator.execute).toHaveBeenCalledOnce();
        });

        And("the audit mutation was still called", () => {
          expect(state.calledRefs.map((c) => c.ref)).toContain(state.comp.audit.record);
        });

        And("exactly 1 mutation call was made", () => {
          // updateStatus should NOT have been called (it is undefined)
          expect(state.calledRefs).not.toContainEqual(expect.objectContaining({ ref: undefined }));
          expect(state.mockRunMutation).toHaveBeenCalledTimes(1);
          vi.useRealTimers();
        });
      }
    );

    RuleScenario(
      "Skips status update on routing failure when updateStatus is undefined",
      ({ Given, When, Then, And }) => {
        Given("a mock component without updateStatus", () => {
          state.comp = createMockComponentWithoutUpdateStatus();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When('the bridge handler is invoked with commandType "NonExistent"', async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          state.handlerResult = handler(
            state.mockCtx,
            createTestArgs({ commandType: "NonExistent" })
          );
        });

        Then("the handler resolves without throwing", async () => {
          await expect(state.handlerResult).resolves.toBeUndefined();
        });

        And("exactly 1 mutation call was made", () => {
          expect(state.mockRunMutation).toHaveBeenCalledTimes(1);
        });

        And("the only mutation call was the audit record", () => {
          expect(state.mockRunMutation.mock.calls[0][0]).toBe(state.comp.audit.record);
          vi.useRealTimers();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: patternId propagation in audit events
  // ===========================================================================
  Rule("patternId propagation in audit events", ({ RuleScenario }) => {
    RuleScenario(
      "Includes patternId in audit event payload when present in args",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When('the bridge handler is invoked with patternId "churn-risk-v2"', async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs({ patternId: "churn-risk-v2" }));
        });

        Then(
          'an AgentCommandRouted audit event was recorded with patternId "churn-risk-v2"',
          () => {
            const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
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
            vi.useRealTimers();
          }
        );
      }
    );

    RuleScenario(
      "Does not include patternId in audit payload when absent from args",
      ({ Given, When, Then, And }) => {
        Given("a standard mock component", () => {
          state.comp = createMockComponent();
        });

        And("a mock orchestrator that succeeds", () => {
          state.orchestrator = createMockOrchestrator();
        });

        And('a mock registry containing "SuggestCustomerOutreach"', () => {
          state.registry = createMockRegistry(["SuggestCustomerOutreach"]);
        });

        And("a standard route map", () => {
          state.routes = createTestRoutes();
        });

        When("the bridge handler is created and invoked with standard args", async () => {
          const handler = createCommandBridgeHandler({
            agentComponent: state.comp,
            commandRoutes: state.routes,
            commandRegistry: state.registry,
            commandOrchestrator: state.orchestrator,
          });
          await handler(state.mockCtx, createTestArgs());
        });

        Then("an AgentCommandRouted audit event was recorded without patternId", () => {
          const auditCall = state.calledRefs.find((c) => c.ref === state.comp.audit.record);
          expect(auditCall).toBeDefined();
          const payload = auditCall!.args.payload as Record<string, unknown>;
          expect(payload).not.toHaveProperty("patternId");
          vi.useRealTimers();
        });
      }
    );
  });
});
