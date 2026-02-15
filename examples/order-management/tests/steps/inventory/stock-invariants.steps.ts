/**
 * Stock Invariants - Step Definitions
 *
 * BDD step definitions for pure stock invariant functions:
 * - assertSufficientStock
 * - checkStockAvailability
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  assertSufficientStock,
  checkStockAvailability,
  InventoryInvariantError,
  InventoryErrorCodes,
} from "../../../convex/contexts/inventory/domain/invariants.js";
import type { InventoryCMS } from "../../../convex/contexts/inventory/domain/inventory.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  product: InventoryCMS | null;
  error: InventoryInvariantError | null;
  noErrorThrown: boolean;
  stockResult: { available: true } | { available: false; deficit: number } | null;
}

function createInitialState(): TestState {
  return {
    product: null,
    error: null,
    noErrorThrown: false,
    stockResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Factories
// =============================================================================

function createTestInventoryCMS(overrides: Partial<InventoryCMS> = {}): InventoryCMS {
  return {
    productId: "prod_test",
    productName: "Test Product",
    sku: "SKU-TEST-001",
    availableQuantity: 100,
    reservedQuantity: 10,
    unitPrice: 49.99,
    version: 1,
    stateVersion: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/inventory/stock-invariants.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: assertSufficientStock ensures requested quantity does not exceed
  //       available stock
  // ==========================================================================

  Rule(
    "assertSufficientStock ensures requested quantity does not exceed available stock",
    ({ RuleScenario }) => {
      // --- passes when stock is sufficient ---
      RuleScenario("passes when stock is sufficient", ({ Given, When, Then }) => {
        Given("a product with available quantity 100", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 100 });
        });

        When("I assert sufficient stock for quantity 50", () => {
          try {
            assertSufficientStock(state.product!, 50);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      // --- passes when requesting exact available quantity ---
      RuleScenario("passes when requesting exact available quantity", ({ Given, When, Then }) => {
        Given("a product with available quantity 100", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 100 });
        });

        When("I assert sufficient stock for quantity 100", () => {
          try {
            assertSufficientStock(state.product!, 100);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      // --- throws INSUFFICIENT_STOCK when stock is not enough ---
      RuleScenario(
        "throws INSUFFICIENT_STOCK when stock is not enough",
        ({ Given, When, Then, And }) => {
          Given('a product with available quantity 10 and productId "prod_low"', () => {
            state.product = createTestInventoryCMS({
              availableQuantity: 10,
              productId: "prod_low",
            });
          });

          When("I assert sufficient stock for quantity 20", () => {
            try {
              assertSufficientStock(state.product!, 20);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InventoryInvariantError;
            }
          });

          Then('an InventoryInvariantError is thrown with code "INSUFFICIENT_STOCK"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.INSUFFICIENT_STOCK);
          });

          And('the error context productId is "prod_low"', () => {
            expect(state.error!.context?.productId).toBe("prod_low");
          });

          And("the error context availableQuantity is 10", () => {
            expect(state.error!.context?.availableQuantity).toBe(10);
          });

          And("the error context requestedQuantity is 20", () => {
            expect(state.error!.context?.requestedQuantity).toBe(20);
          });
        }
      );

      // --- throws INSUFFICIENT_STOCK when stock is zero ---
      RuleScenario("throws INSUFFICIENT_STOCK when stock is zero", ({ Given, When, Then }) => {
        Given("a product with available quantity 0", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 0 });
        });

        When("I assert sufficient stock for quantity 1", () => {
          try {
            assertSufficientStock(state.product!, 1);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INSUFFICIENT_STOCK"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INSUFFICIENT_STOCK);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: checkStockAvailability returns availability status with optional
  //       deficit
  // ==========================================================================

  Rule(
    "checkStockAvailability returns availability status with optional deficit",
    ({ RuleScenario }) => {
      // --- returns available when stock is sufficient ---
      RuleScenario("returns available when stock is sufficient", ({ Given, When, Then }) => {
        Given("a product with available quantity 100", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 100 });
        });

        When("I check stock availability for quantity 50", () => {
          state.stockResult = checkStockAvailability(state.product!, 50);
        });

        Then("the result shows stock is available", () => {
          expect(state.stockResult).toEqual({ available: true });
        });
      });

      // --- returns available when requesting exact amount ---
      RuleScenario("returns available when requesting exact amount", ({ Given, When, Then }) => {
        Given("a product with available quantity 100", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 100 });
        });

        When("I check stock availability for quantity 100", () => {
          state.stockResult = checkStockAvailability(state.product!, 100);
        });

        Then("the result shows stock is available", () => {
          expect(state.stockResult).toEqual({ available: true });
        });
      });

      // --- returns unavailable with deficit when stock is insufficient ---
      RuleScenario(
        "returns unavailable with deficit when stock is insufficient",
        ({ Given, When, Then, And }) => {
          Given("a product with available quantity 10", () => {
            state.product = createTestInventoryCMS({ availableQuantity: 10 });
          });

          When("I check stock availability for quantity 25", () => {
            state.stockResult = checkStockAvailability(state.product!, 25);
          });

          Then("the result shows stock is not available", () => {
            expect(state.stockResult!.available).toBe(false);
          });

          And("the deficit is 15", () => {
            if (!state.stockResult!.available) {
              expect(state.stockResult!.deficit).toBe(15);
            }
          });
        }
      );

      // --- returns correct deficit for zero stock ---
      RuleScenario("returns correct deficit for zero stock", ({ Given, When, Then, And }) => {
        Given("a product with available quantity 0", () => {
          state.product = createTestInventoryCMS({ availableQuantity: 0 });
        });

        When("I check stock availability for quantity 10", () => {
          state.stockResult = checkStockAvailability(state.product!, 10);
        });

        Then("the result shows stock is not available", () => {
          expect(state.stockResult!.available).toBe(false);
        });

        And("the deficit is 10", () => {
          if (!state.stockResult!.available) {
            expect(state.stockResult!.deficit).toBe(10);
          }
        });
      });
    }
  );
});
