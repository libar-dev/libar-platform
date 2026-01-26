/**
 * Inventory Step Definitions for Unit Tests
 *
 * Uses convex-test for mock backend testing.
 * Tests CreateProduct and AddStock command behavior.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { generateSku } from "../fixtures/inventory";
import { generateCommandId } from "../fixtures/orders";
import {
  initInventoryState,
  tableRowsToObject,
  type InventoryScenarioState,
  type DataTableRow,
} from "./common.helpers";

// Module-level state shared across steps within a scenario
let state: InventoryScenarioState | null = null;

// ============================================
// CREATE PRODUCT FEATURE
// ============================================

const createProductFeature = await loadFeature(
  "tests/features/behavior/inventory/create-product.feature"
);

describeFeature(createProductFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      state = initInventoryState();
      expect(state.t).toBeDefined();
    });
  });

  Scenario("Successfully create a new product", ({ Given, When, Then }) => {
    Given("no product exists with ID {string}", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      // In a fresh test, no products exist - nothing to verify
    });

    When("I send a CreateProduct command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.productId = data.productId;
      state!.scenario.productName = data.productName;
      state!.scenario.sku = data.sku;

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.createProduct, {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then("the command should succeed", () => {
      if (state!.lastError) {
        throw new Error(`Command failed with error: ${state!.lastError.message}`);
      }
      expect(state!.lastResult).toBeDefined();
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });
  });

  Scenario("Cannot create product with existing ID", ({ Given, When, Then }) => {
    Given("a product {string} already exists", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      state!.scenario.sku = generateSku();

      await state!.t.mutation(api.inventory.createProduct, {
        productId,
        productName: "Existing Product",
        sku: state!.scenario.sku,
        unitPrice: 9.99,
      });
    });

    When("I send a CreateProduct command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.createProduct, {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (state!.lastResult) {
          const result = state!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(state!.lastError).toBeDefined();
          expect(state!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  Scenario("CreateProduct is idempotent with same commandId", ({ Given, When, Then }) => {
    Given("no product exists with ID {string}", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      state!.scenario.sku = generateSku();
    });

    When(
      "I send a CreateProduct command twice with the same commandId for product {string}",
      async (_ctx: unknown, productId: string) => {
        const commandId = generateCommandId();

        // First call
        const result1 = await state!.t.mutation(api.inventory.createProduct, {
          productId,
          productName: "Test Product",
          sku: state!.scenario.sku!,
          unitPrice: 19.99,
          commandId,
        });

        // Second call with same commandId
        const result2 = await state!.t.mutation(api.inventory.createProduct, {
          productId,
          productName: "Test Product",
          sku: state!.scenario.sku!,
          unitPrice: 19.99,
          commandId,
        });

        state!.lastResult = { first: result1, second: result2 };
      }
    );

    Then("the second command should return duplicate status", () => {
      const results = state!.lastResult as { first: unknown; second: { status: string } };
      expect(results.second.status).toBe("duplicate");
    });
  });
});

// ============================================
// ADD STOCK FEATURE
// ============================================

const addStockFeature = await loadFeature("tests/features/behavior/inventory/add-stock.feature");

describeFeature(addStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      state = initInventoryState();
      expect(state.t).toBeDefined();
    });
  });

  Scenario("Successfully add stock to existing product", ({ Given, When, Then }) => {
    Given("a product {string} exists", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      state!.scenario.sku = generateSku();

      // Create product via regular command (with event store)
      await state!.t.mutation(api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku: state!.scenario.sku,
        unitPrice: 9.99,
      });
    });

    When("I send an AddStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.addStock, {
          productId: data.productId,
          quantity: parseInt(data.quantity, 10),
          reason: data.reason,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then("the command should succeed", () => {
      if (state!.lastError) {
        throw new Error(`Command failed with error: ${state!.lastError.message}`);
      }
      expect(state!.lastResult).toBeDefined();
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });
  });

  Scenario("Add stock to product with existing stock", ({ Given, When, Then }) => {
    Given("a product {string} exists with stock", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      state!.scenario.sku = generateSku();

      // Create product via regular command (with event store)
      await state!.t.mutation(api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku: state!.scenario.sku,
        unitPrice: 9.99,
      });

      // Add initial stock
      await state!.t.mutation(api.inventory.addStock, {
        productId,
        quantity: 30,
        reason: "Initial stock for test",
      });
    });

    When("I send an AddStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.addStock, {
          productId: data.productId,
          quantity: parseInt(data.quantity, 10),
          reason: data.reason,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then("the command should succeed", () => {
      if (state!.lastError) {
        throw new Error(`Command failed with error: ${state!.lastError.message}`);
      }
      expect(state!.lastResult).toBeDefined();
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });
  });

  Scenario("Cannot add stock to non-existent product", ({ Given, When, Then }) => {
    Given("no product exists with ID {string}", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      // Nothing to do - product doesn't exist
    });

    When("I send an AddStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.addStock, {
          productId: data.productId,
          quantity: parseInt(data.quantity, 10),
          reason: data.reason,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        if (state!.lastResult) {
          const result = state!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(state!.lastError).toBeDefined();
          expect(state!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  Scenario("AddStock is idempotent with same commandId", ({ Given, When, Then }) => {
    Given("a product {string} exists with stock", async (_ctx: unknown, productId: string) => {
      state!.scenario.productId = productId;
      state!.scenario.sku = generateSku();

      // Create product via regular command (with event store)
      await state!.t.mutation(api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku: state!.scenario.sku,
        unitPrice: 9.99,
      });

      // Add initial stock
      await state!.t.mutation(api.inventory.addStock, {
        productId,
        quantity: 10,
        reason: "Initial stock for test",
      });
    });

    When(
      "I send an AddStock command twice with the same commandId for product {string}",
      async (_ctx: unknown, productId: string) => {
        const commandId = generateCommandId();

        // First call
        const result1 = await state!.t.mutation(api.inventory.addStock, {
          productId,
          quantity: 10,
          reason: "Test stock",
          commandId,
        });

        // Second call with same commandId
        const result2 = await state!.t.mutation(api.inventory.addStock, {
          productId,
          quantity: 10,
          reason: "Test stock",
          commandId,
        });

        state!.lastResult = { first: result1, second: result2 };
      }
    );

    Then("the second command should return duplicate status", () => {
      const results = state!.lastResult as { first: unknown; second: { status: string } };
      expect(results.second.status).toBe("duplicate");
    });
  });
});
