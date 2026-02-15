/**
 * Batch Validation - Step Definitions
 *
 * BDD step definitions for batch command pre-flight validation:
 * - Empty batch rejection
 * - Partial mode validation (with and without registry)
 * - Atomic mode validation (with and without registry)
 * - Bounded context filtering
 * - extractAggregateId utility
 * - groupByAggregateId utility
 *
 * Mechanical migration from tests/unit/batch/validation.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  validateBatch,
  extractAggregateId,
  groupByAggregateId,
} from "../../../src/batch/validation.js";
import type { BatchCommand } from "../../../src/batch/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Registry
// =============================================================================

const mockRegistry = (
  registrations: Record<
    string,
    {
      category: string;
      boundedContext: string;
      targetAggregate?: { type: string; idField: string };
    }
  >
) => {
  return (commandType: string) => registrations[commandType];
};

/**
 * Standard registry used by "atomic mode with registry" scenarios.
 */
function createStandardAtomicRegistry() {
  return mockRegistry({
    AddOrderItem: {
      category: "aggregate",
      boundedContext: "orders",
      targetAggregate: { type: "Order", idField: "orderId" },
    },
    RemoveOrderItem: {
      category: "aggregate",
      boundedContext: "orders",
      targetAggregate: { type: "Order", idField: "orderId" },
    },
    ReserveStock: {
      category: "aggregate",
      boundedContext: "inventory",
      targetAggregate: { type: "Stock", idField: "productId" },
    },
    SendNotification: {
      category: "system",
      boundedContext: "notifications",
    },
  });
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  commands: BatchCommand[];
  registry: ((commandType: string) => unknown) | undefined;
  validationResult: {
    valid: boolean;
    errors?: Array<{ code: string; commandIndex?: number }>;
  } | null;
  singleCommand: BatchCommand | null;
  extractedId: string | undefined;
  groups: Map<string, BatchCommand[]> | null;
}

