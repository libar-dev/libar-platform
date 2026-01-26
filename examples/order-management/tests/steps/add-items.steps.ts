/**
 * Add Items Step Definitions for Unit Tests
 *
 * Tests the AddOrderItem command behavior.
 * Uses convex-test for mock backend testing.
 *
 * NOTE: convex-test cannot verify projections (Workpool doesn't execute).
 * "Then" steps that verify projection results (item count, total) only
 * verify command success. Full projection verification happens in integration tests.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  type ScenarioState,
  type OrderItem,
  type ItemTableRow,
  initState,
  setupOrderWithStatus,
  executeMutation,
  assertCommandSucceeded,
  assertCommandReturnedRejection,
  parseItemTable,
} from "./common.helpers";

// Module-level state shared across steps within a scenario
let scenarioState: ScenarioState | null = null;

// Load the add-items feature
const addItemsFeature = await loadFeature("tests/features/behavior/orders/add-items.feature");

describeFeature(addItemsFeature, ({ Scenario, Background, AfterEachScenario }) => {
  // Clean up after each scenario
  AfterEachScenario(() => {
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // =========================================================================
  // Scenario: Add single item to empty draft order
  // =========================================================================
  Scenario("Add single item to empty draft order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    And("the order has no items", () => {
      scenarioState!.scenario.items = [];
    });

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    // NOTE: This step verifies command success only.
    // Actual item count verification requires integration tests with real projections.
    And("the order should have {int} item", (_ctx: unknown, _count: number) => {
      // In unit tests, we only verify the command succeeded.
      // Projection verification happens in integration tests.
      assertCommandSucceeded(scenarioState!);
    });

    And("the order total should be {int}", (_ctx: unknown, _total: number) => {
      // In unit tests, we only verify the command succeeded.
      // Total calculation verification happens in integration tests.
      assertCommandSucceeded(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Add multiple items to draft order
  // =========================================================================
  Scenario("Add multiple items to draft order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    And("the order has no items", () => {
      scenarioState!.scenario.items = [];
    });

    When(
      "I add items to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);

        // Add each item sequentially
        for (const item of items) {
          await executeMutation(scenarioState!, async () => {
            return await scenarioState!.t.mutation(api.orders.addOrderItem, {
              orderId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            });
          });

          // Stop on first failure
          if (scenarioState!.lastError) {
            break;
          }
        }
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    And("the order should have {int} items", (_ctx: unknown, _count: number) => {
      // Projection verification in integration tests
      assertCommandSucceeded(scenarioState!);
    });

    And("the order total should be {int}", (_ctx: unknown, _total: number) => {
      // Projection verification in integration tests
      assertCommandSucceeded(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Cannot add items to submitted order
  // =========================================================================
  Scenario("Cannot add items to submitted order", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Create order with submitted status and some items
        const items: OrderItem[] = [
          { productId: "prod_existing", productName: "Existing Item", quantity: 1, unitPrice: 10 },
        ];
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled",
          items
        );
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        });
      }
    );

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot add items to cancelled order
  // =========================================================================
  Scenario("Cannot add items to cancelled order", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        });
      }
    );

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot add item with zero quantity
  // =========================================================================
  Scenario("Cannot add item with zero quantity", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity, // Will be 0
            unitPrice: item.unitPrice,
          });
        });
      }
    );

    Then("the command should be rejected", () => {
      assertCommandReturnedRejection(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Cannot add item with negative quantity
  // =========================================================================
  Scenario("Cannot add item with negative quantity", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity, // Will be -1
            unitPrice: item.unitPrice,
          });
        });
      }
    );

    Then("the command should be rejected", () => {
      assertCommandReturnedRejection(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Cannot add item with negative price
  // =========================================================================
  Scenario("Cannot add item with negative price", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        await setupOrderWithStatus(
          scenarioState!,
          orderId,
          status as "draft" | "submitted" | "confirmed" | "cancelled"
        );
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.addOrderItem, {
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice, // Will be negative
          });
        });
      }
    );

    Then("the command should be rejected", () => {
      assertCommandReturnedRejection(scenarioState!);
    });
  });
});
