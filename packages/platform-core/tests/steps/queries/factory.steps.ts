/**
 * Query Factory - Step Definitions
 *
 * BDD step definitions for query descriptor factories:
 * - createReadModelQuery
 * - createPaginatedQuery
 * - createQueryRegistry
 * - getPaginationOptions
 * - Type safety
 *
 * Mechanical migration from tests/unit/queries/factory.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  createReadModelQuery,
  createPaginatedQuery,
  createQueryRegistry,
  getPaginationOptions,
  type ReadModelQueryDescriptor,
  type PaginatedQueryDescriptor,
  type QueryRegistry,
} from "../../../src/queries/factory.js";
import type { NormalizedPaginationOptions } from "../../../src/queries/types.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../../src/queries/pagination.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  descriptor: ReadModelQueryDescriptor<unknown> | PaginatedQueryDescriptor<unknown> | null;
  registry: QueryRegistry<Record<string, unknown>> | null;
  paginationOptions: NormalizedPaginationOptions | null;
  paginatedQuery: PaginatedQueryDescriptor<unknown> | null;
  // For multi-result pagination scenarios
  multiPaginationResults: Array<{ pageSize: number; result: NormalizedPaginationOptions }>;
  // Type safety descriptors
  singleDescriptor: ReadModelQueryDescriptor<unknown> | null;
  paginatedDescriptor: PaginatedQueryDescriptor<unknown> | null;
}

function createInitialState(): TestState {
  return {
    descriptor: null,
    registry: null,
    paginationOptions: null,
    paginatedQuery: null,
    multiPaginationResults: [],
    singleDescriptor: null,
    paginatedDescriptor: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/queries/factory.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // createReadModelQuery
  // ==========================================================================

  Rule(
    "createReadModelQuery produces descriptors with correct result type and config",
    ({ RuleScenario }) => {
      RuleScenario(
        "Single result query descriptor has correct result type and config",
        ({ Given, Then, And }) => {
          Given(
            'a read model query descriptor for "getOrderById" with result type "single"',
            () => {
              state.descriptor = createReadModelQuery<{
                id: string;
                name: string;
              }>(
                {
                  queryName: "getOrderById",
                  description: "Gets a single order by its ID",
                  sourceProjection: "orderSummary",
                  targetTable: "orderSummaries",
                },
                "single"
              );
            }
          );

          Then('the descriptor has result type "single"', () => {
            expect(state.descriptor.resultType).toBe("single");
          });

          And(
            "the descriptor config has all expected fields:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{
                field: string;
                value: string;
              }>(dataTable);
              for (const row of rows) {
                expect(state.descriptor.config[row.field]).toBe(row.value);
              }
            }
          );
        }
      );

      RuleScenario(
        "List result query descriptor has correct result type",
        ({ Given, Then, And }) => {
          Given(
            'a read model query descriptor for "getOrdersByCustomer" with result type "list"',
            () => {
              state.descriptor = createReadModelQuery<{ id: string }[]>(
                {
                  queryName: "getOrdersByCustomer",
                  description: "Gets all orders for a customer",
                  sourceProjection: "orderSummary",
                  targetTable: "orderSummaries",
                },
                "list"
              );
            }
          );

          Then('the descriptor has result type "list"', () => {
            expect(state.descriptor.resultType).toBe("list");
          });

          And('the descriptor config queryName is "getOrdersByCustomer"', () => {
            expect(state.descriptor.config.queryName).toBe("getOrdersByCustomer");
          });
        }
      );

      RuleScenario(
        "Count result query descriptor has correct result type",
        ({ Given, Then, And }) => {
          Given(
            'a read model query descriptor for "countPendingOrders" with result type "count"',
            () => {
              state.descriptor = createReadModelQuery<number>(
                {
                  queryName: "countPendingOrders",
                  description: "Counts pending orders",
                  sourceProjection: "orderSummary",
                  targetTable: "orderSummaries",
                },
                "count"
              );
            }
          );

          Then('the descriptor has result type "count"', () => {
            expect(state.descriptor.resultType).toBe("count");
          });

          And('the descriptor config queryName is "countPendingOrders"', () => {
            expect(state.descriptor.config.queryName).toBe("countPendingOrders");
          });
        }
      );
    }
  );

  // ==========================================================================
  // createPaginatedQuery
  // ==========================================================================

  Rule(
    "createPaginatedQuery produces paginated descriptors with default page sizes",
    ({ RuleScenario }) => {
      RuleScenario("Paginated query descriptor uses default page sizes", ({ Given, Then, And }) => {
        Given('a paginated query descriptor for "listOrders" with index "by_customer"', () => {
          state.descriptor = createPaginatedQuery<{ id: string }>({
            queryName: "listOrders",
            description: "Lists orders with pagination",
            sourceProjection: "orderSummary",
            targetTable: "orderSummaries",
            paginationIndex: "by_customer",
          });
        });

        Then('the descriptor has result type "paginated"', () => {
          expect(state.descriptor.resultType).toBe("paginated");
        });

        And('the descriptor config queryName is "listOrders"', () => {
          expect(state.descriptor.config.queryName).toBe("listOrders");
        });

        And('the descriptor config paginationIndex is "by_customer"', () => {
          expect(state.descriptor.config.paginationIndex).toBe("by_customer");
        });

        And("the descriptor defaults use standard pagination constants", () => {
          expect(state.descriptor.defaults.pageSize).toBe(DEFAULT_PAGE_SIZE);
          expect(state.descriptor.defaults.maxPageSize).toBe(MAX_PAGE_SIZE);
        });
      });
    }
  );

  Rule("createPaginatedQuery accepts custom page sizes", ({ RuleScenario }) => {
    RuleScenario("Paginated query descriptor uses custom page sizes", ({ Given, Then }) => {
      Given(
        'a paginated query descriptor for "listProducts" with custom page size 50 and max 200',
        () => {
          state.descriptor = createPaginatedQuery<{ id: string }>({
            queryName: "listProducts",
            description: "Lists products with custom pagination",
            sourceProjection: "productCatalog",
            targetTable: "productCatalog",
            paginationIndex: "by_category",
            defaultPageSize: 50,
            maxPageSize: 200,
          });
        }
      );

      Then("the descriptor has custom page sizes:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          field: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const expected = Number(row.value);
          if (row.field === "pageSize") {
            expect(state.descriptor.defaults.pageSize).toBe(expected);
          } else if (row.field === "maxPageSize") {
            expect(state.descriptor.defaults.maxPageSize).toBe(expected);
          }
        }
        // Also verify config fields
        expect(state.descriptor.config.defaultPageSize).toBe(50);
        expect(state.descriptor.config.maxPageSize).toBe(200);
      });
    });
  });

  Rule("createPaginatedQuery applies defaults to config when not provided", ({ RuleScenario }) => {
    RuleScenario("Config receives default pagination values", ({ Given, Then }) => {
      Given(
        'a paginated query descriptor for "listItems" with index "by_created" and no custom sizes',
        () => {
          state.descriptor = createPaginatedQuery<{ id: string }>({
            queryName: "listItems",
            description: "Lists items",
            sourceProjection: "itemList",
            targetTable: "items",
            paginationIndex: "by_created",
          });
        }
      );

      Then("the descriptor config has default pagination values", () => {
        expect(state.descriptor.config.defaultPageSize).toBe(DEFAULT_PAGE_SIZE);
        expect(state.descriptor.config.maxPageSize).toBe(MAX_PAGE_SIZE);
      });
    });
  });

  // ==========================================================================
  // createQueryRegistry
  // ==========================================================================

  Rule("createQueryRegistry creates a registry with context and projection", ({ RuleScenario }) => {
    RuleScenario("Empty registry has correct context and projection", ({ Given, Then, And }) => {
      Given(
        'a query registry for context "orders" and projection "orderSummary" with no queries',
        () => {
          state.registry = createQueryRegistry("orders", "orderSummary", {});
        }
      );

      Then('the registry context is "orders"', () => {
        expect(state.registry.context).toBe("orders");
      });

      And('the registry sourceProjection is "orderSummary"', () => {
        expect(state.registry.sourceProjection).toBe("orderSummary");
      });

      And("the registry has 0 queries", () => {
        expect(state.registry.queries).toEqual({});
      });
    });
  });

  Rule("createQueryRegistry indexes multiple query descriptors", ({ RuleScenario }) => {
    RuleScenario("Registry with multiple queries provides keyed access", ({ Given, Then, And }) => {
      Given(
        'a query registry with a "single" query "getById" and a "paginated" query "list"',
        () => {
          const getById = createReadModelQuery<{ id: string }>(
            {
              queryName: "getById",
              description: "Get by ID",
              sourceProjection: "orderSummary",
              targetTable: "orderSummaries",
            },
            "single"
          );

          const list = createPaginatedQuery<{ id: string }>({
            queryName: "list",
            description: "List orders",
            sourceProjection: "orderSummary",
            targetTable: "orderSummaries",
            paginationIndex: "by_created",
          });

          state.registry = createQueryRegistry("orders", "orderSummary", {
            getById,
            list,
          });
        }
      );

      Then("the registry has 2 queries", () => {
        expect(Object.keys(state.registry.queries)).toHaveLength(2);
      });

      And("the registry query result types are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          key: string;
          resultType: string;
        }>(dataTable);
        for (const row of rows) {
          expect(state.registry.queries[row.key].resultType).toBe(row.resultType);
        }
      });
    });
  });

  Rule("createQueryRegistry provides type-safe access to query descriptors", ({ RuleScenario }) => {
    RuleScenario("Type-safe access to registered query descriptor", ({ Given, Then }) => {
      Given('a query registry with a single query "getById"', () => {
        const getById = createReadModelQuery<{
          id: string;
          name: string;
        }>(
          {
            queryName: "getById",
            description: "Get by ID",
            sourceProjection: "orderSummary",
            targetTable: "orderSummaries",
          },
          "single"
        );

        state.registry = createQueryRegistry("orders", "orderSummary", {
          getById,
        });
      });

      Then('the registry query "getById" has queryName "getById"', () => {
        const descriptor = state.registry.queries.getById;
        expect(descriptor.config.queryName).toBe("getById");
      });
    });
  });

  // ==========================================================================
  // getPaginationOptions
  // ==========================================================================

  Rule("getPaginationOptions returns defaults when no options provided", ({ RuleScenario }) => {
    RuleScenario("No options returns descriptor defaults", ({ Given, When, Then, And }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When("getPaginationOptions is called with no options", () => {
        state.paginationOptions = getPaginationOptions(state.paginatedQuery, undefined);
      });

      Then("the pagination page size is 25", () => {
        expect(state.paginationOptions.pageSize).toBe(25);
      });

      And("the pagination cursor is undefined", () => {
        expect(state.paginationOptions.cursor).toBeUndefined();
      });
    });
  });

  Rule("getPaginationOptions respects provided page size within limits", ({ RuleScenario }) => {
    RuleScenario("Provided page size within limits is used", ({ Given, When, Then }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When("getPaginationOptions is called with page size 50", () => {
        state.paginationOptions = getPaginationOptions(state.paginatedQuery, { pageSize: 50 });
      });

      Then("the pagination page size is 50", () => {
        expect(state.paginationOptions.pageSize).toBe(50);
      });
    });
  });

  Rule("getPaginationOptions caps page size at max", ({ RuleScenario }) => {
    RuleScenario("Page size exceeding max is clamped", ({ Given, When, Then }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When("getPaginationOptions is called with page size 500", () => {
        state.paginationOptions = getPaginationOptions(state.paginatedQuery, { pageSize: 500 });
      });

      Then("the pagination page size is 100", () => {
        expect(state.paginationOptions.pageSize).toBe(100);
      });
    });
  });

  Rule("getPaginationOptions enforces minimum page size of 1", ({ RuleScenario }) => {
    RuleScenario("Zero and negative page sizes are clamped to 1", ({ Given, When, Then }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When(
        "getPaginationOptions is called with each page size:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ pageSize: string }>(dataTable);
          state.multiPaginationResults = rows.map((row) => {
            const pageSize = Number(row.pageSize);
            const result = getPaginationOptions(state.paginatedQuery, {
              pageSize,
            });
            return { pageSize, result };
          });
        }
      );

      Then("each result has page size 1", () => {
        expect(state.multiPaginationResults).toHaveLength(2);
        for (const entry of state.multiPaginationResults) {
          expect(entry.result.pageSize, `Expected page size 1 for input ${entry.pageSize}`).toBe(1);
        }
      });
    });
  });

  Rule("getPaginationOptions passes through cursor", ({ RuleScenario }) => {
    RuleScenario("Cursor is passed through to options", ({ Given, When, Then }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When('getPaginationOptions is called with page size 20 and cursor "abc123"', () => {
        state.paginationOptions = getPaginationOptions(state.paginatedQuery, {
          pageSize: 20,
          cursor: "abc123",
        });
      });

      Then('the pagination cursor is "abc123"', () => {
        expect(state.paginationOptions.cursor).toBe("abc123");
      });
    });
  });

  Rule("getPaginationOptions returns undefined cursor when not provided", ({ RuleScenario }) => {
    RuleScenario("Cursor is undefined when not provided", ({ Given, When, Then }) => {
      Given("a paginated query with default page size 25 and max 100", () => {
        state.paginatedQuery = createPaginatedQuery<{ id: string }>({
          queryName: "listItems",
          description: "Lists items",
          sourceProjection: "itemList",
          targetTable: "items",
          paginationIndex: "by_created",
          defaultPageSize: 25,
          maxPageSize: 100,
        });
      });

      When("getPaginationOptions is called with page size 20", () => {
        state.paginationOptions = getPaginationOptions(state.paginatedQuery, { pageSize: 20 });
      });

      Then("the pagination cursor is undefined", () => {
        expect(state.paginationOptions.cursor).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Type Safety
  // ==========================================================================

  Rule("Query descriptors preserve TypeScript result types", ({ RuleScenario }) => {
    RuleScenario(
      "Read model and paginated descriptors preserve result types",
      ({ Given, And, Then }) => {
        Given('a typed single ReadModelQueryDescriptor for "getOrder"', () => {
          interface Order {
            id: string;
            status: string;
            total: number;
          }

          const descriptor: ReadModelQueryDescriptor<Order> = createReadModelQuery<Order>(
            {
              queryName: "getOrder",
              description: "Get order",
              sourceProjection: "orderSummary",
              targetTable: "orders",
            },
            "single"
          );

          state.singleDescriptor = descriptor;
        });

        And('a typed PaginatedQueryDescriptor for "listProducts"', () => {
          interface Product {
            id: string;
            name: string;
            price: number;
          }

          const descriptor: PaginatedQueryDescriptor<Product> = createPaginatedQuery<Product>({
            queryName: "listProducts",
            description: "List products",
            sourceProjection: "productCatalog",
            targetTable: "products",
            paginationIndex: "by_category",
          });

          state.paginatedDescriptor = descriptor;
        });

        Then('the single descriptor has result type "single"', () => {
          expect(state.singleDescriptor.resultType).toBe("single");
        });

        And('the paginated descriptor has result type "paginated"', () => {
          expect(state.paginatedDescriptor.resultType).toBe("paginated");
        });
      }
    );
  });
});
