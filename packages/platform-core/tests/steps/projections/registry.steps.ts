/**
 * Projection Registry - Step Definitions
 *
 * BDD step definitions for ProjectionRegistry CRUD operations and lookup capabilities.
 * Migrated from tests/unit/projections/registry.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createProjectionRegistry } from "../../../src/projections/registry.js";
import { defineProjection } from "@libar-dev/platform-bc";
import type { ProjectionDefinition } from "@libar-dev/platform-bc";

// =============================================================================
// Test Projection Definitions (same as original test)
// =============================================================================

const orderSummary = defineProjection({
  projectionName: "orderSummary",
  description: "Order summary view",
  targetTable: "orderSummaries",
  partitionKeyField: "orderId",
  eventSubscriptions: ["OrderCreated", "OrderSubmitted"] as const,
  context: "orders",
  type: "primary",
  category: "view",
});

const productCatalog = defineProjection({
  projectionName: "productCatalog",
  description: "Product catalog view",
  targetTable: "productCatalog",
  partitionKeyField: "productId",
  eventSubscriptions: ["ProductCreated", "StockAdded"] as const,
  context: "inventory",
  type: "primary",
  category: "view",
  secondaryTables: ["stockAvailability"],
});

const orderWithInventory = defineProjection({
  projectionName: "orderWithInventory",
  description: "Cross-context order view",
  targetTable: "orderWithInventoryStatus",
  partitionKeyField: "orderId",
  eventSubscriptions: ["OrderCreated", "OrderSubmitted", "StockReserved"] as const,
  context: "cross-context",
  type: "cross-context",
  category: "integration",
  sources: ["orders", "inventory"],
});

const orderExistence = defineProjection({
  projectionName: "orderExistence",
  description: "Order existence check for validation",
  targetTable: "orderExistence",
  partitionKeyField: "orderId",
  eventSubscriptions: ["OrderCreated", "OrderCancelled"] as const,
  context: "orders",
  type: "primary",
  category: "logic",
});

const dailySales = defineProjection({
  projectionName: "dailySales",
  description: "Daily sales aggregation",
  targetTable: "dailySalesReports",
  partitionKeyField: "date",
  eventSubscriptions: ["OrderConfirmed"] as const,
  context: "analytics",
  type: "secondary",
  category: "reporting",
});

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  registry: ReturnType<typeof createProjectionRegistry> | null;
  projection: ProjectionDefinition | undefined;
  projections: ProjectionDefinition[];
  eventProjections: ProjectionDefinition[];
  contextProjections: ProjectionDefinition[];
  categoryProjections: ProjectionDefinition[];
  rebuildOrder: ProjectionDefinition[];
  eventTypes: string[];
  hasResult: boolean;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    registry: null,
    projection: undefined,
    projections: [],
    eventProjections: [],
    contextProjections: [],
    categoryProjections: [],
    rebuildOrder: [],
    eventTypes: [],
    hasResult: false,
    error: null,
  };
}

// =============================================================================
// Projection lookup by name
// =============================================================================

const _projectionMap: Record<string, ProjectionDefinition> = {
  orderSummary,
  productCatalog,
  orderWithInventory,
  orderExistence,
  dailySales,
};

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/projections/registry.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Rule: Registration
  // ===========================================================================

  Rule("Registry accepts and stores projection definitions", ({ RuleScenario }) => {
    RuleScenario("Register a single projection", ({ Given, When, Then, And }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When('I register the "orderSummary" projection', () => {
        state.registry!.register(orderSummary);
      });

      Then('the registry has "orderSummary"', () => {
        expect(state.registry!.has("orderSummary")).toBe(true);
      });

      And("the registry size is 1", () => {
        expect(state.registry!.size).toBe(1);
      });
    });

    RuleScenario("Register multiple projections", ({ Given, When, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When("I register all standard projections", () => {
        state.registry!.register(orderSummary);
        state.registry!.register(productCatalog);
        state.registry!.register(orderWithInventory);
      });

      Then("the registry size is 3", () => {
        expect(state.registry!.size).toBe(3);
      });
    });

    RuleScenario("Duplicate projection name throws error", ({ Given, When, Then }) => {
      Given('a registry with the "orderSummary" projection', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
      });

      When('I attempt to register "orderSummary" again', () => {
        try {
          state.registry!.register(orderSummary);
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('it throws "Projection \\"orderSummary\\" is already registered"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error!.message).toBe('Projection "orderSummary" is already registered');
      });
    });
  });

  // ===========================================================================
  // Rule: Get
  // ===========================================================================

  Rule("Registry returns projection definitions by name", ({ RuleScenario }) => {
    RuleScenario("Get returns projection by name", ({ Given, When, Then, And }) => {
      Given('a registry with "orderSummary" and "productCatalog" projections', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
      });

      When('I get the "orderSummary" projection', () => {
        state.projection = state.registry!.get("orderSummary");
      });

      Then('the projection name is "orderSummary"', () => {
        expect(state.projection).toBeDefined();
        expect(state.projection?.projectionName).toBe("orderSummary");
      });

      And('the target table is "orderSummaries"', () => {
        expect(state.projection?.targetTable).toBe("orderSummaries");
      });
    });

    RuleScenario("Get returns undefined for unknown projection", ({ Given, When, Then }) => {
      Given('a registry with "orderSummary" and "productCatalog" projections', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
      });

      When('I get the "unknownProjection" projection', () => {
        state.projection = state.registry!.get("unknownProjection");
      });

      Then("the result is undefined", () => {
        expect(state.projection).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // Rule: Has
  // ===========================================================================

  Rule("Registry checks existence of projection definitions", ({ RuleScenario }) => {
    RuleScenario("Has returns true for registered projection", ({ Given, When, Then }) => {
      Given('a registry with the "orderSummary" projection', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
      });

      When('I check if the registry has "orderSummary"', () => {
        state.hasResult = state.registry!.has("orderSummary");
      });

      Then("the result is true", () => {
        expect(state.hasResult).toBe(true);
      });
    });

    RuleScenario("Has returns false for unregistered projection", ({ Given, When, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When('I check if the registry has "unknownProjection"', () => {
        state.hasResult = state.registry!.has("unknownProjection");
      });

      Then("the result is false", () => {
        expect(state.hasResult).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: List
  // ===========================================================================

  Rule("Registry lists all registered projection definitions", ({ RuleScenario }) => {
    RuleScenario("List returns empty array for empty registry", ({ Given, When, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When("I list all projections", () => {
        state.projections = state.registry!.list();
      });

      Then("the list is empty", () => {
        expect(state.projections).toEqual([]);
      });
    });

    RuleScenario("List returns all registered projections", ({ Given, When, Then, And }) => {
      Given('a registry with "orderSummary" and "productCatalog" projections', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
      });

      When("I list all projections", () => {
        state.projections = state.registry!.list();
      });

      Then("the list has 2 projections", () => {
        expect(state.projections).toHaveLength(2);
      });

      And("the list contains all of:", (_ctx: unknown, dataTable: { name: string }[]) => {
        const names = state.projections.map((p) => p.projectionName);
        for (const row of dataTable) {
          expect(names).toContain(row.name);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: Size
  // ===========================================================================

  Rule("Registry reports its size accurately", ({ RuleScenario }) => {
    RuleScenario("Size is 0 for empty registry", ({ Given, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      Then("the registry size is 0", () => {
        expect(state.registry!.size).toBe(0);
      });
    });

    RuleScenario("Size reflects registration count", ({ Given, Then }) => {
      Given('a registry with "orderSummary" and "productCatalog" projections', () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
      });

      Then("the registry size is 2", () => {
        expect(state.registry!.size).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Rule: GetByEventType
  // ===========================================================================

  Rule("Registry looks up projections by event type subscription", ({ RuleScenario }) => {
    RuleScenario(
      "GetByEventType returns multiple matching projections",
      ({ Given, When, Then, And }) => {
        Given("a registry with all standard projections", () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderSummary);
          state.registry.register(productCatalog);
          state.registry.register(orderWithInventory);
        });

        When('I get projections by event type "OrderCreated"', () => {
          state.eventProjections = state.registry!.getByEventType("OrderCreated");
        });

        Then("the event lookup returns 2 projections", () => {
          expect(state.eventProjections).toHaveLength(2);
        });

        And("the event lookup contains all of:", (_ctx: unknown, dataTable: { name: string }[]) => {
          const names = state.eventProjections.map((p) => p.projectionName);
          for (const row of dataTable) {
            expect(names).toContain(row.name);
          }
        });
      }
    );

    RuleScenario(
      "GetByEventType returns single context-specific projection",
      ({ Given, When, Then, And }) => {
        Given("a registry with all standard projections", () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderSummary);
          state.registry.register(productCatalog);
          state.registry.register(orderWithInventory);
        });

        When('I get projections by event type "ProductCreated"', () => {
          state.eventProjections = state.registry!.getByEventType("ProductCreated");
        });

        Then("the event lookup returns 1 projection", () => {
          expect(state.eventProjections).toHaveLength(1);
        });

        And('the first event lookup result is "productCatalog"', () => {
          expect(state.eventProjections[0].projectionName).toBe("productCatalog");
        });
      }
    );

    RuleScenario("GetByEventType returns empty for unknown event", ({ Given, When, Then }) => {
      Given("a registry with all standard projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
      });

      When('I get projections by event type "UnknownEvent"', () => {
        state.eventProjections = state.registry!.getByEventType("UnknownEvent");
      });

      Then("the event lookup returns 0 projections", () => {
        expect(state.eventProjections).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // Rule: GetAllEventTypes
  // ===========================================================================

  Rule("Registry aggregates all subscribed event types", ({ RuleScenario }) => {
    RuleScenario("GetAllEventTypes returns empty for empty registry", ({ Given, When, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When("I get all event types", () => {
        state.eventTypes = state.registry!.getAllEventTypes();
      });

      Then("the event types list is empty", () => {
        expect(state.eventTypes).toEqual([]);
      });
    });

    RuleScenario(
      "GetAllEventTypes returns sorted unique event types",
      ({ Given, When, Then, And }) => {
        Given("a registry with all standard projections", () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderSummary);
          state.registry.register(productCatalog);
          state.registry.register(orderWithInventory);
        });

        When("I get all event types", () => {
          state.eventTypes = state.registry!.getAllEventTypes();
        });

        Then("the event types are sorted", () => {
          const sorted = [...state.eventTypes].sort();
          expect(state.eventTypes).toEqual(sorted);
        });

        And("the event types are unique", () => {
          expect(new Set(state.eventTypes).size).toBe(state.eventTypes.length);
        });

        And(
          "the event types include all of:",
          (_ctx: unknown, dataTable: { eventType: string }[]) => {
            for (const row of dataTable) {
              expect(state.eventTypes).toContain(row.eventType);
            }
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: GetByContext
  // ===========================================================================

  Rule("Registry filters projections by bounded context", ({ RuleScenario }) => {
    RuleScenario("GetByContext filters by orders context", ({ Given, When, Then, And }) => {
      Given("a registry with all standard projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
      });

      When('I get projections by context "orders"', () => {
        state.contextProjections = state.registry!.getByContext("orders");
      });

      Then("the context lookup returns 1 projection", () => {
        expect(state.contextProjections).toHaveLength(1);
      });

      And('the first context lookup result is "orderSummary"', () => {
        expect(state.contextProjections[0].projectionName).toBe("orderSummary");
      });
    });

    RuleScenario("GetByContext filters by inventory context", ({ Given, When, Then, And }) => {
      Given("a registry with all standard projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
      });

      When('I get projections by context "inventory"', () => {
        state.contextProjections = state.registry!.getByContext("inventory");
      });

      Then("the context lookup returns 1 projection", () => {
        expect(state.contextProjections).toHaveLength(1);
      });

      And('the first context lookup result is "productCatalog"', () => {
        expect(state.contextProjections[0].projectionName).toBe("productCatalog");
      });
    });

    RuleScenario("GetByContext filters by cross-context", ({ Given, When, Then, And }) => {
      Given("a registry with all standard projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
      });

      When('I get projections by context "cross-context"', () => {
        state.contextProjections = state.registry!.getByContext("cross-context");
      });

      Then("the context lookup returns 1 projection", () => {
        expect(state.contextProjections).toHaveLength(1);
      });

      And('the first context lookup result is "orderWithInventory"', () => {
        expect(state.contextProjections[0].projectionName).toBe("orderWithInventory");
      });
    });

    RuleScenario("GetByContext returns empty for unknown context", ({ Given, When, Then }) => {
      Given("a registry with all standard projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
      });

      When('I get projections by context "unknown"', () => {
        state.contextProjections = state.registry!.getByContext("unknown");
      });

      Then("the context lookup returns 0 projections", () => {
        expect(state.contextProjections).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // Rule: GetRebuildOrder
  // ===========================================================================

  Rule("Registry determines projection rebuild ordering", ({ RuleScenario }) => {
    RuleScenario("GetRebuildOrder returns empty for empty registry", ({ Given, When, Then }) => {
      Given("an empty projection registry", () => {
        state.registry = createProjectionRegistry();
      });

      When("I get the rebuild order", () => {
        state.rebuildOrder = state.registry!.getRebuildOrder();
      });

      Then("the rebuild order is empty", () => {
        expect(state.rebuildOrder).toEqual([]);
      });
    });

    RuleScenario(
      "GetRebuildOrder places primary before cross-context",
      ({ Given, When, Then, And }) => {
        Given("a registry with projections registered in reverse order", () => {
          state.registry = createProjectionRegistry();
          // Register in reverse order to ensure sorting works
          state.registry.register(orderWithInventory);
          state.registry.register(orderSummary);
          state.registry.register(productCatalog);
        });

        When("I get the rebuild order", () => {
          state.rebuildOrder = state.registry!.getRebuildOrder();
        });

        Then('"orderSummary" appears before "orderWithInventory"', () => {
          const names = state.rebuildOrder.map((p) => p.projectionName);
          const orderWithInventoryIndex = names.indexOf("orderWithInventory");
          const orderSummaryIndex = names.indexOf("orderSummary");
          expect(orderWithInventoryIndex).toBeGreaterThan(orderSummaryIndex);
        });

        And('"productCatalog" appears before "orderWithInventory"', () => {
          const names = state.rebuildOrder.map((p) => p.projectionName);
          const orderWithInventoryIndex = names.indexOf("orderWithInventory");
          const productCatalogIndex = names.indexOf("productCatalog");
          expect(orderWithInventoryIndex).toBeGreaterThan(productCatalogIndex);
        });

        And("the rebuild order has 3 projections", () => {
          expect(state.rebuildOrder).toHaveLength(3);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: GetByCategory
  // ===========================================================================

  Rule("Registry filters projections by category with indexed lookup", ({ RuleScenario }) => {
    RuleScenario("GetByCategory returns view projections", ({ Given, When, Then, And }) => {
      Given("a registry with all five category projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
        state.registry.register(orderExistence);
        state.registry.register(dailySales);
      });

      When('I get projections by category "view"', () => {
        state.categoryProjections = state.registry!.getByCategory("view");
      });

      Then("the category lookup returns 2 projections", () => {
        expect(state.categoryProjections).toHaveLength(2);
      });

      And(
        "the category lookup contains all of:",
        (_ctx: unknown, dataTable: { name: string }[]) => {
          const names = state.categoryProjections.map((p) => p.projectionName);
          for (const row of dataTable) {
            expect(names).toContain(row.name);
          }
        }
      );
    });

    RuleScenario("GetByCategory returns logic projections", ({ Given, When, Then, And }) => {
      Given("a registry with all five category projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
        state.registry.register(orderExistence);
        state.registry.register(dailySales);
      });

      When('I get projections by category "logic"', () => {
        state.categoryProjections = state.registry!.getByCategory("logic");
      });

      Then("the category lookup returns 1 projection", () => {
        expect(state.categoryProjections).toHaveLength(1);
      });

      And('the first category lookup result is "orderExistence"', () => {
        expect(state.categoryProjections[0].projectionName).toBe("orderExistence");
      });
    });

    RuleScenario("GetByCategory returns reporting projections", ({ Given, When, Then, And }) => {
      Given("a registry with all five category projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
        state.registry.register(orderExistence);
        state.registry.register(dailySales);
      });

      When('I get projections by category "reporting"', () => {
        state.categoryProjections = state.registry!.getByCategory("reporting");
      });

      Then("the category lookup returns 1 projection", () => {
        expect(state.categoryProjections).toHaveLength(1);
      });

      And('the first category lookup result is "dailySales"', () => {
        expect(state.categoryProjections[0].projectionName).toBe("dailySales");
      });
    });

    RuleScenario("GetByCategory returns integration projections", ({ Given, When, Then, And }) => {
      Given("a registry with all five category projections", () => {
        state.registry = createProjectionRegistry();
        state.registry.register(orderSummary);
        state.registry.register(productCatalog);
        state.registry.register(orderWithInventory);
        state.registry.register(orderExistence);
        state.registry.register(dailySales);
      });

      When('I get projections by category "integration"', () => {
        state.categoryProjections = state.registry!.getByCategory("integration");
      });

      Then("the category lookup returns 1 projection", () => {
        expect(state.categoryProjections).toHaveLength(1);
      });

      And('the first category lookup result is "orderWithInventory"', () => {
        expect(state.categoryProjections[0].projectionName).toBe("orderWithInventory");
      });
    });

    RuleScenario(
      "GetByCategory returns empty when no projections match",
      ({ Given, When, Then }) => {
        Given('a registry with the "orderSummary" projection', () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderSummary);
        });

        When('I get projections by category "logic"', () => {
          state.categoryProjections = state.registry!.getByCategory("logic");
        });

        Then("the category lookup returns 0 projections", () => {
          expect(state.categoryProjections).toEqual([]);
        });
      }
    );

    RuleScenario(
      "GetByCategory verifies all results have requested category",
      ({ Given, When, Then }) => {
        Given("a registry with all five category projections", () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderSummary);
          state.registry.register(productCatalog);
          state.registry.register(orderWithInventory);
          state.registry.register(orderExistence);
          state.registry.register(dailySales);
        });

        When('I get projections by category "view"', () => {
          state.categoryProjections = state.registry!.getByCategory("view");
        });

        Then('all returned projections have category "view"', () => {
          for (const projection of state.categoryProjections) {
            expect(projection.category).toBe("view");
          }
        });
      }
    );

    RuleScenario(
      "GetByCategory works regardless of registration order",
      ({ Given, When, Then, And }) => {
        Given("a registry with projections registered in non-category-grouped order", () => {
          state.registry = createProjectionRegistry();
          state.registry.register(orderExistence); // logic
          state.registry.register(orderSummary); // view
          state.registry.register(dailySales); // reporting
          state.registry.register(productCatalog); // view
          state.registry.register(orderWithInventory); // integration
        });

        When('I get projections by category "view"', () => {
          state.categoryProjections = state.registry!.getByCategory("view");
        });

        Then("the category lookup returns 2 projections", () => {
          expect(state.categoryProjections).toHaveLength(2);
        });

        And('the category lookup names sorted are "orderSummary" and "productCatalog"', () => {
          expect(state.categoryProjections.map((p) => p.projectionName).sort()).toEqual([
            "orderSummary",
            "productCatalog",
          ]);
        });
      }
    );

    RuleScenario(
      "Category index is maintained incrementally",
      ({ Given, When, Then, And: _And }) => {
        Given("an empty projection registry", () => {
          state.registry = createProjectionRegistry();
        });

        When('I register "orderSummary" with category "view"', () => {
          state.registry!.register(orderSummary);
        });

        Then('the category lookup for "view" returns 1 projection', () => {
          expect(state.registry!.getByCategory("view")).toHaveLength(1);
        });

        When('I register "orderExistence" with category "logic"', () => {
          state.registry!.register(orderExistence);
        });

        Then(
          "the category counts are:",
          (_ctx: unknown, dataTable: { category: string; count: string }[]) => {
            for (const row of dataTable) {
              expect(state.registry!.getByCategory(row.category as "view" | "logic")).toHaveLength(
                Number(row.count)
              );
            }
          }
        );

        When('I register "productCatalog" with category "view"', () => {
          state.registry!.register(productCatalog);
        });

        Then('the category lookup for "view" returns 2 projections', () => {
          expect(state.registry!.getByCategory("view")).toHaveLength(2);
        });
      }
    );
  });
});
