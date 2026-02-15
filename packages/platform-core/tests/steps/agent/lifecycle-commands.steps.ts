/**
 * Lifecycle Commands - Step Definitions
 *
 * BDD step definitions for agent lifecycle command types, error codes,
 * result types, and Convex validator exports including:
 * - Command type construction with discriminated unions
 * - AGENT_LIFECYCLE_ERROR_CODES constants
 * - Success and failure result type construction
 * - Convex validators exist and are defined
 *
 * Mechanical migration from tests/unit/agent/lifecycle-commands.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

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
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Validator Lookup
// =============================================================================

const validatorMap: Record<string, unknown> = {
  lifecycleStateValidator,
  costBudgetOverridesValidator,
  rateLimitOverridesValidator,
  configOverridesValidator,
  startAgentArgsValidator,
  pauseAgentArgsValidator,
  resumeAgentArgsValidator,
  stopAgentArgsValidator,
  reconfigureAgentArgsValidator,
};

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  command:
    | StartAgentCommand
    | PauseAgentCommand
    | ResumeAgentCommand
    | StopAgentCommand
    | ReconfigureAgentCommand
    | AgentLifecycleCommand
    | null;
  overrides: AgentConfigOverrides | null;
  result: AgentLifecycleSuccess | AgentLifecycleFailure | AgentLifecycleResult | null;
  unreachableReached: boolean;
}

function createInitialState(): TestState {
  return {
    command: null,
    overrides: null,
    result: null,
    unreachableReached: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/lifecycle-commands.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: Command types construct with correct discriminated union fields
  // ===========================================================================

  Rule("Command types construct with correct discriminated union fields", ({ RuleScenario }) => {
    RuleScenario("StartAgentCommand carries type and required fields", ({ Given, Then }) => {
      Given(
        'a StartAgentCommand with commandId "cmd-001" agentId "agent-001" correlationId "corr-001"',
        () => {
          state.command = {
            type: "StartAgent",
            commandId: "cmd-001",
            agentId: "agent-001",
            correlationId: "corr-001",
          } satisfies StartAgentCommand;
        }
      );

      Then("the command has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const prop = row["property"] as keyof typeof state.command;
          expect((state.command as Record<string, unknown>)[prop]).toBe(row["value"]);
        }
      });
    });

    RuleScenario(
      "PauseAgentCommand carries optional reason when provided",
      ({ Given, Then, And }) => {
        Given(
          'a PauseAgentCommand with commandId "cmd-002" agentId "agent-001" correlationId "corr-002" reason "maintenance window"',
          () => {
            state.command = {
              type: "PauseAgent",
              commandId: "cmd-002",
              agentId: "agent-001",
              correlationId: "corr-002",
              reason: "maintenance window",
            } satisfies PauseAgentCommand;
          }
        );

        Then('the command type is "PauseAgent"', () => {
          expect((state.command as PauseAgentCommand).type).toBe("PauseAgent");
        });

        And('the command reason is "maintenance window"', () => {
          expect((state.command as PauseAgentCommand).reason).toBe("maintenance window");
        });
      }
    );

    RuleScenario("PauseAgentCommand has undefined reason when omitted", ({ Given, Then }) => {
      Given(
        'a PauseAgentCommand with commandId "cmd-003" agentId "agent-001" correlationId "corr-003" and no reason',
        () => {
          state.command = {
            type: "PauseAgent",
            commandId: "cmd-003",
            agentId: "agent-001",
            correlationId: "corr-003",
          } satisfies PauseAgentCommand;
        }
      );

      Then("the command reason is undefined", () => {
        expect((state.command as PauseAgentCommand).reason).toBeUndefined();
      });
    });

    RuleScenario("ResumeAgentCommand carries correct type", ({ Given, Then }) => {
      Given(
        'a ResumeAgentCommand with commandId "cmd-004" agentId "agent-001" correlationId "corr-004"',
        () => {
          state.command = {
            type: "ResumeAgent",
            commandId: "cmd-004",
            agentId: "agent-001",
            correlationId: "corr-004",
          } satisfies ResumeAgentCommand;
        }
      );

      Then('the command type is "ResumeAgent"', () => {
        expect((state.command as ResumeAgentCommand).type).toBe("ResumeAgent");
      });
    });

    RuleScenario(
      "StopAgentCommand carries optional reason when provided",
      ({ Given, Then, And }) => {
        Given(
          'a StopAgentCommand with commandId "cmd-005" agentId "agent-001" correlationId "corr-005" reason "budget exceeded"',
          () => {
            state.command = {
              type: "StopAgent",
              commandId: "cmd-005",
              agentId: "agent-001",
              correlationId: "corr-005",
              reason: "budget exceeded",
            } satisfies StopAgentCommand;
          }
        );

        Then('the command type is "StopAgent"', () => {
          expect((state.command as StopAgentCommand).type).toBe("StopAgent");
        });

        And('the command reason is "budget exceeded"', () => {
          expect((state.command as StopAgentCommand).reason).toBe("budget exceeded");
        });
      }
    );

    RuleScenario(
      "ReconfigureAgentCommand carries configOverrides with nested fields",
      ({ Given, Then, And }) => {
        Given("a ReconfigureAgentCommand with config overrides", () => {
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
          state.command = {
            type: "ReconfigureAgent",
            commandId: "cmd-006",
            agentId: "agent-001",
            correlationId: "corr-006",
            configOverrides: overrides,
          } satisfies ReconfigureAgentCommand;
        });

        Then('the command type is "ReconfigureAgent"', () => {
          expect((state.command as ReconfigureAgentCommand).type).toBe("ReconfigureAgent");
        });

        And(
          "the config overrides have the following properties:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const cmd = state.command as ReconfigureAgentCommand;
            for (const row of rows) {
              const prop = row["property"];
              const expected = Number(row["value"]);
              if (prop === "confidenceThreshold") {
                expect(cmd.configOverrides.confidenceThreshold).toBe(expected);
              } else if (prop === "rateLimits.maxRequestsPerMinute") {
                expect(cmd.configOverrides.rateLimits?.maxRequestsPerMinute).toBe(expected);
              } else if (prop === "rateLimits.costBudget.daily") {
                expect(cmd.configOverrides.rateLimits?.costBudget?.daily).toBe(expected);
              }
            }
          }
        );
      }
    );

    RuleScenario("Discriminated union narrows by type field at runtime", ({ Given, Then, And }) => {
      Given('an AgentLifecycleCommand of type PauseAgent with reason "test"', () => {
        state.command = {
          type: "PauseAgent",
          commandId: "cmd-007",
          agentId: "agent-001",
          correlationId: "corr-007",
          reason: "test",
        } as AgentLifecycleCommand;
      });

      Then('narrowing by type "PauseAgent" yields reason "test"', () => {
        const cmd = state.command as AgentLifecycleCommand;
        if (cmd.type === "PauseAgent") {
          expect(cmd.reason).toBe("test");
        }
      });

      And('narrowing by type "ReconfigureAgent" does not execute', () => {
        const cmd = state.command as AgentLifecycleCommand;
        if (cmd.type === "ReconfigureAgent") {
          expect.unreachable("Should not reach ReconfigureAgent branch");
        }
      });
    });
  });

  // ===========================================================================
  // Rule: AgentConfigOverrides allows partial and nested optional fields
  // ===========================================================================

  Rule("AgentConfigOverrides allows partial and nested optional fields", ({ RuleScenario }) => {
    RuleScenario("All fields are optional in AgentConfigOverrides", ({ Given, Then }) => {
      Given("an empty AgentConfigOverrides object", () => {
        state.overrides = {};
      });

      Then(
        "the overrides have all undefined top-level fields:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string }>(dataTable);
          for (const row of rows) {
            expect((state.overrides as Record<string, unknown>)[row["field"]]).toBeUndefined();
          }
        }
      );
    });

    RuleScenario("Partial rateLimits with only maxRequestsPerMinute", ({ Given, Then, And }) => {
      Given("an AgentConfigOverrides with only maxRequestsPerMinute 10", () => {
        state.overrides = {
          rateLimits: {
            maxRequestsPerMinute: 10,
          },
        };
      });

      Then("the overrides rateLimits.maxRequestsPerMinute is 10", () => {
        expect(state.overrides!.rateLimits?.maxRequestsPerMinute).toBe(10);
      });

      And("the overrides rateLimits.maxConcurrent is undefined", () => {
        expect(state.overrides!.rateLimits?.maxConcurrent).toBeUndefined();
      });

      And("the overrides rateLimits.costBudget is undefined", () => {
        expect(state.overrides!.rateLimits?.costBudget).toBeUndefined();
      });
    });

    RuleScenario("Nested costBudget overrides with only daily", ({ Given, Then, And }) => {
      Given("an AgentConfigOverrides with only costBudget daily 25", () => {
        state.overrides = {
          rateLimits: {
            costBudget: {
              daily: 25,
            },
          },
        };
      });

      Then("the overrides rateLimits.costBudget.daily is 25", () => {
        expect(state.overrides!.rateLimits?.costBudget?.daily).toBe(25);
      });

      And("the overrides rateLimits.costBudget.alertThreshold is undefined", () => {
        expect(state.overrides!.rateLimits?.costBudget?.alertThreshold).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // Rule: AGENT_LIFECYCLE_ERROR_CODES defines exactly the expected constants
  // ===========================================================================

  Rule("AGENT_LIFECYCLE_ERROR_CODES defines exactly the expected constants", ({ RuleScenario }) => {
    RuleScenario("Error codes contain expected values and count", ({ Then, And }) => {
      Then(
        "the AGENT_LIFECYCLE_ERROR_CODES have the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            key: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            expect((AGENT_LIFECYCLE_ERROR_CODES as Record<string, string>)[row["key"]]).toBe(
              row["value"]
            );
          }
        }
      );

      And("there are exactly 2 error codes", () => {
        expect(Object.keys(AGENT_LIFECYCLE_ERROR_CODES)).toHaveLength(2);
      });
    });
  });

  // ===========================================================================
  // Rule: Result types construct success and failure variants with discrimination
  // ===========================================================================

  Rule(
    "Result types construct success and failure variants with discrimination",
    ({ RuleScenario }) => {
      RuleScenario("Success result carries state transition fields", ({ Given, Then }) => {
        Given(
          'a success result with agentId "agent-001" previousState "stopped" newState "active"',
          () => {
            state.result = {
              success: true,
              agentId: "agent-001",
              previousState: "stopped",
              newState: "active",
            } satisfies AgentLifecycleSuccess;
          }
        );

        Then("the result has the following properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            const prop = row["property"];
            const actual = (state.result as Record<string, unknown>)[prop];
            const expected = row["value"];
            if (expected === "true") {
              expect(actual).toBe(true);
            } else {
              expect(actual).toBe(expected);
            }
          }
        });
      });

      RuleScenario(
        "Failure result with error code carries message and state",
        ({ Given, Then, And }) => {
          Given(
            'a failure result with agentId "agent-001" code "INVALID_LIFECYCLE_TRANSITION" message "Cannot PAUSE from stopped state" currentState "stopped"',
            () => {
              state.result = {
                success: false,
                agentId: "agent-001",
                code: "INVALID_LIFECYCLE_TRANSITION",
                message: "Cannot PAUSE from stopped state",
                currentState: "stopped",
              } satisfies AgentLifecycleFailure;
            }
          );

          Then("the result success is false", () => {
            expect(state.result!.success).toBe(false);
          });

          And("the failure has the following properties:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            const failure = state.result as AgentLifecycleFailure;
            for (const row of rows) {
              const prop = row["property"];
              if (prop === "code") {
                expect(failure.code).toBe(row["value"]);
              } else if (prop === "currentState") {
                expect(failure.currentState).toBe(row["value"]);
              }
            }
          });

          And('the failure message contains "PAUSE"', () => {
            const failure = state.result as AgentLifecycleFailure;
            expect(failure.message).toContain("PAUSE");
          });
        }
      );

      RuleScenario("Failure result without currentState for agent not found", ({ Given, Then }) => {
        Given(
          'a failure result with agentId "nonexistent" code "AGENT_NOT_FOUND" message "Agent not found" and no currentState',
          () => {
            state.result = {
              success: false,
              agentId: "nonexistent",
              code: "AGENT_NOT_FOUND",
              message: "Agent not found",
            } satisfies AgentLifecycleFailure;
          }
        );

        Then("the failure currentState is undefined", () => {
          expect((state.result as AgentLifecycleFailure).currentState).toBeUndefined();
        });
      });

      RuleScenario("Discriminated union narrows to success branch", ({ Given, Then }) => {
        Given(
          'a success result with agentId "agent-001" previousState "active" newState "paused"',
          () => {
            state.result = {
              success: true,
              agentId: "agent-001",
              previousState: "active",
              newState: "paused",
            } satisfies AgentLifecycleSuccess;
          }
        );

        Then('narrowing on success yields previousState "active" and newState "paused"', () => {
          const r = state.result as AgentLifecycleResult;
          if (r.success) {
            expect(r.previousState).toBe("active");
            expect(r.newState).toBe("paused");
          } else {
            expect.unreachable("Should not reach failure branch");
          }
        });
      });

      RuleScenario("Discriminated union narrows to failure branch", ({ Given, Then }) => {
        Given(
          'a failure result with agentId "agent-001" code "AGENT_NOT_FOUND" message "Agent not found" and no currentState',
          () => {
            state.result = {
              success: false,
              agentId: "agent-001",
              code: "AGENT_NOT_FOUND",
              message: "Agent not found",
            } satisfies AgentLifecycleFailure;
          }
        );

        Then('narrowing on failure yields code "AGENT_NOT_FOUND"', () => {
          const r = state.result as AgentLifecycleResult;
          if (!r.success) {
            expect(r.code).toBe("AGENT_NOT_FOUND");
          } else {
            expect.unreachable("Should not reach success branch");
          }
        });
      });
    }
  );

  // ===========================================================================
  // Rule: Convex validators are exported and defined
  // ===========================================================================

  Rule("Convex validators are exported and defined", ({ RuleScenario }) => {
    RuleScenario("All lifecycle validators are exported", ({ Then }) => {
      Then("the following validators are defined:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ validator: string }>(dataTable);
        for (const row of rows) {
          const name = row["validator"];
          expect(validatorMap[name], `Expected ${name} to be defined`).toBeDefined();
        }
      });
    });
  });
});