function createInitialState(): TestState {
  return {
    commands: [],
    registry: undefined,
    validationResult: null,
    singleCommand: null,
    extractedId: undefined,
    groups: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/batch/validation.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Empty Batch
  // ==========================================================================

  Rule("Empty batches are always rejected", ({ RuleScenario }) => {
    RuleScenario("Rejects empty batch", ({ Given, When, Then }) => {
      Given("an empty batch of commands", () => {
        state.commands = [];
      });

      When('the batch is validated in "partial" mode', () => {
        state.validationResult = validateBatch([], {
          mode: "partial",
        }) as TestState["validationResult"];
      });

      Then('validation fails with error code "EMPTY_BATCH"', () => {
        expect(state.validationResult?.valid).toBe(false);
        if (!state.validationResult?.valid) {
          expect(state.validationResult?.errors?.[0]?.code).toBe("EMPTY_BATCH");
        }
      });
    });
  });

  // ==========================================================================
  // Partial Mode
  // ==========================================================================

  Rule(
    "Partial mode accepts valid commands without cross-aggregate constraints",
    ({ RuleScenario }) => {
      RuleScenario("Accepts valid commands without registry", ({ Given, When, Then }) => {
        Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
          state.commands = rows.map((r) => ({
            commandType: r.commandType,
            args: JSON.parse(r.args),
          }));
        });

        When('the batch is validated in "partial" mode without registry', () => {
          state.validationResult = validateBatch(state.commands, {
            mode: "partial",
          }) as TestState["validationResult"];
        });

        Then("validation succeeds", () => {
          expect(state.validationResult?.valid).toBe(true);
        });
      });

      RuleScenario(
        "Accepts commands in different bounded contexts",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("a registry with entries:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              commandType: string;
              category: string;
              boundedContext: string;
              aggregateType: string;
              idField: string;
            }>(dataTable);
            const registrations: Record<
              string,
              {
                category: string;
                boundedContext: string;
                targetAggregate?: { type: string; idField: string };
              }
            > = {};
            for (const r of rows) {
              registrations[r.commandType] = {
                category: r.category,
                boundedContext: r.boundedContext,
                ...(r.aggregateType
                  ? { targetAggregate: { type: r.aggregateType, idField: r.idField } }
                  : {}),
              };
            }
            state.registry = mockRegistry(registrations);
          });

          When('the batch is validated in "partial" mode with registry', () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "partial" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          });

          Then("validation succeeds", () => {
            expect(state.validationResult?.valid).toBe(true);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Atomic Mode Without Registry
  // ==========================================================================

  Rule("Atomic mode without registry requires explicit aggregate options", ({ RuleScenario }) => {
    RuleScenario("Requires aggregateId option", ({ Given, When, Then }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When('the batch is validated in "atomic" mode without options', () => {
        state.validationResult = validateBatch(state.commands, {
          mode: "atomic",
        }) as TestState["validationResult"];
      });

      Then('validation fails with error code "MISSING_AGGREGATE_ID"', () => {
        expect(state.validationResult?.valid).toBe(false);
        if (!state.validationResult?.valid) {
          expect(state.validationResult?.errors?.[0]?.code).toBe("MISSING_AGGREGATE_ID");
        }
      });
    });

    RuleScenario("Requires aggregateIdField option", ({ Given, When, Then }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When('the batch is validated in "atomic" mode with only aggregateId "ord_1"', () => {
        state.validationResult = validateBatch(state.commands, {
          mode: "atomic",
          aggregateId: "ord_1",
        }) as TestState["validationResult"];
      });

      Then('validation fails with error code "MISSING_AGGREGATE_ID"', () => {
        expect(state.validationResult?.valid).toBe(false);
        if (!state.validationResult?.valid) {
          expect(state.validationResult?.errors?.[0]?.code).toBe("MISSING_AGGREGATE_ID");
        }
      });
    });

    RuleScenario("Accepts when all commands target same aggregate", ({ Given, When, Then }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When(
        'the batch is validated in "atomic" mode with aggregateId "ord_1" and field "orderId"',
        () => {
          state.validationResult = validateBatch(state.commands, {
            mode: "atomic",
            aggregateId: "ord_1",
            aggregateIdField: "orderId",
          }) as TestState["validationResult"];
        }
      );

      Then("validation succeeds", () => {
        expect(state.validationResult?.valid).toBe(true);
      });
    });

    RuleScenario("Rejects when commands target different aggregates", ({ Given, When, Then }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When(
        'the batch is validated in "atomic" mode with aggregateId "ord_1" and field "orderId"',
        () => {
          state.validationResult = validateBatch(state.commands, {
            mode: "atomic",
            aggregateId: "ord_1",
            aggregateIdField: "orderId",
          }) as TestState["validationResult"];
        }
      );

      Then('validation fails with error code "CROSS_AGGREGATE_ATOMIC" at command index 1', () => {
        expect(state.validationResult?.valid).toBe(false);
        if (!state.validationResult?.valid) {
          expect(state.validationResult?.errors?.[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
          expect(state.validationResult?.errors?.[0]?.commandIndex).toBe(1);
        }
      });
    });
  });

  // ==========================================================================
  // Atomic Mode With Registry
  // ==========================================================================

  Rule(
    "Atomic mode with registry enforces single-aggregate scope via metadata",
    ({ RuleScenario }) => {
      RuleScenario(
        "Accepts commands targeting same aggregate with explicit aggregateId",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("the standard atomic registry", () => {
            state.registry = createStandardAtomicRegistry();
          });

          When(
            'the batch is validated in "atomic" mode with explicit aggregateId "ord_1" and registry',
            () => {
              state.validationResult = validateBatch(
                state.commands,
                { mode: "atomic", aggregateId: "ord_1" },
                state.registry as Parameters<typeof validateBatch>[2]
              ) as TestState["validationResult"];
            }
          );

          Then("validation succeeds", () => {
            expect(state.validationResult?.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "Infers aggregate ID from first command when not specified",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("the standard atomic registry", () => {
            state.registry = createStandardAtomicRegistry();
          });

          When('the batch is validated in "atomic" mode with registry only', () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "atomic" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          });

          Then("validation succeeds", () => {
            expect(state.validationResult?.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "Rejects when commands target different aggregate instances",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("the standard atomic registry", () => {
            state.registry = createStandardAtomicRegistry();
          });

          When('the batch is validated in "atomic" mode with registry only', () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "atomic" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          });

          Then('validation fails with error code "CROSS_AGGREGATE_ATOMIC"', () => {
            expect(state.validationResult?.valid).toBe(false);
            if (!state.validationResult?.valid) {
              expect(state.validationResult?.errors?.[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
            }
          });
        }
      );

      RuleScenario(
        "Rejects when commands target different aggregate types",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("the standard atomic registry", () => {
            state.registry = createStandardAtomicRegistry();
          });

          When('the batch is validated in "atomic" mode with registry only', () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "atomic" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          });

          Then('validation fails with error code "CROSS_AGGREGATE_ATOMIC"', () => {
            expect(state.validationResult?.valid).toBe(false);
            if (!state.validationResult?.valid) {
              expect(state.validationResult?.errors?.[0]?.code).toBe("CROSS_AGGREGATE_ATOMIC");
            }
          });
        }
      );

      RuleScenario(
        "Rejects non-aggregate commands in atomic mode",
        ({ Given, And, When, Then }) => {
          Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
            state.commands = rows.map((r) => ({
              commandType: r.commandType,
              args: JSON.parse(r.args),
            }));
          });

          And("the standard atomic registry", () => {
            state.registry = createStandardAtomicRegistry();
          });

          When('the batch is validated in "atomic" mode with registry only', () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "atomic" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          });

          Then('validation fails with error code "WRONG_CATEGORY"', () => {
            expect(state.validationResult?.valid).toBe(false);
            if (!state.validationResult?.valid) {
              expect(state.validationResult?.errors?.[0]?.code).toBe("WRONG_CATEGORY");
            }
          });
        }
      );

      RuleScenario("Rejects unregistered commands", ({ Given, And, When, Then }) => {
        Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
          state.commands = rows.map((r) => ({
            commandType: r.commandType,
            args: JSON.parse(r.args),
          }));
        });

        And("the standard atomic registry", () => {
          state.registry = createStandardAtomicRegistry();
        });

        When('the batch is validated in "atomic" mode with registry only', () => {
          state.validationResult = validateBatch(
            state.commands,
            { mode: "atomic" },
            state.registry as Parameters<typeof validateBatch>[2]
          ) as TestState["validationResult"];
        });

        Then('validation fails with error code "UNREGISTERED_COMMAND" at command index 1', () => {
          expect(state.validationResult?.valid).toBe(false);
          if (!state.validationResult?.valid) {
            expect(state.validationResult?.errors?.[0]?.code).toBe("UNREGISTERED_COMMAND");
            expect(state.validationResult?.errors?.[0]?.commandIndex).toBe(1);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Bounded Context Filtering
  // ==========================================================================

  Rule("Bounded context option filters commands to a single context", ({ RuleScenario }) => {
    RuleScenario(
      "Accepts commands matching specified bounded context",
      ({ Given, And, When, Then }) => {
        Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
          state.commands = rows.map((r) => ({
            commandType: r.commandType,
            args: JSON.parse(r.args),
          }));
        });

        And("a registry with entries:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            commandType: string;
            category: string;
            boundedContext: string;
            aggregateType: string;
            idField: string;
          }>(dataTable);
          const registrations: Record<
            string,
            {
              category: string;
              boundedContext: string;
              targetAggregate?: { type: string; idField: string };
            }
          > = {};
          for (const r of rows) {
            registrations[r.commandType] = {
              category: r.category,
              boundedContext: r.boundedContext,
              ...(r.aggregateType
                ? { targetAggregate: { type: r.aggregateType, idField: r.idField } }
                : {}),
            };
          }
          state.registry = mockRegistry(registrations);
        });

        When(
          'the batch is validated in "partial" mode with boundedContext "orders" and registry',
          () => {
            state.validationResult = validateBatch(
              state.commands,
              { mode: "partial", boundedContext: "orders" },
              state.registry as Parameters<typeof validateBatch>[2]
            ) as TestState["validationResult"];
          }
        );

        Then("validation succeeds", () => {
          expect(state.validationResult?.valid).toBe(true);
        });
      }
    );

    RuleScenario("Rejects commands from wrong bounded context", ({ Given, And, When, Then }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      And("a registry with entries:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          commandType: string;
          category: string;
          boundedContext: string;
          aggregateType: string;
          idField: string;
        }>(dataTable);
        const registrations: Record<
          string,
          {
            category: string;
            boundedContext: string;
            targetAggregate?: { type: string; idField: string };
          }
        > = {};
        for (const r of rows) {
          registrations[r.commandType] = {
            category: r.category,
            boundedContext: r.boundedContext,
            ...(r.aggregateType
              ? { targetAggregate: { type: r.aggregateType, idField: r.idField } }
              : {}),
          };
        }
        state.registry = mockRegistry(registrations);
      });

      When(
        'the batch is validated in "partial" mode with boundedContext "orders" and registry',
        () => {
          state.validationResult = validateBatch(
            state.commands,
            { mode: "partial", boundedContext: "orders" },
            state.registry as Parameters<typeof validateBatch>[2]
          ) as TestState["validationResult"];
        }
      );

      Then('validation fails with error code "WRONG_BOUNDED_CONTEXT" at command index 1', () => {
        expect(state.validationResult?.valid).toBe(false);
        if (!state.validationResult?.valid) {
          expect(state.validationResult?.errors?.[0]?.code).toBe("WRONG_BOUNDED_CONTEXT");
          expect(state.validationResult?.errors?.[0]?.commandIndex).toBe(1);
        }
      });
    });
  });

  // ==========================================================================
  // extractAggregateId
  // ==========================================================================

  Rule("extractAggregateId extracts string IDs from command args", ({ RuleScenario }) => {
    RuleScenario("Extracts ID from command args", ({ Given, When, Then }) => {
      Given(
        'a command "AddOrderItem" with args {"orderId": "ord_123", "productId": "prod_456"}',
        () => {
          state.singleCommand = {
            commandType: "AddOrderItem",
            args: { orderId: "ord_123", productId: "prod_456" },
          };
        }
      );

      When('extractAggregateId is called with field "orderId"', () => {
        state.extractedId = extractAggregateId(state.singleCommand!, "orderId");
      });

      Then('the extracted ID is "ord_123"', () => {
        expect(state.extractedId).toBe("ord_123");
      });
    });

    RuleScenario("Returns undefined for missing field", ({ Given, When, Then }) => {
      Given('a command "AddOrderItem" with args {"productId": "prod_456"}', () => {
        state.singleCommand = {
          commandType: "AddOrderItem",
          args: { productId: "prod_456" },
        };
      });

      When('extractAggregateId is called with field "orderId"', () => {
        state.extractedId = extractAggregateId(state.singleCommand!, "orderId");
      });

      Then("the extracted ID is undefined", () => {
        expect(state.extractedId).toBeUndefined();
      });
    });

    RuleScenario("Returns undefined for non-string value", ({ Given, When, Then }) => {
      Given('a command "AddOrderItem" with args {"orderId": 123}', () => {
        state.singleCommand = {
          commandType: "AddOrderItem",
          args: { orderId: 123 },
        };
      });

      When('extractAggregateId is called with field "orderId"', () => {
        state.extractedId = extractAggregateId(state.singleCommand!, "orderId");
      });

      Then("the extracted ID is undefined", () => {
        expect(state.extractedId).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // groupByAggregateId
  // ==========================================================================

  Rule("groupByAggregateId groups commands by their aggregate ID field", ({ RuleScenario }) => {
    RuleScenario("Groups commands by aggregate ID", ({ Given, When, Then, And }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When('groupByAggregateId is called with field "orderId"', () => {
        state.groups = groupByAggregateId(state.commands, "orderId");
      });

      Then("there are 2 groups", () => {
        expect(state.groups!.size).toBe(2);
      });

      And('group "ord_1" has 2 commands', () => {
        expect(state.groups!.get("ord_1")?.length).toBe(2);
      });

      And('group "ord_2" has 1 command', () => {
        expect(state.groups!.get("ord_2")?.length).toBe(1);
      });
    });

    RuleScenario("Uses placeholder for missing IDs", ({ Given, When, Then, And }) => {
      Given("a batch of commands:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; args: string }>(dataTable);
        state.commands = rows.map((r) => ({
          commandType: r.commandType,
          args: JSON.parse(r.args),
        }));
      });

      When('groupByAggregateId is called with field "orderId"', () => {
        state.groups = groupByAggregateId(state.commands, "orderId");
      });

      Then("there are 2 groups", () => {
        expect(state.groups!.size).toBe(2);
      });

      And('group "ord_1" has 1 command', () => {
        expect(state.groups!.get("ord_1")?.length).toBe(1);
      });

      And('group "__no_id__" has 1 command', () => {
        expect(state.groups!.get("__no_id__")?.length).toBe(1);
      });
    });
  });
});
