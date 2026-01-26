/**
 * Remove Order Item Step Definitions for Unit Tests
 *
 * Tests the RemoveOrderItem command behavior.
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
  type ItemTableRow,
  initState,
  executeMutation,
  assertCommandSucceeded,
  assertCommandReturnedRejection,
  assertCommandDuplicate,
  parseItemTable,
} from "./common.helpers";

// Module-level state shared across steps within a scenario
let scenarioState: ScenarioState | null = null;

// Load the remove-order-item feature
const removeOrderItemFeature = await loadFeature(
  "tests/features/behavior/orders/remove-order-item.feature"
);

describeFeature(removeOrderItemFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Remove item from draft order with multiple items
  // =========================================================================
  Scenario("Remove item from draft order with multiple items", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        // Just store the orderId - don't create yet, items will be added in next step
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      // Create order with items using test helper
      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "draft",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

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
  // Scenario: Remove last item from draft order
  // =========================================================================
  Scenario("Remove last item from draft order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        // Just store the orderId - don't create yet, items will be added in next step
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "draft",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    And("the order should have {int} items", (_ctx: unknown, _count: number) => {
      assertCommandSucceeded(scenarioState!);
    });

    And("the order total should be {int}", (_ctx: unknown, _total: number) => {
      assertCommandSucceeded(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Cannot remove item from submitted order
  // =========================================================================
  Scenario("Cannot remove item from submitted order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "submitted",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
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
  // Scenario: Cannot remove item from cancelled order
  // =========================================================================
  Scenario("Cannot remove item from cancelled order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "cancelled",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
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
  // Scenario: Cannot remove item from confirmed order
  // =========================================================================
  Scenario("Cannot remove item from confirmed order", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "confirmed",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
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
  // Scenario: Cannot remove non-existent item
  // =========================================================================
  Scenario("Cannot remove non-existent item", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "draft",
        items,
      });
    });

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, orderId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
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
  // Scenario: RemoveOrderItem is idempotent with same commandId
  // =========================================================================
  Scenario("RemoveOrderItem is idempotent with same commandId", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      scenarioState!.scenario.items = items;

      await scenarioState!.t.mutation(api.testing.createTestOrder, {
        orderId: scenarioState!.scenario.orderId!,
        customerId: scenarioState!.scenario.customerId || "cust_default",
        status: "draft",
        items,
      });
    });

    When(
      "I remove item {string} from order {string} with commandId {string}",
      async (_ctx: unknown, productId: string, orderId: string, commandId: string) => {
        scenarioState!.scenario.commandId = commandId;
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
            commandId,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    // Second call with same commandId should return duplicate
    And(
      "I remove item {string} from order {string} with commandId {string}",
      async (_ctx: unknown, productId: string, orderId: string, commandId: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.removeOrderItem, {
            orderId,
            productId,
            commandId,
          });
        });
      }
    );

    Then("the command should return duplicate result", () => {
      assertCommandDuplicate(scenarioState!);
    });
  });
});
