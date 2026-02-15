/**
 * Order Domain Functions - Step Definitions
 *
 * BDD step definitions for pure order domain functions:
 * - calculateTotalAmount
 * - createInitialOrderCMS
 * - upcastOrderCMS
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  calculateTotalAmount,
  createInitialOrderCMS,
  upcastOrderCMS,
  CURRENT_ORDER_CMS_VERSION,
  type OrderItem,
  type OrderCMS,
} from "../../../convex/contexts/orders/domain/order.js";

// =============================================================================
// Types
// =============================================================================

interface DataTableRow {
  field: string;
  value: string;
}

interface ItemTableRow {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  items: OrderItem[];
  totalAmount: number | null;
  cms: OrderCMS | null;
  originalCMS: Record<string, unknown> | null;
  upcastResult: OrderCMS | null;
  beforeTimestamp: number;
  afterTimestamp: number;
}

function createInitialState(): TestState {
  return {
    items: [],
    totalAmount: null,
    cms: null,
    originalCMS: null,
    upcastResult: null,
    beforeTimestamp: 0,
    afterTimestamp: 0,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers
// =============================================================================

function parseItemTable(table: ItemTableRow[]): OrderItem[] {
  return table.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
  }));
}

function parseFieldValueTable(table: DataTableRow[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const row of table) {
    const val = row.value;
    obj[row.field] = isNaN(Number(val)) ? val : Number(val);
  }
  return obj;
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/orders/order-domain.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: calculateTotalAmount computes the sum of quantity * unitPrice
  // ==========================================================================

  Rule(
    "calculateTotalAmount computes the sum of quantity * unitPrice for all items",
    ({ RuleScenario }) => {
      RuleScenario("Empty items array returns zero", ({ Given, When, Then }) => {
        Given("an empty items array", () => {
          state.items = [];
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is 0", () => {
          expect(state.totalAmount).toBe(0);
        });
      });

      RuleScenario("Single item total", ({ Given, When, Then }) => {
        Given("an items array with:", (_ctx: unknown, table: ItemTableRow[]) => {
          state.items = parseItemTable(table);
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is 21", () => {
          expect(state.totalAmount).toBe(21);
        });
      });

      RuleScenario("Multiple items total", ({ Given, When, Then }) => {
        Given("an items array with:", (_ctx: unknown, table: ItemTableRow[]) => {
          state.items = parseItemTable(table);
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is 70", () => {
          expect(state.totalAmount).toBe(70);
        });
      });

      RuleScenario("Zero quantity results in zero contribution", ({ Given, When, Then }) => {
        Given("an items array with:", (_ctx: unknown, table: ItemTableRow[]) => {
          state.items = parseItemTable(table);
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is 0", () => {
          expect(state.totalAmount).toBe(0);
        });
      });

      RuleScenario("Zero price results in zero contribution", ({ Given, When, Then }) => {
        Given("an items array with:", (_ctx: unknown, table: ItemTableRow[]) => {
          state.items = parseItemTable(table);
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is 0", () => {
          expect(state.totalAmount).toBe(0);
        });
      });

      RuleScenario("Decimal prices are handled correctly", ({ Given, When, Then }) => {
        Given("an items array with:", (_ctx: unknown, table: ItemTableRow[]) => {
          state.items = parseItemTable(table);
        });

        When("I calculate the total amount", () => {
          state.totalAmount = calculateTotalAmount(state.items);
        });

        Then("the total amount is approximately 29.97", () => {
          expect(state.totalAmount).toBeCloseTo(29.97, 2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: createInitialOrderCMS produces a draft order with correct defaults
  // ==========================================================================

  Rule("createInitialOrderCMS produces a draft order with correct defaults", ({ RuleScenario }) => {
    RuleScenario("CMS is created with the provided orderId and customerId", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then("the CMS has the following field values:", (_ctx: unknown, table: DataTableRow[]) => {
        for (const row of table) {
          const field = row.field as keyof OrderCMS;
          expect(String(state.cms![field])).toBe(row.value);
        }
      });
    });

    RuleScenario("CMS initializes with draft status", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then('the CMS status is "draft"', () => {
        expect(state.cms!.status).toBe("draft");
      });
    });

    RuleScenario("CMS initializes with empty items array", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then("the CMS items array is empty", () => {
        expect(state.cms!.items).toEqual([]);
        expect(state.cms!.items.length).toBe(0);
      });
    });

    RuleScenario("CMS initializes with zero totalAmount", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then("the CMS totalAmount is 0", () => {
        expect(state.cms!.totalAmount).toBe(0);
      });
    });

    RuleScenario("CMS initializes with version 0", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then("the CMS version is 0", () => {
        expect(state.cms!.version).toBe(0);
      });
    });

    RuleScenario("CMS initializes with current state version", ({ Given, Then }) => {
      Given(
        'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
        () => {
          state.cms = createInitialOrderCMS("ord_123", "cust_456");
        }
      );

      Then("the CMS stateVersion equals CURRENT_ORDER_CMS_VERSION", () => {
        expect(state.cms!.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
      });
    });

    RuleScenario(
      "CMS sets createdAt and updatedAt to current timestamp",
      ({ Given, And, Then }) => {
        Given("a timestamp is captured before creation", () => {
          state.beforeTimestamp = Date.now();
        });

        And(
          'I create an initial order CMS with orderId "ord_123" and customerId "cust_456"',
          () => {
            state.cms = createInitialOrderCMS("ord_123", "cust_456");
            state.afterTimestamp = Date.now();
          }
        );

        Then("the CMS createdAt is between the before and after timestamps", () => {
          expect(state.cms!.createdAt).toBeGreaterThanOrEqual(state.beforeTimestamp);
          expect(state.cms!.createdAt).toBeLessThanOrEqual(state.afterTimestamp);
        });

        And("the CMS updatedAt equals createdAt", () => {
          expect(state.cms!.updatedAt).toBe(state.cms!.createdAt);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: upcastOrderCMS migrates older CMS versions to current version
  // ==========================================================================

  Rule("upcastOrderCMS migrates older CMS versions to current version", ({ RuleScenario }) => {
    RuleScenario(
      "CMS already at current version is returned unchanged",
      ({ Given, When, Then, And }) => {
        Given(
          "an OrderCMS at the current stateVersion with:",
          (_ctx: unknown, table: DataTableRow[]) => {
            const obj = parseFieldValueTable(table);
            state.originalCMS = {
              ...obj,
              items: [],
              stateVersion: CURRENT_ORDER_CMS_VERSION,
            };
          }
        );

        When("I upcast the OrderCMS", () => {
          state.upcastResult = upcastOrderCMS(state.originalCMS);
        });

        Then("the result equals the original CMS", () => {
          expect(state.upcastResult).toEqual(state.originalCMS);
        });

        And("the result stateVersion equals CURRENT_ORDER_CMS_VERSION", () => {
          expect(state.upcastResult!.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
        });
      }
    );

    RuleScenario("CMS with missing stateVersion is upgraded", ({ Given, When, Then, And }) => {
      Given(
        "an OrderCMS without stateVersion and with:",
        (_ctx: unknown, table: DataTableRow[]) => {
          const obj = parseFieldValueTable(table);
          state.originalCMS = {
            ...obj,
            status: "draft",
            items: [],
            totalAmount: 0,
            version: 1,
            createdAt: 1000,
            updatedAt: 1000,
            // stateVersion intentionally omitted
          };
        }
      );

      When("I upcast the OrderCMS", () => {
        state.upcastResult = upcastOrderCMS(state.originalCMS);
      });

      Then("the result stateVersion equals CURRENT_ORDER_CMS_VERSION", () => {
        expect(state.upcastResult!.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
      });

      And("the result preserves the original field values", () => {
        expect(state.upcastResult!.orderId).toBe("ord_123");
        expect(state.upcastResult!.customerId).toBe("cust_456");
      });
    });

    RuleScenario("CMS with stateVersion 0 is upgraded", ({ Given, And, When, Then }) => {
      Given("an OrderCMS at stateVersion 0 with:", (_ctx: unknown, table: DataTableRow[]) => {
        const obj = parseFieldValueTable(table);
        state.originalCMS = {
          ...obj,
          stateVersion: 0,
          items: [],
        };
      });

      And("the CMS has 1 item", () => {
        (state.originalCMS as Record<string, unknown>)["items"] = [
          {
            productId: "p1",
            productName: "Test",
            quantity: 1,
            unitPrice: 10,
          },
        ];
      });

      When("I upcast the OrderCMS", () => {
        state.upcastResult = upcastOrderCMS(state.originalCMS);
      });

      Then("the result stateVersion equals CURRENT_ORDER_CMS_VERSION", () => {
        expect(state.upcastResult!.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
      });

      And('the result status is "submitted"', () => {
        expect(state.upcastResult!.status).toBe("submitted");
      });

      And("the result has 1 item", () => {
        expect(state.upcastResult!.items).toHaveLength(1);
      });

      And("the result totalAmount is 10", () => {
        expect(state.upcastResult!.totalAmount).toBe(10);
      });
    });

    RuleScenario("All fields are preserved during upcast", ({ Given, And, When, Then }) => {
      Given("an OrderCMS at stateVersion 0 with:", (_ctx: unknown, table: DataTableRow[]) => {
        const obj = parseFieldValueTable(table);
        state.originalCMS = {
          ...obj,
          stateVersion: 0,
          items: [],
        };
      });

      And("the CMS has items:", (_ctx: unknown, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        (state.originalCMS as Record<string, unknown>)["items"] = items;
      });

      When("I upcast the OrderCMS", () => {
        state.upcastResult = upcastOrderCMS(state.originalCMS);
      });

      Then("the upcast result preserves all fields:", (_ctx: unknown, table: DataTableRow[]) => {
        for (const row of table) {
          const field = row.field as keyof OrderCMS;
          const expected = row.value;
          const actual = state.upcastResult![field];
          if (typeof actual === "number") {
            expect(actual).toBe(Number(expected));
          } else {
            expect(String(actual)).toBe(expected);
          }
        }
      });

      And("the result items match the original items", () => {
        const originalItems = (state.originalCMS as Record<string, unknown>)[
          "items"
        ] as OrderItem[];
        expect(state.upcastResult!.items).toEqual(originalItems);
      });
    });
  });
});
