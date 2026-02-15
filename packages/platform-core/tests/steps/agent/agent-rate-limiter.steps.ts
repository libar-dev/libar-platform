/**
 * Agent Rate Limiter - Step Definitions
 *
 * BDD step definitions for withRateLimit() including:
 * - Allowed: operation executes and result returned
 * - Denied: operation NOT called, retryAfterMs returned
 * - Rate limit key is agent-scoped
 * - Operation error propagation
 * - Logging outcomes
 *
 * Mechanical migration from tests/unit/agent/agent-rate-limiter.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  withRateLimit,
  type AgentRateLimiterConfig,
} from "../../../src/agent/agent-rate-limiter.js";
import type { Logger } from "../../../src/logging/types.js";

// =============================================================================
// Test Helpers
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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  config: AgentRateLimiterConfig | null;
  operation: ReturnType<typeof vi.fn> | null;
  result: Awaited<ReturnType<typeof withRateLimit>> | null;
  error: Error | null;
  checkRateLimit: ReturnType<typeof vi.fn> | null;
  logger: Logger | null;
}

function createInitialState(): TestState {
  return {
    config: null,
    operation: null,
    result: null,
    error: null,
    checkRateLimit: null,
    logger: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/agent-rate-limiter.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: Allowed operations execute and return their result
  // ==========================================================================

  Rule("Allowed operations execute and return their result", ({ RuleScenario }) => {
    RuleScenario(
      "Operation executes and result is returned when allowed",
      ({ Given, And, When, Then }) => {
        Given('a rate limiter config for agent "test-agent" that allows requests', () => {
          state.checkRateLimit = vi.fn().mockResolvedValue({ ok: true });
          state.config = {
            agentId: "test-agent",
            checkRateLimit: state.checkRateLimit,
          };
        });

        And('an operation that returns analysis "success" with score 0.95', () => {
          state.operation = vi.fn().mockResolvedValue({ analysis: "success", score: 0.95 });
        });

        When("I call withRateLimit", async () => {
          state.result = await withRateLimit(state.config!, state.operation!);
        });

        Then("the result indicates allowed is true", () => {
          expect(state.result!.allowed).toBe(true);
        });

        And('the result value has analysis "success" and score 0.95', () => {
          if (state.result!.allowed) {
            expect(state.result!.result).toEqual({ analysis: "success", score: 0.95 });
          }
        });

        And("the operation was called 1 time", () => {
          expect(state.operation).toHaveBeenCalledTimes(1);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Denied operations are skipped with retry information
  // ==========================================================================

  Rule("Denied operations are skipped with retry information", ({ RuleScenario }) => {
    RuleScenario("Operation is not executed when denied", ({ Given, And, When, Then }) => {
      Given(
        'a rate limiter config for agent "test-agent" that denies with retryAfterMs 5000',
        () => {
          state.checkRateLimit = vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 5000 });
          state.config = {
            agentId: "test-agent",
            checkRateLimit: state.checkRateLimit,
          };
        }
      );

      And("a mock operation", () => {
        state.operation = vi.fn();
      });

      When("I call withRateLimit", async () => {
        state.result = await withRateLimit(state.config!, state.operation!);
      });

      Then("the result indicates allowed is false", () => {
        expect(state.result!.allowed).toBe(false);
      });

      And("the result retryAfterMs is 5000", () => {
        if (!state.result!.allowed) {
          expect(state.result!.retryAfterMs).toBe(5000);
        }
      });

      And("the operation was not called", () => {
        expect(state.operation).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Rule: Rate limit key is agent-scoped
  // ==========================================================================

  Rule("Rate limit key is agent-scoped", ({ RuleScenario }) => {
    RuleScenario("checkRateLimit receives agent-scoped key", ({ Given, When, Then }) => {
      Given('a rate limiter config for agent "churn-risk-agent" that allows requests', () => {
        state.checkRateLimit = vi.fn().mockResolvedValue({ ok: true });
        state.config = {
          agentId: "churn-risk-agent",
          checkRateLimit: state.checkRateLimit,
        };
      });

      When("I call withRateLimit with a simple operation", async () => {
        await withRateLimit(state.config!, async () => "result");
      });

      Then('checkRateLimit was called with key "agent:churn-risk-agent"', () => {
        expect(state.checkRateLimit).toHaveBeenCalledWith("agent:churn-risk-agent");
      });
    });
  });

  // ==========================================================================
  // Rule: Errors propagate correctly
  // ==========================================================================

  Rule("Errors propagate correctly", ({ RuleScenario }) => {
    RuleScenario("Operation errors propagate to caller", ({ Given, And, When, Then }) => {
      Given('a rate limiter config for agent "test-agent" that allows requests', () => {
        state.checkRateLimit = vi.fn().mockResolvedValue({ ok: true });
        state.config = {
          agentId: "test-agent",
          checkRateLimit: state.checkRateLimit,
        };
      });

      And('an operation that throws "LLM API crashed"', () => {
        state.operation = vi.fn().mockRejectedValue(new Error("LLM API crashed"));
      });

      When("I call withRateLimit expecting an error", async () => {
        try {
          await withRateLimit(state.config!, state.operation!);
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('the error message is "LLM API crashed"', () => {
        expect(state.error).toBeTruthy();
        expect(state.error!.message).toBe("LLM API crashed");
      });
    });

    RuleScenario(
      "checkRateLimit callback errors propagate without calling operation",
      ({ Given, And, When, Then }) => {
        Given(
          'a rate limiter config for agent "test-agent" where checkRateLimit throws "Rate limiter store unavailable"',
          () => {
            state.checkRateLimit = vi
              .fn()
              .mockRejectedValue(new Error("Rate limiter store unavailable"));
            state.config = {
              agentId: "test-agent",
              checkRateLimit: state.checkRateLimit,
            };
          }
        );

        And("a mock operation", () => {
          state.operation = vi.fn();
        });

        When("I call withRateLimit expecting an error", async () => {
          try {
            await withRateLimit(state.config!, state.operation!);
          } catch (e) {
            state.error = e as Error;
          }
        });

        Then('the error message is "Rate limiter store unavailable"', () => {
          expect(state.error).toBeTruthy();
          expect(state.error!.message).toBe("Rate limiter store unavailable");
        });

        And("the operation was not called", () => {
          expect(state.operation).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Logging reflects rate limit outcomes
  // ==========================================================================

  Rule("Logging reflects rate limit outcomes", ({ RuleScenario }) => {
    RuleScenario("Warning is logged when rate limited", ({ Given, When, Then }) => {
      Given(
        'a rate limiter config with logger for agent "test-agent" that denies with retryAfterMs 3000',
        () => {
          state.logger = createMockLogger();
          state.checkRateLimit = vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 3000 });
          state.config = {
            agentId: "test-agent",
            checkRateLimit: state.checkRateLimit,
            logger: state.logger,
          };
        }
      );

      When("I call withRateLimit with a simple operation", async () => {
        await withRateLimit(state.config!, async () => "result");
      });

      Then(
        'the logger warned "Rate limited" with agentId "test-agent" and retryAfterMs 3000',
        () => {
          expect(state.logger!.warn).toHaveBeenCalledWith(
            "Rate limited",
            expect.objectContaining({
              agentId: "test-agent",
              retryAfterMs: 3000,
            })
          );
        }
      );
    });

    RuleScenario("Debug is logged when rate limit check passes", ({ Given, When, Then }) => {
      Given('a rate limiter config with logger for agent "test-agent" that allows requests', () => {
        state.logger = createMockLogger();
        state.checkRateLimit = vi.fn().mockResolvedValue({ ok: true });
        state.config = {
          agentId: "test-agent",
          checkRateLimit: state.checkRateLimit,
          logger: state.logger,
        };
      });

      When("I call withRateLimit with a simple operation", async () => {
        await withRateLimit(state.config!, async () => "result");
      });

      Then(
        'the logger logged debug "Rate limit passed, executing operation" with agentId "test-agent"',
        () => {
          expect(state.logger!.debug).toHaveBeenCalledWith(
            "Rate limit passed, executing operation",
            expect.objectContaining({
              agentId: "test-agent",
            })
          );
        }
      );
    });
  });
});
