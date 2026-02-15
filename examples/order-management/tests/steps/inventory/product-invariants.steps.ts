/**
 * Product Invariants - Step Definitions
 *
 * BDD step definitions for pure product invariant functions:
 * - assertProductExists / assertProductDoesNotExist
 * - assertValidSku / assertValidProductName
 * - assertPositiveQuantity
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  assertProductExists,
  assertProductDoesNotExist,
  assertValidSku,
  assertValidProductName,
  assertPositiveQuantity,
  InventoryInvariantError,
  InventoryErrorCodes,
} from "../../../convex/contexts/inventory/domain/invariants.js";
import type { InventoryCMS } from "../../../convex/contexts/inventory/domain/inventory.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  product: InventoryCMS | null | undefined;
  skuValue: string;
  productNameValue: string;
  quantityValue: number;
  contextString: string | undefined;
  error: InventoryInvariantError | null;
  noErrorThrown: boolean;
}

function createInitialState(): TestState {
  return {
    product: null,
    skuValue: "",
    productNameValue: "",
    quantityValue: 0,
    contextString: undefined,
    error: null,
    noErrorThrown: false,
  };
}

// =============================================================================
// Factories
// =============================================================================

function createTestInventoryCMS(overrides: Partial<InventoryCMS> = {}): InventoryCMS {
  return {
    productId: "prod_test",
    productName: "Test Product",
    sku: "SKU-TEST-001",
    unitPrice: 49.99,
    availableQuantity: 100,
    reservedQuantity: 10,
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

let state: TestState = createInitialState();

const feature = await loadFeature("tests/features/behavior/inventory/product-invariants.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: assertProductExists
  // ==========================================================================

  Rule(
    "assertProductExists validates that a product reference is not null or undefined",
    ({ RuleScenario }) => {
      RuleScenario("passes for a valid product", ({ Given, When, Then }) => {
        Given("a valid product", () => {
          state.product = createTestInventoryCMS();
        });

        When("I call assertProductExists", () => {
          try {
            assertProductExists(state.product);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario(
        "throws PRODUCT_NOT_FOUND for null product reference",
        ({ Given, When, Then }) => {
          Given("a null product reference", () => {
            state.product = null;
          });

          When("I call assertProductExists", () => {
            try {
              assertProductExists(state.product);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InventoryInvariantError;
            }
          });

          Then('an InventoryInvariantError is thrown with code "PRODUCT_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.PRODUCT_NOT_FOUND);
          });
        }
      );

      RuleScenario(
        "throws PRODUCT_NOT_FOUND for undefined product reference",
        ({ Given, When, Then }) => {
          Given("an undefined product reference", () => {
            state.product = undefined;
          });

          When("I call assertProductExists", () => {
            try {
              assertProductExists(state.product);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InventoryInvariantError;
            }
          });

          Then('an InventoryInvariantError is thrown with code "PRODUCT_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.PRODUCT_NOT_FOUND);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assertProductDoesNotExist
  // ==========================================================================

  Rule(
    "assertProductDoesNotExist validates that a product reference is null or undefined",
    ({ RuleScenario }) => {
      RuleScenario("passes for null product reference", ({ Given, When, Then }) => {
        Given("a null product reference", () => {
          state.product = null;
        });

        When("I call assertProductDoesNotExist", () => {
          try {
            assertProductDoesNotExist(state.product);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("passes for undefined product reference", ({ Given, When, Then }) => {
        Given("an undefined product reference", () => {
          state.product = undefined;
        });

        When("I call assertProductDoesNotExist", () => {
          try {
            assertProductDoesNotExist(state.product);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario(
        "throws PRODUCT_ALREADY_EXISTS for existing product",
        ({ Given, When, Then, And }) => {
          Given('an existing product with productId "prod_existing"', () => {
            state.product = createTestInventoryCMS({ productId: "prod_existing" });
          });

          When("I call assertProductDoesNotExist", () => {
            try {
              assertProductDoesNotExist(state.product);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InventoryInvariantError;
            }
          });

          Then('an InventoryInvariantError is thrown with code "PRODUCT_ALREADY_EXISTS"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.PRODUCT_ALREADY_EXISTS);
          });

          And('the error context contains productId "prod_existing"', () => {
            expect(state.error!.context?.productId).toBe("prod_existing");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assertValidSku
  // ==========================================================================

  Rule("assertValidSku validates that a SKU string is non-empty", ({ RuleScenario }) => {
    RuleScenario("passes for standard SKU", ({ Given, When, Then }) => {
      Given('the SKU value "SKU-123"', () => {
        state.skuValue = "SKU-123";
      });

      When("I call assertValidSku", () => {
        try {
          assertValidSku(state.skuValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("passes for SKU with special characters", ({ Given, When, Then }) => {
      Given('the SKU value "SKU_ABC-123/XYZ"', () => {
        state.skuValue = "SKU_ABC-123/XYZ";
      });

      When("I call assertValidSku", () => {
        try {
          assertValidSku(state.skuValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("throws INVALID_SKU for empty SKU", ({ Given, When, Then }) => {
      Given("an empty SKU value", () => {
        state.skuValue = "";
      });

      When("I call assertValidSku", () => {
        try {
          assertValidSku(state.skuValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then('an InventoryInvariantError is thrown with code "INVALID_SKU"', () => {
        expect(state.error).toBeInstanceOf(InventoryInvariantError);
        expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_SKU);
      });
    });

    RuleScenario("throws INVALID_SKU for whitespace-only SKU", ({ Given, When, Then }) => {
      Given("a whitespace-only SKU value", () => {
        state.skuValue = "   ";
      });

      When("I call assertValidSku", () => {
        try {
          assertValidSku(state.skuValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then('an InventoryInvariantError is thrown with code "INVALID_SKU"', () => {
        expect(state.error).toBeInstanceOf(InventoryInvariantError);
        expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_SKU);
      });
    });
  });

  // ==========================================================================
  // Rule: assertValidProductName
  // ==========================================================================

  Rule("assertValidProductName validates that a product name is non-empty", ({ RuleScenario }) => {
    RuleScenario("passes for standard product name", ({ Given, When, Then }) => {
      Given('the product name "Test Product"', () => {
        state.productNameValue = "Test Product";
      });

      When("I call assertValidProductName", () => {
        try {
          assertValidProductName(state.productNameValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("passes for product name with numbers", ({ Given, When, Then }) => {
      Given('the product name "Widget 2000"', () => {
        state.productNameValue = "Widget 2000";
      });

      When("I call assertValidProductName", () => {
        try {
          assertValidProductName(state.productNameValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
      });
    });

    RuleScenario("throws INVALID_PRODUCT_NAME for empty product name", ({ Given, When, Then }) => {
      Given("an empty product name", () => {
        state.productNameValue = "";
      });

      When("I call assertValidProductName", () => {
        try {
          assertValidProductName(state.productNameValue);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InventoryInvariantError;
        }
      });

      Then('an InventoryInvariantError is thrown with code "INVALID_PRODUCT_NAME"', () => {
        expect(state.error).toBeInstanceOf(InventoryInvariantError);
        expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_PRODUCT_NAME);
      });
    });

    RuleScenario(
      "throws INVALID_PRODUCT_NAME for whitespace-only product name",
      ({ Given, When, Then }) => {
        Given("a whitespace-only product name", () => {
          state.productNameValue = "   ";
        });

        When("I call assertValidProductName", () => {
          try {
            assertValidProductName(state.productNameValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_PRODUCT_NAME"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_PRODUCT_NAME);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: assertPositiveQuantity
  // ==========================================================================

  Rule(
    "assertPositiveQuantity validates that a quantity is a positive integer",
    ({ RuleScenario }) => {
      RuleScenario("passes for positive integer 10", ({ Given, When, Then }) => {
        Given("the quantity value 10", () => {
          state.quantityValue = 10;
        });

        When("I call assertPositiveQuantity", () => {
          try {
            assertPositiveQuantity(state.quantityValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("passes for positive integer 1", ({ Given, When, Then }) => {
        Given("the quantity value 1", () => {
          state.quantityValue = 1;
        });

        When("I call assertPositiveQuantity", () => {
          try {
            assertPositiveQuantity(state.quantityValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
        });
      });

      RuleScenario("throws INVALID_QUANTITY for zero", ({ Given, When, Then }) => {
        Given("the quantity value 0", () => {
          state.quantityValue = 0;
        });

        When("I call assertPositiveQuantity", () => {
          try {
            assertPositiveQuantity(state.quantityValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      });

      RuleScenario("throws INVALID_QUANTITY for negative number", ({ Given, When, Then, And }) => {
        Given("the quantity value -5", () => {
          state.quantityValue = -5;
        });

        When("I call assertPositiveQuantity", () => {
          try {
            assertPositiveQuantity(state.quantityValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });

        And("the error context contains quantity -5", () => {
          expect(state.error!.context?.quantity).toBe(-5);
        });
      });

      RuleScenario("throws INVALID_QUANTITY for non-integer", ({ Given, When, Then }) => {
        Given("the quantity value 1.5", () => {
          state.quantityValue = 1.5;
        });

        When("I call assertPositiveQuantity", () => {
          try {
            assertPositiveQuantity(state.quantityValue);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      });

      RuleScenario("includes context string in error message", ({ Given, When, Then }) => {
        Given('the quantity value 0 with context "adding stock"', () => {
          state.quantityValue = 0;
          state.contextString = "adding stock";
        });

        When("I call assertPositiveQuantity with context", () => {
          try {
            assertPositiveQuantity(state.quantityValue, state.contextString);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InventoryInvariantError;
          }
        });

        Then('the error message contains "adding stock"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.message).toContain("adding stock");
        });
      });
    }
  );
});
