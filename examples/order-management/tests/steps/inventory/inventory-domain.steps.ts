/**
 * Inventory Domain Functions - Step Definitions
 *
 * BDD step definitions for pure inventory domain functions:
 * - calculateTotalQuantity
 * - createInitialInventoryCMS
 * - upcastInventoryCMS
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  calculateTotalQuantity,
  createInitialInventoryCMS,
  upcastInventoryCMS,
  CURRENT_INVENTORY_CMS_VERSION,
  type InventoryCMS,
} from "../../../convex/contexts/inventory/domain/inventory.js";

// =============================================================================
// Test State
// =============================================================================

interface DataTableRow {
  field: string;
  value: string;
}

interface TestState {
  inventoryCMS: InventoryCMS | null;
  rawCMS: Record<string, unknown> | null;
  totalQuantity: number | null;
  createdCMS: InventoryCMS | null;
  upcastedCMS: InventoryCMS | null;
  error: Error | null;
  beforeTimestamp: number;
}

function createInitialState(): TestState {
  return {
    inventoryCMS: null,
    rawCMS: null,
    totalQuantity: null,
    createdCMS: null,
    upcastedCMS: null,
    error: null,
    beforeTimestamp: 0,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Inventory Domain Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/inventory/inventory-domain.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("the inventory domain module is imported", () => {
      expect(calculateTotalQuantity).toBeDefined();
      expect(createInitialInventoryCMS).toBeDefined();
      expect(upcastInventoryCMS).toBeDefined();
    });
  });

  // ==========================================================================
  // Rule: calculateTotalQuantity returns the sum of available and reserved
  // ==========================================================================

  Rule(
    "calculateTotalQuantity returns the sum of available and reserved quantities",
    ({ RuleScenario }) => {
      RuleScenario("Sum of available and reserved", ({ Given, When, Then }) => {
        Given("an inventory CMS with availableQuantity 100 and reservedQuantity 25", () => {
          state.inventoryCMS = {
            productId: "prod_1",
            productName: "Test",
            sku: "SKU-001",
            unitPrice: 9.99,
            availableQuantity: 100,
            reservedQuantity: 25,
            version: 1,
            stateVersion: 1,
            createdAt: 1000,
            updatedAt: 1000,
          };
        });

        When("I calculate the total quantity", () => {
          state.totalQuantity = calculateTotalQuantity(state.inventoryCMS!);
        });

        Then("the total quantity is 125", () => {
          expect(state.totalQuantity).toBe(125);
        });
      });

      RuleScenario("Only available when reserved is zero", ({ Given, When, Then }) => {
        Given("an inventory CMS with availableQuantity 50 and reservedQuantity 0", () => {
          state.inventoryCMS = {
            productId: "prod_1",
            productName: "Test",
            sku: "SKU-001",
            unitPrice: 9.99,
            availableQuantity: 50,
            reservedQuantity: 0,
            version: 1,
            stateVersion: 1,
            createdAt: 1000,
            updatedAt: 1000,
          };
        });

        When("I calculate the total quantity", () => {
          state.totalQuantity = calculateTotalQuantity(state.inventoryCMS!);
        });

        Then("the total quantity is 50", () => {
          expect(state.totalQuantity).toBe(50);
        });
      });

      RuleScenario("Only reserved when available is zero", ({ Given, When, Then }) => {
        Given("an inventory CMS with availableQuantity 0 and reservedQuantity 30", () => {
          state.inventoryCMS = {
            productId: "prod_1",
            productName: "Test",
            sku: "SKU-001",
            unitPrice: 9.99,
            availableQuantity: 0,
            reservedQuantity: 30,
            version: 1,
            stateVersion: 1,
            createdAt: 1000,
            updatedAt: 1000,
          };
        });

        When("I calculate the total quantity", () => {
          state.totalQuantity = calculateTotalQuantity(state.inventoryCMS!);
        });

        Then("the total quantity is 30", () => {
          expect(state.totalQuantity).toBe(30);
        });
      });

      RuleScenario("Both quantities are zero", ({ Given, When, Then }) => {
        Given("an inventory CMS with availableQuantity 0 and reservedQuantity 0", () => {
          state.inventoryCMS = {
            productId: "prod_1",
            productName: "Test",
            sku: "SKU-001",
            unitPrice: 9.99,
            availableQuantity: 0,
            reservedQuantity: 0,
            version: 1,
            stateVersion: 1,
            createdAt: 1000,
            updatedAt: 1000,
          };
        });

        When("I calculate the total quantity", () => {
          state.totalQuantity = calculateTotalQuantity(state.inventoryCMS!);
        });

        Then("the total quantity is 0", () => {
          expect(state.totalQuantity).toBe(0);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: createInitialInventoryCMS produces a correctly initialized CMS
  // ==========================================================================

  Rule(
    "createInitialInventoryCMS produces a correctly initialized CMS record",
    ({ RuleScenario }) => {
      RuleScenario("CMS fields match input parameters", ({ When, Then }) => {
        When(
          'I create an initial inventory CMS with productId "prod_123", productName "Test Widget", sku "SKU-TEST-001", and unitPrice 29.99',
          () => {
            state.createdCMS = createInitialInventoryCMS(
              "prod_123",
              "Test Widget",
              "SKU-TEST-001",
              29.99
            );
          }
        );

        Then("the CMS has the following field values:", (_ctx: unknown, table: DataTableRow[]) => {
          for (const row of table) {
            const actual = state.createdCMS![row.field as keyof InventoryCMS];
            if (row.field === "unitPrice") {
              expect(actual).toBe(parseFloat(row.value));
            } else {
              expect(actual).toBe(row.value);
            }
          }
        });
      });

      RuleScenario("Initial quantities and version are zero", ({ When, Then, And }) => {
        When(
          'I create an initial inventory CMS with productId "prod_123", productName "Test", sku "SKU-001", and unitPrice 10.00',
          () => {
            state.createdCMS = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
          }
        );

        Then(
          "the CMS has the following numeric field values:",
          (_ctx: unknown, table: DataTableRow[]) => {
            for (const row of table) {
              const actual = state.createdCMS![row.field as keyof InventoryCMS];
              expect(actual).toBe(parseInt(row.value, 10));
            }
          }
        );

        And("the CMS stateVersion equals the current inventory CMS version", () => {
          expect(state.createdCMS!.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
        });
      });

      RuleScenario("Timestamps are set to current time", ({ Given, When, Then, And }) => {
        Given("I record the current time", () => {
          state.beforeTimestamp = Date.now();
        });

        When(
          'I create an initial inventory CMS with productId "prod_123", productName "Test", sku "SKU-001", and unitPrice 10.00',
          () => {
            state.createdCMS = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
          }
        );

        Then("the CMS createdAt is between the recorded time and now", () => {
          const afterTimestamp = Date.now();
          expect(state.createdCMS!.createdAt).toBeGreaterThanOrEqual(state.beforeTimestamp);
          expect(state.createdCMS!.createdAt).toBeLessThanOrEqual(afterTimestamp);
        });

        And("the CMS updatedAt equals createdAt", () => {
          expect(state.createdCMS!.updatedAt).toBe(state.createdCMS!.createdAt);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: upcastInventoryCMS migrates older CMS versions
  // ==========================================================================

  Rule(
    "upcastInventoryCMS migrates older CMS versions to the current version",
    ({ RuleScenario }) => {
      RuleScenario("Current version CMS is unchanged", ({ Given, When, Then, And }) => {
        Given(
          'an inventory CMS at the current stateVersion with productId "prod_123" and availableQuantity 100',
          () => {
            state.inventoryCMS = {
              productId: "prod_123",
              productName: "Test Product",
              sku: "SKU-001",
              unitPrice: 9.99,
              availableQuantity: 100,
              reservedQuantity: 10,
              version: 5,
              stateVersion: CURRENT_INVENTORY_CMS_VERSION,
              createdAt: 1000,
              updatedAt: 2000,
            };
          }
        );

        When("I upcast the inventory CMS", () => {
          state.upcastedCMS = upcastInventoryCMS(state.inventoryCMS!);
        });

        Then("the upcasted CMS equals the original CMS", () => {
          expect(state.upcastedCMS).toEqual(state.inventoryCMS);
        });

        And("the upcasted CMS stateVersion equals the current inventory CMS version", () => {
          expect(state.upcastedCMS!.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
        });
      });

      RuleScenario("Missing stateVersion is upgraded", ({ Given, When, Then, And }) => {
        Given(
          'an inventory CMS without a stateVersion field and with productId "prod_123" and availableQuantity 50',
          () => {
            state.rawCMS = {
              productId: "prod_123",
              productName: "Test Product",
              sku: "SKU-001",
              unitPrice: 9.99,
              availableQuantity: 50,
              reservedQuantity: 5,
              version: 3,
              // stateVersion intentionally missing
              createdAt: 1000,
              updatedAt: 2000,
            };
          }
        );

        When("I upcast the inventory CMS", () => {
          state.upcastedCMS = upcastInventoryCMS(state.rawCMS!);
        });

        Then("the upcasted CMS stateVersion equals the current inventory CMS version", () => {
          expect(state.upcastedCMS!.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
        });

        And('the upcasted CMS productId is "prod_123"', () => {
          expect(state.upcastedCMS!.productId).toBe("prod_123");
        });

        And("the upcasted CMS availableQuantity is 50", () => {
          expect(state.upcastedCMS!.availableQuantity).toBe(50);
        });
      });

      RuleScenario("Version 0 is upgraded", ({ Given, When, Then, And }) => {
        Given(
          'an inventory CMS with stateVersion 0, productId "prod_123", availableQuantity 75, and reservedQuantity 15',
          () => {
            state.rawCMS = {
              productId: "prod_123",
              productName: "Test Product",
              sku: "SKU-001",
              unitPrice: 9.99,
              availableQuantity: 75,
              reservedQuantity: 15,
              version: 4,
              stateVersion: 0,
              createdAt: 1000,
              updatedAt: 2000,
            };
          }
        );

        When("I upcast the inventory CMS", () => {
          state.upcastedCMS = upcastInventoryCMS(state.rawCMS!);
        });

        Then("the upcasted CMS stateVersion equals the current inventory CMS version", () => {
          expect(state.upcastedCMS!.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
        });

        And(
          "the upcasted CMS has the following preserved fields:",
          (_ctx: unknown, table: DataTableRow[]) => {
            for (const row of table) {
              const actual = state.upcastedCMS![row.field as keyof InventoryCMS];
              const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
              expect(actual).toBe(expected);
            }
          }
        );
      });

      RuleScenario("All fields are preserved during upcast", ({ Given, When, Then }) => {
        Given(
          "an inventory CMS with stateVersion 0 and the following fields:",
          (_ctx: unknown, table: DataTableRow[]) => {
            state.rawCMS = { stateVersion: 0 };
            for (const row of table) {
              state.rawCMS[row.field] = isNaN(Number(row.value)) ? row.value : Number(row.value);
            }
          }
        );

        When("I upcast the inventory CMS", () => {
          state.upcastedCMS = upcastInventoryCMS(state.rawCMS!);
        });

        Then(
          "the upcasted CMS has the following preserved fields:",
          (_ctx: unknown, table: DataTableRow[]) => {
            for (const row of table) {
              const actual = state.upcastedCMS![row.field as keyof InventoryCMS];
              const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
              expect(actual).toBe(expected);
            }
          }
        );
      });
    }
  );

  // ==========================================================================
  // Rule: upcastInventoryCMS rejects future CMS versions
  // ==========================================================================

  Rule("upcastInventoryCMS rejects future CMS versions", ({ RuleScenario }) => {
    RuleScenario("Future version throws error", ({ Given, When, Then }) => {
      Given("an inventory CMS with a stateVersion 10 higher than the current version", () => {
        state.rawCMS = {
          productId: "prod_123",
          productName: "Test Product",
          sku: "SKU-001",
          unitPrice: 9.99,
          availableQuantity: 50,
          reservedQuantity: 5,
          version: 3,
          stateVersion: CURRENT_INVENTORY_CMS_VERSION + 10,
          createdAt: 1000,
          updatedAt: 2000,
        };
      });

      When("I attempt to upcast the inventory CMS", () => {
        try {
          state.upcastedCMS = upcastInventoryCMS(state.rawCMS!);
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error is thrown mentioning "newer than supported version"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error!.message).toMatch(/newer than supported version/);
      });
    });
  });
});
