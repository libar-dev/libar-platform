/**
 * Inventory Integration Step Definitions
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests complete flow: commands -> events -> projections.
 *
 * These steps require:
 * - Docker backend running (port 3210)
 * - `just start && just deploy-local` executed
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";
import { generateSku, generateProductId, generateReservationId } from "../fixtures/inventory";
import { waitUntil, waitForInventoryProjection } from "../support/localBackendHelpers";
import { testMutation, testQuery } from "../support/integrationHelpers";

// =============================================================================
// Types
// =============================================================================

/** DataTable row for product creation with columns */
type ProductDataTableRow = {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: string;
};

/** DataTable row for stock operations */
type StockDataTableRow = {
  quantity: string;
  reason?: string;
};

/** DataTable row for product setup with stock */
type ProductSetupTableRow = {
  productId: string;
  productName: string;
  sku: string;
  availableQuantity: string;
};

/** DataTable row for availability setup */
type AvailabilitySetupTableRow = {
  availableQuantity: string;
  reservedQuantity: string;
};

/** DataTable row for check availability */
type CheckAvailabilityTableRow = {
  productId: string;
  quantity: string;
};

/** DataTable row for reservation items */
type ReservationItemTableRow = {
  productId: string;
  quantity: string;
};

// State interface for each scenario
interface IntegrationScenarioState {
  t: ConvexTestingHelper;
  lastResult: unknown;
  lastError: Error | null;
  secondResult: unknown;
  scenario: {
    productId?: string;
    productName?: string;
    sku?: string;
    commandId?: string;
    orderId?: string;
    reservationId?: string;
    products?: Array<{ productId: string; productName: string }>;
  };
}

// Module-level state shared across steps within a scenario
let scenarioState: IntegrationScenarioState | null = null;

// Initialize state for a scenario
function initState(): IntegrationScenarioState {
  return {
    t: new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    }),
    lastResult: null,
    lastError: null,
    secondResult: null,
    scenario: {},
  };
}

/**
 * Parse product data table (column-based format).
 */
function parseProductDataTable(rows: ProductDataTableRow[]): {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
} {
  const row = rows[0];
  return {
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    unitPrice: parseFloat(row.unitPrice),
  };
}

/**
 * Parse stock data table (column-based format).
 */
function parseStockDataTable(rows: StockDataTableRow[]): {
  quantity: number;
  reason?: string;
} {
  const row = rows[0];
  return {
    quantity: parseInt(row.quantity, 10),
    reason: row.reason,
  };
}

// =============================================================================
// CREATE PRODUCT FEATURE
// =============================================================================

const createProductFeature = await loadFeature(
  "tests/integration-features/inventory/create-product.feature"
);

