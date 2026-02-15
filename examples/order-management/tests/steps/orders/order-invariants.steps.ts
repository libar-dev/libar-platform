/**
 * Order Invariants - Step Definitions
 *
 * BDD step definitions for pure order invariant functions:
 * - assertOrderExists / assertOrderDoesNotExist
 * - orderIsDraft / orderIsSubmitted
 * - orderNotCancelled / orderNotConfirmed
 * - orderHasItems / orderCanAddItem
 * - assertItemExists / validateItem
 * - OrderInvariantError
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  assertOrderExists,
  assertOrderDoesNotExist,
  assertItemExists,
  validateItem,
  orderIsDraft,
  orderIsSubmitted,
  orderNotCancelled,
  orderNotConfirmed,
  orderHasItems,
  orderCanAddItem,
  OrderInvariantError,
  OrderErrorCodes,
  MAX_ITEMS_PER_ORDER,
} from "../../../convex/contexts/orders/domain/invariants.js";
import type { OrderCMS, OrderItem } from "../../../convex/contexts/orders/domain/order.js";

// =============================================================================
// Types
// =============================================================================

interface FieldValueRow {
  field: string;
  value: string;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  order: OrderCMS | null;
  orderRef: OrderCMS | null | undefined;
  item: OrderItem | null;
  checkResult: boolean | null;
  error: OrderInvariantError | null;
  errorInstance: OrderInvariantError | null;
  noErrorThrown: boolean;
}

function createInitialState(): TestState {
  return {
    order: null,
    orderRef: null,
    item: null,
    checkResult: null,
    error: null,
    errorInstance: null,
    noErrorThrown: false,
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

// =============================================================================
// Feature
// =============================================================================

let state: TestState = createInitialState();

const feature = await loadFeature("tests/features/behavior/orders/order-invariants.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: assertOrderExists
  // ==========================================================================

  Rule(
    "assertOrderExists validates that an order reference is not null or undefined",
    ({ RuleScenario }) => {
      RuleScenario("passes for a valid order", ({ Given, When, Then }) => {
        Given("a valid order", () => {
          state.order = createTestOrderCMS();
          state.orderRef = state.order;
        });

        When("I call assertOrderExists", () => {
          try {
            assertOrderExists(state.orderRef);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("throws ORDER_NOT_FOUND for null order reference", ({ Given, When, Then }) => {
        Given("a null order reference", () => {
          state.orderRef = null;
        });

        When("I call assertOrderExists", () => {
          try {
            assertOrderExists(state.orderRef);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "ORDER_NOT_FOUND"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_FOUND);
        });
      });

      RuleScenario(
        "throws ORDER_NOT_FOUND for undefined order reference",
        ({ Given, When, Then }) => {
          Given("an undefined order reference", () => {
            state.orderRef = undefined;
          });

          When("I call assertOrderExists", () => {
            try {
              assertOrderExists(state.orderRef);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_FOUND);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assertOrderDoesNotExist
  // ==========================================================================

  Rule(
    "assertOrderDoesNotExist validates that an order reference is null or undefined",
    ({ RuleScenario }) => {
      RuleScenario("passes for null order reference", ({ Given, When, Then }) => {
        Given("a null order reference", () => {
          state.orderRef = null;
        });

        When("I call assertOrderDoesNotExist", () => {
          try {
            assertOrderDoesNotExist(state.orderRef);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("passes for undefined order reference", ({ Given, When, Then }) => {
        Given("an undefined order reference", () => {
          state.orderRef = undefined;
        });

        When("I call assertOrderDoesNotExist", () => {
          try {
            assertOrderDoesNotExist(state.orderRef);
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
        "throws ORDER_ALREADY_EXISTS for existing order",
        ({ Given, When, Then, And }) => {
          Given('an existing order with orderId "ord_existing"', () => {
            state.order = createTestOrderCMS({ orderId: "ord_existing" });
            state.orderRef = state.order;
          });

          When("I call assertOrderDoesNotExist", () => {
            try {
              assertOrderDoesNotExist(state.orderRef);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_ALREADY_EXISTS"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_ALREADY_EXISTS);
          });

          And('the error context contains orderId "ord_existing"', () => {
            expect(state.error!.context?.orderId).toBe("ord_existing");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: orderIsDraft
  // ==========================================================================

  Rule(
    "orderIsDraft checks whether an order is in draft status",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario("check returns true for draft order", ({ Given, When, Then }) => {
        Given('an order in "draft" status', () => {
          state.order = createTestOrderCMS({ status: "draft" });
        });

        When("I call orderIsDraft.check()", () => {
          state.checkResult = orderIsDraft.check(state.order!);
        });

        Then("the result is true", () => {
          expect(state.checkResult).toBe(true);
        });
      });

      RuleScenario("check returns false for submitted order", ({ Given, When, Then }) => {
        Given('an order in "submitted" status', () => {
          state.order = createTestOrderCMS({ status: "submitted" });
        });

        When("I call orderIsDraft.check()", () => {
          state.checkResult = orderIsDraft.check(state.order!);
        });

        Then("the result is false", () => {
          expect(state.checkResult).toBe(false);
        });
      });

      RuleScenario("assert passes for draft order", ({ Given, When, Then }) => {
        Given('an order in "draft" status', () => {
          state.order = createTestOrderCMS({ status: "draft" });
        });

        When("I call orderIsDraft.assert()", () => {
          try {
            orderIsDraft.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenarioOutline(
        "assert throws ORDER_NOT_IN_DRAFT for non-draft statuses",
        ({ Given, When, Then, And }, variables: { status: string }) => {
          Given('an order in "<status>" status', () => {
            state.order = createTestOrderCMS({
              status: variables.status as OrderCMS["status"],
            });
          });

          When("I call orderIsDraft.assert()", () => {
            try {
              orderIsDraft.assert(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
          });

          And('the error context contains currentStatus "<status>"', () => {
            expect(state.error!.context?.currentStatus).toBe(variables.status);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: orderIsSubmitted
  // ==========================================================================

  Rule(
    "orderIsSubmitted checks whether an order is in submitted status",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario("check returns true for submitted order", ({ Given, When, Then }) => {
        Given('an order in "submitted" status', () => {
          state.order = createTestOrderCMS({ status: "submitted" });
        });

        When("I call orderIsSubmitted.check()", () => {
          state.checkResult = orderIsSubmitted.check(state.order!);
        });

        Then("the result is true", () => {
          expect(state.checkResult).toBe(true);
        });
      });

      RuleScenario("check returns false for draft order", ({ Given, When, Then }) => {
        Given('an order in "draft" status', () => {
          state.order = createTestOrderCMS({ status: "draft" });
        });

        When("I call orderIsSubmitted.check()", () => {
          state.checkResult = orderIsSubmitted.check(state.order!);
        });

        Then("the result is false", () => {
          expect(state.checkResult).toBe(false);
        });
      });

      RuleScenario("assert passes for submitted order", ({ Given, When, Then }) => {
        Given('an order in "submitted" status', () => {
          state.order = createTestOrderCMS({ status: "submitted" });
        });

        When("I call orderIsSubmitted.assert()", () => {
          try {
            orderIsSubmitted.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenarioOutline(
        "assert throws ORDER_NOT_SUBMITTED for non-submitted statuses",
        ({ Given, When, Then }, variables: { status: string }) => {
          Given('an order in "<status>" status', () => {
            state.order = createTestOrderCMS({
              status: variables.status as OrderCMS["status"],
            });
          });

          When("I call orderIsSubmitted.assert()", () => {
            try {
              orderIsSubmitted.assert(state.order!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ORDER_NOT_SUBMITTED"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ORDER_NOT_SUBMITTED);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: orderNotCancelled
  // ==========================================================================

  Rule("orderNotCancelled checks whether an order has not been cancelled", ({ RuleScenario }) => {
    RuleScenario("check returns true for draft order", ({ Given, When, Then }) => {
      Given('an order in "draft" status', () => {
        state.order = createTestOrderCMS({ status: "draft" });
      });

      When("I call orderNotCancelled.check()", () => {
        state.checkResult = orderNotCancelled.check(state.order!);
      });

      Then("the result is true", () => {
        expect(state.checkResult).toBe(true);
      });
    });

    RuleScenario("check returns true for submitted order", ({ Given, When, Then }) => {
      Given('an order in "submitted" status', () => {
        state.order = createTestOrderCMS({ status: "submitted" });
      });

      When("I call orderNotCancelled.check()", () => {
        state.checkResult = orderNotCancelled.check(state.order!);
      });

      Then("the result is true", () => {
        expect(state.checkResult).toBe(true);
      });
    });

    RuleScenario("check returns false for cancelled order", ({ Given, When, Then }) => {
      Given('an order in "cancelled" status', () => {
        state.order = createTestOrderCMS({ status: "cancelled" });
      });

      When("I call orderNotCancelled.check()", () => {
        state.checkResult = orderNotCancelled.check(state.order!);
      });

      Then("the result is false", () => {
        expect(state.checkResult).toBe(false);
      });
    });

    RuleScenario("assert passes for draft order (not cancelled)", ({ Given, When, Then }) => {
      Given('an order in "draft" status', () => {
        state.order = createTestOrderCMS({ status: "draft" });
      });

      When("I call orderNotCancelled.assert()", () => {
        try {
          orderNotCancelled.assert(state.order!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("assert passes for confirmed order (not cancelled)", ({ Given, When, Then }) => {
      Given('an order in "confirmed" status', () => {
        state.order = createTestOrderCMS({ status: "confirmed" });
      });

      When("I call orderNotCancelled.assert()", () => {
        try {
          orderNotCancelled.assert(state.order!);
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
      "assert throws ORDER_ALREADY_CANCELLED for cancelled order",
      ({ Given, When, Then, And }) => {
        Given('a cancelled order with orderId "ord_cancelled"', () => {
          state.order = createTestOrderCMS({
            status: "cancelled",
            orderId: "ord_cancelled",
          });
        });

        When("I call orderNotCancelled.assert()", () => {
          try {
            orderNotCancelled.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "ORDER_ALREADY_CANCELLED"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.ORDER_ALREADY_CANCELLED);
        });

        And('the error context contains orderId "ord_cancelled"', () => {
          expect(state.error!.context?.orderId).toBe("ord_cancelled");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: orderNotConfirmed
  // ==========================================================================

  Rule("orderNotConfirmed checks whether an order has not been confirmed", ({ RuleScenario }) => {
    RuleScenario("check returns true for draft order (not confirmed)", ({ Given, When, Then }) => {
      Given('an order in "draft" status', () => {
        state.order = createTestOrderCMS({ status: "draft" });
      });

      When("I call orderNotConfirmed.check()", () => {
        state.checkResult = orderNotConfirmed.check(state.order!);
      });

      Then("the result is true", () => {
        expect(state.checkResult).toBe(true);
      });
    });

    RuleScenario(
      "check returns true for submitted order (not confirmed)",
      ({ Given, When, Then }) => {
        Given('an order in "submitted" status', () => {
          state.order = createTestOrderCMS({ status: "submitted" });
        });

        When("I call orderNotConfirmed.check()", () => {
          state.checkResult = orderNotConfirmed.check(state.order!);
        });

        Then("the result is true", () => {
          expect(state.checkResult).toBe(true);
        });
      }
    );

    RuleScenario("check returns false for confirmed order", ({ Given, When, Then }) => {
      Given('an order in "confirmed" status', () => {
        state.order = createTestOrderCMS({ status: "confirmed" });
      });

      When("I call orderNotConfirmed.check()", () => {
        state.checkResult = orderNotConfirmed.check(state.order!);
      });

      Then("the result is false", () => {
        expect(state.checkResult).toBe(false);
      });
    });

    RuleScenario("assert passes for draft order (not confirmed)", ({ Given, When, Then }) => {
      Given('an order in "draft" status', () => {
        state.order = createTestOrderCMS({ status: "draft" });
      });

      When("I call orderNotConfirmed.assert()", () => {
        try {
          orderNotConfirmed.assert(state.order!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("assert passes for cancelled order (not confirmed)", ({ Given, When, Then }) => {
      Given('an order in "cancelled" status', () => {
        state.order = createTestOrderCMS({ status: "cancelled" });
      });

      When("I call orderNotConfirmed.assert()", () => {
        try {
          orderNotConfirmed.assert(state.order!);
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
      "assert throws ORDER_ALREADY_CONFIRMED for confirmed order",
      ({ Given, When, Then, And }) => {
        Given('a confirmed order with orderId "ord_confirmed"', () => {
          state.order = createTestOrderCMS({
            status: "confirmed",
            orderId: "ord_confirmed",
          });
        });

        When("I call orderNotConfirmed.assert()", () => {
          try {
            orderNotConfirmed.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "ORDER_ALREADY_CONFIRMED"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.ORDER_ALREADY_CONFIRMED);
        });

        And('the error context contains orderId "ord_confirmed"', () => {
          expect(state.error!.context?.orderId).toBe("ord_confirmed");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: orderHasItems
  // ==========================================================================

  Rule("orderHasItems checks whether an order contains at least one item", ({ RuleScenario }) => {
    RuleScenario("check returns true when order has items", ({ Given, When, Then }) => {
      Given("an order with 1 item", () => {
        state.order = createTestOrderCMS({
          items: [createTestItem()],
        });
      });

      When("I call orderHasItems.check()", () => {
        state.checkResult = orderHasItems.check(state.order!);
      });

      Then("the result is true", () => {
        expect(state.checkResult).toBe(true);
      });
    });

    RuleScenario("check returns false when order has no items", ({ Given, When, Then }) => {
      Given("an order with 0 items", () => {
        state.order = createTestOrderCMS({ items: [] });
      });

      When("I call orderHasItems.check()", () => {
        state.checkResult = orderHasItems.check(state.order!);
      });

      Then("the result is false", () => {
        expect(state.checkResult).toBe(false);
      });
    });

    RuleScenario("assert passes when order has items", ({ Given, When, Then }) => {
      Given("an order with 1 item", () => {
        state.order = createTestOrderCMS({
          items: [createTestItem()],
        });
      });

      When("I call orderHasItems.assert()", () => {
        try {
          orderHasItems.assert(state.order!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("assert passes when order has multiple items", ({ Given, When, Then }) => {
      Given("an order with 2 items", () => {
        state.order = createTestOrderCMS({
          items: [createTestItem(), createTestItem({ productId: "prod_2" })],
        });
      });

      When("I call orderHasItems.assert()", () => {
        try {
          orderHasItems.assert(state.order!);
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
      "assert throws ORDER_HAS_NO_ITEMS for empty order",
      ({ Given, When, Then, And }) => {
        Given('an order with 0 items and orderId "ord_empty"', () => {
          state.order = createTestOrderCMS({
            items: [],
            orderId: "ord_empty",
          });
        });

        When("I call orderHasItems.assert()", () => {
          try {
            orderHasItems.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "ORDER_HAS_NO_ITEMS"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.ORDER_HAS_NO_ITEMS);
        });

        And('the error context contains orderId "ord_empty"', () => {
          expect(state.error!.context?.orderId).toBe("ord_empty");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: orderCanAddItem
  // ==========================================================================

  Rule("orderCanAddItem checks whether an order has room for more items", ({ RuleScenario }) => {
    RuleScenario("check returns true when order has room for items", ({ Given, When, Then }) => {
      Given("an order with 0 items", () => {
        state.order = createTestOrderCMS({ items: [] });
      });

      When("I call orderCanAddItem.check()", () => {
        state.checkResult = orderCanAddItem.check(state.order!);
      });

      Then("the result is true", () => {
        expect(state.checkResult).toBe(true);
      });
    });

    RuleScenario("check returns false when order is at max capacity", ({ Given, When, Then }) => {
      Given("an order at max item capacity", () => {
        const items = Array(MAX_ITEMS_PER_ORDER)
          .fill(null)
          .map((_, i) => createTestItem({ productId: `prod_${i}` }));
        state.order = createTestOrderCMS({ items });
      });

      When("I call orderCanAddItem.check()", () => {
        state.checkResult = orderCanAddItem.check(state.order!);
      });

      Then("the result is false", () => {
        expect(state.checkResult).toBe(false);
      });
    });

    RuleScenario("assert passes when order has room for items", ({ Given, When, Then }) => {
      Given("an order with 0 items", () => {
        state.order = createTestOrderCMS({ items: [] });
      });

      When("I call orderCanAddItem.assert()", () => {
        try {
          orderCanAddItem.assert(state.order!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("assert passes when order is one under max capacity", ({ Given, When, Then }) => {
      Given("an order one under max item capacity", () => {
        const items = Array(MAX_ITEMS_PER_ORDER - 1)
          .fill(null)
          .map((_, i) => createTestItem({ productId: `prod_${i}` }));
        state.order = createTestOrderCMS({ items });
      });

      When("I call orderCanAddItem.assert()", () => {
        try {
          orderCanAddItem.assert(state.order!);
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
      "assert throws MAX_ITEMS_EXCEEDED at max capacity",
      ({ Given, When, Then, And }) => {
        Given('an order at max item capacity with orderId "ord_full"', () => {
          const items = Array(MAX_ITEMS_PER_ORDER)
            .fill(null)
            .map((_, i) => createTestItem({ productId: `prod_${i}` }));
          state.order = createTestOrderCMS({
            items,
            orderId: "ord_full",
          });
        });

        When("I call orderCanAddItem.assert()", () => {
          try {
            orderCanAddItem.assert(state.order!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "MAX_ITEMS_EXCEEDED"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.MAX_ITEMS_EXCEEDED);
        });

        And("the error context contains currentCount equal to MAX_ITEMS_PER_ORDER", () => {
          expect(state.error!.context?.currentCount).toBe(MAX_ITEMS_PER_ORDER);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: assertItemExists
  // ==========================================================================

  Rule(
    "assertItemExists validates that a product exists in the order items",
    ({ RuleScenario }) => {
      RuleScenario("passes when item exists in order", ({ Given, When, Then }) => {
        Given('an order with item productId "prod_target"', () => {
          state.order = createTestOrderCMS({
            items: [createTestItem({ productId: "prod_target" })],
          });
        });

        When('I call assertItemExists with productId "prod_target"', () => {
          try {
            assertItemExists(state.order!, "prod_target");
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("passes when item is one of many", ({ Given, When, Then }) => {
        Given('an order with items "prod_1", "prod_target", "prod_3"', () => {
          state.order = createTestOrderCMS({
            items: [
              createTestItem({ productId: "prod_1" }),
              createTestItem({ productId: "prod_target" }),
              createTestItem({ productId: "prod_3" }),
            ],
          });
        });

        When('I call assertItemExists with productId "prod_target"', () => {
          try {
            assertItemExists(state.order!, "prod_target");
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
        "throws ITEM_NOT_FOUND when item does not exist",
        ({ Given, When, Then, And }) => {
          Given('an order with item productId "prod_other" and orderId "ord_test"', () => {
            state.order = createTestOrderCMS({
              items: [createTestItem({ productId: "prod_other" })],
              orderId: "ord_test",
            });
          });

          When('I call assertItemExists with productId "prod_missing"', () => {
            try {
              assertItemExists(state.order!, "prod_missing");
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as OrderInvariantError;
            }
          });

          Then('an OrderInvariantError is thrown with code "ITEM_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(OrderInvariantError);
            expect(state.error!.code).toBe(OrderErrorCodes.ITEM_NOT_FOUND);
          });

          And('the error context contains productId "prod_missing"', () => {
            expect(state.error!.context?.productId).toBe("prod_missing");
          });

          And('the error context contains orderId "ord_test"', () => {
            expect(state.error!.context?.orderId).toBe("ord_test");
          });
        }
      );

      RuleScenario("throws ITEM_NOT_FOUND when items array is empty", ({ Given, When, Then }) => {
        Given("an order with 0 items", () => {
          state.order = createTestOrderCMS({ items: [] });
        });

        When('I call assertItemExists with productId "prod_any"', () => {
          try {
            assertItemExists(state.order!, "prod_any");
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as OrderInvariantError;
          }
        });

        Then('an OrderInvariantError is thrown with code "ITEM_NOT_FOUND"', () => {
          expect(state.error).toBeInstanceOf(OrderInvariantError);
          expect(state.error!.code).toBe(OrderErrorCodes.ITEM_NOT_FOUND);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: validateItem
  // ==========================================================================

  Rule("validateItem validates item data integrity", ({ RuleScenario }) => {
    RuleScenario("passes for valid item", ({ Given, When, Then }) => {
      Given("a valid item with quantity 1 and unitPrice 10", () => {
        state.item = createTestItem();
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("passes for item with decimal price", ({ Given, When, Then }) => {
      Given("a valid item with quantity 1 and unitPrice 9.99", () => {
        state.item = createTestItem({ unitPrice: 9.99 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("passes for item with zero price (free item)", ({ Given, When, Then }) => {
      Given("a valid item with quantity 1 and unitPrice 0", () => {
        state.item = createTestItem({ unitPrice: 0 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("throws INVALID_QUANTITY for negative quantity", ({ Given, When, Then }) => {
      Given("an item with quantity -1", () => {
        state.item = createTestItem({ quantity: -1 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_QUANTITY"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_QUANTITY);
      });
    });

    RuleScenario("throws INVALID_QUANTITY for zero quantity", ({ Given, When, Then }) => {
      Given("an item with quantity 0", () => {
        state.item = createTestItem({ quantity: 0 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_QUANTITY"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_QUANTITY);
      });
    });

    RuleScenario("throws INVALID_QUANTITY for non-integer quantity", ({ Given, When, Then }) => {
      Given("an item with quantity 1.5", () => {
        state.item = createTestItem({ quantity: 1.5 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_QUANTITY"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_QUANTITY);
      });
    });

    RuleScenario("throws INVALID_PRICE for negative price", ({ Given, When, Then }) => {
      Given("an item with unitPrice -5", () => {
        state.item = createTestItem({ unitPrice: -5 });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_PRICE"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_PRICE);
      });
    });

    RuleScenario("throws INVALID_ITEM_DATA for empty productId", ({ Given, When, Then }) => {
      Given("an item with empty productId", () => {
        state.item = createTestItem({ productId: "" });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_ITEM_DATA"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_ITEM_DATA);
      });
    });

    RuleScenario("throws INVALID_ITEM_DATA for empty productName", ({ Given, When, Then }) => {
      Given("an item with empty productName", () => {
        state.item = createTestItem({ productName: "" });
      });

      When("I call validateItem", () => {
        try {
          validateItem(state.item!);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as OrderInvariantError;
        }
      });

      Then('an OrderInvariantError is thrown with code "INVALID_ITEM_DATA"', () => {
        expect(state.error).toBeInstanceOf(OrderInvariantError);
        expect(state.error!.code).toBe(OrderErrorCodes.INVALID_ITEM_DATA);
      });
    });
  });

  // ==========================================================================
  // Rule: OrderInvariantError
  // ==========================================================================

  Rule("OrderInvariantError carries structured error information", ({ RuleScenario }) => {
    RuleScenario("error has correct name property", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Test message"',
        () => {
          state.errorInstance = new OrderInvariantError(
            OrderErrorCodes.ORDER_NOT_FOUND,
            "Test message"
          );
        }
      );

      Then('the error name is "OrderInvariantError"', () => {
        expect(state.errorInstance!.name).toBe("OrderInvariantError");
      });
    });

    RuleScenario("error has correct code property", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_IN_DRAFT" and message "Test message"',
        () => {
          state.errorInstance = new OrderInvariantError(
            OrderErrorCodes.ORDER_NOT_IN_DRAFT,
            "Test message"
          );
        }
      );

      Then('the error code is "ORDER_NOT_IN_DRAFT"', () => {
        expect(state.errorInstance!.code).toBe("ORDER_NOT_IN_DRAFT");
      });
    });

    RuleScenario("error has correct message property", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Custom message"',
        () => {
          state.errorInstance = new OrderInvariantError(
            OrderErrorCodes.ORDER_NOT_FOUND,
            "Custom message"
          );
        }
      );

      Then('the error message is "Custom message"', () => {
        expect(state.errorInstance!.message).toBe("Custom message");
      });
    });

    RuleScenario("error has correct context property", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message" and context:',
        (_ctx: unknown, table: FieldValueRow[]) => {
          const context: Record<string, string> = {};
          for (const row of table) {
            context[row.field] = row.value;
          }
          state.errorInstance = new OrderInvariantError(
            OrderErrorCodes.ORDER_NOT_FOUND,
            "Message",
            context
          );
        }
      );

      Then("the error context matches the provided context", () => {
        expect(state.errorInstance!.context).toEqual({
          orderId: "ord_123",
          extra: "data",
        });
      });
    });

    RuleScenario("error can have undefined context", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message"',
        () => {
          state.errorInstance = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Message");
        }
      );

      Then("the error context is undefined", () => {
        expect(state.errorInstance!.context).toBeUndefined();
      });
    });

    RuleScenario("error is an instance of Error", ({ When, Then }) => {
      When(
        'I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message"',
        () => {
          state.errorInstance = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Message");
        }
      );

      Then("the error is an instance of Error", () => {
        expect(state.errorInstance).toBeInstanceOf(Error);
      });
    });
  });
});
