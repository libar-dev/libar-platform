/**
 * CommandRegistry - Step Definitions
 *
 * BDD step definitions for CommandRegistry:
 * - Singleton pattern
 * - Command registration and lookup
 * - Duplicate detection
 * - Category-based filtering
 * - Validation
 *
 * Mechanical migration from tests/unit/registry/CommandRegistry.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";
import { CommandRegistry, globalRegistry } from "../../../src/registry/index.js";
import type {
  CommandRegistration,
  CommandDefinitionMetadata,
} from "../../../src/registry/types.js";
import type { CommandConfig, CommandHandlerResult } from "../../../src/orchestration/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Helpers (from original test)
// =============================================================================

const mockFunctionRef = () => ({}) as never;

function createMockRegistration(
  commandType: string,
  options: Partial<{
    boundedContext: string;
    category: "aggregate" | "process" | "system" | "batch";
    targetAggregate: { type: string; idField: string };
    targetProcess: string;
    subsystem: string;
    description: string;
    tags: string[];
    hasSecondaryProjections: boolean;
    hasSagaRoute: boolean;
    hasFailedProjection: boolean;
  }> = {}
): CommandRegistration<Record<string, unknown>, unknown> {
  const metadata: CommandDefinitionMetadata = {
    commandType,
    boundedContext: options.boundedContext ?? "test",
    category: options.category ?? "aggregate",
    schemaVersion: 1,
  };

  if (options.targetAggregate) {
    metadata.targetAggregate = options.targetAggregate;
  }
  if (options.targetProcess) {
    metadata.targetProcess = options.targetProcess;
  }
  if (options.subsystem) {
    metadata.subsystem = options.subsystem;
  }
  if (options.description) {
    metadata.description = options.description;
  }
  if (options.tags) {
    metadata.tags = options.tags;
  }

  const config: CommandConfig<
    Record<string, unknown>,
    Record<string, unknown>,
    CommandHandlerResult<unknown>,
    Record<string, unknown>,
    unknown
  > = {
    commandType,
    boundedContext: options.boundedContext ?? "test",
    handler: mockFunctionRef(),
    toHandlerArgs: (args) => args,
    projection: {
      handler: mockFunctionRef(),
      projectionName: "testProjection",
      toProjectionArgs: () => ({}),
      getPartitionKey: () => ({ name: "test", value: "1" }),
    },
  };

  if (options.hasSecondaryProjections) {
    config.secondaryProjections = [
      {
        handler: mockFunctionRef(),
        projectionName: "secondary",
        toProjectionArgs: () => ({}),
        getPartitionKey: () => ({ name: "test", value: "1" }),
      },
    ];
  }

  if (options.hasSagaRoute) {
    config.sagaRoute = {
      router: mockFunctionRef(),
      getEventType: () => "TestEvent",
    };
  }

  if (options.hasFailedProjection) {
    config.failedProjection = {
      handler: mockFunctionRef(),
      projectionName: "failed",
      toProjectionArgs: () => ({}),
      getPartitionKey: () => ({ name: "test", value: "1" }),
    };
  }

  return {
    metadata,
    argsSchema: z.object({}),
    config,
    registeredAt: Date.now(),
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  registry: CommandRegistry;
  secondInstance: CommandRegistry | null;
  unregisterResult: boolean | null;
  configResult: unknown;
  registrationResult: unknown;
  validationResult: { valid: boolean; data?: unknown; errors?: Array<{ code?: string }> } | null;
  groupByContextResult: Map<string, unknown[]> | null;
}

function createInitialState(): TestState {
  CommandRegistry.resetForTesting();
  return {
    registry: CommandRegistry.getInstance(),
    secondInstance: null,
    unregisterResult: null,
    configResult: undefined,
    registrationResult: undefined,
    validationResult: null,
    groupByContextResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/registry/command-registry.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    CommandRegistry.resetForTesting();
  });

  // ==========================================================================
  // Singleton Pattern
  // ==========================================================================

  Rule("CommandRegistry implements the singleton pattern", ({ RuleScenario }) => {
    RuleScenario(
      "getInstance returns the same instance on multiple calls",
      ({ Given, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Already done in BeforeEachScenario
        });

        When("getInstance is called again", () => {
          state.secondInstance = CommandRegistry.getInstance();
        });

        Then("both instances are the same object", () => {
          expect(state.registry).toBe(state.secondInstance);
        });
      }
    );

    RuleScenario("Reset creates a new instance", ({ Given, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Already done in BeforeEachScenario
      });

      When("the registry is reset and a new instance is obtained", () => {
        CommandRegistry.resetForTesting();
        state.secondInstance = CommandRegistry.getInstance();
      });

      Then("the new instance is a different object", () => {
        expect(state.registry).not.toBe(state.secondInstance);
      });
    });
  });

  // ==========================================================================
  // Command Registration
  // ==========================================================================

  Rule("Commands can be registered and duplicate registration is rejected", ({ RuleScenario }) => {
    RuleScenario("Register a command successfully", ({ Given, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      When('a "CreateOrder" command is registered', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
      });

      Then('the registry has "CreateOrder"', () => {
        expect(state.registry.has("CreateOrder")).toBe(true);
      });
    });

    RuleScenario("Duplicate registration throws an error", ({ Given, And, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered in context "orders"', () => {
        state.registry.register(
          createMockRegistration("CreateOrder", { boundedContext: "orders" })
        );
      });

      When('a duplicate "CreateOrder" command is registered in context "other"', () => {
        // Captured in Then
      });

      Then('the registration throws a duplicate error mentioning "orders"', () => {
        expect(() =>
          state.registry.register(
            createMockRegistration("CreateOrder", { boundedContext: "other" })
          )
        ).toThrow(
          'Duplicate command registration: "CreateOrder" is already registered in context "orders"'
        );
      });
    });

    RuleScenario("Different command types can be registered", ({ Given, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      When('"CreateOrder" and "CancelOrder" commands are both registered', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
        state.registry.register(createMockRegistration("CancelOrder"));
      });

      Then("the registry size is 2", () => {
        expect(state.registry.size()).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Unregister
  // ==========================================================================

  Rule("Commands can be unregistered from the registry", ({ RuleScenario }) => {
    RuleScenario("Unregister removes a registered command", ({ Given, And, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
      });

      When('"CreateOrder" is unregistered', () => {
        state.unregisterResult = state.registry.unregister("CreateOrder");
      });

      Then("unregister returned true", () => {
        expect(state.unregisterResult).toBe(true);
      });

      And('the registry does not have "CreateOrder"', () => {
        expect(state.registry.has("CreateOrder")).toBe(false);
      });
    });

    RuleScenario("Unregister returns false for non-existent command", ({ Given, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      When('"NonExistent" is unregistered', () => {
        state.unregisterResult = state.registry.unregister("NonExistent");
      });

      Then("unregister returned false", () => {
        expect(state.unregisterResult).toBe(false);
      });
    });
  });

  // ==========================================================================
  // getConfig
  // ==========================================================================

  Rule("getConfig returns the command configuration or undefined", ({ RuleScenario }) => {
    RuleScenario(
      "getConfig returns config for a registered command",
      ({ Given, And, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Done in BeforeEachScenario
        });

        And('a "CreateOrder" command is registered', () => {
          state.registry.register(createMockRegistration("CreateOrder"));
        });

        When('getConfig is called for "CreateOrder"', () => {
          state.configResult = state.registry.getConfig("CreateOrder");
        });

        Then('the config is defined with commandType "CreateOrder"', () => {
          expect(state.configResult).toBeDefined();
          expect((state.configResult as { commandType: string })?.commandType).toBe("CreateOrder");
        });
      }
    );

    RuleScenario(
      "getConfig returns undefined for a non-existent command",
      ({ Given, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Done in BeforeEachScenario
        });

        When('getConfig is called for "NonExistent"', () => {
          state.configResult = state.registry.getConfig("NonExistent");
        });

        Then("the config is undefined", () => {
          expect(state.configResult).toBeUndefined();
        });
      }
    );
  });

  // ==========================================================================
  // getRegistration
  // ==========================================================================

  Rule("getRegistration returns the full registration or undefined", ({ RuleScenario }) => {
    RuleScenario(
      "getRegistration returns full registration for a registered command",
      ({ Given, And, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Done in BeforeEachScenario
        });

        And('a "CreateOrder" command is registered with description "Creates an order"', () => {
          state.registry.register(
            createMockRegistration("CreateOrder", { description: "Creates an order" })
          );
        });

        When('getRegistration is called for "CreateOrder"', () => {
          state.registrationResult = state.registry.getRegistration("CreateOrder");
        });

        Then(
          'the registration is defined with commandType "CreateOrder" and description "Creates an order"',
          () => {
            expect(state.registrationResult).toBeDefined();
            const reg = state.registrationResult as CommandRegistration<
              Record<string, unknown>,
              unknown
            >;
            expect(reg.metadata.commandType).toBe("CreateOrder");
            expect(reg.metadata.description).toBe("Creates an order");
          }
        );
      }
    );

    RuleScenario(
      "getRegistration returns undefined for a non-existent command",
      ({ Given, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Done in BeforeEachScenario
        });

        When('getRegistration is called for "NonExistent"', () => {
          state.registrationResult = state.registry.getRegistration("NonExistent");
        });

        Then("the registration result is undefined", () => {
          expect(state.registrationResult).toBeUndefined();
        });
      }
    );
  });

  // ==========================================================================
  // has
  // ==========================================================================

  Rule("has checks whether a command is registered", ({ RuleScenario }) => {
    RuleScenario("has returns true for a registered command", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
      });

      Then('the registry has "CreateOrder"', () => {
        expect(state.registry.has("CreateOrder")).toBe(true);
      });
    });

    RuleScenario("has returns false for a non-existent command", ({ Given, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      Then('the registry does not have "NonExistent"', () => {
        expect(state.registry.has("NonExistent")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Validate
  // ==========================================================================

  Rule("validate checks command payloads against registered Zod schemas", ({ RuleScenario }) => {
    RuleScenario("Validate returns valid for correct payload", ({ Given, And, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered with orderId and customerId schema', () => {
        const registration = createMockRegistration("CreateOrder");
        registration.argsSchema = z.object({
          orderId: z.string(),
          customerId: z.string(),
        });
        state.registry.register(registration);
      });

      When('"CreateOrder" is validated with orderId "ord_123" and customerId "cust_456"', () => {
        state.validationResult = state.registry.validate("CreateOrder", {
          orderId: "ord_123",
          customerId: "cust_456",
        }) as TestState["validationResult"];
      });

      Then("validation is valid with matching data", () => {
        expect(state.validationResult!.valid).toBe(true);
        expect(state.validationResult!.data).toEqual({
          orderId: "ord_123",
          customerId: "cust_456",
        });
      });
    });

    RuleScenario("Validate returns invalid for incorrect payload", ({ Given, And, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered with orderId and customerId schema', () => {
        const registration = createMockRegistration("CreateOrder");
        registration.argsSchema = z.object({
          orderId: z.string(),
          customerId: z.string(),
        });
        state.registry.register(registration);
      });

      When('"CreateOrder" is validated with only orderId "ord_123"', () => {
        state.validationResult = state.registry.validate("CreateOrder", {
          orderId: "ord_123",
        }) as TestState["validationResult"];
      });

      Then("validation is invalid with errors", () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.errors).toBeDefined();
        expect(state.validationResult!.errors!.length).toBeGreaterThan(0);
      });
    });

    RuleScenario(
      "Validate returns UNKNOWN_COMMAND for non-existent command",
      ({ Given, When, Then }) => {
        Given("a fresh CommandRegistry instance", () => {
          // Done in BeforeEachScenario
        });

        When('"NonExistent" is validated with empty payload', () => {
          state.validationResult = state.registry.validate(
            "NonExistent",
            {}
          ) as TestState["validationResult"];
        });

        Then('validation is invalid with error code "UNKNOWN_COMMAND"', () => {
          expect(state.validationResult!.valid).toBe(false);
          expect(state.validationResult!.errors![0]!.code).toBe("UNKNOWN_COMMAND");
        });
      }
    );
  });

  // ==========================================================================
  // List
  // ==========================================================================

  Rule("list returns all registered commands as CommandInfo objects", ({ RuleScenario }) => {
    RuleScenario("list returns empty array when no commands are registered", ({ Given, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      Then("list returns an empty array", () => {
        expect(state.registry.list()).toEqual([]);
      });
    });

    RuleScenario("list returns all registered commands", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('"CreateOrder" and "CancelOrder" are registered for listing', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
        state.registry.register(createMockRegistration("CancelOrder"));
      });

      Then("list returns 2 commands containing:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string }>(dataTable);
        const list = state.registry.list();
        expect(list).toHaveLength(2);
        for (const row of rows) {
          expect(list.map((c) => c.commandType)).toContain(row.commandType);
        }
      });
    });

    RuleScenario("list returns CommandInfo objects with correct shape", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('a "CreateOrder" command is registered with full metadata', () => {
        state.registry.register(
          createMockRegistration("CreateOrder", {
            boundedContext: "orders",
            category: "aggregate",
            targetAggregate: { type: "Order", idField: "orderId" },
            description: "Creates an order",
            tags: ["orders", "create"],
            hasSecondaryProjections: true,
            hasSagaRoute: true,
          })
        );
      });

      Then("the CommandInfo has the expected fields", () => {
        const [info] = state.registry.list();
        expect(info!.commandType).toBe("CreateOrder");
        expect(info!.boundedContext).toBe("orders");
        expect(info!.category).toBe("aggregate");
        expect(info!.targetAggregate).toBe("Order");
        expect(info!.description).toBe("Creates an order");
        expect(info!.tags).toEqual(["orders", "create"]);
        expect(info!.hasProjection).toBe(true);
        expect(info!.hasSecondaryProjections).toBe(true);
        expect(info!.hasSagaRoute).toBe(true);
        expect(info!.hasFailedProjection).toBe(false);
      });
    });
  });

  // ==========================================================================
  // listByCategory
  // ==========================================================================

  Rule("listByCategory filters commands by their category", ({ RuleScenario }) => {
    RuleScenario("Filter commands by category", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And("the following categorized commands are registered:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ commandType: string; category: string }>(dataTable);
        for (const row of rows) {
          state.registry.register(
            createMockRegistration(row.commandType, {
              category: row.category as "aggregate" | "process" | "system" | "batch",
            })
          );
        }
      });

      Then("listByCategory returns the expected results:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ category: string; count: string; commandType: string }>(
          dataTable
        );
        for (const row of rows) {
          const results = state.registry.listByCategory(
            row.category as "aggregate" | "process" | "system" | "batch"
          );
          expect(results).toHaveLength(Number(row.count));
          if (Number(row.count) > 0 && row.commandType) {
            expect(results[0]!.commandType).toBe(row.commandType);
          }
        }
      });
    });
  });

  // ==========================================================================
  // listByContext
  // ==========================================================================

  Rule("listByContext filters commands by bounded context", ({ RuleScenario }) => {
    RuleScenario("Filter commands by bounded context", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And("commands are registered across contexts for context filtering", () => {
        state.registry.register(
          createMockRegistration("CreateOrder", { boundedContext: "orders" })
        );
        state.registry.register(
          createMockRegistration("CancelOrder", { boundedContext: "orders" })
        );
        state.registry.register(
          createMockRegistration("ReserveStock", { boundedContext: "inventory" })
        );
      });

      Then('listByContext "orders" returns 2 commands', () => {
        const ordersCommands = state.registry.listByContext("orders");
        expect(ordersCommands).toHaveLength(2);
        expect(ordersCommands.map((c) => c.commandType)).toContain("CreateOrder");
        expect(ordersCommands.map((c) => c.commandType)).toContain("CancelOrder");
      });

      And('listByContext "nonexistent" returns 0 commands', () => {
        const commands = state.registry.listByContext("nonexistent");
        expect(commands).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // listByTag
  // ==========================================================================

  Rule("listByTag filters commands by tag", ({ RuleScenario }) => {
    RuleScenario("Filter commands by tag", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And("commands are registered with tags for tag filtering", () => {
        state.registry.register(
          createMockRegistration("CreateOrder", { tags: ["orders", "create"] })
        );
        state.registry.register(
          createMockRegistration("CancelOrder", { tags: ["orders", "cancel"] })
        );
        state.registry.register(createMockRegistration("ReserveStock", { tags: ["inventory"] }));
      });

      Then('listByTag "orders" returns 2 commands', () => {
        const ordersCommands = state.registry.listByTag("orders");
        expect(ordersCommands).toHaveLength(2);
      });

      And('listByTag "inventory" returns 1 command with commandType "ReserveStock"', () => {
        const inventoryCommands = state.registry.listByTag("inventory");
        expect(inventoryCommands).toHaveLength(1);
        expect(inventoryCommands[0]!.commandType).toBe("ReserveStock");
      });

      And('listByTag "nonexistent" returns 0 commands', () => {
        const commands = state.registry.listByTag("nonexistent");
        expect(commands).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // groupByContext
  // ==========================================================================

  Rule("groupByContext groups commands by their bounded context", ({ RuleScenario }) => {
    RuleScenario("Group commands by bounded context", ({ Given, And, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And("commands are registered across contexts for grouping", () => {
        state.registry.register(
          createMockRegistration("CreateOrder", { boundedContext: "orders" })
        );
        state.registry.register(
          createMockRegistration("CancelOrder", { boundedContext: "orders" })
        );
        state.registry.register(
          createMockRegistration("ReserveStock", { boundedContext: "inventory" })
        );
      });

      Then("groupByContext returns a map with 2 keys", () => {
        state.groupByContextResult = state.registry.groupByContext();
        expect(state.groupByContextResult.size).toBe(2);
      });

      And('the "orders" group has 2 commands', () => {
        expect(state.groupByContextResult!.get("orders")).toHaveLength(2);
      });

      And('the "inventory" group has 1 command', () => {
        expect(state.groupByContextResult!.get("inventory")).toHaveLength(1);
      });
    });

    RuleScenario("groupByContext returns empty map when no commands", ({ Given, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      Then("groupByContext returns a map with 0 keys", () => {
        const groups = state.registry.groupByContext();
        expect(groups.size).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Size
  // ==========================================================================

  Rule("size returns the number of registered commands", ({ RuleScenario }) => {
    RuleScenario("Size reflects registered command count", ({ Given, Then, When }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      Then("the registry size is 0", () => {
        expect(state.registry.size()).toBe(0);
      });

      When('"CreateOrder" and "CancelOrder" are registered for size check', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
        state.registry.register(createMockRegistration("CancelOrder"));
      });

      Then("the registry size is 2", () => {
        expect(state.registry.size()).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Clear
  // ==========================================================================

  Rule("clear removes all registrations", ({ RuleScenario }) => {
    RuleScenario("Clear removes all registrations", ({ Given, And, When, Then }) => {
      Given("a fresh CommandRegistry instance", () => {
        // Done in BeforeEachScenario
      });

      And('"CreateOrder" and "CancelOrder" are registered for clearing', () => {
        state.registry.register(createMockRegistration("CreateOrder"));
        state.registry.register(createMockRegistration("CancelOrder"));
      });

      When("the registry is cleared", () => {
        state.registry.clear();
      });

      Then("the registry size is 0", () => {
        expect(state.registry.size()).toBe(0);
      });
    });
  });

  // ==========================================================================
  // globalRegistry
  // ==========================================================================

  Rule("globalRegistry is a functional singleton instance", ({ RuleScenario }) => {
    RuleScenario("globalRegistry is a functional registry instance", ({ Then, And }) => {
      Then("globalRegistry is defined", () => {
        expect(globalRegistry).toBeDefined();
      });

      And("globalRegistry exposes a register function", () => {
        expect(typeof globalRegistry.register).toBe("function");
      });
    });
  });
});