describeFeature(createProductFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Successfully create a new product and verify projection
  // --------------------------------------------------------------------------
  Scenario("Successfully create a new product and verify projection", ({ When, Then, And }) => {
    When("I create a product with:", async (_ctx: unknown, table: ProductDataTableRow[]) => {
      const data = parseProductDataTable(table);
      const uniqueProductId = `${data.productId}-${Date.now()}`;
      const uniqueSku = `${data.sku}-${Date.now()}`;

      scenarioState!.scenario.productId = uniqueProductId;
      scenarioState!.scenario.productName = data.productName;
      scenarioState!.scenario.sku = uniqueSku;

      try {
        scenarioState!.lastResult = await testMutation(
          scenarioState!.t,
          api.inventory.createProduct,
          {
            productId: uniqueProductId,
            productName: data.productName,
            sku: uniqueSku,
            unitPrice: data.unitPrice,
          }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      const productId = scenarioState!.scenario.productId!;
      await waitForInventoryProjection(scenarioState!.t, productId);
    });

    And(
      "the product {string} should exist with name {string}",
      async (_ctx: unknown, _productId: string, expectedName: string) => {
        const productId = scenarioState!.scenario.productId!;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product).toBeDefined();
        expect(product?.productName).toBe(expectedName);
      }
    );

    And(
      "the product {string} should have {int} available stock",
      async (_ctx: unknown, _productId: string, expectedStock: number) => {
        const productId = scenarioState!.scenario.productId!;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedStock);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject duplicate product ID
  // --------------------------------------------------------------------------
  Scenario("Reject duplicate product ID", ({ Given, When, Then }) => {
    Given("a product {string} exists", async (_ctx: unknown, productId: string) => {
      const uniqueProductId = `${productId}-${Date.now()}`;
      const uniqueSku = generateSku();

      scenarioState!.scenario.productId = uniqueProductId;
      scenarioState!.scenario.sku = uniqueSku;

      await testMutation(scenarioState!.t, api.inventory.createProduct, {
        productId: uniqueProductId,
        productName: "Existing Product",
        sku: uniqueSku,
        unitPrice: 9.99,
      });
    });

    When("I create a product with:", async (_ctx: unknown, table: ProductDataTableRow[]) => {
      const data = parseProductDataTable(table);
      const productId = scenarioState!.scenario.productId!;
      const newSku = generateSku();

      try {
        scenarioState!.lastResult = await testMutation(
          scenarioState!.t,
          api.inventory.createProduct,
          {
            productId,
            productName: data.productName,
            sku: newSku,
            unitPrice: data.unitPrice,
          }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject duplicate SKU
  // --------------------------------------------------------------------------
  Scenario("Reject duplicate SKU", ({ Given, When, Then }) => {
    Given("a product with SKU {string} exists", async (_ctx: unknown, sku: string) => {
      const uniqueSku = `${sku}-${Date.now()}`;
      const productId = generateProductId();

      scenarioState!.scenario.sku = uniqueSku;
      scenarioState!.scenario.productId = productId;

      await testMutation(scenarioState!.t, api.inventory.createProduct, {
        productId,
        productName: "First Product",
        sku: uniqueSku,
        unitPrice: 9.99,
      });

      await waitForInventoryProjection(scenarioState!.t, productId);
    });

    When("I create a product with:", async (_ctx: unknown, table: ProductDataTableRow[]) => {
      const data = parseProductDataTable(table);
      const existingSku = scenarioState!.scenario.sku!;
      const newProductId = generateProductId();

      try {
        scenarioState!.lastResult = await testMutation(
          scenarioState!.t,
          api.inventory.createProduct,
          {
            productId: newProductId,
            productName: data.productName,
            sku: existingSku,
            unitPrice: data.unitPrice,
          }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: CreateProduct is idempotent with same commandId
  // --------------------------------------------------------------------------
  Scenario("CreateProduct is idempotent with same commandId", ({ When, Then, And }) => {
    When(
      "I create a product with commandId {string}:",
      async (_ctx: unknown, commandId: string, table: ProductDataTableRow[]) => {
        const data = parseProductDataTable(table);
        const uniqueProductId = `${data.productId}-${Date.now()}`;
        const uniqueSku = `${data.sku}-${Date.now()}`;

        scenarioState!.scenario.productId = uniqueProductId;
        scenarioState!.scenario.sku = uniqueSku;
        scenarioState!.scenario.commandId = commandId;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.createProduct,
            {
              productId: uniqueProductId,
              productName: data.productName,
              sku: uniqueSku,
              unitPrice: data.unitPrice,
              commandId,
            }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And(
      "I create a product with commandId {string}:",
      async (_ctx: unknown, commandId: string, table: ProductDataTableRow[]) => {
        const data = parseProductDataTable(table);
        const productId = scenarioState!.scenario.productId!;
        const sku = scenarioState!.scenario.sku!;

        try {
          scenarioState!.secondResult = await testMutation(
            scenarioState!.t,
            api.inventory.createProduct,
            {
              productId,
              productName: data.productName,
              sku,
              unitPrice: data.unitPrice,
              commandId,
            }
          );
        } catch (error) {
          scenarioState!.secondResult = { error: error as Error };
        }
      }
    );

    Then("the second command should return duplicate status", () => {
      expect(scenarioState!.secondResult).toBeDefined();
      const result = scenarioState!.secondResult as { status: string };
      expect(result.status).toBe("duplicate");
    });
  });
});

// =============================================================================
// ADD STOCK FEATURE
// =============================================================================

const addStockFeature = await loadFeature("tests/integration-features/inventory/add-stock.feature");

describeFeature(addStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Successfully add stock to existing product
  // --------------------------------------------------------------------------
  Scenario("Successfully add stock to existing product", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} stock",
      async (_ctx: unknown, productId: string, stock: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        const uniqueSku = generateSku();

        scenarioState!.scenario.productId = uniqueProductId;
        scenarioState!.scenario.sku = uniqueSku;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: uniqueSku,
          availableQuantity: stock,
        });
      }
    );

    When(
      "I add stock to product {string}:",
      async (_ctx: unknown, _productId: string, table: StockDataTableRow[]) => {
        const data = parseStockDataTable(table);
        const productId = scenarioState!.scenario.productId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.inventory.addStock, {
            productId,
            quantity: data.quantity,
            reason: data.reason,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      const productId = scenarioState!.scenario.productId!;
      await waitUntil(
        async () => {
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          return product !== null && product.availableQuantity > 0;
        },
        { message: `Stock update projection for ${productId}` }
      );
    });

    And(
      "the product {string} should have {int} available stock",
      async (_ctx: unknown, _productId: string, expectedStock: number) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return product?.availableQuantity === expectedStock;
          },
          { message: `Stock to be ${expectedStock}` }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedStock);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject adding stock to non-existent product
  // --------------------------------------------------------------------------
  Scenario("Reject adding stock to non-existent product", ({ When, Then }) => {
    When(
      "I add stock to product {string}:",
      async (_ctx: unknown, productId: string, table: StockDataTableRow[]) => {
        const data = parseStockDataTable(table);
        const uniqueProductId = `${productId}-${Date.now()}`;

        scenarioState!.scenario.productId = uniqueProductId;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.inventory.addStock, {
            productId: uniqueProductId,
            quantity: data.quantity,
            reason: data.reason,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: AddStock is idempotent with same commandId
  // --------------------------------------------------------------------------
  Scenario("AddStock is idempotent with same commandId", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} stock",
      async (_ctx: unknown, productId: string, stock: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        const uniqueSku = generateSku();

        scenarioState!.scenario.productId = uniqueProductId;
        scenarioState!.scenario.sku = uniqueSku;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: uniqueSku,
          availableQuantity: stock,
        });
      }
    );

    When(
      "I add stock with commandId {string} to product {string}:",
      async (_ctx: unknown, commandId: string, _productId: string, table: StockDataTableRow[]) => {
        const data = parseStockDataTable(table);
        const productId = scenarioState!.scenario.productId!;

        scenarioState!.scenario.commandId = commandId;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.inventory.addStock, {
            productId,
            quantity: data.quantity,
            reason: data.reason,
            commandId,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And(
      "I add stock with commandId {string} to product {string}:",
      async (_ctx: unknown, commandId: string, _productId: string, table: StockDataTableRow[]) => {
        const data = parseStockDataTable(table);
        const productId = scenarioState!.scenario.productId!;

        try {
          scenarioState!.secondResult = await testMutation(
            scenarioState!.t,
            api.inventory.addStock,
            {
              productId,
              quantity: data.quantity,
              reason: data.reason,
              commandId,
            }
          );
        } catch (error) {
          scenarioState!.secondResult = { error: error as Error };
        }
      }
    );

    Then("the second command should return duplicate status", () => {
      expect(scenarioState!.secondResult).toBeDefined();
      const result = scenarioState!.secondResult as { status: string };
      expect(result.status).toBe("duplicate");
    });
  });
});

// =============================================================================
// QUERY INVENTORY FEATURE
// =============================================================================

const queryInventoryFeature = await loadFeature(
  "tests/integration-features/inventory/query-inventory.feature"
);

describeFeature(queryInventoryFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: List products returns all products
  // --------------------------------------------------------------------------
  Scenario("List products returns all products", ({ Given, When, Then, And }) => {
    Given("the following products exist:", async (_ctx: unknown, table: ProductSetupTableRow[]) => {
      scenarioState!.scenario.products = [];

      for (const row of table) {
        const uniqueProductId = `${row.productId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const uniqueSku = `${row.sku}-${Date.now()}`;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: row.productName,
          sku: uniqueSku,
          availableQuantity: parseInt(row.availableQuantity, 10),
        });

        scenarioState!.scenario.products!.push({
          productId: uniqueProductId,
          productName: row.productName,
        });
      }
    });

    When("I list all products", async () => {
      try {
        scenarioState!.lastResult = await testQuery(
          scenarioState!.t,
          api.inventory.listProducts,
          {}
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then("the result should contain at least {int} products", (_ctx: unknown, minCount: number) => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const products = scenarioState!.lastResult as Array<unknown>;
      expect(products.length).toBeGreaterThanOrEqual(minCount);
    });

    And(
      "the result should include product {string} with name {string}",
      (_ctx: unknown, _productId: string, expectedName: string) => {
        const products = scenarioState!.lastResult as Array<{
          productId: string;
          productName: string;
        }>;
        const found = products.find((p) => p.productName === expectedName);
        expect(found).toBeDefined();
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Get stock availability for product
  // --------------------------------------------------------------------------
  Scenario("Get stock availability for product", ({ Given, When, Then }) => {
    Given(
      "a product {string} exists with:",
      async (_ctx: unknown, productId: string, table: AvailabilitySetupTableRow[]) => {
        const row = table[0];
        const uniqueProductId = `${productId}-${Date.now()}`;
        const uniqueSku = generateSku();

        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: uniqueSku,
          availableQuantity: parseInt(row.availableQuantity, 10),
          reservedQuantity: parseInt(row.reservedQuantity, 10),
        });
      }
    );

    When(
      "I get stock availability for product {string}",
      async (_ctx: unknown, _productId: string) => {
        const productId = scenarioState!.scenario.productId!;

        try {
          scenarioState!.lastResult = await testQuery(
            scenarioState!.t,
            api.inventory.getStockAvailability,
            { productId }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the availability should show {int} available and {int} reserved",
      (_ctx: unknown, expectedAvailable: number, expectedReserved: number) => {
        if (scenarioState!.lastError) {
          throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
        }
        const availability = scenarioState!.lastResult as {
          availableQuantity: number;
          reservedQuantity: number;
        };
        expect(availability.availableQuantity).toBe(expectedAvailable);
        expect(availability.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Check availability for multiple items
  // --------------------------------------------------------------------------
  Scenario("Check availability for multiple items", ({ Given, When, Then }) => {
    Given("the following products exist:", async (_ctx: unknown, table: ProductSetupTableRow[]) => {
      scenarioState!.scenario.products = [];

      for (const row of table) {
        const uniqueProductId = `${row.productId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const uniqueSku = `${row.sku}-${Date.now()}`;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: row.productName,
          sku: uniqueSku,
          availableQuantity: parseInt(row.availableQuantity, 10),
        });

        scenarioState!.scenario.products!.push({
          productId: uniqueProductId,
          productName: row.productName,
        });
      }
    });

    When(
      "I check availability for items:",
      async (_ctx: unknown, table: CheckAvailabilityTableRow[]) => {
        // Map feature productIds to actual unique productIds
        const items = table.map((row) => {
          const product = scenarioState!.scenario.products!.find((p) =>
            p.productId.startsWith(row.productId)
          );
          return {
            productId: product?.productId || row.productId,
            quantity: parseInt(row.quantity, 10),
          };
        });

        try {
          scenarioState!.lastResult = await testQuery(
            scenarioState!.t,
            api.inventory.checkAvailability,
            {
              items,
            }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("all items should be available", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const result = scenarioState!.lastResult as { allAvailable: boolean };
      expect(result.allAvailable).toBe(true);
    });

    Then("not all items should be available", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const result = scenarioState!.lastResult as { allAvailable: boolean };
      expect(result.allAvailable).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Get reservation by order ID
  // --------------------------------------------------------------------------
  Scenario("Get reservation by order ID", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} stock",
      async (_ctx: unknown, productId: string, stock: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        const uniqueSku = generateSku();

        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: uniqueSku,
          availableQuantity: stock,
          reservedQuantity: 0,
        });
      }
    );

    And(
      "a pending reservation exists for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const uniqueReservationId = generateReservationId();

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.reservationId = uniqueReservationId;

        // Map items to actual product IDs
        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
        });
      }
    );

    When("I get reservation by order ID {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testQuery(
          scenarioState!.t,
          api.inventory.getReservationByOrderId,
          { orderId }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then("the reservation should exist for order {string}", (_ctx: unknown, _orderId: string) => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const reservation = scenarioState!.lastResult as { orderId: string } | null;
      expect(reservation).toBeDefined();
      expect(reservation?.orderId).toBe(scenarioState!.scenario.orderId);
    });

    And("the reservation status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      const reservation = scenarioState!.lastResult as { status: string };
      expect(reservation.status).toBe(expectedStatus);
    });
  });
});

// =============================================================================
// RESERVE STOCK FEATURE
// =============================================================================

const reserveStockFeature = await loadFeature(
  "tests/integration-features/inventory/reserve-stock.feature"
);

describeFeature(reserveStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  let productIds: string[] = [];

  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
    productIds = [];
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      productIds = [];
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Reserve stock successfully
  // --------------------------------------------------------------------------
  Scenario("Reserve stock successfully", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row, index) => ({
          productId: productIds[index] || scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;

          const result = scenarioState!.lastResult as { data?: { reservationId?: string } };
          if (result.data?.reservationId) {
            scenarioState!.scenario.reservationId = result.data.reservationId;
          }
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      const productId = scenarioState!.scenario.productId!;
      await waitUntil(
        async () => {
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          return product !== null;
        },
        { message: "Inventory projection to process" }
      );
    });

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = productIds[0] || scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          {
            message: `Product stock to be ${expectedAvailable} available / ${expectedReserved} reserved`,
          }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );

    And(
      "the reservation should have status {string}",
      async (_ctx: unknown, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId,
            });
            return reservation?.status === expectedStatus;
          },
          { message: `Reservation to have status "${expectedStatus}"` }
        );

        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reserve stock for multiple items
  // --------------------------------------------------------------------------
  Scenario("Reserve stock for multiple items", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row, index) => ({
          productId: productIds[index],
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;

          const result = scenarioState!.lastResult as { data?: { reservationId?: string } };
          if (result.data?.reservationId) {
            scenarioState!.scenario.reservationId = result.data.reservationId;
          }
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      for (const productId of productIds) {
        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return product !== null;
          },
          { message: `Inventory projection for ${productId}` }
        );
      }
    });

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        // Match by partial ID from placeholder
        const index = productIdPlaceholder.includes("-02") ? 0 : 1;
        const productId = productIds[index];

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          { message: `Product ${productId} stock update` }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject when insufficient stock
  // --------------------------------------------------------------------------
  Scenario("Reject when insufficient stock", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Limited Stock Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should return failed status with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (scenarioState!.lastError) {
          throw new Error(`Command threw an error: ${scenarioState!.lastError.message}`);
        }
        const result = scenarioState!.lastResult as { status?: string; reason?: string };
        expect(result.status).toBe("failed");
        expect(result.reason).toContain(expectedReason);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: All-or-nothing reservation when one item fails
  // --------------------------------------------------------------------------
  Scenario("All-or-nothing reservation when one item fails", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row, index) => ({
          productId: productIds[index],
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should return failed status with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (scenarioState!.lastError) {
          throw new Error(`Command threw an error: ${scenarioState!.lastError.message}`);
        }
        const result = scenarioState!.lastResult as { status?: string; reason?: string };
        expect(result.status).toBe("failed");
        expect(result.reason).toContain(expectedReason);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const index = productIdPlaceholder.includes("-05") ? 0 : 1;
        const productId = productIds[index];

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject for non-existent product
  // --------------------------------------------------------------------------
  Scenario("Reject for non-existent product", ({ When, Then }) => {
    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: row.productId,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should return failed status with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (scenarioState!.lastError) {
          throw new Error(`Command threw an error: ${scenarioState!.lastError.message}`);
        }
        const result = scenarioState!.lastResult as { status?: string; reason?: string };
        expect(result.status).toBe("failed");
        expect(result.reason).toContain(expectedReason);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Return failed status when reservation fails
  // --------------------------------------------------------------------------
  Scenario("Return failed status when reservation fails", ({ Given, When, Then, And }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with:",
      async (_ctx: unknown, orderId: string, table: ReservationItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should return failed status", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command threw an error: ${scenarioState!.lastError.message}`);
      }
      const result = scenarioState!.lastResult as { status?: string };
      expect(result.status).toBe("failed");
    });

    And("the result should have an eventId for the failure event", () => {
      const result = scenarioState!.lastResult as { eventId?: string };
      expect(result.eventId).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Idempotent with same commandId
  // --------------------------------------------------------------------------
  Scenario("Idempotent with same commandId", ({ Given, When, And, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIds.push(uniqueProductId);
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    When(
      "I reserve stock for order {string} with commandId {string}:",
      async (
        _ctx: unknown,
        orderId: string,
        commandId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.commandId = commandId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: uniqueOrderId, items, commandId }
          );
          scenarioState!.lastError = null;

          const result = scenarioState!.lastResult as { data?: { reservationId?: string } };
          if (result.data?.reservationId) {
            scenarioState!.scenario.reservationId = result.data.reservationId;
          }
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And(
      "I reserve stock for order {string} with commandId {string}:",
      async (
        _ctx: unknown,
        _orderId: string,
        commandId: string,
        table: ReservationItemTableRow[]
      ) => {
        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        try {
          scenarioState!.secondResult = await testMutation(
            scenarioState!.t,
            api.inventory.reserveStock,
            { orderId: scenarioState!.scenario.orderId!, items, commandId }
          );
        } catch (error) {
          scenarioState!.secondResult = { error: error as Error };
        }
      }
    );

    Then("the second command should return duplicate status", () => {
      expect(scenarioState!.secondResult).toBeDefined();
      const result = scenarioState!.secondResult as { status: string };
      expect(result.status).toBe("duplicate");
    });

    And("I wait for projections to process", async () => {
      const productId = scenarioState!.scenario.productId!;
      await waitUntil(
        async () => {
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          return product !== null;
        },
        { message: "Inventory projection to process" }
      );
    });

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          {
            message: `Product stock to be ${expectedAvailable} available / ${expectedReserved} reserved`,
          }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });
});

// =============================================================================
// CONFIRM RESERVATION FEATURE
// =============================================================================

const confirmReservationFeature = await loadFeature(
  "tests/integration-features/inventory/confirm-reservation.feature"
);

describeFeature(confirmReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Confirm pending reservation
  // --------------------------------------------------------------------------
  Scenario("Confirm pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When(
      "I confirm the reservation {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.confirmReservation,
            { reservationId }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    And(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId,
            });
            return reservation?.status === expectedStatus;
          },
          { message: `Reservation to have status "${expectedStatus}"` }
        );

        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject confirming already confirmed reservation
  // --------------------------------------------------------------------------
  Scenario("Reject confirming already confirmed reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
          reservedQuantity: 5,
        });
      }
    );

    And(
      "a confirmed reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "confirmed",
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When(
      "I confirm the reservation {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.confirmReservation,
            { reservationId }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject confirming non-existent reservation
  // --------------------------------------------------------------------------
  Scenario("Reject confirming non-existent reservation", ({ When, Then }) => {
    When("I confirm the reservation {string}", async (_ctx: unknown, reservationId: string) => {
      const uniqueReservationId = `${reservationId}-${Date.now()}`;

      try {
        scenarioState!.lastResult = await testMutation(
          scenarioState!.t,
          api.inventory.confirmReservation,
          { reservationId: uniqueReservationId }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });
});

// =============================================================================
// RELEASE RESERVATION FEATURE
// =============================================================================

const releaseReservationFeature = await loadFeature(
  "tests/integration-features/inventory/release-reservation.feature"
);

describeFeature(releaseReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Release pending reservation
  // --------------------------------------------------------------------------
  Scenario("Release pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When(
      "I release the reservation {string} with reason {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, reason: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.releaseReservation,
            { reservationId, reason }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    And("I wait for projections to process", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    And(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId,
            });
            return reservation?.status === expectedStatus;
          },
          { message: `Reservation to have status "${expectedStatus}"` }
        );

        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          {
            message: `Product stock to be ${expectedAvailable} available / ${expectedReserved} reserved`,
          }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject releasing non-pending reservation
  // --------------------------------------------------------------------------
  Scenario("Reject releasing non-pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
          reservedQuantity: 5,
        });
      }
    );

    And(
      "a confirmed reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "confirmed",
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When(
      "I release the reservation {string} with reason {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, reason: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.inventory.releaseReservation,
            { reservationId, reason }
          );
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });
});

// =============================================================================
// RESERVATION EXPIRATION FEATURE
// =============================================================================

const reservationExpirationFeature = await loadFeature(
  "tests/integration-features/inventory/reservation-expiration.feature"
);

describeFeature(reservationExpirationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  let expirationResult: { processed: number } | null = null;
  let reservationIds: string[] = [];

  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
    expirationResult = null;
    reservationIds = [];
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expirationResult = null;
      reservationIds = [];
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Expire pending reservations past TTL
  // --------------------------------------------------------------------------
  Scenario("Expire pending reservations past TTL", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "an expired pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;
        reservationIds.push(uniqueReservationId);

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
          expiresAt: Date.now() - 1000, // Expired
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When("I trigger the reservation expiration process", async () => {
      expirationResult = await testMutation(
        scenarioState!.t,
        api.testing.expireExpiredReservations,
        {}
      );
    });

    Then(
      "the expiration process should have processed at least {int} reservation",
      (_ctx: unknown, minProcessed: number) => {
        expect(expirationResult).toBeDefined();
        expect(expirationResult!.processed).toBeGreaterThanOrEqual(minProcessed);
      }
    );

    And("I wait for projections to process", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    And(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;

        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId,
            });
            return reservation?.status === expectedStatus;
          },
          { message: `Reservation to have status "${expectedStatus}"`, timeoutMs: 10000 }
        );

        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          {
            message: `Product stock to be ${expectedAvailable} available / ${expectedReserved} reserved`,
            timeoutMs: 10000,
          }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Skip confirmed reservations
  // --------------------------------------------------------------------------
  Scenario("Skip confirmed reservations", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "an expired confirmed reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "confirmed",
          expiresAt: Date.now() - 1000, // Expired but confirmed
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When("I trigger the reservation expiration process", async () => {
      expirationResult = await testMutation(
        scenarioState!.t,
        api.testing.expireExpiredReservations,
        {}
      );
    });

    And("I wait for {int} milliseconds", async (_ctx: unknown, ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

    Then(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;
        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Skip reservations not yet expired
  // --------------------------------------------------------------------------
  Scenario("Skip reservations not yet expired", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a future pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        scenarioState!.scenario.reservationId = uniqueReservationId;
        scenarioState!.scenario.orderId = uniqueOrderId;

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
          expiresAt: Date.now() + 3600000, // Expires in 1 hour
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When("I trigger the reservation expiration process", async () => {
      expirationResult = await testMutation(
        scenarioState!.t,
        api.testing.expireExpiredReservations,
        {}
      );
    });

    And("I wait for {int} milliseconds", async (_ctx: unknown, ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

    Then(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, _reservationIdPlaceholder: string, expectedStatus: string) => {
        const reservationId = scenarioState!.scenario.reservationId!;
        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Batch expiration of multiple reservations
  // --------------------------------------------------------------------------
  Scenario("Batch expiration of multiple reservations", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;
        reservationIds = [];

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "an expired pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: ReservationItemTableRow[]
      ) => {
        const uniqueReservationId = `${reservationId}-${Date.now()}`;
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        reservationIds.push(uniqueReservationId);

        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          quantity: parseInt(row.quantity, 10),
        }));

        await testMutation(scenarioState!.t, api.testing.createTestReservation, {
          reservationId: uniqueReservationId,
          orderId: uniqueOrderId,
          items,
          status: "pending",
          expiresAt: Date.now() - 1000,
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId: uniqueReservationId,
            });
            return reservation !== null;
          },
          { message: "Reservation projection" }
        );
      }
    );

    When("I trigger the reservation expiration process", async () => {
      expirationResult = await testMutation(
        scenarioState!.t,
        api.testing.expireExpiredReservations,
        {}
      );
    });

    Then(
      "the expiration process should have processed {int} reservations",
      (_ctx: unknown, expectedProcessed: number) => {
        expect(expirationResult).toBeDefined();
        expect(expirationResult!.processed).toBe(expectedProcessed);
      }
    );

    And("I wait for projections to process", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    And(
      "the reservation {string} should have status {string}",
      async (_ctx: unknown, reservationIdPlaceholder: string, expectedStatus: string) => {
        // Find the actual reservation ID based on the placeholder suffix
        const suffix = reservationIdPlaceholder.slice(-1); // Get last character (a, b, c)
        const index = suffix.charCodeAt(0) - "a".charCodeAt(0);
        const reservationId = reservationIds[index];

        await waitUntil(
          async () => {
            const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
              reservationId,
            });
            return reservation?.status === expectedStatus;
          },
          {
            message: `Reservation ${reservationId} to have status "${expectedStatus}"`,
            timeoutMs: 10000,
          }
        );

        const reservation = await testQuery(scenarioState!.t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (
        _ctx: unknown,
        _productIdPlaceholder: string,
        expectedAvailable: number,
        expectedReserved: number
      ) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
              productId,
            });
            return (
              product?.availableQuantity === expectedAvailable &&
              product?.reservedQuantity === expectedReserved
            );
          },
          {
            message: `Product stock to be ${expectedAvailable} available / ${expectedReserved} reserved`,
            timeoutMs: 10000,
          }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });
});
