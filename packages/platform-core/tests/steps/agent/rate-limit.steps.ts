/**
 * Rate Limit Module - Step Definitions
 *
 * BDD step definitions for the LLM rate limiting module including:
 * - Error codes validation
 * - Zod schema validation (CostBudgetSchema, AgentRateLimitConfigSchema)
 * - Config validation (validateRateLimitConfig)
 * - Factory functions (createDefaultRateLimitConfig, createRateLimitConfigWithBudget, createRateLimitError)
 * - Type guards (isRateLimitError, isRetryableError, isPermanentError)
 * - Exponential backoff calculation (calculateBackoffDelay)
 * - Budget helpers (wouldExceedBudget, isAtAlertThreshold)
 * - Effective config merging (getEffectiveRateLimitConfig)
 *
 * Mechanical migration from tests/unit/agent/rate-limit.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  RATE_LIMIT_ERROR_CODES,
  CostBudgetSchema,
  AgentRateLimitConfigSchema,
  validateRateLimitConfig,
  createDefaultRateLimitConfig,
  createRateLimitConfigWithBudget,
  createRateLimitError,
  DEFAULT_RATE_LIMIT_VALUES,
  isRateLimitError,
  isRetryableError,
  isPermanentError,
  calculateBackoffDelay,
  getEffectiveRateLimitConfig,
  wouldExceedBudget,
  isAtAlertThreshold,
} from "../../../src/agent/rate-limit.js";
import type { AgentRateLimitConfig } from "../../../src/agent/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  parseResult: { success: boolean } | null;
  validationResult: { valid: boolean; code?: string; message?: string } | null;
  config: AgentRateLimitConfig | null;
  error: {
    code: string;
    message: string;
    retryAfterMs?: number;
    context?: Record<string, unknown>;
  } | null;
  typeGuardResult: boolean | null;
  effectiveConfig: AgentRateLimitConfig | null;
}

function createInitialState(): TestState {
  return {
    parseResult: null,
    validationResult: null,
    config: null,
    error: null,
    typeGuardResult: null,
    effectiveConfig: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/rate-limit.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterAllScenarios }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterAllScenarios(() => {
    vi.restoreAllMocks();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module imports are validated at load time
    });
  });

  // ===========================================================================
  // Rule: Error codes enumerate all rate-limit failure modes
  // ===========================================================================

  Rule("Error codes enumerate all rate-limit failure modes", ({ RuleScenario }) => {
    RuleScenario("All expected error codes are present with correct values", ({ Then }) => {
      Then("RATE_LIMIT_ERROR_CODES contains all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ code: string; value: string }>(dataTable);
        for (const row of rows) {
          expect(RATE_LIMIT_ERROR_CODES[row.code as keyof typeof RATE_LIMIT_ERROR_CODES]).toBe(
            row.value
          );
        }
      });
    });

    RuleScenario("Error codes object has exactly 8 entries", ({ Then }) => {
      Then("RATE_LIMIT_ERROR_CODES has 8 entries", () => {
        expect(Object.keys(RATE_LIMIT_ERROR_CODES).length).toBe(8);
      });
    });
  });

  // ===========================================================================
  // Rule: CostBudgetSchema validates budget configuration
  // ===========================================================================

  Rule("CostBudgetSchema validates budget configuration", ({ RuleScenario }) => {
    RuleScenario("Accepts valid cost budget", ({ When, Then }) => {
      When("I parse a cost budget with daily 10 and alertThreshold 0.8", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 10,
          alertThreshold: 0.8,
        });
      });

      Then("the schema parse succeeds", () => {
        expect(state.parseResult!.success).toBe(true);
      });
    });

    RuleScenario("Rejects budget with zero daily", ({ When, Then }) => {
      When("I parse a cost budget with daily 0 and alertThreshold 0.8", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 0,
          alertThreshold: 0.8,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects budget with negative daily", ({ When, Then }) => {
      When("I parse a cost budget with daily -10 and alertThreshold 0.8", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: -10,
          alertThreshold: 0.8,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects budget with alertThreshold above 1", ({ When, Then }) => {
      When("I parse a cost budget with daily 10 and alertThreshold 1.5", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 10,
          alertThreshold: 1.5,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects budget with negative alertThreshold", ({ When, Then }) => {
      When("I parse a cost budget with daily 10 and alertThreshold -0.1", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 10,
          alertThreshold: -0.1,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Accepts alertThreshold at boundary 0", ({ When, Then }) => {
      When("I parse a cost budget with daily 10 and alertThreshold 0", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 10,
          alertThreshold: 0,
        });
      });

      Then("the schema parse succeeds", () => {
        expect(state.parseResult!.success).toBe(true);
      });
    });

    RuleScenario("Accepts alertThreshold at boundary 1", ({ When, Then }) => {
      When("I parse a cost budget with daily 10 and alertThreshold 1", () => {
        state.parseResult = CostBudgetSchema.safeParse({
          daily: 10,
          alertThreshold: 1,
        });
      });

      Then("the schema parse succeeds", () => {
        expect(state.parseResult!.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: AgentRateLimitConfigSchema validates rate limit configuration
  // ===========================================================================

  Rule("AgentRateLimitConfigSchema validates rate limit configuration", ({ RuleScenario }) => {
    RuleScenario("Accepts valid config with required fields only", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute 60", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: 60,
        });
      });

      Then("the schema parse succeeds", () => {
        expect(state.parseResult!.success).toBe(true);
      });
    });

    RuleScenario("Accepts config with all optional fields", ({ When, Then }) => {
      When(
        "I parse a full rate limit config with maxRequestsPerMinute 60 and maxConcurrent 5 and queueDepth 100 and budget",
        () => {
          state.parseResult = AgentRateLimitConfigSchema.safeParse({
            maxRequestsPerMinute: 60,
            maxConcurrent: 5,
            queueDepth: 100,
            costBudget: { daily: 10, alertThreshold: 0.8 },
          });
        }
      );

      Then("the schema parse succeeds", () => {
        expect(state.parseResult!.success).toBe(true);
      });
    });

    RuleScenario("Rejects config with zero maxRequestsPerMinute", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute 0", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects config with negative maxRequestsPerMinute", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute -10", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: -10,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects config with non-integer maxRequestsPerMinute", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute 60.5", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: 60.5,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects config with zero maxConcurrent", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 0", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: 60,
          maxConcurrent: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects config with zero queueDepth", ({ When, Then }) => {
      When("I parse a rate limit config with maxRequestsPerMinute 60 and queueDepth 0", () => {
        state.parseResult = AgentRateLimitConfigSchema.safeParse({
          maxRequestsPerMinute: 60,
          queueDepth: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.parseResult!.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: validateRateLimitConfig catches invalid configurations
  // ===========================================================================

  Rule("validateRateLimitConfig catches invalid configurations", ({ RuleScenario }) => {
    RuleScenario(
      "Returns invalid when maxRequestsPerMinute is undefined",
      ({ When, Then, And }) => {
        When("I validate a rate limit config with no maxRequestsPerMinute", () => {
          state.validationResult = validateRateLimitConfig({}) as typeof state.validationResult;
        });

        Then("the validation result is invalid", () => {
          expect(state.validationResult!.valid).toBe(false);
        });

        And('the validation error code is "INVALID_RATE_LIMIT_CONFIG"', () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.code).toBe(
              RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG
            );
          }
        });

        And('the validation error message contains "maxRequestsPerMinute"', () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.message).toContain("maxRequestsPerMinute");
          }
        });
      }
    );

    RuleScenario("Returns invalid when maxRequestsPerMinute is zero", ({ When, Then }) => {
      When("I validate a rate limit config with maxRequestsPerMinute 0", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: 0,
        }) as typeof state.validationResult;
      });

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when maxRequestsPerMinute is negative", ({ When, Then }) => {
      When("I validate a rate limit config with maxRequestsPerMinute -10", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: -10,
        }) as typeof state.validationResult;
      });

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario(
      "Returns invalid when maxRequestsPerMinute is not an integer",
      ({ When, Then }) => {
        When("I validate a rate limit config with maxRequestsPerMinute 60.5", () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60.5,
          }) as typeof state.validationResult;
        });

        Then("the validation result is invalid", () => {
          expect(state.validationResult!.valid).toBe(false);
        });
      }
    );

    RuleScenario("Returns valid for positive integer maxRequestsPerMinute", ({ When, Then }) => {
      When("I validate a rate limit config with maxRequestsPerMinute 60", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: 60,
        }) as typeof state.validationResult;
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns invalid when maxConcurrent is zero", ({ When, Then, And }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 0",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            maxConcurrent: 0,
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });

      And('the validation error message contains "maxConcurrent"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.message).toContain("maxConcurrent");
        }
      });
    });

    RuleScenario("Returns invalid when maxConcurrent is negative", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent -5",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            maxConcurrent: -5,
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when maxConcurrent is not an integer", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 5.5",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            maxConcurrent: 5.5,
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns valid when maxConcurrent is undefined", ({ When, Then }) => {
      When("I validate a rate limit config with maxRequestsPerMinute 60", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: 60,
        }) as typeof state.validationResult;
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns invalid when queueDepth is zero", ({ When, Then, And }) => {
      When("I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth 0", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: 60,
          queueDepth: 0,
        }) as typeof state.validationResult;
      });

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });

      And('the validation error message contains "queueDepth"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.message).toContain("queueDepth");
        }
      });
    });

    RuleScenario("Returns invalid when queueDepth is negative", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth -100",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            queueDepth: -100,
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when queueDepth is not an integer", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth 100.5",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            queueDepth: 100.5,
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when costBudget daily is zero", ({ When, Then, And }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 0 alertThreshold 0.8",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            costBudget: { daily: 0, alertThreshold: 0.8 },
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });

      And('the validation error message contains "daily"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.message).toContain("daily");
        }
      });
    });

    RuleScenario("Returns invalid when costBudget daily is negative", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily -10 alertThreshold 0.8",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            costBudget: { daily: -10, alertThreshold: 0.8 },
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario(
      "Returns invalid when costBudget alertThreshold is below 0",
      ({ When, Then, And }) => {
        When(
          "I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold -0.1",
          () => {
            state.validationResult = validateRateLimitConfig({
              maxRequestsPerMinute: 60,
              costBudget: { daily: 10, alertThreshold: -0.1 },
            }) as typeof state.validationResult;
          }
        );

        Then("the validation result is invalid", () => {
          expect(state.validationResult!.valid).toBe(false);
        });

        And('the validation error message contains "alertThreshold"', () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.message).toContain("alertThreshold");
          }
        });
      }
    );

    RuleScenario("Returns invalid when costBudget alertThreshold is above 1", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold 1.5",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            costBudget: { daily: 10, alertThreshold: 1.5 },
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns valid when costBudget is valid", ({ When, Then }) => {
      When(
        "I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold 0.8",
        () => {
          state.validationResult = validateRateLimitConfig({
            maxRequestsPerMinute: 60,
            costBudget: { daily: 10, alertThreshold: 0.8 },
          }) as typeof state.validationResult;
        }
      );

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns valid for complete valid config", ({ When, Then }) => {
      When("I validate a complete rate limit config", () => {
        state.validationResult = validateRateLimitConfig({
          maxRequestsPerMinute: 60,
          maxConcurrent: 5,
          queueDepth: 100,
          costBudget: { daily: 10, alertThreshold: 0.8 },
        }) as typeof state.validationResult;
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: createDefaultRateLimitConfig produces valid defaults
  // ===========================================================================

  Rule("createDefaultRateLimitConfig produces valid defaults", ({ RuleScenario }) => {
    RuleScenario("Default config has correct field values", ({ When, Then, And }) => {
      When("I create a default rate limit config", () => {
        state.config = createDefaultRateLimitConfig();
      });

      Then("the config maxRequestsPerMinute matches the default", () => {
        expect(state.config!.maxRequestsPerMinute).toBe(
          DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute
        );
      });

      And("the config maxConcurrent matches the default", () => {
        expect(state.config!.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
      });

      And("the config queueDepth matches the default", () => {
        expect(state.config!.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
      });

      And("the config has no costBudget", () => {
        expect(state.config!.costBudget).toBeUndefined();
      });
    });

    RuleScenario("Default config passes validation", ({ When, And, Then }) => {
      When("I create a default rate limit config", () => {
        state.config = createDefaultRateLimitConfig();
      });

      And("I validate the created config", () => {
        state.validationResult = validateRateLimitConfig(
          state.config!
        ) as typeof state.validationResult;
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: createRateLimitConfigWithBudget produces config with cost budget
  // ===========================================================================

  Rule("createRateLimitConfigWithBudget produces config with cost budget", ({ RuleScenario }) => {
    RuleScenario("Creates config with specified dailyBudget", ({ When, Then }) => {
      When("I create a rate limit config with dailyBudget 25", () => {
        state.config = createRateLimitConfigWithBudget({ dailyBudget: 25.0 });
      });

      Then("the config costBudget daily is 25", () => {
        expect(state.config!.costBudget?.daily).toBe(25.0);
      });
    });

    RuleScenario("Uses default alertThreshold when not specified", ({ When, Then }) => {
      When("I create a rate limit config with dailyBudget 10", () => {
        state.config = createRateLimitConfigWithBudget({ dailyBudget: 10.0 });
      });

      Then("the config costBudget alertThreshold is 0.8", () => {
        expect(state.config!.costBudget?.alertThreshold).toBe(0.8);
      });
    });

    RuleScenario("Uses specified alertThreshold", ({ When, Then }) => {
      When("I create a rate limit config with dailyBudget 10 and alertThreshold 0.5", () => {
        state.config = createRateLimitConfigWithBudget({
          dailyBudget: 10.0,
          alertThreshold: 0.5,
        });
      });

      Then("the config costBudget alertThreshold is 0.5", () => {
        expect(state.config!.costBudget?.alertThreshold).toBe(0.5);
      });
    });

    RuleScenario("Uses specified maxRequestsPerMinute", ({ When, Then }) => {
      When("I create a rate limit config with dailyBudget 10 and maxRequestsPerMinute 30", () => {
        state.config = createRateLimitConfigWithBudget({
          dailyBudget: 10.0,
          maxRequestsPerMinute: 30,
        });
      });

      Then("the config maxRequestsPerMinute is 30", () => {
        expect(state.config!.maxRequestsPerMinute).toBe(30);
      });
    });

    RuleScenario("Uses default maxRequestsPerMinute when not specified", ({ When, Then }) => {
      When("I create a rate limit config with dailyBudget 10", () => {
        state.config = createRateLimitConfigWithBudget({ dailyBudget: 10.0 });
      });

      Then("the config maxRequestsPerMinute matches the default", () => {
        expect(state.config!.maxRequestsPerMinute).toBe(
          DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute
        );
      });
    });

    RuleScenario("Includes all optional fields", ({ When, Then }) => {
      When(
        "I create a rate limit config with dailyBudget 10 and maxRequestsPerMinute 30 and maxConcurrent 3 and queueDepth 50 and alertThreshold 0.7",
        () => {
          state.config = createRateLimitConfigWithBudget({
            dailyBudget: 10.0,
            maxRequestsPerMinute: 30,
            maxConcurrent: 3,
            queueDepth: 50,
            alertThreshold: 0.7,
          });
        }
      );

      Then("the config has the following values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
        for (const row of rows) {
          const expected = Number(row.value);
          switch (row.field) {
            case "maxRequestsPerMinute":
              expect(state.config!.maxRequestsPerMinute).toBe(expected);
              break;
            case "maxConcurrent":
              expect(state.config!.maxConcurrent).toBe(expected);
              break;
            case "queueDepth":
              expect(state.config!.queueDepth).toBe(expected);
              break;
            case "costBudget.daily":
              expect(state.config!.costBudget?.daily).toBe(expected);
              break;
            case "costBudget.alertThreshold":
              expect(state.config!.costBudget?.alertThreshold).toBe(expected);
              break;
          }
        }
      });
    });
  });

  // ===========================================================================
  // Rule: createRateLimitError builds structured error objects
  // ===========================================================================

  Rule("createRateLimitError builds structured error objects", ({ RuleScenario }) => {
    RuleScenario("Creates error with code and message", ({ When, Then, And }) => {
      When(
        'I create a rate limit error with code "LLM_RATE_LIMITED" and message "Rate limit exceeded"',
        () => {
          state.error = createRateLimitError(
            RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
            "Rate limit exceeded"
          );
        }
      );

      Then('the error code is "LLM_RATE_LIMITED"', () => {
        expect(state.error!.code).toBe("LLM_RATE_LIMITED");
      });

      And('the error message is "Rate limit exceeded"', () => {
        expect(state.error!.message).toBe("Rate limit exceeded");
      });
    });

    RuleScenario(
      "Creates error without optional fields when not provided",
      ({ When, Then, And }) => {
        When(
          'I create a rate limit error with code "LLM_UNAVAILABLE" and message "Service unavailable"',
          () => {
            state.error = createRateLimitError(
              RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE,
              "Service unavailable"
            );
          }
        );

        Then("the error retryAfterMs is undefined", () => {
          expect(state.error!.retryAfterMs).toBeUndefined();
        });

        And("the error context is undefined", () => {
          expect(state.error!.context).toBeUndefined();
        });
      }
    );

    RuleScenario("Creates error with retryAfterMs when provided", ({ When, Then }) => {
      When(
        'I create a rate limit error with code "LLM_RATE_LIMITED" and message "Rate limited" and retryAfterMs 5000',
        () => {
          state.error = createRateLimitError(
            RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
            "Rate limited",
            { retryAfterMs: 5000 }
          );
        }
      );

      Then("the error retryAfterMs is 5000", () => {
        expect(state.error!.retryAfterMs).toBe(5000);
      });
    });

    RuleScenario("Creates error with context when provided", ({ When, Then }) => {
      When(
        'I create a rate limit error with code "QUEUE_OVERFLOW" and message "Queue full" and context queueSize 100 maxSize 100',
        () => {
          state.error = createRateLimitError(RATE_LIMIT_ERROR_CODES.QUEUE_OVERFLOW, "Queue full", {
            context: { queueSize: 100, maxSize: 100 },
          });
        }
      );

      Then("the error context equals queueSize 100 and maxSize 100", () => {
        expect(state.error!.context).toEqual({ queueSize: 100, maxSize: 100 });
      });
    });

    RuleScenario("Creates error with both retryAfterMs and context", ({ When, Then, And }) => {
      When(
        'I create a rate limit error with code "LLM_TIMEOUT" and message "Timeout" and retryAfterMs 10000 and context attempt 3',
        () => {
          state.error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT, "Timeout", {
            retryAfterMs: 10000,
            context: { attempt: 3 },
          });
        }
      );

      Then("the error retryAfterMs is 10000", () => {
        expect(state.error!.retryAfterMs).toBe(10000);
      });

      And("the error context equals attempt 3", () => {
        expect(state.error!.context).toEqual({ attempt: 3 });
      });
    });
  });

  // ===========================================================================
  // Rule: isRateLimitError identifies valid rate limit error objects
  // ===========================================================================

  Rule("isRateLimitError identifies valid rate limit error objects", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid rate limit error", ({ When, Then }) => {
      When("I check isRateLimitError for a valid LLM_RATE_LIMITED error", () => {
        const error = createRateLimitError(
          RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
          "Rate limit exceeded"
        );
        state.typeGuardResult = isRateLimitError(error);
      });

      Then("the type guard result is true", () => {
        expect(state.typeGuardResult).toBe(true);
      });
    });

    RuleScenario("Returns true for all known error codes", ({ Then }) => {
      Then("isRateLimitError returns true for all known error codes", () => {
        const codes = Object.values(RATE_LIMIT_ERROR_CODES);
        for (const code of codes) {
          const error = createRateLimitError(code, "Test error");
          expect(isRateLimitError(error)).toBe(true);
        }
      });
    });

    RuleScenario("Returns false for non-error values", ({ Then }) => {
      Then("isRateLimitError returns false for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          let value: unknown;
          switch (row.input) {
            case "null":
              value = null;
              break;
            case "undefined":
              value = undefined;
              break;
            case "string:error":
              value = "error";
              break;
            case "number:123":
              value = 123;
              break;
            case "boolean:true":
              value = true;
              break;
            case "object:message-only":
              value = { message: "error" };
              break;
            case "object:code-only":
              value = { code: "LLM_RATE_LIMITED" };
              break;
            case "object:non-string-code":
              value = { code: 123, message: "error" };
              break;
            case "object:unknown-code":
              value = { code: "UNKNOWN_CODE", message: "error" };
              break;
            case "Error:regular":
              value = new Error("error");
              break;
          }
          expect(isRateLimitError(value)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: isRetryableError identifies transient errors eligible for retry
  // ===========================================================================

  Rule("isRetryableError identifies transient errors eligible for retry", ({ RuleScenario }) => {
    RuleScenario("Retryable error codes", ({ Then }) => {
      Then(
        "isRetryableError returns the expected result for each code:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string; expected: string }>(dataTable);
          for (const row of rows) {
            const error = createRateLimitError(
              RATE_LIMIT_ERROR_CODES[row.code as keyof typeof RATE_LIMIT_ERROR_CODES],
              "Test error"
            );
            expect(isRetryableError(error)).toBe(row.expected === "true");
          }
        }
      );
    });

    RuleScenario("Returns false for non-rate-limit errors", ({ Then }) => {
      Then("isRetryableError returns false for non-error values", () => {
        expect(isRetryableError(new Error("regular error"))).toBe(false);
        expect(isRetryableError(null)).toBe(false);
        expect(isRetryableError("error")).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: isPermanentError identifies non-retryable errors
  // ===========================================================================

  Rule("isPermanentError identifies non-retryable errors", ({ RuleScenario }) => {
    RuleScenario("Permanent error codes", ({ Then }) => {
      Then(
        "isPermanentError returns the expected result for each code:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string; expected: string }>(dataTable);
          for (const row of rows) {
            const error = createRateLimitError(
              RATE_LIMIT_ERROR_CODES[row.code as keyof typeof RATE_LIMIT_ERROR_CODES],
              "Test error"
            );
            expect(isPermanentError(error)).toBe(row.expected === "true");
          }
        }
      );
    });

    RuleScenario("Returns false for non-rate-limit errors", ({ Then }) => {
      Then("isPermanentError returns false for non-error values", () => {
        expect(isPermanentError(new Error("regular error"))).toBe(false);
        expect(isPermanentError(null)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: calculateBackoffDelay computes exponential backoff with jitter
  // ===========================================================================

  Rule("calculateBackoffDelay computes exponential backoff with jitter", ({ RuleScenario }) => {
    RuleScenario(
      "Exponential 2^n growth pattern with Math.random mocked to 0",
      ({ When, Then }) => {
        When("Math.random is mocked to return 0", () => {
          vi.spyOn(Math, "random").mockReturnValue(0);
        });

        Then(
          "calculateBackoffDelay returns the expected delays:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              attempt: string;
              baseDelay: string;
              expected: string;
            }>(dataTable);
            for (const row of rows) {
              const delay = calculateBackoffDelay(Number(row.attempt), Number(row.baseDelay));
              expect(delay).toBe(Number(row.expected));
            }
            vi.restoreAllMocks();
          }
        );
      }
    );

    RuleScenario("Caps at default maxDelay of 60000ms", ({ When, Then }) => {
      When("Math.random is mocked to return 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
      });

      Then("calculateBackoffDelay for attempt 10 with baseDelay 1000 returns 60000", () => {
        const delay = calculateBackoffDelay(10, 1000);
        expect(delay).toBe(60000);
        vi.restoreAllMocks();
      });
    });

    RuleScenario("Caps at custom maxDelay", ({ When, Then }) => {
      When("Math.random is mocked to return 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
      });

      Then(
        "calculateBackoffDelay for attempt 5 with baseDelay 1000 and maxDelay 10000 returns 10000",
        () => {
          const delay = calculateBackoffDelay(5, 1000, 10000);
          expect(delay).toBe(10000);
          vi.restoreAllMocks();
        }
      );
    });

    RuleScenario("Does not cap when delay is below max", ({ When, Then }) => {
      When("Math.random is mocked to return 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
      });

      Then(
        "calculateBackoffDelay for attempt 2 with baseDelay 1000 and maxDelay 10000 returns 4000",
        () => {
          const delay = calculateBackoffDelay(2, 1000, 10000);
          expect(delay).toBe(4000);
          vi.restoreAllMocks();
        }
      );
    });

    RuleScenario("Adds jitter up to 25% of delay", ({ When, Then }) => {
      When("Math.random is mocked to return 0.5", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
      });

      Then("calculateBackoffDelay for attempt 0 with baseDelay 1000 returns 1125", () => {
        const delay = calculateBackoffDelay(0, 1000);
        expect(delay).toBe(1125);
        vi.restoreAllMocks();
      });
    });

    RuleScenario("Adds max jitter of 25% when random is 1", ({ When, Then }) => {
      When("Math.random is mocked to return 1", () => {
        vi.spyOn(Math, "random").mockReturnValue(1);
      });

      Then("calculateBackoffDelay for attempt 0 with baseDelay 1000 returns 1250", () => {
        const delay = calculateBackoffDelay(0, 1000);
        expect(delay).toBe(1250);
        vi.restoreAllMocks();
      });
    });

    RuleScenario("Uses default base delay of 1000ms", ({ When, Then }) => {
      When("Math.random is mocked to return 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
      });

      Then("calculateBackoffDelay for attempt 0 with default params returns 1000", () => {
        const delay = calculateBackoffDelay(0);
        expect(delay).toBe(1000);
        vi.restoreAllMocks();
      });
    });

    RuleScenario("Uses default max delay of 60000ms", ({ When, Then }) => {
      When("Math.random is mocked to return 0", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
      });

      Then("calculateBackoffDelay for attempt 10 with default params returns 60000", () => {
        const delay = calculateBackoffDelay(10);
        expect(delay).toBe(60000);
        vi.restoreAllMocks();
      });
    });

    RuleScenario("Returns floored integer", ({ When, Then }) => {
      When("Math.random is mocked to return 0.333", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.333);
      });

      Then("calculateBackoffDelay for attempt 0 with baseDelay 1000 returns an integer", () => {
        const delay = calculateBackoffDelay(0, 1000);
        expect(Number.isInteger(delay)).toBe(true);
        vi.restoreAllMocks();
      });
    });
  });

  // ===========================================================================
  // Rule: wouldExceedBudget checks if estimated cost would exceed daily budget
  // ===========================================================================

  Rule(
    "wouldExceedBudget checks if estimated cost would exceed daily budget",
    ({ RuleScenario }) => {
      RuleScenario("Returns true when total exceeds budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 9 estimatedCost 2 and daily 10 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(9.0, 2.0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Returns false when total is under budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 5 estimatedCost 3 and daily 10 returns false",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(5.0, 3.0, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Returns false when total equals budget exactly", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 7 estimatedCost 3 and daily 10 returns false",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(7.0, 3.0, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Returns true when current spend already exceeds budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 11 estimatedCost 0 and daily 10 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(11.0, 0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Handles zero current spend under budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 0 estimatedCost 5 and daily 10 returns false",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(0, 5.0, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Handles zero current spend over budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 0 estimatedCost 15 and daily 10 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(wouldExceedBudget(0, 15.0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Handles small decimal values under budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 0.05 estimatedCost 0.04 and daily 0.1 returns false",
          () => {
            const budget = { daily: 0.1, alertThreshold: 0.8 };
            expect(wouldExceedBudget(0.05, 0.04, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Handles small decimal values over budget", ({ Then }) => {
        Then(
          "wouldExceedBudget for currentSpend 0.05 estimatedCost 0.06 and daily 0.1 returns true",
          () => {
            const budget = { daily: 0.1, alertThreshold: 0.8 };
            expect(wouldExceedBudget(0.05, 0.06, budget)).toBe(true);
          }
        );
      });
    }
  );

  // ===========================================================================
  // Rule: isAtAlertThreshold checks if spend ratio meets or exceeds alert threshold
  // ===========================================================================

  Rule(
    "isAtAlertThreshold checks if spend ratio meets or exceeds alert threshold",
    ({ RuleScenario }) => {
      RuleScenario("Returns true when spend reaches threshold percentage", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 8 with daily 10 and alertThreshold 0.8 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(isAtAlertThreshold(8.0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Returns true when spend exceeds threshold", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 9 with daily 10 and alertThreshold 0.8 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(isAtAlertThreshold(9.0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Returns false when spend is below threshold", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 7 with daily 10 and alertThreshold 0.8 returns false",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0.8 };
            expect(isAtAlertThreshold(7.0, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Handles threshold of 0 - always alert", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 0 with daily 10 and alertThreshold 0 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 0 };
            expect(isAtAlertThreshold(0, budget)).toBe(true);
          }
        );
      });

      RuleScenario("Handles threshold of 1 - below full budget", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 9.99 with daily 10 and alertThreshold 1 returns false",
          () => {
            const budget = { daily: 10.0, alertThreshold: 1 };
            expect(isAtAlertThreshold(9.99, budget)).toBe(false);
          }
        );
      });

      RuleScenario("Handles threshold of 1 - at full budget", ({ Then }) => {
        Then(
          "isAtAlertThreshold for currentSpend 10 with daily 10 and alertThreshold 1 returns true",
          () => {
            const budget = { daily: 10.0, alertThreshold: 1 };
            expect(isAtAlertThreshold(10.0, budget)).toBe(true);
          }
        );
      });
    }
  );

  // ===========================================================================
  // Rule: getEffectiveRateLimitConfig merges provided config with defaults
  // ===========================================================================

  Rule("getEffectiveRateLimitConfig merges provided config with defaults", ({ RuleScenario }) => {
    RuleScenario("Returns defaults when no config provided", ({ When, Then }) => {
      When("I get the effective rate limit config with no input", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig();
      });

      Then("the effective config matches all defaults", () => {
        expect(state.effectiveConfig!.maxRequestsPerMinute).toBe(
          DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute
        );
        expect(state.effectiveConfig!.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
        expect(state.effectiveConfig!.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
      });
    });

    RuleScenario("Returns defaults when undefined config provided", ({ When, Then }) => {
      When("I get the effective rate limit config with undefined input", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig(undefined);
      });

      Then("the effective config maxRequestsPerMinute matches the default", () => {
        expect(state.effectiveConfig!.maxRequestsPerMinute).toBe(
          DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute
        );
      });
    });

    RuleScenario("Uses provided maxRequestsPerMinute", ({ When, Then }) => {
      When("I get the effective rate limit config with maxRequestsPerMinute 30", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig({
          maxRequestsPerMinute: 30,
        });
      });

      Then("the effective config maxRequestsPerMinute is 30", () => {
        expect(state.effectiveConfig!.maxRequestsPerMinute).toBe(30);
      });
    });

    RuleScenario("Uses default maxConcurrent when not provided", ({ When, Then }) => {
      When("I get the effective rate limit config with maxRequestsPerMinute 30", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig({
          maxRequestsPerMinute: 30,
        });
      });

      Then("the effective config maxConcurrent matches the default", () => {
        expect(state.effectiveConfig!.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
      });
    });

    RuleScenario("Uses provided maxConcurrent", ({ When, Then }) => {
      When(
        "I get the effective rate limit config with maxRequestsPerMinute 30 and maxConcurrent 3",
        () => {
          state.effectiveConfig = getEffectiveRateLimitConfig({
            maxRequestsPerMinute: 30,
            maxConcurrent: 3,
          });
        }
      );

      Then("the effective config maxConcurrent is 3", () => {
        expect(state.effectiveConfig!.maxConcurrent).toBe(3);
      });
    });

    RuleScenario("Uses default queueDepth when not provided", ({ When, Then }) => {
      When("I get the effective rate limit config with maxRequestsPerMinute 30", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig({
          maxRequestsPerMinute: 30,
        });
      });

      Then("the effective config queueDepth matches the default", () => {
        expect(state.effectiveConfig!.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
      });
    });

    RuleScenario("Uses provided queueDepth", ({ When, Then }) => {
      When(
        "I get the effective rate limit config with maxRequestsPerMinute 30 and queueDepth 50",
        () => {
          state.effectiveConfig = getEffectiveRateLimitConfig({
            maxRequestsPerMinute: 30,
            queueDepth: 50,
          });
        }
      );

      Then("the effective config queueDepth is 50", () => {
        expect(state.effectiveConfig!.queueDepth).toBe(50);
      });
    });

    RuleScenario("Preserves costBudget when provided", ({ When, Then }) => {
      When(
        "I get the effective rate limit config with maxRequestsPerMinute 30 and costBudget daily 10 alertThreshold 0.8",
        () => {
          state.effectiveConfig = getEffectiveRateLimitConfig({
            maxRequestsPerMinute: 30,
            costBudget: { daily: 10, alertThreshold: 0.8 },
          });
        }
      );

      Then("the effective config costBudget equals daily 10 and alertThreshold 0.8", () => {
        expect(state.effectiveConfig!.costBudget).toEqual({
          daily: 10,
          alertThreshold: 0.8,
        });
      });
    });

    RuleScenario("Does not include costBudget when not provided", ({ When, Then }) => {
      When("I get the effective rate limit config with maxRequestsPerMinute 30", () => {
        state.effectiveConfig = getEffectiveRateLimitConfig({
          maxRequestsPerMinute: 30,
        });
      });

      Then("the effective config costBudget is undefined", () => {
        expect(state.effectiveConfig!.costBudget).toBeUndefined();
      });
    });
  });
});
