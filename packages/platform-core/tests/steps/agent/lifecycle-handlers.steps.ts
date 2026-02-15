/**
 * Lifecycle Handlers - Step Definitions
 *
 * BDD step definitions for all 5 lifecycle handlers and the createLifecycleHandlers factory:
 * - handleStartAgent: stopped -> active, rejects from active/paused
 * - handlePauseAgent: active -> paused, rejects from stopped
 * - handleResumeAgent: paused -> active, rejects from stopped
 * - handleStopAgent: active/paused/error_recovery -> stopped, rejects from stopped
 * - handleReconfigureAgent: active/paused -> active with config merge, rejects from stopped
 * - createLifecycleHandlers: factory returns all 5, round-trip test
 * - Logger behavior: no-op logger, warning on invalid transition
 *
 * Mechanical migration from tests/unit/agent/lifecycle-handlers.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

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
import type { Logger } from "../../../src/logging/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Factories
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

// =============================================================================
// State
// =============================================================================

interface TestState {
  component: AgentComponentAPI;
  ctx: ReturnType<typeof createMockCtx>;
  logger: Logger | undefined;
  result: unknown;
  existingOverrides: Record<string, unknown> | undefined;
}

function createInitialState(): TestState {
  return {
    component: createMockComponent(),
    ctx: undefined as unknown as ReturnType<typeof createMockCtx>,
    logger: undefined,
    result: undefined,
    existingOverrides: undefined,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/lifecycle-handlers.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are done at module level
    });
  });

  // ===========================================================================
  // Rule: handleStartAgent
  // ===========================================================================

  Rule(
    "handleStartAgent transitions stopped to active with AgentStarted audit",
    ({ RuleScenario }) => {
      RuleScenario(
        "Happy path - stopped to active with AgentStarted audit",
        ({ Given, And, When, Then }) => {
          Given('an agent in "stopped" state with lastProcessedPosition 25', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "stopped", {
              lastProcessedPosition: 25,
            });
          });

          And("a logger is attached", () => {
            state.logger = createMockLogger();
          });

          When(
            'handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_001"',
            async () => {
              const handler = handleStartAgent({
                agentComponent: state.component,
                logger: state.logger,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_001",
              });
            }
          );

          Then(
            'the result is successful with previousState "stopped" and newState "active"',
            () => {
              const r = state.result as {
                success: boolean;
                agentId: string;
                previousState: string;
                newState: string;
              };
              expect(r.success).toBe(true);
              expect(r.agentId).toBe("test-agent");
              expect(r.previousState).toBe("stopped");
              expect(r.newState).toBe("active");
            }
          );

          And(
            'transitionLifecycle was called with status "active" and audit event type "AgentStarted"',
            () => {
              const transitionCall = state.ctx.runMutation.mock.calls.find(
                (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
              );
              expect(transitionCall).toBeDefined();
              expect(transitionCall![1]).toMatchObject({
                agentId: "test-agent",
                status: "active",
                auditEvent: {
                  eventType: "AgentStarted",
                },
              });
            }
          );

          And("the AgentStarted audit payload contains:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            const payload = (
              transitionCall![1] as {
                auditEvent: { payload: Record<string, unknown> };
              }
            ).auditEvent.payload;

            for (const row of rows) {
              const expected = row.value === "26" ? 26 : row.value;
              expect(payload[row.property]).toEqual(expected);
            }
          });

          And('the logger info was called with "Agent started" and agentId "test-agent"', () => {
            expect((state.logger as Logger).info).toHaveBeenCalledWith(
              "Agent started",
              expect.objectContaining({
                agentId: "test-agent",
                previousState: "stopped",
                newState: "active",
              })
            );
          });
        }
      );

      RuleScenario("Rejects START from active state", ({ Given, When, Then, And }) => {
        Given('an agent in "active" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "active");
        });

        When(
          'handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_002"',
          async () => {
            const handler = handleStartAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_002",
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure message contains "START" and "active"', () => {
          const r = state.result as { message: string };
          expect(r.message).toContain("START");
          expect(r.message).toContain("active");
        });

        And('the failure currentState is "active"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("active");
        });

        And("transitionLifecycle was not called", () => {
          const transitionCall = state.ctx.runMutation.mock.calls.find(
            (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
          );
          expect(transitionCall).toBeUndefined();
        });
      });

      RuleScenario("Rejects START from paused state", ({ Given, When, Then, And }) => {
        Given('an agent in "paused" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "paused");
        });

        When(
          'handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_003"',
          async () => {
            const handler = handleStartAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_003",
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure currentState is "paused"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("paused");
        });
      });
    }
  );

  // ===========================================================================
  // Rule: handlePauseAgent
  // ===========================================================================

  Rule(
    "handlePauseAgent transitions active to paused with AgentPaused audit",
    ({ RuleScenario }) => {
      RuleScenario(
        "Happy path - active to paused with AgentPaused audit and reason",
        ({ Given, And, When, Then }) => {
          Given(
            'an agent in "active" state with lastProcessedPosition 50 and eventsProcessed 20',
            () => {
              state.component = createMockComponent();
              state.ctx = createMockCtx(state.component, "active", {
                lastProcessedPosition: 50,
                eventsProcessed: 20,
              });
            }
          );

          And("a logger is attached", () => {
            state.logger = createMockLogger();
          });

          When(
            'handlePauseAgent is invoked with agentId "test-agent" correlationId "corr_010" and reason "Maintenance window"',
            async () => {
              const handler = handlePauseAgent({
                agentComponent: state.component,
                logger: state.logger,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_010",
                reason: "Maintenance window",
              });
            }
          );

          Then('the result is successful with previousState "active" and newState "paused"', () => {
            const r = state.result as {
              success: boolean;
              previousState: string;
              newState: string;
            };
            expect(r.success).toBe(true);
            expect(r.previousState).toBe("active");
            expect(r.newState).toBe("paused");
          });

          And(
            'transitionLifecycle was called with status "paused" and audit event type "AgentPaused"',
            () => {
              const transitionCall = state.ctx.runMutation.mock.calls.find(
                (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
              );
              expect(transitionCall).toBeDefined();
              expect(transitionCall![1]).toMatchObject({
                agentId: "test-agent",
                status: "paused",
                auditEvent: {
                  eventType: "AgentPaused",
                },
              });
            }
          );

          And("the AgentPaused audit payload contains:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            const payload = (
              transitionCall![1] as {
                auditEvent: { payload: Record<string, unknown> };
              }
            ).auditEvent.payload;

            for (const row of rows) {
              const expected = row.value === "50" ? 50 : row.value === "20" ? 20 : row.value;
              expect(payload[row.property]).toEqual(expected);
            }
          });
        }
      );

      RuleScenario("Rejects PAUSE from stopped state", ({ Given, When, Then, And }) => {
        Given('an agent in "stopped" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "stopped");
        });

        When(
          'handlePauseAgent is invoked with agentId "test-agent" and correlationId "corr_011"',
          async () => {
            const handler = handlePauseAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_011",
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure message contains "PAUSE" and "stopped"', () => {
          const r = state.result as { message: string };
          expect(r.message).toContain("PAUSE");
          expect(r.message).toContain("stopped");
        });

        And('the failure currentState is "stopped"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("stopped");
        });
      });
    }
  );

  // ===========================================================================
  // Rule: handleResumeAgent
  // ===========================================================================

  Rule(
    "handleResumeAgent transitions paused to active with AgentResumed audit",
    ({ RuleScenario }) => {
      RuleScenario(
        "Happy path - paused to active with AgentResumed audit",
        ({ Given, And, When, Then }) => {
          Given('an agent in "paused" state with lastProcessedPosition 75', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "paused", {
              lastProcessedPosition: 75,
            });
          });

          And("a logger is attached", () => {
            state.logger = createMockLogger();
          });

          When(
            'handleResumeAgent is invoked with agentId "test-agent" and correlationId "corr_020"',
            async () => {
              const handler = handleResumeAgent({
                agentComponent: state.component,
                logger: state.logger,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_020",
              });
            }
          );

          Then('the result is successful with previousState "paused" and newState "active"', () => {
            const r = state.result as {
              success: boolean;
              previousState: string;
              newState: string;
            };
            expect(r.success).toBe(true);
            expect(r.previousState).toBe("paused");
            expect(r.newState).toBe("active");
          });

          And(
            'transitionLifecycle was called with status "active" and audit event type "AgentResumed"',
            () => {
              const transitionCall = state.ctx.runMutation.mock.calls.find(
                (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
              );
              expect(transitionCall).toBeDefined();
              expect(transitionCall![1]).toMatchObject({
                agentId: "test-agent",
                status: "active",
                auditEvent: {
                  eventType: "AgentResumed",
                },
              });
            }
          );

          And("the AgentResumed audit payload contains:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            const payload = (
              transitionCall![1] as {
                auditEvent: { payload: Record<string, unknown> };
              }
            ).auditEvent.payload;

            for (const row of rows) {
              const expected = row.value === "76" ? 76 : row.value;
              expect(payload[row.property]).toEqual(expected);
            }
          });
        }
      );

      RuleScenario("Rejects RESUME from stopped state", ({ Given, When, Then, And }) => {
        Given('an agent in "stopped" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "stopped");
        });

        When(
          'handleResumeAgent is invoked with agentId "test-agent" and correlationId "corr_021"',
          async () => {
            const handler = handleResumeAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_021",
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure message contains "RESUME" and "stopped"', () => {
          const r = state.result as { message: string };
          expect(r.message).toContain("RESUME");
          expect(r.message).toContain("stopped");
        });

        And('the failure currentState is "stopped"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("stopped");
        });
      });
    }
  );

  // ===========================================================================
  // Rule: handleStopAgent
  // ===========================================================================

  Rule(
    "handleStopAgent transitions active, paused, or error_recovery to stopped with AgentStopped audit",
    ({ RuleScenario }) => {
      RuleScenario(
        "Happy path - active to stopped with AgentStopped audit",
        ({ Given, And, When, Then }) => {
          Given('an agent in "active" state with lastProcessedPosition 100', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "active", {
              lastProcessedPosition: 100,
            });
          });

          And("a logger is attached", () => {
            state.logger = createMockLogger();
          });

          When(
            'handleStopAgent is invoked with agentId "test-agent" correlationId "corr_030" and reason "Decommissioning"',
            async () => {
              const handler = handleStopAgent({
                agentComponent: state.component,
                logger: state.logger,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_030",
                reason: "Decommissioning",
              });
            }
          );

          Then(
            'the result is successful with previousState "active" and newState "stopped"',
            () => {
              const r = state.result as {
                success: boolean;
                previousState: string;
                newState: string;
              };
              expect(r.success).toBe(true);
              expect(r.previousState).toBe("active");
              expect(r.newState).toBe("stopped");
            }
          );

          And(
            'transitionLifecycle was called with status "stopped" and audit event type "AgentStopped"',
            () => {
              const transitionCall = state.ctx.runMutation.mock.calls.find(
                (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
              );
              expect(transitionCall).toBeDefined();
              expect(transitionCall![1]).toMatchObject({
                agentId: "test-agent",
                status: "stopped",
                auditEvent: {
                  eventType: "AgentStopped",
                },
              });
            }
          );

          And("the AgentStopped audit payload contains:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            const payload = (
              transitionCall![1] as {
                auditEvent: { payload: Record<string, unknown> };
              }
            ).auditEvent.payload;

            for (const row of rows) {
              const expected = row.value === "100" ? 100 : row.value;
              expect(payload[row.property]).toEqual(expected);
            }
          });
        }
      );

      RuleScenario(
        "Happy path - paused to stopped as universal escape hatch",
        ({ Given, When, Then, And }) => {
          Given('an agent in "paused" state with lastProcessedPosition 60', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "paused", {
              lastProcessedPosition: 60,
            });
          });

          When(
            'handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_031"',
            async () => {
              const handler = handleStopAgent({
                agentComponent: state.component,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_031",
              });
            }
          );

          Then(
            'the result is successful with previousState "paused" and newState "stopped"',
            () => {
              const r = state.result as {
                success: boolean;
                previousState: string;
                newState: string;
              };
              expect(r.success).toBe(true);
              expect(r.previousState).toBe("paused");
              expect(r.newState).toBe("stopped");
            }
          );

          And(
            'the AgentStopped audit payload has previousState "paused" and stoppedAtPosition 60',
            () => {
              const transitionCall = state.ctx.runMutation.mock.calls.find(
                (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
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
            }
          );
        }
      );

      RuleScenario("Happy path - error_recovery to stopped", ({ Given, When, Then }) => {
        Given('an agent in "error_recovery" state with lastProcessedPosition 88', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "error_recovery", {
            lastProcessedPosition: 88,
          });
        });

        When(
          'handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_032"',
          async () => {
            const handler = handleStopAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_032",
            });
          }
        );

        Then(
          'the result is successful with previousState "error_recovery" and newState "stopped"',
          () => {
            const r = state.result as {
              success: boolean;
              previousState: string;
              newState: string;
            };
            expect(r.success).toBe(true);
            expect(r.previousState).toBe("error_recovery");
            expect(r.newState).toBe("stopped");
          }
        );
      });

      RuleScenario("Rejects STOP from already stopped state", ({ Given, When, Then, And }) => {
        Given('an agent in "stopped" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "stopped");
        });

        When(
          'handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_033"',
          async () => {
            const handler = handleStopAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_033",
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure message contains "STOP" and "stopped"', () => {
          const r = state.result as { message: string };
          expect(r.message).toContain("STOP");
          expect(r.message).toContain("stopped");
        });

        And('the failure currentState is "stopped"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("stopped");
        });
      });
    }
  );

  // ===========================================================================
  // Rule: handleReconfigureAgent
  // ===========================================================================

  Rule(
    "handleReconfigureAgent patches config overrides and transitions to active",
    ({ RuleScenario }) => {
      RuleScenario(
        "Reconfigures active agent with merged overrides",
        ({ Given, And, When, Then }) => {
          Given('an agent in "active" state with existing config overrides', () => {
            state.component = createMockComponent();
            state.existingOverrides = {
              confidenceThreshold: 0.8,
              patternWindowDuration: "30d",
            };
            state.ctx = createMockCtx(state.component, "active", {
              configOverrides: state.existingOverrides,
            });
          });

          And("a logger is attached", () => {
            state.logger = createMockLogger();
          });

          When(
            'handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_040" and new overrides',
            async () => {
              const handler = handleReconfigureAgent({
                agentComponent: state.component,
                logger: state.logger,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_040",
                configOverrides: {
                  confidenceThreshold: 0.9,
                },
              });
            }
          );

          Then('the result is successful with previousState "active" and newState "active"', () => {
            const r = state.result as {
              success: boolean;
              previousState: string;
              newState: string;
            };
            expect(r.success).toBe(true);
            expect(r.previousState).toBe("active");
            expect(r.newState).toBe("active");
          });

          And("patchConfigOverrides was called with merged overrides", () => {
            const patchCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.patchConfigOverrides
            );
            expect(patchCall).toBeDefined();
            expect(patchCall![1]).toMatchObject({
              agentId: "test-agent",
              configOverrides: {
                confidenceThreshold: 0.9, // overridden
                patternWindowDuration: "30d", // preserved from existing
              },
            });
          });

          And("the AgentReconfigured audit payload contains previous and new overrides", () => {
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            expect(transitionCall).toBeDefined();
            expect(transitionCall![1]).toMatchObject({
              agentId: "test-agent",
              status: "active",
              auditEvent: {
                eventType: "AgentReconfigured",
                payload: {
                  previousState: "active",
                  previousOverrides: state.existingOverrides,
                  newOverrides: { confidenceThreshold: 0.9 },
                  correlationId: "corr_040",
                },
              },
            });
          });
        }
      );

      RuleScenario(
        "Reconfigures paused agent transitioning to active",
        ({ Given, When, Then, And }) => {
          Given('an agent in "paused" state with no config overrides', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "paused");
          });

          When(
            'handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_041" and paused overrides',
            async () => {
              const handler = handleReconfigureAgent({
                agentComponent: state.component,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_041",
                configOverrides: {
                  patternWindowDuration: "7d",
                  rateLimits: { maxRequestsPerMinute: 30 },
                },
              });
            }
          );

          Then('the result is successful with previousState "paused" and newState "active"', () => {
            const r = state.result as {
              success: boolean;
              previousState: string;
              newState: string;
            };
            expect(r.success).toBe(true);
            expect(r.previousState).toBe("paused");
            expect(r.newState).toBe("active");
          });

          And("patchConfigOverrides was called with paused agent overrides", () => {
            const patchCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.patchConfigOverrides
            );
            expect(patchCall).toBeDefined();
            expect(patchCall![1]).toMatchObject({
              agentId: "test-agent",
              configOverrides: {
                patternWindowDuration: "7d",
                rateLimits: { maxRequestsPerMinute: 30 },
              },
            });
          });

          And('transitionLifecycle was called with status "active" for paused reconfigure', () => {
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
            );
            expect(transitionCall).toBeDefined();
            expect(transitionCall![1]).toMatchObject({
              agentId: "test-agent",
              status: "active",
            });
          });
        }
      );

      RuleScenario("Rejects RECONFIGURE from stopped state", ({ Given, When, Then, And }) => {
        Given('an agent in "stopped" state', () => {
          state.component = createMockComponent();
          state.ctx = createMockCtx(state.component, "stopped");
        });

        When(
          'handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_042" and overrides',
          async () => {
            const handler = handleReconfigureAgent({
              agentComponent: state.component,
            });
            state.result = await handler(state.ctx, {
              agentId: "test-agent",
              correlationId: "corr_042",
              configOverrides: { confidenceThreshold: 0.7 },
            });
          }
        );

        Then("the result is a failure with code INVALID_LIFECYCLE_TRANSITION", () => {
          const r = state.result as {
            success: boolean;
            code: string;
          };
          expect(r.success).toBe(false);
          expect(r.code).toBe(AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
        });

        And('the failure message contains "RECONFIGURE" and "stopped"', () => {
          const r = state.result as { message: string };
          expect(r.message).toContain("RECONFIGURE");
          expect(r.message).toContain("stopped");
        });

        And('the failure currentState is "stopped"', () => {
          const r = state.result as { currentState: string };
          expect(r.currentState).toBe("stopped");
        });
      });

      RuleScenario(
        "Handles first-time config overrides when checkpoint has none",
        ({ Given, When, Then, And }) => {
          Given('an agent in "active" state with no existing config overrides', () => {
            state.component = createMockComponent();
            state.ctx = createMockCtx(state.component, "active", {
              configOverrides: undefined,
            });
          });

          When(
            'handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_043" and first-time overrides',
            async () => {
              const handler = handleReconfigureAgent({
                agentComponent: state.component,
              });
              state.result = await handler(state.ctx, {
                agentId: "test-agent",
                correlationId: "corr_043",
                configOverrides: { confidenceThreshold: 0.85 },
              });
            }
          );

          Then("the result is successful", () => {
            const r = state.result as { success: boolean };
            expect(r.success).toBe(true);
          });

          And("patchConfigOverrides was called with first-time overrides only", () => {
            const patchCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.patchConfigOverrides
            );
            expect(patchCall).toBeDefined();
            expect(patchCall![1]).toMatchObject({
              configOverrides: {
                confidenceThreshold: 0.85,
              },
            });
          });

          And("the AgentReconfigured audit payload has undefined previousOverrides", () => {
            const transitionCall = state.ctx.runMutation.mock.calls.find(
              (call: unknown[]) => call[0] === state.component.checkpoints.transitionLifecycle
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
        }
      );
    }
  );

  // ===========================================================================
  // Rule: createLifecycleHandlers factory
  // ===========================================================================

  Rule("createLifecycleHandlers factory returns all 5 handler functions", ({ RuleScenario }) => {
    RuleScenario("Factory returns all 5 handler functions", ({ When, Then }) => {
      let handlers: ReturnType<typeof createLifecycleHandlers>;

      When("createLifecycleHandlers is invoked with a mock component", () => {
        const component = createMockComponent();
        const config: LifecycleHandlerConfig = {
          agentComponent: component,
        };
        handlers = createLifecycleHandlers(config);
      });

      Then("the result contains all handler functions:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ handler: string }>(dataTable);
        for (const row of rows) {
          expect(typeof (handlers as Record<string, unknown>)[row.handler]).toBe("function");
        }
      });
    });

    RuleScenario("Factory handlers complete a start-pause-stop round trip", ({ When, Then }) => {
      let startResult: { success: boolean };
      let pauseResult: { success: boolean };
      let stopResult: { success: boolean };

      When("a round-trip lifecycle sequence is executed via factory handlers", async () => {
        const component = createMockComponent();
        const config: LifecycleHandlerConfig = {
          agentComponent: component,
        };
        const handlers = createLifecycleHandlers(config);

        // Start from stopped
        const startCtx = createMockCtx(component, "stopped");
        startResult = (await handlers.handleStartAgent(startCtx, {
          agentId: "round-trip-agent",
          correlationId: "corr_100",
        })) as { success: boolean };

        // Pause from active
        const pauseCtx = createMockCtx(component, "active");
        pauseResult = (await handlers.handlePauseAgent(pauseCtx, {
          agentId: "round-trip-agent",
          correlationId: "corr_101",
          reason: "Maintenance",
        })) as { success: boolean };

        // Stop from paused
        const stopCtx = createMockCtx(component, "paused");
        stopResult = (await handlers.handleStopAgent(stopCtx, {
          agentId: "round-trip-agent",
          correlationId: "corr_102",
        })) as { success: boolean };
      });

      Then("all three operations succeed", () => {
        expect(startResult.success).toBe(true);
        expect(pauseResult.success).toBe(true);
        expect(stopResult.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: Logger behavior
  // ===========================================================================

  Rule("Lifecycle handlers use logger correctly", ({ RuleScenario }) => {
    RuleScenario("Uses no-op logger when none provided", ({ Given, When, Then }) => {
      Given('an agent in "stopped" state', () => {
        state.component = createMockComponent();
        state.ctx = createMockCtx(state.component, "stopped");
      });

      When(
        'handleStartAgent is invoked without a logger with agentId "test-agent" and correlationId "corr_200"',
        async () => {
          const handler = handleStartAgent({
            agentComponent: state.component,
          });
          state.result = await handler(state.ctx, {
            agentId: "test-agent",
            correlationId: "corr_200",
          });
        }
      );

      Then("the result is successful", () => {
        const r = state.result as { success: boolean };
        expect(r.success).toBe(true);
      });
    });

    RuleScenario("Logs warning on invalid transition", ({ Given, And, When, Then }) => {
      Given('an agent in "active" state', () => {
        state.component = createMockComponent();
        state.ctx = createMockCtx(state.component, "active");
      });

      And("a logger is attached", () => {
        state.logger = createMockLogger();
      });

      When(
        'handleStartAgent is invoked with logger with agentId "test-agent" and correlationId "corr_201"',
        async () => {
          const handler = handleStartAgent({
            agentComponent: state.component,
            logger: state.logger,
          });
          await handler(state.ctx, {
            agentId: "test-agent",
            correlationId: "corr_201",
          });
        }
      );

      Then(
        'the logger warn was called with "Invalid lifecycle transition" and command "StartAgent" and currentState "active"',
        () => {
          expect((state.logger as Logger).warn).toHaveBeenCalledWith(
            "Invalid lifecycle transition",
            expect.objectContaining({
              agentId: "test-agent",
              command: "StartAgent",
              currentState: "active",
            })
          );
        }
      );
    });
  });
});
