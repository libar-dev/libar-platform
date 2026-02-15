/**
 * Checkpoint Extension - Step Definitions
 *
 * BDD step definitions for checkpoint lifecycle extensions including:
 * - isAgentInErrorRecovery — true for error_recovery, false for others
 * - resolveEffectiveConfig — base config, partial overrides, full overrides, deep merge
 * - applyCheckpointUpdate with configOverrides — merge behavior and preservation
 * - createInitialAgentCheckpoint — default values
 *
 * Mechanical migration from tests/unit/agent/checkpoint-extension.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi, beforeEach, afterEach } from "vitest";

import {
  isAgentInErrorRecovery,
  resolveEffectiveConfig,
  applyCheckpointUpdate,
  createInitialAgentCheckpoint,
  type AgentCheckpoint,
  type AgentCheckpointUpdate,
} from "../../../src/agent/checkpoint.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Helpers
// =============================================================================

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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  checkpoint: AgentCheckpoint | null;
  errorRecoveryResult: boolean | null;
  effectiveConfig: ReturnType<typeof resolveEffectiveConfig> | null;
  updatedCheckpoint: AgentCheckpoint | null;
  initialCheckpoint: AgentCheckpoint | null;
}

function createInitialState(): TestState {
  return {
    checkpoint: null,
    errorRecoveryResult: null,
    effectiveConfig: null,
    updatedCheckpoint: null,
    initialCheckpoint: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/checkpoint-extension.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: isAgentInErrorRecovery returns true only for error_recovery status
  // ===========================================================================

  Rule("isAgentInErrorRecovery returns true only for error_recovery status", ({ RuleScenario }) => {
    RuleScenario("Returns true for error_recovery status", ({ Given, When, Then }) => {
      Given('a checkpoint with status "error_recovery"', () => {
        state.checkpoint = makeCheckpoint({ status: "error_recovery" });
      });

      When("I check if the agent is in error recovery", () => {
        state.errorRecoveryResult = isAgentInErrorRecovery(state.checkpoint!);
      });

      Then("the error recovery result is true", () => {
        expect(state.errorRecoveryResult).toBe(true);
      });
    });

    RuleScenario("Returns false for active status", ({ Given, When, Then }) => {
      Given('a checkpoint with status "active"', () => {
        state.checkpoint = makeCheckpoint({ status: "active" });
      });

      When("I check if the agent is in error recovery", () => {
        state.errorRecoveryResult = isAgentInErrorRecovery(state.checkpoint!);
      });

      Then("the error recovery result is false", () => {
        expect(state.errorRecoveryResult).toBe(false);
      });
    });

    RuleScenario("Returns false for paused status", ({ Given, When, Then }) => {
      Given('a checkpoint with status "paused"', () => {
        state.checkpoint = makeCheckpoint({ status: "paused" });
      });

      When("I check if the agent is in error recovery", () => {
        state.errorRecoveryResult = isAgentInErrorRecovery(state.checkpoint!);
      });

      Then("the error recovery result is false", () => {
        expect(state.errorRecoveryResult).toBe(false);
      });
    });

    RuleScenario("Returns false for stopped status", ({ Given, When, Then }) => {
      Given('a checkpoint with status "stopped"', () => {
        state.checkpoint = makeCheckpoint({ status: "stopped" });
      });

      When("I check if the agent is in error recovery", () => {
        state.errorRecoveryResult = isAgentInErrorRecovery(state.checkpoint!);
      });

      Then("the error recovery result is false", () => {
        expect(state.errorRecoveryResult).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: resolveEffectiveConfig returns base config when no overrides provided
  // ===========================================================================

  Rule(
    "resolveEffectiveConfig returns base config when no overrides provided",
    ({ RuleScenario }) => {
      RuleScenario(
        "Returns base config values when overrides are undefined",
        ({ Given, When, Then, And }) => {
          Given(
            'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"',
            () => {
              // Base config stored implicitly — used in When step
            }
          );

          When("I resolve effective config without overrides", () => {
            state.effectiveConfig = resolveEffectiveConfig({
              confidenceThreshold: 0.8,
              patternWindow: { duration: "30d" },
            });
          });

          Then("the effective confidenceThreshold is 0.8", () => {
            expect(state.effectiveConfig!.confidenceThreshold).toBe(0.8);
          });

          And('the effective patternWindowDuration is "30d"', () => {
            expect(state.effectiveConfig!.patternWindowDuration).toBe("30d");
          });
        }
      );

      RuleScenario("Passes through base rateLimits when no overrides", ({ Given, When, Then }) => {
        Given(
          'a base config with confidenceThreshold 0.75 and patternWindowDuration "7d" and rateLimits',
          () => {
            // Base config with rateLimits — used in When step
          }
        );

        When("I resolve effective config without overrides", () => {
          state.effectiveConfig = resolveEffectiveConfig({
            confidenceThreshold: 0.75,
            patternWindow: { duration: "7d" },
            rateLimits: {
              maxRequestsPerMinute: 60,
              maxConcurrent: 5,
              costBudget: { daily: 100, alertThreshold: 0.8 },
            },
          });
        });

        Then("the effective rateLimits have the following values:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = Number(row["value"]);
            if (prop === "maxRequestsPerMinute") {
              expect(state.effectiveConfig!.rateLimits?.maxRequestsPerMinute).toBe(expected);
            } else if (prop === "maxConcurrent") {
              expect(state.effectiveConfig!.rateLimits?.maxConcurrent).toBe(expected);
            } else if (prop === "costBudget.daily") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(expected);
            } else if (prop === "costBudget.alertThreshold") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.alertThreshold).toBe(expected);
            }
          }
        });
      });

      RuleScenario(
        "Omits rateLimits when base has none and no overrides",
        ({ Given, When, Then }) => {
          Given('a base config with confidenceThreshold 0.5 and patternWindowDuration "1d"', () => {
            // No rateLimits in base
          });

          When("I resolve effective config without overrides", () => {
            state.effectiveConfig = resolveEffectiveConfig({
              confidenceThreshold: 0.5,
              patternWindow: { duration: "1d" },
            });
          });

          Then("the effective rateLimits are undefined", () => {
            expect(state.effectiveConfig!.rateLimits).toBeUndefined();
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: resolveEffectiveConfig applies partial overrides
  // ===========================================================================

  Rule(
    "resolveEffectiveConfig applies partial overrides while preserving other values",
    ({ RuleScenario }) => {
      RuleScenario(
        "Overrides confidenceThreshold while preserving patternWindowDuration",
        ({ Given, When, Then, And }) => {
          Given(
            'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"',
            () => {
              // Base config
            }
          );

          When("I resolve effective config with confidenceThreshold override 0.95", () => {
            state.effectiveConfig = resolveEffectiveConfig(
              {
                confidenceThreshold: 0.8,
                patternWindow: { duration: "30d" },
              },
              { confidenceThreshold: 0.95 }
            );
          });

          Then("the effective confidenceThreshold is 0.95", () => {
            expect(state.effectiveConfig!.confidenceThreshold).toBe(0.95);
          });

          And('the effective patternWindowDuration is "30d"', () => {
            expect(state.effectiveConfig!.patternWindowDuration).toBe("30d");
          });
        }
      );

      RuleScenario(
        "Overrides patternWindowDuration while preserving confidenceThreshold",
        ({ Given, When, Then, And }) => {
          Given(
            'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"',
            () => {
              // Base config
            }
          );

          When('I resolve effective config with patternWindowDuration override "7d"', () => {
            state.effectiveConfig = resolveEffectiveConfig(
              {
                confidenceThreshold: 0.8,
                patternWindow: { duration: "30d" },
              },
              { patternWindowDuration: "7d" }
            );
          });

          Then("the effective confidenceThreshold is 0.8", () => {
            expect(state.effectiveConfig!.confidenceThreshold).toBe(0.8);
          });

          And('the effective patternWindowDuration is "7d"', () => {
            expect(state.effectiveConfig!.patternWindowDuration).toBe("7d");
          });
        }
      );

      RuleScenario(
        "Overrides rateLimits.maxRequestsPerMinute while preserving base costBudget",
        ({ Given, When, Then }) => {
          Given(
            'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits',
            () => {
              // Base config with rateLimits
            }
          );

          When(
            "I resolve effective config with rateLimits maxRequestsPerMinute override 120",
            () => {
              state.effectiveConfig = resolveEffectiveConfig(
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
            }
          );

          Then("the effective rateLimits have the following values:", (_ctx: unknown, table: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(table);
            for (const row of rows) {
              const prop = row["property"];
              const expected = Number(row["value"]);
              if (prop === "maxRequestsPerMinute") {
                expect(state.effectiveConfig!.rateLimits?.maxRequestsPerMinute).toBe(expected);
              } else if (prop === "costBudget.daily") {
                expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(expected);
              } else if (prop === "costBudget.alertThreshold") {
                expect(state.effectiveConfig!.rateLimits?.costBudget?.alertThreshold).toBe(
                  expected
                );
              }
            }
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: resolveEffectiveConfig deep-merges rateLimits.costBudget
  // ===========================================================================

  Rule("resolveEffectiveConfig deep-merges rateLimits.costBudget", ({ RuleScenario }) => {
    RuleScenario(
      "Deep-merges costBudget.daily while preserving costBudget.alertThreshold",
      ({ Given, When, Then }) => {
        Given(
          'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits',
          () => {
            // Base config with rateLimits
          }
        );

        When("I resolve effective config with costBudget daily override 200", () => {
          state.effectiveConfig = resolveEffectiveConfig(
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
        });

        Then("the effective rateLimits have the following values:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = Number(row["value"]);
            if (prop === "costBudget.daily") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(expected);
            } else if (prop === "costBudget.alertThreshold") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.alertThreshold).toBe(expected);
            }
          }
        });
      }
    );

    RuleScenario(
      "Deep-merges costBudget.alertThreshold while preserving costBudget.daily",
      ({ Given, When, Then }) => {
        Given(
          'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits',
          () => {
            // Base config with rateLimits
          }
        );

        When("I resolve effective config with costBudget alertThreshold override 0.95", () => {
          state.effectiveConfig = resolveEffectiveConfig(
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
        });

        Then("the effective rateLimits have the following values:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = Number(row["value"]);
            if (prop === "costBudget.daily") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(expected);
            } else if (prop === "costBudget.alertThreshold") {
              expect(state.effectiveConfig!.rateLimits?.costBudget?.alertThreshold).toBe(expected);
            }
          }
        });
      }
    );
  });

  // ===========================================================================
  // Rule: resolveEffectiveConfig fully overrides all config values
  // ===========================================================================

  Rule("resolveEffectiveConfig fully overrides all config values", ({ RuleScenario }) => {
    RuleScenario("Fully overrides all config values", ({ Given, When, Then }) => {
      Given(
        'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits',
        () => {
          // Base config with rateLimits
        }
      );

      When("I resolve effective config with full overrides", () => {
        state.effectiveConfig = resolveEffectiveConfig(
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
      });

      Then("the resolved config has the following values:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(table);
        for (const row of rows) {
          const prop = row["property"];
          const expected = row["value"];
          if (prop === "confidenceThreshold") {
            expect(state.effectiveConfig!.confidenceThreshold).toBe(Number(expected));
          } else if (prop === "patternWindowDuration") {
            expect(state.effectiveConfig!.patternWindowDuration).toBe(expected);
          } else if (prop === "maxRequestsPerMinute") {
            expect(state.effectiveConfig!.rateLimits?.maxRequestsPerMinute).toBe(Number(expected));
          } else if (prop === "maxConcurrent") {
            expect(state.effectiveConfig!.rateLimits?.maxConcurrent).toBe(Number(expected));
          } else if (prop === "queueDepth") {
            expect(state.effectiveConfig!.rateLimits?.queueDepth).toBe(Number(expected));
          } else if (prop === "costBudget.daily") {
            expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(Number(expected));
          } else if (prop === "costBudget.alertThreshold") {
            expect(state.effectiveConfig!.rateLimits?.costBudget?.alertThreshold).toBe(
              Number(expected)
            );
          }
        }
      });
    });
  });

  // ===========================================================================
  // Rule: resolveEffectiveConfig handles edge cases
  // ===========================================================================

  Rule("resolveEffectiveConfig handles edge cases", ({ RuleScenario }) => {
    RuleScenario("Adds rateLimits via overrides when base has none", ({ Given, When, Then }) => {
      Given('a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"', () => {
        // Base config without rateLimits
      });

      When("I resolve effective config adding rateLimits via overrides", () => {
        state.effectiveConfig = resolveEffectiveConfig(
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
      });

      Then("the effective rateLimits have the following values:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(table);
        for (const row of rows) {
          const prop = row["property"];
          const expected = Number(row["value"]);
          if (prop === "maxRequestsPerMinute") {
            expect(state.effectiveConfig!.rateLimits?.maxRequestsPerMinute).toBe(expected);
          } else if (prop === "costBudget.daily") {
            expect(state.effectiveConfig!.rateLimits?.costBudget?.daily).toBe(expected);
          }
        }
      });
    });

    RuleScenario(
      "Empty overrides object returns base config values",
      ({ Given, When, Then, And }) => {
        Given(
          'a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and base rateLimits only maxRequestsPerMinute 60',
          () => {
            // Base config with only maxRequestsPerMinute
          }
        );

        When("I resolve effective config with empty overrides", () => {
          state.effectiveConfig = resolveEffectiveConfig(
            {
              confidenceThreshold: 0.8,
              patternWindow: { duration: "30d" },
              rateLimits: { maxRequestsPerMinute: 60 },
            },
            {}
          );
        });

        Then("the effective confidenceThreshold is 0.8", () => {
          expect(state.effectiveConfig!.confidenceThreshold).toBe(0.8);
        });

        And('the effective patternWindowDuration is "30d"', () => {
          expect(state.effectiveConfig!.patternWindowDuration).toBe("30d");
        });

        And("the effective rateLimits maxRequestsPerMinute is 60", () => {
          expect(state.effectiveConfig!.rateLimits?.maxRequestsPerMinute).toBe(60);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: applyCheckpointUpdate merges configOverrides correctly
  // ===========================================================================

  Rule("applyCheckpointUpdate merges configOverrides correctly", ({ RuleScenario }) => {
    RuleScenario(
      "Applies configOverrides to a checkpoint without existing overrides",
      ({ Given, When, Then }) => {
        Given("a checkpoint without configOverrides", () => {
          state.checkpoint = makeCheckpoint();
        });

        When("I apply an update with configOverrides confidenceThreshold 0.95", () => {
          const update: AgentCheckpointUpdate = {
            configOverrides: { confidenceThreshold: 0.95 },
          };
          state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
        });

        Then("the result configOverrides confidenceThreshold is 0.95", () => {
          expect(state.updatedCheckpoint!.configOverrides?.confidenceThreshold).toBe(0.95);
        });
      }
    );

    RuleScenario("Merges new configOverrides with existing overrides", ({ Given, When, Then }) => {
      Given("a checkpoint with configOverrides confidenceThreshold 0.8", () => {
        state.checkpoint = makeCheckpoint({
          configOverrides: { confidenceThreshold: 0.8 },
        });
      });

      When('I apply an update with configOverrides patternWindowDuration "7d"', () => {
        const update: AgentCheckpointUpdate = {
          configOverrides: { patternWindowDuration: "7d" },
        };
        state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
      });

      Then("the result configOverrides has the following values:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(table);
        for (const row of rows) {
          const prop = row["property"];
          const expected = row["value"];
          if (prop === "confidenceThreshold") {
            expect(state.updatedCheckpoint!.configOverrides?.confidenceThreshold).toBe(
              Number(expected)
            );
          } else if (prop === "patternWindowDuration") {
            expect(state.updatedCheckpoint!.configOverrides?.patternWindowDuration).toBe(expected);
          } else if (prop === "rateLimits.maxRequestsPerMinute") {
            expect(state.updatedCheckpoint!.configOverrides?.rateLimits?.maxRequestsPerMinute).toBe(
              Number(expected)
            );
          } else if (prop === "rateLimits.costBudget.daily") {
            expect(state.updatedCheckpoint!.configOverrides?.rateLimits?.costBudget?.daily).toBe(
              Number(expected)
            );
          } else if (prop === "rateLimits.costBudget.alertThreshold") {
            expect(
              state.updatedCheckpoint!.configOverrides?.rateLimits?.costBudget?.alertThreshold
            ).toBe(Number(expected));
          }
        }
      });
    });

    RuleScenario("Update overrides take precedence over existing", ({ Given, When, Then }) => {
      Given("a checkpoint with configOverrides confidenceThreshold 0.8", () => {
        state.checkpoint = makeCheckpoint({
          configOverrides: { confidenceThreshold: 0.8 },
        });
      });

      When("I apply an update with configOverrides confidenceThreshold 0.99", () => {
        const update: AgentCheckpointUpdate = {
          configOverrides: { confidenceThreshold: 0.99 },
        };
        state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
      });

      Then("the result configOverrides confidenceThreshold is 0.99", () => {
        expect(state.updatedCheckpoint!.configOverrides?.confidenceThreshold).toBe(0.99);
      });
    });

    RuleScenario(
      "Preserves existing configOverrides when update has no overrides",
      ({ Given, When, Then, And }) => {
        Given(
          "a checkpoint with configOverrides confidenceThreshold 0.9 and rateLimits maxRequestsPerMinute 30",
          () => {
            state.checkpoint = makeCheckpoint({
              configOverrides: {
                confidenceThreshold: 0.9,
                rateLimits: { maxRequestsPerMinute: 30 },
              },
            });
          }
        );

        When('I apply an update with status "paused" only', () => {
          const update: AgentCheckpointUpdate = {
            status: "paused",
          };
          state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
        });

        Then("the result configOverrides has the following values:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = row["value"];
            if (prop === "confidenceThreshold") {
              expect(state.updatedCheckpoint!.configOverrides?.confidenceThreshold).toBe(
                Number(expected)
              );
            } else if (prop === "rateLimits.maxRequestsPerMinute") {
              expect(
                state.updatedCheckpoint!.configOverrides?.rateLimits?.maxRequestsPerMinute
              ).toBe(Number(expected));
            }
          }
        });

        And('the result status is "paused"', () => {
          expect(state.updatedCheckpoint!.status).toBe("paused");
        });
      }
    );

    RuleScenario(
      "Deep-merges rateLimits.costBudget in checkpoint overrides",
      ({ Given, When, Then }) => {
        Given(
          "a checkpoint with configOverrides rateLimits maxRequestsPerMinute 60 and costBudget daily 100 alertThreshold 0.8",
          () => {
            state.checkpoint = makeCheckpoint({
              configOverrides: {
                rateLimits: {
                  maxRequestsPerMinute: 60,
                  costBudget: { daily: 100, alertThreshold: 0.8 },
                },
              },
            });
          }
        );

        When("I apply an update with configOverrides costBudget daily 200", () => {
          const update: AgentCheckpointUpdate = {
            configOverrides: {
              rateLimits: {
                costBudget: { daily: 200 },
              },
            },
          };
          state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
        });

        Then("the result configOverrides has the following values:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = Number(row["value"]);
            if (prop === "rateLimits.costBudget.daily") {
              expect(state.updatedCheckpoint!.configOverrides?.rateLimits?.costBudget?.daily).toBe(
                expected
              );
            } else if (prop === "rateLimits.costBudget.alertThreshold") {
              expect(
                state.updatedCheckpoint!.configOverrides?.rateLimits?.costBudget?.alertThreshold
              ).toBe(expected);
            }
          }
        });
      }
    );

    RuleScenario("Updates updatedAt timestamp", ({ Given, When, Then }) => {
      Given("a checkpoint without configOverrides", () => {
        state.checkpoint = makeCheckpoint();
      });

      When("I apply an update with lastProcessedPosition 20", () => {
        const update: AgentCheckpointUpdate = {
          lastProcessedPosition: 20,
        };
        state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
      });

      Then("the result updatedAt equals the current time", () => {
        expect(state.updatedCheckpoint!.updatedAt).toBe(Date.now());
      });
    });

    RuleScenario("Increments eventsProcessed count", ({ Given, When, Then }) => {
      Given("a checkpoint with eventsProcessed 10", () => {
        state.checkpoint = makeCheckpoint({ eventsProcessed: 10 });
      });

      When("I apply an update with incrementEventsProcessed 5", () => {
        const update: AgentCheckpointUpdate = {
          incrementEventsProcessed: 5,
        };
        state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
      });

      Then("the result eventsProcessed is 15", () => {
        expect(state.updatedCheckpoint!.eventsProcessed).toBe(15);
      });
    });

    RuleScenario(
      "Preserves eventsProcessed when no increment provided",
      ({ Given, When, Then }) => {
        Given("a checkpoint with eventsProcessed 10", () => {
          state.checkpoint = makeCheckpoint({ eventsProcessed: 10 });
        });

        When('I apply an update with status "paused" only', () => {
          const update: AgentCheckpointUpdate = {
            status: "paused",
          };
          state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
        });

        Then("the result eventsProcessed is 10", () => {
          expect(state.updatedCheckpoint!.eventsProcessed).toBe(10);
        });
      }
    );

    RuleScenario(
      "Does not add configOverrides key when neither existing nor update have them",
      ({ Given, When, Then }) => {
        Given("a checkpoint without configOverrides", () => {
          state.checkpoint = makeCheckpoint();
        });

        When("I apply an update with lastProcessedPosition 20", () => {
          const update: AgentCheckpointUpdate = {
            lastProcessedPosition: 20,
          };
          state.updatedCheckpoint = applyCheckpointUpdate(state.checkpoint!, update);
        });

        Then("the result configOverrides are undefined", () => {
          expect(state.updatedCheckpoint!.configOverrides).toBeUndefined();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: createInitialAgentCheckpoint produces correct defaults
  // ===========================================================================

  Rule("createInitialAgentCheckpoint produces correct defaults", ({ RuleScenario }) => {
    RuleScenario(
      "Creates checkpoint with sentinel lastProcessedPosition of -1",
      ({ When, Then }) => {
        When(
          'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
          () => {
            state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
          }
        );

        Then("the initial checkpoint lastProcessedPosition is -1", () => {
          expect(state.initialCheckpoint!.lastProcessedPosition).toBe(-1);
        });
      }
    );

    RuleScenario("Creates checkpoint with active status", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
        () => {
          state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
        }
      );

      Then('the initial checkpoint status is "active"', () => {
        expect(state.initialCheckpoint!.status).toBe("active");
      });
    });

    RuleScenario("Creates checkpoint with zero events processed", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
        () => {
          state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
        }
      );

      Then("the initial checkpoint eventsProcessed is 0", () => {
        expect(state.initialCheckpoint!.eventsProcessed).toBe(0);
      });
    });

    RuleScenario("Creates checkpoint with empty lastEventId", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
        () => {
          state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
        }
      );

      Then('the initial checkpoint lastEventId is ""', () => {
        expect(state.initialCheckpoint!.lastEventId).toBe("");
      });
    });

    RuleScenario("Sets updatedAt to current time", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
        () => {
          state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
        }
      );

      Then("the initial checkpoint updatedAt equals the current time", () => {
        expect(state.initialCheckpoint!.updatedAt).toBe(Date.now());
      });
    });

    RuleScenario("Preserves agentId and subscriptionId", ({ When, Then }) => {
      When('I create an initial checkpoint for agent "my-agent" and subscription "my-sub"', () => {
        state.initialCheckpoint = createInitialAgentCheckpoint("my-agent", "my-sub");
      });

      Then("the initial checkpoint has the following identity values:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(table);
        for (const row of rows) {
          const prop = row["property"];
          const expected = row["value"];
          if (prop === "agentId") {
            expect(state.initialCheckpoint!.agentId).toBe(expected);
          } else if (prop === "subscriptionId") {
            expect(state.initialCheckpoint!.subscriptionId).toBe(expected);
          }
        }
      });
    });

    RuleScenario("Does not include configOverrides", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "agent-001" and subscription "sub-001"',
        () => {
          state.initialCheckpoint = createInitialAgentCheckpoint("agent-001", "sub-001");
        }
      );

      Then("the initial checkpoint configOverrides are undefined", () => {
        expect(state.initialCheckpoint!.configOverrides).toBeUndefined();
      });
    });
  });
});
