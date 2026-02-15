/**
 * Agent onComplete Handler - Step Definitions
 *
 * BDD step definitions for createAgentOnCompleteHandler() including:
 * - Canceled result handling (no-op)
 * - Failed result handling (dead letter + audit, no checkpoint)
 * - Success with null returnValue (skipped event)
 * - Success with decision (audit, command, approval, checkpoint)
 * - Success without command (skip command + approval recording)
 * - Idempotency (checkpoint position already advanced)
 * - NO-THROW behavior (catch-all with dead letter fallback)
 * - NO-THROW when dead letter also fails
 *
 * Mechanical migration from tests/unit/agent/oncomplete-handler.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createAgentOnCompleteHandler,
  type AgentOnCompleteArgs,
  type AgentWorkpoolContext,
} from "../../../src/agent/oncomplete-handler.js";
import type { AgentActionResult } from "../../../src/agent/action-handler.js";
import type { Logger } from "../../../src/logging/types.js";
import type { AgentComponentAPI } from "../../../src/agent/handler-types.js";
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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockComponent: AgentComponentAPI;
  mockRunMutation: ReturnType<typeof vi.fn>;
  mockCtx: { runMutation: ReturnType<typeof vi.fn> };
  handler: ReturnType<typeof createAgentOnCompleteHandler> | null;
  args: AgentOnCompleteArgs | null;
  logger: Logger | null;
  callOrder: string[];
  calledRefs: unknown[];
  checkpointLoadOrCreateThrows: string | null;
  auditRecordThrows: string | null;
  deadLetterRecordThrows: string | null;
  checkpointLastProcessedPosition: number | null;
  approvalTimeoutMs: number | undefined;
}

function createInitialState(): TestState {
  const mockRunMutation = vi.fn().mockResolvedValue({});
  return {
    mockComponent: createMockComponent(),
    mockRunMutation,
    mockCtx: { runMutation: mockRunMutation },
    handler: null,
    args: null,
    logger: null,
    callOrder: [],
    calledRefs: [],
    checkpointLoadOrCreateThrows: null,
    auditRecordThrows: null,
    deadLetterRecordThrows: null,
    checkpointLastProcessedPosition: null,
    approvalTimeoutMs: undefined,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: set up mockRunMutation behavior based on state config
// =============================================================================

function configureMockRunMutation(): void {
  const s = state;
  s.mockRunMutation.mockImplementation(async (ref: unknown) => {
    s.calledRefs.push(ref);

    if (ref === s.mockComponent.checkpoints.loadOrCreate) {
      s.callOrder.push("loadOrCreate");
      if (s.checkpointLoadOrCreateThrows) {
        throw new Error(s.checkpointLoadOrCreateThrows);
      }
      return {
        checkpoint: {
          lastProcessedPosition: s.checkpointLastProcessedPosition ?? 0,
        },
      };
    }
    if (ref === s.mockComponent.audit.record) {
      s.callOrder.push("audit");
      if (s.auditRecordThrows) {
        throw new Error(s.auditRecordThrows);
      }
      return {};
    }
    if (ref === s.mockComponent.commands.record) {
      s.callOrder.push("commands");
      return {};
    }
    if (ref === s.mockComponent.approvals.create) {
      s.callOrder.push("approvals");
      return {};
    }
    if (ref === s.mockComponent.checkpoints.update) {
      s.callOrder.push("checkpoint_update");
      return {};
    }
    if (ref === s.mockComponent.deadLetters.record) {
      s.callOrder.push("deadLetters");
      if (s.deadLetterRecordThrows) {
        throw new Error(s.deadLetterRecordThrows);
      }
      return {};
    }
    return {};
  });
}

function buildHandler(): ReturnType<typeof createAgentOnCompleteHandler> {
  const opts: Parameters<typeof createAgentOnCompleteHandler>[0] = {
    agentComponent: state.mockComponent,
  };
  if (state.logger) {
    opts.logger = state.logger;
  }
  if (state.approvalTimeoutMs !== undefined) {
    opts.approvalTimeoutMs = state.approvalTimeoutMs;
  }
  return createAgentOnCompleteHandler(opts);
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/oncomplete-handler.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  Background((ctx) => {
    ctx.Given("the module is imported from platform-core", () => {
      // Module imported at top of file
    });
  });

  // ===========================================================================
  // Rule: Canceled results are no-ops
  // ===========================================================================

  Rule("Canceled results are no-ops", ({ RuleScenario }) => {
    RuleScenario(
      "Returns immediately without calling any mutations",
      ({ Given, When, Then, And }) => {
        Given("a handler with default config", () => {
          state.handler = buildHandler();
        });

        And("args with a canceled result", () => {
          state.args = createTestArgs({
            result: { kind: "canceled" },
          });
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("runMutation is not called", () => {
          expect(state.mockRunMutation).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Failed results record dead letter and audit without checkpoint
  // ===========================================================================

  Rule("Failed results record dead letter and audit without checkpoint", ({ RuleScenario }) => {
    RuleScenario(
      "Records dead letter and audit event but does not advance checkpoint",
      ({ Given, And, When, Then }) => {
        Given("a handler with default config", () => {
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And('args with a failed result with error "LLM timeout after 30s"', () => {
          state.args = createTestArgs({
            result: {
              kind: "failed",
              error: "LLM timeout after 30s",
            },
          });
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the dead letter is recorded with fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            field: string;
            value: string;
          }>(dataTable);
          const deadLetterCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.mockComponent.deadLetters.record
          );
          expect(deadLetterCall).toBeDefined();
          for (const row of rows) {
            const actual = deadLetterCall![1][row.field as keyof (typeof deadLetterCall)[1]];
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(actual).toBe(expected);
          }
        });

        And(
          'the audit is recorded with eventType "AgentAnalysisFailed" and agentId "test-agent"',
          () => {
            const auditCall = state.mockRunMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.mockComponent.audit.record
            );
            expect(auditCall).toBeDefined();
            expect(auditCall![1]).toMatchObject({
              eventType: "AgentAnalysisFailed",
              agentId: "test-agent",
            });
          }
        );

        And("the checkpoint update is not called", () => {
          const checkpointCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.mockComponent.checkpoints.update
          );
          expect(checkpointCall).toBeUndefined();
        });

        And("the checkpoint loadOrCreate is not called", () => {
          const loadOrCreateCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.mockComponent.checkpoints.loadOrCreate
          );
          expect(loadOrCreateCall).toBeUndefined();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: Success with null returnValue is a no-op
  // ===========================================================================

  Rule("Success with null returnValue is a no-op", ({ RuleScenario }) => {
    RuleScenario("Returns immediately when returnValue is null", ({ Given, And, When, Then }) => {
      Given("a handler with default config", () => {
        state.handler = buildHandler();
      });

      And("args with a success result with null returnValue", () => {
        state.args = createTestArgs({
          result: { kind: "success", returnValue: null },
        });
      });

      When("the handler is invoked", async () => {
        await state.handler!(state.mockCtx, state.args!);
      });

      Then("runMutation is not called", () => {
        expect(state.mockRunMutation).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Rule: Success with decision persists audit, command, approval, and checkpoint
  // ===========================================================================

  Rule(
    "Success with decision persists audit, command, approval, and checkpoint",
    ({ RuleScenario }) => {
      RuleScenario(
        "Persists in correct order when requiresApproval is true",
        ({ Given, And, When, Then }) => {
          Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
            configureMockRunMutation();
            state.handler = buildHandler();
          });

          And("args with a success result containing a decision with requiresApproval true", () => {
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
            state.args = createTestArgs({
              result: { kind: "success", returnValue: actionResult },
            });
          });

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the persistence order is:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ step: string }>(dataTable);
            const expectedOrder = rows.map((r) => r.step);
            expect(state.callOrder).toEqual(expectedOrder);
          });
        }
      );

      RuleScenario("Updates checkpoint with correct args", ({ Given, And, When, Then }) => {
        Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And(
          'args with a success result and context agentId "my-agent" subscriptionId "sub_my-agent" eventId "evt_999" globalPosition 150',
          () => {
            const actionResult = createTestActionResult();
            state.args = createTestArgs({
              context: createTestContext({
                agentId: "my-agent",
                subscriptionId: "sub_my-agent",
                eventId: "evt_999",
                globalPosition: 150,
              }),
              result: { kind: "success", returnValue: actionResult },
            });
          }
        );

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the checkpoint update is called with:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            field: string;
            value: string;
          }>(dataTable);
          const checkpointUpdateCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.mockComponent.checkpoints.update
          );
          expect(checkpointUpdateCall).toBeDefined();
          for (const row of rows) {
            const actual =
              checkpointUpdateCall![1][row.field as keyof (typeof checkpointUpdateCall)[1]];
            let expected: unknown;
            if (row.value === "true") expected = true;
            else if (row.value === "false") expected = false;
            else if (!isNaN(Number(row.value))) expected = Number(row.value);
            else expected = row.value;
            expect(actual).toBe(expected);
          }
        });
      });

      RuleScenario(
        "Uses default 24h timeout for approval expiresAt",
        ({ Given, And, When, Then }) => {
          Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
            configureMockRunMutation();
            state.handler = buildHandler();
          });

          And("args with a success result containing a decision with requiresApproval true", () => {
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
            state.args = createTestArgs({
              result: { kind: "success", returnValue: actionResult },
            });
          });

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the approval expiresAt equals Date.now() plus 86400000 ms", () => {
            const approvalCall = state.mockRunMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.mockComponent.approvals.create
            );
            expect(approvalCall).toBeDefined();
            expect(approvalCall![1].expiresAt).toBe(Date.now() + 24 * 60 * 60 * 1000);
          });
        }
      );

      RuleScenario(
        "Records command but not approval when requiresApproval is false",
        ({ Given, And, When, Then }) => {
          Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
            configureMockRunMutation();
            state.handler = buildHandler();
          });

          And(
            "args with a success result containing a decision with requiresApproval false",
            () => {
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
              state.args = createTestArgs({
                result: { kind: "success", returnValue: actionResult },
              });
            }
          );

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the commands record is called", () => {
            expect(state.calledRefs).toContain(state.mockComponent.commands.record);
          });

          And("the approvals create is not called", () => {
            expect(state.calledRefs).not.toContain(state.mockComponent.approvals.create);
          });
        }
      );

      RuleScenario(
        "Does not create approval when requiresApproval is true but command is null",
        ({ Given, And, When, Then }) => {
          Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
            configureMockRunMutation();
            state.handler = buildHandler();
          });

          And(
            "args with a success result containing a decision with null command and requiresApproval true",
            () => {
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
              state.args = createTestArgs({
                result: { kind: "success", returnValue: actionResult },
              });
            }
          );

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the approvals create is not called", () => {
            expect(state.calledRefs).not.toContain(state.mockComponent.approvals.create);
          });

          And("the commands record is not called", () => {
            expect(state.calledRefs).not.toContain(state.mockComponent.commands.record);
          });

          And("the checkpoint update is called", () => {
            expect(state.calledRefs).toContain(state.mockComponent.checkpoints.update);
          });
        }
      );

      RuleScenario(
        "Uses custom approvalTimeoutMs for approval expiresAt",
        ({ Given, And, When, Then }) => {
          Given(
            'a handler with approvalTimeoutMs 3600000 and fake timers at "2024-01-15T12:00:00Z"',
            () => {
              vi.useFakeTimers();
              vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
              state.approvalTimeoutMs = 3600000;
              configureMockRunMutation();
              state.handler = buildHandler();
            }
          );

          And("args with a success result containing a decision with requiresApproval true", () => {
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
            state.args = createTestArgs({
              result: { kind: "success", returnValue: actionResult },
            });
          });

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the approval expiresAt equals Date.now() plus 3600000 ms", () => {
            const approvalCall = state.mockRunMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.mockComponent.approvals.create
            );
            expect(approvalCall).toBeDefined();
            expect(approvalCall![1].expiresAt).toBe(Date.now() + 3600000);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: Success with no-command decision skips command and approval recording
  // ===========================================================================

  Rule(
    "Success with no-command decision skips command and approval recording",
    ({ RuleScenario }) => {
      RuleScenario(
        "Records audit and checkpoint but skips command and approval",
        ({ Given, And, When, Then }) => {
          Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
            configureMockRunMutation();
            state.handler = buildHandler();
          });

          And("args with a success result containing a no-command decision", () => {
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
            state.args = createTestArgs({
              result: { kind: "success", returnValue: actionResult },
            });
          });

          When("the handler is invoked", async () => {
            await state.handler!(state.mockCtx, state.args!);
          });

          Then("the audit record is called", () => {
            expect(state.calledRefs).toContain(state.mockComponent.audit.record);
          });

          And("the commands record is not called", () => {
            expect(state.calledRefs).not.toContain(state.mockComponent.commands.record);
          });

          And("the approvals create is not called", () => {
            expect(state.calledRefs).not.toContain(state.mockComponent.approvals.create);
          });

          And("the checkpoint update is called", () => {
            expect(state.calledRefs).toContain(state.mockComponent.checkpoints.update);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: Idempotency via checkpoint position
  // ===========================================================================

  Rule("Idempotency via checkpoint position", ({ RuleScenario }) => {
    RuleScenario(
      "Skips when checkpoint position equals event position",
      ({ Given, And, When, Then }) => {
        Given('a handler with default config and fake timers at "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          state.checkpointLastProcessedPosition = 42;
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And("args with a success result and context globalPosition 42", () => {
          const actionResult = createTestActionResult();
          state.args = createTestArgs({
            context: createTestContext({ globalPosition: 42 }),
            result: { kind: "success", returnValue: actionResult },
          });
        });

        And("the checkpoint loadOrCreate returns lastProcessedPosition 42", () => {
          // Already configured in Given via state.checkpointLastProcessedPosition
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the checkpoint loadOrCreate is called", () => {
          expect(state.calledRefs).toContain(state.mockComponent.checkpoints.loadOrCreate);
        });

        And("the checkpoint update is not called", () => {
          expect(state.calledRefs).not.toContain(state.mockComponent.checkpoints.update);
        });

        And("the audit record is not called", () => {
          expect(state.calledRefs).not.toContain(state.mockComponent.audit.record);
        });

        And("the commands record is not called", () => {
          expect(state.calledRefs).not.toContain(state.mockComponent.commands.record);
        });

        And("the approvals create is not called", () => {
          expect(state.calledRefs).not.toContain(state.mockComponent.approvals.create);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: NO-THROW zone catches errors and records dead letter fallback
  // ===========================================================================

  Rule("NO-THROW zone catches errors and records dead letter fallback", ({ RuleScenario }) => {
    RuleScenario(
      "Catches checkpoint error and creates dead letter instead of throwing",
      ({ Given, And, When, Then }) => {
        Given("a handler with default config and a logger", () => {
          state.logger = createMockLogger();
        });

        And('the checkpoint loadOrCreate will throw "Database connection lost"', () => {
          state.checkpointLoadOrCreateThrows = "Database connection lost";
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And("args with a success result containing a standard decision", () => {
          const actionResult = createTestActionResult();
          state.args = createTestArgs({
            result: { kind: "success", returnValue: actionResult },
          });
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the handler resolves without throwing", () => {
          // Already resolved in When step — if it threw, test would fail
        });

        And("the dead letter is recorded with fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            field: string;
            value: string;
          }>(dataTable);
          const deadLetterCall = state.mockRunMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.mockComponent.deadLetters.record
          );
          expect(deadLetterCall).toBeDefined();
          for (const row of rows) {
            const actual = deadLetterCall![1][row.field as keyof (typeof deadLetterCall)[1]];
            expect(actual).toBe(row.value);
          }
        });

        And(
          'the logger error is called with message "Unexpected error in agent onComplete" and agentId "test-agent" and error "Database connection lost"',
          () => {
            expect(state.logger!.error).toHaveBeenCalledWith(
              "Unexpected error in agent onComplete",
              expect.objectContaining({
                agentId: "test-agent",
                error: "Database connection lost",
              })
            );
          }
        );
      }
    );

    RuleScenario(
      "Continues to record commands and checkpoint when audit throws",
      ({ Given, And, When, Then }) => {
        Given("a handler with default config and a logger", () => {
          state.logger = createMockLogger();
        });

        And("the checkpoint loadOrCreate returns lastProcessedPosition 0", () => {
          state.checkpointLastProcessedPosition = 0;
        });

        And('the audit record will throw "Audit store unavailable"', () => {
          state.auditRecordThrows = "Audit store unavailable";
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And(
          "args with a success result containing a decision with command and requiresApproval false",
          () => {
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
            state.args = createTestArgs({
              result: { kind: "success", returnValue: actionResult },
            });
          }
        );

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the handler resolves without throwing", () => {
          // Already resolved
        });

        And("the audit record is called", () => {
          expect(state.calledRefs).toContain(state.mockComponent.audit.record);
        });

        And("the commands record is called", () => {
          expect(state.calledRefs).toContain(state.mockComponent.commands.record);
        });

        And("the checkpoint update is called", () => {
          expect(state.calledRefs).toContain(state.mockComponent.checkpoints.update);
        });

        And(
          'the logger error is called with message "Failed to record audit in onComplete" and agentId "test-agent" and error "Audit store unavailable"',
          () => {
            expect(state.logger!.error).toHaveBeenCalledWith(
              "Failed to record audit in onComplete",
              expect.objectContaining({
                agentId: "test-agent",
                error: "Audit store unavailable",
              })
            );
          }
        );
      }
    );

    RuleScenario(
      "Does not throw even when dead letter recording also fails",
      ({ Given, And, When, Then }) => {
        Given("a handler with default config and a logger", () => {
          state.logger = createMockLogger();
        });

        And('the checkpoint loadOrCreate will throw "Primary failure"', () => {
          state.checkpointLoadOrCreateThrows = "Primary failure";
        });

        And('the dead letter record will throw "Dead letter also failed"', () => {
          state.deadLetterRecordThrows = "Dead letter also failed";
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And("args with a success result containing a standard decision", () => {
          const actionResult = createTestActionResult();
          state.args = createTestArgs({
            result: { kind: "success", returnValue: actionResult },
          });
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the handler resolves without throwing", () => {
          // Already resolved
        });

        And(
          'the logger error is called with message "Unexpected error in agent onComplete"',
          () => {
            expect(state.logger!.error).toHaveBeenCalledWith(
              "Unexpected error in agent onComplete",
              expect.any(Object)
            );
          }
        );

        And(
          'the logger error is called with message "Failed to record dead letter in catch-all" and agentId "test-agent" and eventId "evt_123"',
          () => {
            expect(state.logger!.error).toHaveBeenCalledWith(
              "Failed to record dead letter in catch-all",
              expect.objectContaining({
                agentId: "test-agent",
                eventId: "evt_123",
              })
            );
          }
        );
      }
    );

    RuleScenario(
      "Does not throw when failed result dead letter recording fails",
      ({ Given, And, When, Then }) => {
        Given("a handler with default config and a logger", () => {
          state.logger = createMockLogger();
        });

        And('the dead letter record will throw "Dead letter store unavailable"', () => {
          state.deadLetterRecordThrows = "Dead letter store unavailable";
          configureMockRunMutation();
          state.handler = buildHandler();
        });

        And('args with a failed result with error "Action failed"', () => {
          state.args = createTestArgs({
            result: { kind: "failed", error: "Action failed" },
          });
        });

        When("the handler is invoked", async () => {
          await state.handler!(state.mockCtx, state.args!);
        });

        Then("the handler resolves without throwing", () => {
          // Already resolved
        });

        And(
          'the logger error is called with message "Failed to record dead letter for action failure" and agentId "test-agent" and error "Dead letter store unavailable"',
          () => {
            expect(state.logger!.error).toHaveBeenCalledWith(
              "Failed to record dead letter for action failure",
              expect.objectContaining({
                agentId: "test-agent",
                error: "Dead letter store unavailable",
              })
            );
          }
        );
      }
    );
  });
});
