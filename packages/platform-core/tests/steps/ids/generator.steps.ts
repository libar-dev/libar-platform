/**
 * ID Generation Utilities - Step Definitions
 *
 * BDD step definitions for ID generation and parsing:
 * - generateId: Prefixed ID generation with validation
 * - parseId: ID decomposition
 * - generateCorrelationId, generateCommandId, generateEventId,
 *   generateIntegrationEventId: Domain-specific ID factories
 * - UUID v7 format and time-ordering guarantees
 *
 * Mechanical migration from tests/unit/ids/generator.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  generateId,
  parseId,
  generateCorrelationId,
  generateCommandId,
  generateEventId,
  generateIntegrationEventId,
} from "../../../src/ids/generator.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  generatedId: string | null;
  generatedId2: string | null;
  parsedResult: { context: string; type: string; uuid: string } | null;
  generatedForParse: string | null;
  result1: string | null;
  result2: string | null;
  eventResult: string | null;
  eventResult2: string | null;
  sequentialIds: string[];
  prefixResults: Array<{ context: string; type: string; expectedPrefix: string; result: string }>;
}

function createInitialState(): TestState {
  return {
    generatedId: null,
    generatedId2: null,
    parsedResult: null,
    generatedForParse: null,
    result1: null,
    result2: null,
    eventResult: null,
    eventResult2: null,
    sequentialIds: [],
    prefixResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/ids/generator.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: generateId produces IDs in {context}_{type}_{uuid} format
  // ==========================================================================

  Rule("generateId produces IDs in {context}_{type}_{uuid} format", ({ RuleScenario }) => {
    RuleScenario("Generated ID matches the expected format", ({ When, Then }) => {
      When('generateId is called with context "orders" and type "order"', () => {
        state.generatedId = generateId("orders", "order");
      });

      Then('the result matches pattern "^orders_order_[0-9a-f-]{36}$"', () => {
        expect(state.generatedId).toMatch(/^orders_order_[0-9a-f-]{36}$/);
      });
    });

    RuleScenario("Each call produces a unique ID", ({ When, Then }) => {
      When('generateId is called twice with context "orders" and type "order"', () => {
        state.generatedId = generateId("orders", "order");
        state.generatedId2 = generateId("orders", "order");
      });

      Then("the two IDs are different", () => {
        expect(state.generatedId).not.toBe(state.generatedId2);
      });
    });

    RuleScenario("Generated ID starts with the provided context and type", ({ When, Then }) => {
      When('generateId is called with context "inventory" and type "product"', () => {
        state.generatedId = generateId("inventory", "product");
      });

      Then('the result starts with "inventory_product_"', () => {
        expect(state.generatedId!.startsWith("inventory_product_")).toBe(true);
      });
    });

    RuleScenario(
      "Lowercase alphanumeric values are accepted for context and type",
      ({ When, Then }) => {
        When("generateId is called with the following inputs:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            context: string;
            type: string;
            expectedPrefix: string;
          }>(dataTable);
          state.prefixResults = rows.map((row) => ({
            context: row.context,
            type: row.type,
            expectedPrefix: row.expectedPrefix,
            result: generateId(row.context, row.type),
          }));
        });

        Then("each result starts with its expected prefix", () => {
          for (const entry of state.prefixResults) {
            expect(entry.result.startsWith(entry.expectedPrefix)).toBe(true);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: generateId rejects invalid context and type values
  // ==========================================================================

  Rule("generateId rejects invalid context and type values", ({ RuleScenario }) => {
    RuleScenario("Empty context or type throws an error", ({ Then }) => {
      Then("generateId throws for invalid inputs:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          context: string;
          type: string;
          errorPattern: string;
        }>(dataTable);
        for (const row of rows) {
          expect(() => generateId(row.context, row.type)).toThrow(new RegExp(row.errorPattern));
        }
      });
    });

    RuleScenario("Context with disallowed characters throws an error", ({ Then }) => {
      Then("generateId throws for invalid inputs:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          context: string;
          type: string;
          errorPattern: string;
        }>(dataTable);
        for (const row of rows) {
          expect(() => generateId(row.context, row.type)).toThrow(new RegExp(row.errorPattern));
        }
      });
    });

    RuleScenario("Type with underscore throws an error", ({ Then }) => {
      Then("generateId throws for invalid inputs:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          context: string;
          type: string;
          errorPattern: string;
        }>(dataTable);
        for (const row of rows) {
          expect(() => generateId(row.context, row.type)).toThrow(new RegExp(row.errorPattern));
        }
      });
    });
  });

  // ==========================================================================
  // Rule: parseId decomposes valid IDs into context, type, and uuid
  // ==========================================================================

  Rule("parseId decomposes valid IDs into context, type, and uuid", ({ RuleScenario }) => {
    RuleScenario("A well-formed ID is parsed into its components", ({ Given, When, Then }) => {
      Given('the ID string "orders_order_0190a7c4-1234-7abc-8def-1234567890ab"', () => {
        state.generatedForParse = "orders_order_0190a7c4-1234-7abc-8def-1234567890ab";
      });

      When("parseId is called", () => {
        state.parsedResult = parseId(state.generatedForParse!);
      });

      Then("the parsed result is:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          field: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.parsedResult![row.field as keyof typeof state.parsedResult]).toBe(row.value);
        }
      });
    });

    RuleScenario("An ID produced by generateId is parseable", ({ Given, When, Then, And }) => {
      Given('an ID generated with context "inventory" and type "product"', () => {
        state.generatedForParse = generateId("inventory", "product");
      });

      When("parseId is called", () => {
        state.parsedResult = parseId(state.generatedForParse!);
      });

      Then('the parsed context is "inventory"', () => {
        expect(state.parsedResult).not.toBeNull();
        expect(state.parsedResult!.context).toBe("inventory");
      });

      And('the parsed type is "product"', () => {
        expect(state.parsedResult!.type).toBe("product");
      });

      And('the parsed uuid matches "^[0-9a-f-]{36}$"', () => {
        expect(state.parsedResult!.uuid).toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    RuleScenario("UUID portion containing underscores is preserved", ({ Given, When, Then }) => {
      Given('the ID string "orders_order_uuid_with_extra_parts"', () => {
        state.generatedForParse = "orders_order_uuid_with_extra_parts";
      });

      When("parseId is called", () => {
        state.parsedResult = parseId(state.generatedForParse!);
      });

      Then("the parsed result is:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          field: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.parsedResult![row.field as keyof typeof state.parsedResult]).toBe(row.value);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: parseId returns null for malformed IDs
  // ==========================================================================

  Rule("parseId returns null for malformed IDs", ({ RuleScenario }) => {
    RuleScenario("IDs with fewer than three parts return null", ({ Then }) => {
      Then("parseId returns null for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(parseId(row.input)).toBeNull();
        }
      });
    });

    RuleScenario("IDs with empty context or type return null", ({ Then }) => {
      Then("parseId returns null for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(parseId(row.input)).toBeNull();
        }
      });
    });
  });

  // ==========================================================================
  // Rule: generateCorrelationId produces corr_-prefixed unique IDs
  // ==========================================================================

  Rule("generateCorrelationId produces corr_-prefixed unique IDs", ({ RuleScenario }) => {
    RuleScenario(
      "Correlation ID has the expected format and is unique per call",
      ({ When, Then, And }) => {
        When("generateCorrelationId is called twice", () => {
          state.result1 = generateCorrelationId();
          state.result2 = generateCorrelationId();
        });

        Then('both results match pattern "^corr_[0-9a-f-]{36}$"', () => {
          expect(state.result1).toMatch(/^corr_[0-9a-f-]{36}$/);
          expect(state.result2).toMatch(/^corr_[0-9a-f-]{36}$/);
        });

        And("the two results are different", () => {
          expect(state.result1).not.toBe(state.result2);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: generateCommandId produces cmd_-prefixed unique IDs
  // ==========================================================================

  Rule("generateCommandId produces cmd_-prefixed unique IDs", ({ RuleScenario }) => {
    RuleScenario(
      "Command ID has the expected format and is unique per call",
      ({ When, Then, And }) => {
        When("generateCommandId is called twice", () => {
          state.result1 = generateCommandId();
          state.result2 = generateCommandId();
        });

        Then('both results match pattern "^cmd_[0-9a-f-]{36}$"', () => {
          expect(state.result1).toMatch(/^cmd_[0-9a-f-]{36}$/);
          expect(state.result2).toMatch(/^cmd_[0-9a-f-]{36}$/);
        });

        And("the two results are different", () => {
          expect(state.result1).not.toBe(state.result2);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: generateEventId produces context-prefixed event IDs
  // ==========================================================================

  Rule("generateEventId produces context-prefixed event IDs", ({ RuleScenario }) => {
    RuleScenario(
      "Event ID has the expected format and uses the provided context",
      ({ When, Then }) => {
        When('generateEventId is called with context "orders"', () => {
          state.eventResult = generateEventId("orders");
        });

        Then('the result matches pattern "^orders_event_[0-9a-f-]{36}$"', () => {
          expect(state.eventResult).toMatch(/^orders_event_[0-9a-f-]{36}$/);
        });

        When('generateEventId is called with context "inventory"', () => {
          state.eventResult = generateEventId("inventory");
        });

        Then('the result starts with "inventory_event_"', () => {
          expect(state.eventResult!.startsWith("inventory_event_")).toBe(true);
        });
      }
    );

    RuleScenario("Event IDs are unique per call", ({ When, Then }) => {
      When('generateEventId is called twice with context "orders"', () => {
        state.eventResult = generateEventId("orders");
        state.eventResult2 = generateEventId("orders");
      });

      Then("the two results are different", () => {
        expect(state.eventResult).not.toBe(state.eventResult2);
      });
    });

    RuleScenario("Empty context throws an error", ({ Then }) => {
      Then('generateEventId with empty context throws "context cannot be empty"', () => {
        expect(() => generateEventId("")).toThrow("context cannot be empty");
      });
    });
  });

  // ==========================================================================
  // Rule: generateIntegrationEventId produces int_evt_-prefixed unique IDs
  // ==========================================================================

  Rule("generateIntegrationEventId produces int_evt_-prefixed unique IDs", ({ RuleScenario }) => {
    RuleScenario(
      "Integration event ID has the expected format and is unique per call",
      ({ When, Then, And }) => {
        When("generateIntegrationEventId is called twice", () => {
          state.result1 = generateIntegrationEventId();
          state.result2 = generateIntegrationEventId();
        });

        Then('both results match pattern "^int_evt_[0-9a-f-]{36}$"', () => {
          expect(state.result1).toMatch(/^int_evt_[0-9a-f-]{36}$/);
          expect(state.result2).toMatch(/^int_evt_[0-9a-f-]{36}$/);
        });

        And("the two results are different", () => {
          expect(state.result1).not.toBe(state.result2);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Generated UUIDs conform to UUID v7 and are time-ordered
  // ==========================================================================

  Rule("Generated UUIDs conform to UUID v7 and are time-ordered", ({ RuleScenario }) => {
    RuleScenario("UUID portion has version 7 indicator", ({ When, Then }) => {
      When('generateId is called with context "test" and type "item"', () => {
        state.generatedId = generateId("test", "item");
      });

      Then(
        'the UUID portion matches "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$"',
        () => {
          const parsed = parseId(state.generatedId!);
          expect(parsed!.uuid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/
          );
        }
      );
    });

    RuleScenario("Ten sequential IDs are lexicographically sorted", ({ When, Then }) => {
      When('10 IDs are generated sequentially with context "test" and type "item"', () => {
        state.sequentialIds = [];
        for (let i = 0; i < 10; i++) {
          state.sequentialIds.push(generateId("test", "item"));
        }
      });

      Then("the IDs are in lexicographic order", () => {
        const sorted = [...state.sequentialIds].sort();
        expect(state.sequentialIds).toEqual(sorted);
      });
    });
  });
});
