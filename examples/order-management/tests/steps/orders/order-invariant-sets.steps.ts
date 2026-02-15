/**
 * Order Invariant Sets - Step Definitions
 *
 * BDD step definitions for composed invariant sets:
 * - orderSubmitInvariants (orderIsDraft + orderHasItems)
 * - orderAddItemInvariants (orderIsDraft + orderCanAddItem)
 * - orderCancelInvariants (orderNotConfirmed + orderNotCancelled)
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  orderSubmitInvariants,
  orderAddItemInvariants,
  orderCancelInvariants,
  OrderInvariantError,
  OrderErrorCodes,
  MAX_ITEMS_PER_ORDER,
} from "../../../convex/contexts/orders/domain/invariants.js";
import type { OrderCMS, OrderItem } from "../../../convex/contexts/orders/domain/order.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  order: OrderCMS | null;
  checkAllResult: boolean | null;
  error: OrderInvariantError | null;
  noErrorThrown: boolean;
  validateResult: {
    valid: boolean;
    violations?: Array<{ code: string }>;
  } | null;
}

function createInitialState(): TestState {
  return {
    order: null,
    checkAllResult: null,
    error: null,
    noErrorThrown: false,
    validateResult: null,
  };
}

// =============================================================================
// Factories
// =============================================================================

function createTestOrderCMS(overrides: Partial<OrderCMS> = {}): OrderCMS {
  return {
    orderId: "ord_test",
    customerId: "cust_test",
    status: "draft",
    items: [],
    totalAmount: 0,
    version: 1,
    stateVersion: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function createTestItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: "prod_test",
    productName: "Test Product",
    quantity: 1,
    unitPrice: 10,
    ...overrides,
  };
}

function createMaxItems(): OrderItem[] {
  return Array(MAX_ITEMS_PER_ORDER)
    .fill(null)
    .map((_, i) => createTestItem({ productId: `prod_${i}` }));
}

// =============================================================================
// Feature
// =============================================================================

let state: TestState = createInitialState();

const feature = await loadFeature("tests/features/behavior/orders/order-invariant-sets.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: orderSubmitInvariants
  // ==========================================================================

  Rule(
    "orderSubmitInvariants composes orderIsDraft and orderHasItems for order submission",
    ({ RuleScenario }) => {
      // --- checkAll ---

      RuleScenario("checkAll returns true for draft order with items", ({ Given, When, Then }) => {
        Given("a draft order with items", () => {
          state.order = createTestOrderCMS({
            status: "draft",
            items: [createTestItem()],
          });
        });

        When("I call orderSubmitInvariants.checkAll()", () => {
          state.checkAllResult = orderSubmitInvariants.checkAll(state.order!);
        });

        Then("the checkAll result is true", () => {
          expect(state.checkAllResult).toBe(true);
        });
      });

      RuleScenario(
        "checkAll returns false for non-draft order with items",
        ({ Given, When, Then }) => {
          Given("a submitted order with items", () => {
            state.order = createTestOrderCMS({
              status: "submitted",
              items: [createTestItem()],
            });
          });

          When("I call orderSubmitInvariants.checkAll()", () => {
            state.checkAllResult = orderSubmitInvariants.checkAll(state.order!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "checkAll returns false for draft order without items",
        ({ Given, When, Then }) => {
          Given("a draft order with no items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [],
            });
          });

          When("I call orderSubmitInvariants.checkAll()", () => {
            state.checkAllResult = orderSubmitInvariants.checkAll(state.order!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      // --- assertAll ---

      RuleScenario(
        "assertAll does not throw for valid draft order with items",
        ({ Given, When, Then }) => {
          Given("a draft order with items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [createTestItem()],
            });
          });

          When("I call orderSubmitInvariants.assertAll()", () => {
            try {
              orderSubmitInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
          });
        }
      );

      RuleScenario(
        "assertAll throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)",
        ({ Given, When, Then }) => {
          Given("a submitted order with items", () => {
            state.order = createTestOrderCMS({
              status: "submitted",
              items: [createTestItem()],
            });
          });

          When("I call orderSubmitInvariants.assertAll()", () => {
            try {
              orderSubmitInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
          });
        }
      );

      RuleScenario(
        "assertAll throws ORDER_HAS_NO_ITEMS for draft order with no items",
        ({ Given, When, Then }) => {
          Given("a draft order with no items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [],
            });
          });

          When("I call orderSubmitInvariants.assertAll()", () => {
            try {
              orderSubmitInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_HAS_NO_ITEMS"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_HAS_NO_ITEMS);
          });
        }
      );

      // --- validateAll ---

      RuleScenario(
        "validateAll returns valid result for draft order with items",
        ({ Given, When, Then }) => {
          Given("a draft order with items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [createTestItem()],
            });
          });

          When("I call orderSubmitInvariants.validateAll()", () => {
            state.validateResult = orderSubmitInvariants.validateAll(state.order!);
          });

          Then("the validation result is valid", () => {
            expect(state.validateResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "validateAll returns both violations for submitted order with no items",
        ({ Given, When, Then, And }) => {
          Given("a submitted order with no items", () => {
            state.order = createTestOrderCMS({
              status: "submitted",
              items: [],
            });
          });

          When("I call orderSubmitInvariants.validateAll()", () => {
            state.validateResult = orderSubmitInvariants.validateAll(state.order!);
          });

          Then("the validation result is invalid with 2 violations", () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.violations).toHaveLength(2);
          });

          And("the violation codes include:", (_ctx: unknown, table: { code: string }[]) => {
            const actualCodes = state.validateResult!.violations!.map((v) => v.code);
            for (const row of table) {
              expect(actualCodes).toContain(row.code);
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: orderAddItemInvariants
  // ==========================================================================

  Rule(
    "orderAddItemInvariants composes orderIsDraft and orderCanAddItem for adding items",
    ({ RuleScenario }) => {
      // --- checkAll ---

      RuleScenario(
        "checkAll returns true for draft order under item limit",
        ({ Given, When, Then }) => {
          Given("a draft order with items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [createTestItem()],
            });
          });

          When("I call orderAddItemInvariants.checkAll()", () => {
            state.checkAllResult = orderAddItemInvariants.checkAll(state.order!);
          });

          Then("the checkAll result is true", () => {
            expect(state.checkAllResult).toBe(true);
          });
        }
      );

      RuleScenario("checkAll returns false for non-draft order", ({ Given, When, Then }) => {
        Given("a confirmed order with no items", () => {
          state.order = createTestOrderCMS({
            status: "confirmed",
            items: [],
          });
        });

        When("I call orderAddItemInvariants.checkAll()", () => {
          state.checkAllResult = orderAddItemInvariants.checkAll(state.order!);
        });

        Then("the checkAll result is false", () => {
          expect(state.checkAllResult).toBe(false);
        });
      });

      RuleScenario(
        "checkAll returns false for draft order at max capacity",
        ({ Given, When, Then }) => {
          Given("a draft order at max item capacity", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: createMaxItems(),
            });
          });

          When("I call orderAddItemInvariants.checkAll()", () => {
            state.checkAllResult = orderAddItemInvariants.checkAll(state.order!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      // --- assertAll ---

      RuleScenario(
        "assertAll does not throw for valid draft order under limit",
        ({ Given, When, Then }) => {
          Given("a draft order with no items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [],
            });
          });

          When("I call orderAddItemInvariants.assertAll()", () => {
            try {
              orderAddItemInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
          });
        }
      );

      RuleScenario(
        "assertAll throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)",
        ({ Given, When, Then }) => {
          Given("a submitted order with no items", () => {
            state.order = createTestOrderCMS({
              status: "submitted",
              items: [],
            });
          });

          When("I call orderAddItemInvariants.assertAll()", () => {
            try {
              orderAddItemInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
          });
        }
      );

      RuleScenario(
        "assertAll throws MAX_ITEMS_EXCEEDED for draft order at capacity",
        ({ Given, When, Then }) => {
          Given("a draft order at max item capacity", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: createMaxItems(),
            });
          });

          When("I call orderAddItemInvariants.assertAll()", () => {
            try {
              orderAddItemInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "MAX_ITEMS_EXCEEDED"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.MAX_ITEMS_EXCEEDED);
          });
        }
      );

      // --- validateAll ---

      RuleScenario(
        "validateAll returns valid result for draft order under limit",
        ({ Given, When, Then }) => {
          Given("a draft order with no items", () => {
            state.order = createTestOrderCMS({
              status: "draft",
              items: [],
            });
          });

          When("I call orderAddItemInvariants.validateAll()", () => {
            state.validateResult = orderAddItemInvariants.validateAll(state.order!);
          });

          Then("the validation result is valid", () => {
            expect(state.validateResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "validateAll returns both violations for submitted order at capacity",
        ({ Given, When, Then, And }) => {
          Given("a submitted order at max item capacity", () => {
            state.order = createTestOrderCMS({
              status: "submitted",
              items: createMaxItems(),
            });
          });

          When("I call orderAddItemInvariants.validateAll()", () => {
            state.validateResult = orderAddItemInvariants.validateAll(state.order!);
          });

          Then("the validation result is invalid with 2 violations", () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.violations).toHaveLength(2);
          });

          And("the violation codes include:", (_ctx: unknown, table: { code: string }[]) => {
            const actualCodes = state.validateResult!.violations!.map((v) => v.code);
            for (const row of table) {
              expect(actualCodes).toContain(row.code);
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: orderCancelInvariants
  // ==========================================================================

  Rule(
    "orderCancelInvariants composes orderNotConfirmed and orderNotCancelled for cancellation",
    ({ RuleScenario, RuleScenarioOutline }) => {
      // --- checkAll (Scenario Outline) ---

      RuleScenarioOutline(
        "checkAll returns <expected> for <status> order",
        ({ Given, When, Then }, variables: { status: string; expected: string }) => {
          Given('an order in "<status>" status', () => {
            state.order = createTestOrderCMS({
              status: variables.status as OrderCMS["status"],
            });
          });

          When("I call orderCancelInvariants.checkAll()", () => {
            state.checkAllResult = orderCancelInvariants.checkAll(state.order!);
          });

          Then("the checkAll result is <expected>", () => {
            expect(state.checkAllResult).toBe(variables.expected === "true");
          });
        }
      );

      // --- assertAll ---

      RuleScenario("assertAll does not throw for draft order", ({ Given, When, Then }) => {
        Given('an order in "draft" status', () => {
          state.order = createTestOrderCMS({ status: "draft" });
        });

        When("I call orderCancelInvariants.assertAll()", () => {
          try {
            orderCancelInvariants.assertAll(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("assertAll does not throw for submitted order", ({ Given, When, Then }) => {
        Given('an order in "submitted" status', () => {
          state.order = createTestOrderCMS({ status: "submitted" });
        });

        When("I call orderCancelInvariants.assertAll()", () => {
          try {
            orderCancelInvariants.assertAll(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario(
        "assertAll throws ORDER_ALREADY_CONFIRMED for confirmed order",
        ({ Given, When, Then }) => {
          Given('an order in "confirmed" status', () => {
            state.order = createTestOrderCMS({ status: "confirmed" });
          });

          When("I call orderCancelInvariants.assertAll()", () => {
            try {
              orderCancelInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_ALREADY_CONFIRMED"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_ALREADY_CONFIRMED);
          });
        }
      );

      RuleScenario(
        "assertAll throws ORDER_ALREADY_CANCELLED for cancelled order",
        ({ Given, When, Then }) => {
          Given('an order in "cancelled" status', () => {
            state.order = createTestOrderCMS({ status: "cancelled" });
          });

          When("I call orderCancelInvariants.assertAll()", () => {
            try {
              orderCancelInvariants.assertAll(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_ALREADY_CANCELLED"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_ALREADY_CANCELLED);
          });
        }
      );

      // --- validateAll ---

      RuleScenario("validateAll returns valid result for draft order", ({ Given, When, Then }) => {
        Given('an order in "draft" status', () => {
          state.order = createTestOrderCMS({ status: "draft" });
        });

        When("I call orderCancelInvariants.validateAll()", () => {
          state.validateResult = orderCancelInvariants.validateAll(state.order!);
        });

        Then("the validation result is valid", () => {
          expect(state.validateResult!.valid).toBe(true);
        });
      });

      RuleScenario(
        "validateAll returns single violation for confirmed order",
        ({ Given, When, Then, And }) => {
          Given('an order in "confirmed" status', () => {
            state.order = createTestOrderCMS({ status: "confirmed" });
          });

          When("I call orderCancelInvariants.validateAll()", () => {
            state.validateResult = orderCancelInvariants.validateAll(state.order!);
          });

          Then("the validation result is invalid with 1 violation", () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.violations).toHaveLength(1);
          });

          And("the violation codes include:", (_ctx: unknown, table: { code: string }[]) => {
            const actualCodes = state.validateResult!.violations!.map((v) => v.code);
            for (const row of table) {
              expect(actualCodes).toContain(row.code);
            }
          });
        }
      );

      RuleScenario(
        "validateAll returns single violation for cancelled order",
        ({ Given, When, Then, And }) => {
          Given('an order in "cancelled" status', () => {
            state.order = createTestOrderCMS({ status: "cancelled" });
          });

          When("I call orderCancelInvariants.validateAll()", () => {
            state.validateResult = orderCancelInvariants.validateAll(state.order!);
          });

          Then("the validation result is invalid with 1 violation", () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.violations).toHaveLength(1);
          });

          And("the violation codes include:", (_ctx: unknown, table: { code: string }[]) => {
            const actualCodes = state.validateResult!.violations!.map((v) => v.code);
            for (const row of table) {
              expect(actualCodes).toContain(row.code);
            }
          });
        }
      );
    }
  );
});
