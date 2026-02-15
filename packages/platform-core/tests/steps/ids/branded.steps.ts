/**
 * Branded ID Types - Step Definitions
 *
 * BDD step definitions for branded ID type system:
 * - Factory functions creating branded IDs from raw strings
 * - String compatibility of branded types
 * - Generator integration with UUID v7
 * - isValidIdString type guard
 * - Uniqueness of generated IDs
 *
 * Mechanical migration from tests/unit/ids/branded.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  toCommandId,
  toCorrelationId,
  toCausationId,
  toEventId,
  toStreamId,
  isValidIdString,
  type CommandId,
  type CorrelationId,
  type CausationId,
  type EventId,
  type StreamId,
} from "../../../src/ids/branded.js";
import {
  generateCommandId,
  generateCorrelationId,
  generateEventId,
  generateIntegrationEventId,
} from "../../../src/ids/generator.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  factoryResults: Array<{ factory: string; input: string; result: string }>;
  brandedIds: Array<{
    factory: string;
    input: string;
    branded: CommandId | CorrelationId | CausationId | EventId | StreamId;
  }>;
  commandId: CommandId | null;
  generatorResults: Array<{ generator: string; prefix: string; result: string }>;
  generatedCommandId: CommandId | null;
  generatedCorrelationId: CorrelationId | null;
  unknownValue: unknown;
  generatedCommandIds: Set<string>;
  generatedCorrelationIds: Set<string>;
}

function createInitialState(): TestState {
  return {
    factoryResults: [],
    brandedIds: [],
    commandId: null,
    generatorResults: [],
    generatedCommandId: null,
    generatedCorrelationId: null,
    unknownValue: undefined,
    generatedCommandIds: new Set(),
    generatedCorrelationIds: new Set(),
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Factory Helpers
// =============================================================================

type FactoryFn = (input: string) => CommandId | CorrelationId | CausationId | EventId | StreamId;

const factoryMap: Record<string, FactoryFn> = {
  toCommandId: (s) => toCommandId(s),
  toCorrelationId: (s) => toCorrelationId(s),
  toCausationId: (s) => toCausationId(s),
  toEventId: (s) => toEventId(s),
  toStreamId: (s) => toStreamId(s),
};

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/ids/branded.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: Factory functions create branded IDs from raw strings
  // ==========================================================================

  Rule("Factory functions create branded IDs from raw strings", ({ RuleScenario }) => {
    RuleScenario(
      "Factory functions produce branded IDs preserving the input value",
      ({ Given, When, Then, And }) => {
        Given("the following raw ID strings:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ factory: string; input: string }>(dataTable);
          state.factoryResults = rows.map((row) => ({
            factory: row.factory,
            input: row.input,
            result: "",
          }));
        });

        When("each factory function is called with its input", () => {
          state.factoryResults = state.factoryResults.map((entry) => {
            const fn = factoryMap[entry.factory];
            expect(fn).toBeDefined();
            return { ...entry, result: fn!(entry.input) as string };
          });
        });

        Then("each result equals its input string", () => {
          for (const entry of state.factoryResults) {
            expect(entry.result).toBe(entry.input);
          }
        });

        And("each result is assignable to its branded type", () => {
          // Re-run each factory and verify type assignment compiles
          const cmdId: CommandId = toCommandId("cmd_test123");
          expect(cmdId).toBe("cmd_test123");
          const corrId: CorrelationId = toCorrelationId("corr_test456");
          expect(corrId).toBe("corr_test456");
          const causId: CausationId = toCausationId("cmd_test789");
          expect(causId).toBe("cmd_test789");
          const evtId: EventId = toEventId("orders_event_abc");
          expect(evtId).toBe("orders_event_abc");
          const streamId: StreamId = toStreamId("Order-123");
          expect(streamId).toBe("Order-123");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Branded IDs remain fully compatible with string operations
  // ==========================================================================

  Rule("Branded IDs remain fully compatible with string operations", ({ RuleScenario }) => {
    RuleScenario(
      "Branded IDs are assignable to plain string variables",
      ({ Given, When, Then }) => {
        Given("branded IDs created from the following inputs:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ factory: string; input: string }>(dataTable);
          state.brandedIds = rows.map((row) => {
            const fn = factoryMap[row.factory];
            expect(fn).toBeDefined();
            return {
              factory: row.factory,
              input: row.input,
              branded: fn!(row.input),
            };
          });
        });

        When("each branded ID is assigned to a string variable", () => {
          // Assignment happens implicitly -- branded types are string subtypes
          for (const entry of state.brandedIds) {
            const _str: string = entry.branded;
            expect(typeof _str).toBe("string");
          }
        });

        Then("each string variable equals its original input", () => {
          for (const entry of state.brandedIds) {
            const str: string = entry.branded;
            expect(str).toBe(entry.input);
          }
        });
      }
    );

    RuleScenario("Branded IDs support standard string methods", ({ Given, When, Then, And }) => {
      Given('a CommandId created from "cmd_TEST_123"', () => {
        state.commandId = toCommandId("cmd_TEST_123");
      });

      When("string methods are called on the branded ID", () => {
        // Methods are called in Then/And steps
        expect(state.commandId).not.toBeNull();
      });

      Then('toLowerCase returns "cmd_test_123"', () => {
        expect(state.commandId!.toLowerCase()).toBe("cmd_test_123");
      });

      And('startsWith "cmd_" returns true', () => {
        expect(state.commandId!.startsWith("cmd_")).toBe(true);
      });

      And("length equals 12", () => {
        expect(state.commandId!.length).toBe(12);
      });
    });
  });

  // ==========================================================================
  // Rule: ID generators produce correctly branded and prefixed IDs
  // ==========================================================================

  Rule("ID generators produce correctly branded and prefixed IDs", ({ RuleScenario }) => {
    RuleScenario("Generators produce correctly prefixed branded IDs", ({ When, Then }) => {
      When("the following generators are called:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          generator: string;
          expectedPrefix: string;
        }>(dataTable);
        state.generatorResults = rows.map((row) => {
          let result: string;
          if (row.generator === "generateCommandId") {
            result = generateCommandId();
          } else if (row.generator === "generateCorrelationId") {
            result = generateCorrelationId();
          } else if (row.generator === "generateEventId:orders") {
            result = generateEventId("orders");
          } else if (row.generator === "generateIntegrationEventId") {
            result = generateIntegrationEventId();
          } else {
            throw new Error(`Unknown generator: ${row.generator}`);
          }
          return {
            generator: row.generator,
            prefix: row.expectedPrefix,
            result,
          };
        });
      });

      Then("each result starts with its expected prefix", () => {
        for (const entry of state.generatorResults) {
          expect(entry.result).toMatch(new RegExp(`^${entry.prefix}`));
        }
      });
    });

    RuleScenario(
      "Command and correlation generators produce valid UUID v7 after prefix",
      ({ When, Then }) => {
        When("generateCommandId is called", () => {
          state.generatedCommandId = generateCommandId();
        });

        Then('the result after removing "cmd_" matches UUID v7 format', () => {
          const uuid = state.generatedCommandId!.slice(4);
          expect(uuid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
          );
        });

        When("generateCorrelationId is called", () => {
          state.generatedCorrelationId = generateCorrelationId();
        });

        Then('the result after removing "corr_" matches UUID v7 format', () => {
          const uuid = state.generatedCorrelationId!.slice(5);
          expect(uuid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
          );
        });
      }
    );
  });

  // ==========================================================================
  // Rule: isValidIdString validates and narrows unknown values to strings
  // ==========================================================================

  Rule("isValidIdString validates and narrows unknown values to strings", ({ RuleScenario }) => {
    RuleScenario("isValidIdString returns true for non-empty strings", ({ Then }) => {
      Then("isValidIdString returns true for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          expect(isValidIdString(row.value)).toBe(true);
        }
      });
    });

    RuleScenario("isValidIdString returns false for empty string", ({ Then }) => {
      Then('isValidIdString returns false for ""', () => {
        expect(isValidIdString("")).toBe(false);
      });
    });

    RuleScenario("isValidIdString returns false for non-string values", ({ Then }) => {
      Then("isValidIdString returns false for all non-string values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ description: string }>(dataTable);
        const valueMap: Record<string, unknown> = {
          null: null,
          undefined: undefined,
          "number 123": 123,
          object: {},
          array: [],
        };
        for (const row of rows) {
          const val = valueMap[row.description];
          expect(isValidIdString(val)).toBe(false);
        }
      });
    });

    RuleScenario("isValidIdString narrows type for TypeScript", ({ Given, When, Then }) => {
      Given('an unknown value "test_id"', () => {
        state.unknownValue = "test_id";
      });

      When("isValidIdString returns true", () => {
        expect(isValidIdString(state.unknownValue)).toBe(true);
      });

      Then("the value is usable as a string with length greater than 0", () => {
        if (isValidIdString(state.unknownValue)) {
          const str: string = state.unknownValue;
          expect(str.length).toBeGreaterThan(0);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: ID generators produce unique values across repeated calls
  // ==========================================================================

  Rule("ID generators produce unique values across repeated calls", ({ RuleScenario }) => {
    RuleScenario("100 generated CommandIds are all unique", ({ When, Then }) => {
      When("100 CommandIds are generated", () => {
        state.generatedCommandIds = new Set<string>();
        for (let i = 0; i < 100; i++) {
          state.generatedCommandIds.add(generateCommandId());
        }
      });

      Then("all 100 are distinct", () => {
        expect(state.generatedCommandIds.size).toBe(100);
      });
    });

    RuleScenario("100 generated CorrelationIds are all unique", ({ When, Then }) => {
      When("100 CorrelationIds are generated", () => {
        state.generatedCorrelationIds = new Set<string>();
        for (let i = 0; i < 100; i++) {
          state.generatedCorrelationIds.add(generateCorrelationId());
        }
      });

      Then("all 100 are distinct", () => {
        expect(state.generatedCorrelationIds.size).toBe(100);
      });
    });
  });
});
