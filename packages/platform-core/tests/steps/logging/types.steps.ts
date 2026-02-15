/**
 * Logging Types - Step Definitions
 *
 * BDD step definitions for log level types:
 * - LOG_LEVEL_PRIORITY ordering
 * - DEFAULT_LOG_LEVEL constant
 * - shouldLog filtering function
 *
 * Mechanical migration from tests/unit/logging/types.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  LOG_LEVEL_PRIORITY,
  DEFAULT_LOG_LEVEL,
  shouldLog,
  type LogLevel,
} from "../../../src/logging/types.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  configuredLevel: LogLevel | null;
}

let state: TestState;

function resetState(): void {
  state = {
    configuredLevel: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/logging/types.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  // ==========================================================================
  // Rule: LOG_LEVEL_PRIORITY defines numeric ordering for all log levels
  // ==========================================================================

  Rule("LOG_LEVEL_PRIORITY defines numeric ordering for all log levels", ({ RuleScenario }) => {
    RuleScenario("Priority values increase from DEBUG to ERROR", ({ When, Then }) => {
      When("I inspect the LOG_LEVEL_PRIORITY map", () => {
        // No-op: LOG_LEVEL_PRIORITY is a module constant
      });

      Then("the priority order from lowest to highest is:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ level: string }>(dataTable);
        const levels = rows.map((row) => row.level) as LogLevel[];
        for (let i = 0; i < levels.length - 1; i++) {
          expect(LOG_LEVEL_PRIORITY[levels[i]]).toBeLessThan(LOG_LEVEL_PRIORITY[levels[i + 1]]);
        }
      });
    });

    RuleScenario("All 6 log levels are defined as numbers", ({ When, Then }) => {
      When("I inspect the LOG_LEVEL_PRIORITY map", () => {
        // No-op: LOG_LEVEL_PRIORITY is a module constant
      });

      Then("all log levels are defined as numbers:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ level: string }>(dataTable);
        const levels = rows.map((row) => row.level) as LogLevel[];
        for (const level of levels) {
          expect(LOG_LEVEL_PRIORITY[level]).toBeDefined();
          expect(typeof LOG_LEVEL_PRIORITY[level]).toBe("number");
        }
      });
    });
  });

  // ==========================================================================
  // Rule: DEFAULT_LOG_LEVEL is INFO
  // ==========================================================================

  Rule("DEFAULT_LOG_LEVEL is INFO", ({ RuleScenario }) => {
    RuleScenario("Default log level is INFO", ({ When, Then }) => {
      When("I check the DEFAULT_LOG_LEVEL constant", () => {
        // No-op: DEFAULT_LOG_LEVEL is a module constant
      });

      Then('it should be "INFO"', () => {
        expect(DEFAULT_LOG_LEVEL).toBe("INFO");
      });
    });
  });

  // ==========================================================================
  // Rule: shouldLog returns true when message level >= configured level
  // ==========================================================================

  Rule("shouldLog returns true when message level >= configured level", ({ RuleScenario }) => {
    RuleScenario("Messages at or above INFO level pass the filter", ({ Given, Then }) => {
      Given('the configured log level is "INFO"', () => {
        state.configuredLevel = "INFO";
      });

      Then("shouldLog returns true for levels:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
        const levels = rows.map((r) => r.messageLevel) as LogLevel[];
        for (const level of levels) {
          expect(shouldLog(level, state.configuredLevel!)).toBe(true);
        }
      });
    });

    RuleScenario("Messages below INFO level are filtered out", ({ Given, Then }) => {
      Given('the configured log level is "INFO"', () => {
        state.configuredLevel = "INFO";
      });

      Then("shouldLog returns false for levels:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
        const levels = rows.map((r) => r.messageLevel) as LogLevel[];
        for (const level of levels) {
          expect(shouldLog(level, state.configuredLevel!)).toBe(false);
        }
      });
    });

    RuleScenario("DEBUG configured level allows all messages", ({ Given, Then }) => {
      Given('the configured log level is "DEBUG"', () => {
        state.configuredLevel = "DEBUG";
      });

      Then("shouldLog returns true for levels:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
        const levels = rows.map((r) => r.messageLevel) as LogLevel[];
        for (const level of levels) {
          expect(shouldLog(level, state.configuredLevel!)).toBe(true);
        }
      });
    });

    RuleScenario("ERROR configured level only allows ERROR", ({ Given, Then, And }) => {
      Given('the configured log level is "ERROR"', () => {
        state.configuredLevel = "ERROR";
      });

      Then("shouldLog returns false for levels:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
        const levels = rows.map((r) => r.messageLevel) as LogLevel[];
        for (const level of levels) {
          expect(shouldLog(level, state.configuredLevel!)).toBe(false);
        }
      });

      And('shouldLog returns true for level "ERROR"', () => {
        expect(shouldLog("ERROR", state.configuredLevel!)).toBe(true);
      });
    });

    RuleScenario("WARN configured level allows WARN and ERROR only", ({ Given, Then, And }) => {
      Given('the configured log level is "WARN"', () => {
        state.configuredLevel = "WARN";
      });

      Then("shouldLog returns false for levels:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
        const levels = rows.map((r) => r.messageLevel) as LogLevel[];
        for (const level of levels) {
          expect(shouldLog(level, state.configuredLevel!)).toBe(false);
        }
      });

      And(
        "shouldLog returns true for levels at WARN and above:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ messageLevel: string }>(dataTable);
          const levels = rows.map((r) => r.messageLevel) as LogLevel[];
          for (const level of levels) {
            expect(shouldLog(level, state.configuredLevel!)).toBe(true);
          }
        }
      );
    });
  });
});
