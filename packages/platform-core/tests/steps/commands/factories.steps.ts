/**
 * Command Category Factories - Step Definitions
 *
 * BDD step definitions for category-specific factory functions:
 * - createAggregateCommandSchema
 * - createProcessCommandSchema
 * - createSystemCommandSchema
 * - createBatchCommandSchema
 * - getCommandCategoryFromSchema
 *
 * Mechanical migration from tests/unit/commands/factories.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";

import {
  createAggregateCommandSchema,
  createProcessCommandSchema,
  createSystemCommandSchema,
  createBatchCommandSchema,
  getCommandCategoryFromSchema,
} from "../../../src/commands/factories.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  schema: z.ZodType<unknown> | null;
  parseResult: unknown;
  parseError: unknown | null;
  // For multi-parse scenarios (missing fields, category extraction)
  multiParseResults: Array<{ input: string; result?: unknown; error?: unknown }>;
  // For category extraction
  categoryResults: Array<{ factory: string; result: unknown }>;
}

function createInitialState(): TestState {
  return {
    schema: null,
    parseResult: null,
    parseError: null,
    multiParseResults: [],
    categoryResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers
// =============================================================================

function makeBaseCommand(commandType: string): Record<string, unknown> {
  return {
    commandId: "cmd_123",
    commandType,
    correlationId: "corr_456",
    timestamp: Date.now(),
    targetContext: "orders",
  };
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/commands/factories.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // createAggregateCommandSchema — category + literal type
  // ==========================================================================

  Rule(
    "createAggregateCommandSchema produces schemas with aggregate category and literal command type",
    ({ RuleScenario }) => {
      RuleScenario(
        "Schema assigns aggregate category and preserves command type",
        ({ Given, When, Then, And }) => {
          Given(
            'an aggregate command schema for "CreateOrder" with payload fields "orderId,customerId"',
            () => {
              state.schema = createAggregateCommandSchema({
                commandType: "CreateOrder",
                payloadSchema: z.object({
                  orderId: z.string(),
                  customerId: z.string(),
                }),
              });
            }
          );

          When('a valid command is parsed with commandType "CreateOrder"', () => {
            state.parseResult = state.schema!.parse({
              ...makeBaseCommand("CreateOrder"),
              payload: { orderId: "order_789", customerId: "cust_012" },
            });
          });

          Then('the parsed command has category "aggregate"', () => {
            expect(state.parseResult.category).toBe("aggregate");
          });

          And('the parsed command has commandType "CreateOrder"', () => {
            expect(state.parseResult.commandType).toBe("CreateOrder");
          });
        }
      );
    }
  );

  // ==========================================================================
  // createAggregateCommandSchema — aggregate target present
  // ==========================================================================

  Rule(
    "createAggregateCommandSchema includes aggregate target when provided",
    ({ RuleScenario }) => {
      RuleScenario("Aggregate target is present on parsed command", ({ Given, When, Then }) => {
        Given(
          'an aggregate command schema for "AddOrderItem" with aggregate target type "Order" and idField "orderId"',
          () => {
            state.schema = createAggregateCommandSchema({
              commandType: "AddOrderItem",
              payloadSchema: z.object({
                orderId: z.string(),
                productId: z.string(),
              }),
              aggregateTarget: {
                type: "Order",
                idField: "orderId",
              },
            });
          }
        );

        When('a valid command is parsed with commandType "AddOrderItem"', () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("AddOrderItem"),
            payload: { orderId: "order_789", productId: "prod_012" },
          });
        });

        Then('the parsed command has aggregateTarget type "Order" and idField "orderId"', () => {
          expect(state.parseResult.aggregateTarget).toEqual({
            type: "Order",
            idField: "orderId",
          });
        });
      });
    }
  );

  // ==========================================================================
  // createAggregateCommandSchema — aggregate target optional
  // ==========================================================================

  Rule(
    "createAggregateCommandSchema makes aggregate target optional when not configured",
    ({ RuleScenario }) => {
      RuleScenario("Aggregate target is undefined when not configured", ({ Given, When, Then }) => {
        Given('an aggregate command schema for "CreateOrder" with payload fields "orderId"', () => {
          state.schema = createAggregateCommandSchema({
            commandType: "CreateOrder",
            payloadSchema: z.object({ orderId: z.string() }),
          });
        });

        When('a valid command is parsed with commandType "CreateOrder"', () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("CreateOrder"),
            payload: { orderId: "order_123" },
          });
        });

        Then("the parsed command has undefined aggregateTarget", () => {
          expect(state.parseResult.aggregateTarget).toBeUndefined();
        });
      });
    }
  );

  // ==========================================================================
  // createAggregateCommandSchema — literal type enforcement
  // ==========================================================================

  Rule("createAggregateCommandSchema enforces literal command type", ({ RuleScenario }) => {
    RuleScenario("Schema rejects a mismatched command type", ({ Given, When, Then }) => {
      Given('an aggregate command schema for "CreateOrder" with payload fields "orderId"', () => {
        state.schema = createAggregateCommandSchema({
          commandType: "CreateOrder",
          payloadSchema: z.object({ orderId: z.string() }),
        });
      });

      When('a command with commandType "WrongType" is parsed', () => {
        try {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("WrongType"),
            payload: { orderId: "order_123" },
          });
        } catch (e) {
          state.parseError = e;
        }
      });

      Then("the parse throws a validation error", () => {
        expect(state.parseError).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // createAggregateCommandSchema — required fields
  // ==========================================================================

  Rule(
    "createAggregateCommandSchema rejects commands missing required base fields",
    ({ RuleScenario }) => {
      RuleScenario("Schema rejects commands missing required fields", ({ Given, When, Then }) => {
        Given('an aggregate command schema for "CreateOrder" with payload fields "orderId"', () => {
          state.schema = createAggregateCommandSchema({
            commandType: "CreateOrder",
            payloadSchema: z.object({ orderId: z.string() }),
          });
        });

        When("commands are parsed with the following missing fields:", (_ctx, dataTable) => {
          const rows = getDataTableRows<{ missingField: string }>(dataTable);
          state.multiParseResults = rows.map((row) => {
            const base = {
              ...makeBaseCommand("CreateOrder"),
              payload: { orderId: "order_123" },
            };
            // Remove the specified field
            delete (base as Record<string, unknown>)[row.missingField];
            try {
              state.schema!.parse(base);
              return { input: row.missingField };
            } catch (e) {
              return { input: row.missingField, error: e };
            }
          });
        });

        Then("each parse throws a validation error", () => {
          expect(state.multiParseResults).toHaveLength(5);
          for (const entry of state.multiParseResults) {
            expect(entry.error, `Expected error for missing field: ${entry.input}`).toBeDefined();
          }
        });
      });
    }
  );

  // ==========================================================================
  // createProcessCommandSchema — process category
  // ==========================================================================

  Rule("createProcessCommandSchema produces schemas with process category", ({ RuleScenario }) => {
    RuleScenario(
      "Schema assigns process category and preserves command type",
      ({ Given, When, Then, And }) => {
        Given(
          'a process command schema for "StartOrderFulfillment" with payload fields "orderId,warehouseId"',
          () => {
            state.schema = createProcessCommandSchema({
              commandType: "StartOrderFulfillment",
              payloadSchema: z.object({
                orderId: z.string(),
                warehouseId: z.string(),
              }),
            });
          }
        );

        When('a valid process command is parsed with commandType "StartOrderFulfillment"', () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("StartOrderFulfillment"),
            targetContext: "sagas",
            payload: { orderId: "order_789", warehouseId: "wh_012" },
          });
        });

        Then('the parsed command has category "process"', () => {
          expect(state.parseResult.category).toBe("process");
        });

        And('the parsed command has commandType "StartOrderFulfillment"', () => {
          expect(state.parseResult.commandType).toBe("StartOrderFulfillment");
        });
      }
    );
  });

  // ==========================================================================
  // createProcessCommandSchema — process type present
  // ==========================================================================

  Rule("createProcessCommandSchema includes process type when provided", ({ RuleScenario }) => {
    RuleScenario("Process type is present on parsed command", ({ Given, When, Then }) => {
      Given(
        'a process command schema for "StartOrderFulfillment" with processType "OrderFulfillmentSaga"',
        () => {
          state.schema = createProcessCommandSchema({
            commandType: "StartOrderFulfillment",
            payloadSchema: z.object({ orderId: z.string() }),
            processType: "OrderFulfillmentSaga",
          });
        }
      );

      When('a valid process command is parsed with commandType "StartOrderFulfillment"', () => {
        state.parseResult = state.schema!.parse({
          ...makeBaseCommand("StartOrderFulfillment"),
          targetContext: "sagas",
          payload: { orderId: "order_123" },
        });
      });

      Then('the parsed command has processType "OrderFulfillmentSaga"', () => {
        expect(state.parseResult.processType).toBe("OrderFulfillmentSaga");
      });
    });
  });

  // ==========================================================================
  // createProcessCommandSchema — process type optional
  // ==========================================================================

  Rule(
    "createProcessCommandSchema makes process type optional when not configured",
    ({ RuleScenario }) => {
      RuleScenario("Process type is undefined when not configured", ({ Given, When, Then }) => {
        Given('a process command schema for "StartProcess" with payload fields "id"', () => {
          state.schema = createProcessCommandSchema({
            commandType: "StartProcess",
            payloadSchema: z.object({ id: z.string() }),
          });
        });

        When('a valid process command is parsed with commandType "StartProcess"', () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("StartProcess"),
            targetContext: "processes",
            payload: { id: "proc_123" },
          });
        });

        Then("the parsed command has undefined processType", () => {
          expect(state.parseResult.processType).toBeUndefined();
        });
      });
    }
  );

  // ==========================================================================
  // createSystemCommandSchema — system category
  // ==========================================================================

  Rule("createSystemCommandSchema produces schemas with system category", ({ RuleScenario }) => {
    RuleScenario(
      "Schema assigns system category and preserves command type",
      ({ Given, When, Then, And }) => {
        Given(
          'a system command schema for "CleanupExpiredCommands" with payload fields "olderThanDays:number"',
          () => {
            state.schema = createSystemCommandSchema({
              commandType: "CleanupExpiredCommands",
              payloadSchema: z.object({ olderThanDays: z.number() }),
            });
          }
        );

        When('a valid system command is parsed with commandType "CleanupExpiredCommands"', () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("CleanupExpiredCommands"),
            targetContext: "system",
            payload: { olderThanDays: 30 },
          });
        });

        Then('the parsed command has category "system"', () => {
          expect(state.parseResult.category).toBe("system");
        });

        And('the parsed command has commandType "CleanupExpiredCommands"', () => {
          expect(state.parseResult.commandType).toBe("CleanupExpiredCommands");
        });
      }
    );
  });

  // ==========================================================================
  // createSystemCommandSchema — requiresIdempotency default
  // ==========================================================================

  Rule("createSystemCommandSchema defaults requiresIdempotency to false", ({ RuleScenario }) => {
    RuleScenario("requiresIdempotency defaults to false", ({ Given, When, Then }) => {
      Given('a system command schema for "RunHealthCheck" with empty payload', () => {
        state.schema = createSystemCommandSchema({
          commandType: "RunHealthCheck",
          payloadSchema: z.object({}),
        });
      });

      When('a valid system command is parsed with commandType "RunHealthCheck"', () => {
        state.parseResult = state.schema!.parse({
          ...makeBaseCommand("RunHealthCheck"),
          targetContext: "system",
          payload: {},
        });
      });

      Then("the parsed command has requiresIdempotency false", () => {
        expect(state.parseResult.requiresIdempotency).toBe(false);
      });
    });
  });

  // ==========================================================================
  // createSystemCommandSchema — requiresIdempotency override
  // ==========================================================================

  Rule("createSystemCommandSchema allows overriding requiresIdempotency", ({ RuleScenario }) => {
    RuleScenario("requiresIdempotency can be set to true", ({ Given, When, Then }) => {
      Given('a system command schema for "MigrateData" with requiresIdempotency true', () => {
        state.schema = createSystemCommandSchema({
          commandType: "MigrateData",
          payloadSchema: z.object({ batchSize: z.number() }),
          requiresIdempotency: true,
        });
      });

      When('a valid system command is parsed with commandType "MigrateData"', () => {
        state.parseResult = state.schema!.parse({
          ...makeBaseCommand("MigrateData"),
          targetContext: "system",
          payload: { batchSize: 100 },
        });
      });

      Then("the parsed command has requiresIdempotency true", () => {
        expect(state.parseResult.requiresIdempotency).toBe(true);
      });
    });
  });

  // ==========================================================================
  // createBatchCommandSchema — batch category
  // ==========================================================================

  Rule(
    "createBatchCommandSchema produces schemas with batch category and items array",
    ({ RuleScenario }) => {
      RuleScenario("Schema assigns batch category with items", ({ Given, When, Then, And }) => {
        Given(
          'a batch command schema for "BulkCreateOrders" with item fields "customerId,productId"',
          () => {
            state.schema = createBatchCommandSchema({
              commandType: "BulkCreateOrders",
              itemPayloadSchema: z.object({
                customerId: z.string(),
                productId: z.string(),
              }),
            });
          }
        );

        When("a valid batch command is parsed with 2 items", () => {
          state.parseResult = state.schema!.parse({
            ...makeBaseCommand("BulkCreateOrders"),
            payload: {
              items: [
                { customerId: "c1", productId: "p1" },
                { customerId: "c2", productId: "p2" },
              ],
            },
          });
        });

        Then('the parsed command has category "batch"', () => {
          expect(state.parseResult.category).toBe("batch");
        });

        And("the parsed command has 2 items", () => {
          expect(state.parseResult.payload.items).toHaveLength(2);
        });
      });
    }
  );

  // ==========================================================================
  // createBatchCommandSchema — batch config
  // ==========================================================================

  Rule("createBatchCommandSchema includes batch config when provided", ({ RuleScenario }) => {
    RuleScenario("Batch config is present on parsed command", ({ Given, When, Then }) => {
      Given(
        'a batch command schema for "BulkUpdateProducts" with batchConfig maxItems 100 and continueOnError true',
        () => {
          state.schema = createBatchCommandSchema({
            commandType: "BulkUpdateProducts",
            itemPayloadSchema: z.object({ productId: z.string() }),
            batchConfig: {
              maxItems: 100,
              continueOnError: true,
            },
          });
        }
      );

      When("a valid batch command is parsed with 1 item", () => {
        state.parseResult = state.schema!.parse({
          ...makeBaseCommand("BulkUpdateProducts"),
          targetContext: "inventory",
          payload: {
            items: [{ productId: "p1" }],
          },
        });
      });

      Then("the parsed command has batchConfig maxItems 100 and continueOnError true", () => {
        expect(state.parseResult.batchConfig).toEqual({
          maxItems: 100,
          continueOnError: true,
        });
      });
    });
  });

  // ==========================================================================
  // createBatchCommandSchema — item schema validation
  // ==========================================================================

  Rule("createBatchCommandSchema validates items against item schema", ({ RuleScenario }) => {
    RuleScenario(
      "Schema rejects items that fail item schema validation",
      ({ Given, When, Then }) => {
        Given(
          'a batch command schema for "BulkProcess" with item fields "id,value:positive-number"',
          () => {
            state.schema = createBatchCommandSchema({
              commandType: "BulkProcess",
              itemPayloadSchema: z.object({
                id: z.string(),
                value: z.number().positive(),
              }),
            });
          }
        );

        When("a batch command is parsed with an invalid item value -5", () => {
          try {
            state.parseResult = state.schema!.parse({
              ...makeBaseCommand("BulkProcess"),
              targetContext: "batch",
              payload: {
                items: [{ id: "1", value: -5 }],
              },
            });
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      }
    );
  });

  // ==========================================================================
  // createBatchCommandSchema — empty items
  // ==========================================================================

  Rule("createBatchCommandSchema allows empty items array", ({ RuleScenario }) => {
    RuleScenario("Empty items array is accepted", ({ Given, When, Then }) => {
      Given('a batch command schema for "BulkProcess" with item fields "id"', () => {
        state.schema = createBatchCommandSchema({
          commandType: "BulkProcess",
          itemPayloadSchema: z.object({ id: z.string() }),
        });
      });

      When("a valid batch command is parsed with 0 items", () => {
        state.parseResult = state.schema!.parse({
          ...makeBaseCommand("BulkProcess"),
          targetContext: "batch",
          payload: { items: [] },
        });
      });

      Then("the parsed command has 0 items", () => {
        expect(state.parseResult.payload.items).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // getCommandCategoryFromSchema — extracts category
  // ==========================================================================

  Rule(
    "getCommandCategoryFromSchema extracts category from factory-created schemas",
    ({ RuleScenario }) => {
      RuleScenario("Category is extracted from each factory schema", ({ Given, Then }) => {
        Given("a schema from each command category factory:", (_ctx, dataTable) => {
          const rows = getDataTableRows<{ factory: string; expected: string }>(dataTable);
          state.categoryResults = rows.map((row) => {
            let schema: z.ZodType;
            switch (row.factory) {
              case "aggregate":
                schema = createAggregateCommandSchema({
                  commandType: "Test",
                  payloadSchema: z.object({}),
                });
                break;
              case "process":
                schema = createProcessCommandSchema({
                  commandType: "Test",
                  payloadSchema: z.object({}),
                });
                break;
              case "system":
                schema = createSystemCommandSchema({
                  commandType: "Test",
                  payloadSchema: z.object({}),
                });
                break;
              case "batch":
                schema = createBatchCommandSchema({
                  commandType: "Test",
                  itemPayloadSchema: z.object({}),
                });
                break;
              default:
                throw new Error(`Unknown factory: ${row.factory}`);
            }
            return { factory: row.factory, result: getCommandCategoryFromSchema(schema) };
          });
        });

        Then("each extraction returns the expected category", () => {
          const expected = ["aggregate", "process", "system", "batch"];
          expect(state.categoryResults).toHaveLength(expected.length);
          for (let i = 0; i < expected.length; i++) {
            expect(state.categoryResults[i]!.result).toBe(expected[i]);
          }
        });
      });
    }
  );

  // ==========================================================================
  // getCommandCategoryFromSchema — non-command schemas
  // ==========================================================================

  Rule(
    "getCommandCategoryFromSchema returns undefined for non-command schemas",
    ({ RuleScenario }) => {
      RuleScenario("Non-command schemas return undefined", ({ Given, Then }) => {
        Given(
          "getCommandCategoryFromSchema is called on non-command schemas:",
          (_ctx, dataTable) => {
            const rows = getDataTableRows<{ schemaType: string }>(dataTable);
            state.categoryResults = rows.map((row) => {
              let schema: z.ZodType;
              switch (row.schemaType) {
                case "string":
                  schema = z.string();
                  break;
                case "number":
                  schema = z.number();
                  break;
                case "plain-object":
                  schema = z.object({ name: z.string() });
                  break;
                default:
                  throw new Error(`Unknown schema type: ${row.schemaType}`);
              }
              return { factory: row.schemaType, result: getCommandCategoryFromSchema(schema) };
            });
          }
        );

        Then("each extraction returns undefined", () => {
          expect(state.categoryResults).toHaveLength(3);
          for (const entry of state.categoryResults) {
            expect(entry.result).toBeUndefined();
          }
        });
      });
    }
  );
});
