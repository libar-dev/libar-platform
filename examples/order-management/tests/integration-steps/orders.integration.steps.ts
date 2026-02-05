/**
 * Orders Integration Step Definitions
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
import { generateCustomerId } from "../fixtures/orders";
import { waitUntil, waitForSagaCompletion } from "../support/localBackendHelpers";
import { testMutation, testQuery } from "../support/integrationHelpers";

// Type for vitest-cucumber DataTable rows (orderId/customerId columns)
type OrderDataTableRow = { orderId: string; customerId: string };

// Type for item DataTable rows
type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

// Type for multi-order table rows
type MultiOrderTableRow = { orderId: string; status: string };

// Type for orders with status table rows
type OrderStatusTableRow = { orderId: string; customerId: string; status: string };

/**
 * Convert vitest-cucumber DataTable rows to order data object.
 * Handles column-based table format: | orderId | customerId |
 */
function parseOrderDataTable(rows: OrderDataTableRow[]): { orderId: string; customerId: string } {
  // For column-based tables, the first row is the data
  const row = rows[0];
  return {
    orderId: row.orderId,
    customerId: row.customerId,
  };
}

/**
 * Parse item table rows into order items.
 */
function parseItemTable(
  table: ItemTableRow[]
): Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> {
  return table.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    quantity: parseInt(row.quantity, 10),
    unitPrice: parseFloat(row.unitPrice),
  }));
}

// State interface for each scenario
interface IntegrationScenarioState {
  t: ConvexTestingHelper;
  lastResult: unknown;
  lastError: Error | null;
  secondResult: unknown; // For idempotency testing
  queryResult: unknown; // For query assertions
  sagaResult: unknown; // For saga completion results
  scenario: {
    orderId?: string;
    customerId?: string;
    commandId?: string;
    productId?: string;
    sagaType?: string;
    sagaId?: string;
    items?: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }>;
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
    queryResult: null,
    sagaResult: null,
    scenario: {},
  };
}

// Load the integration feature file
const createOrderFeature = await loadFeature(
  "tests/integration-features/orders/create-order.feature"
);

describeFeature(createOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  // Cleanup after each scenario - close connection (no clearAll needed with namespace isolation)
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // Initialize fresh state for each scenario
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Successfully create a new order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Successfully create a new order and verify projection", ({ When, Then, And }) => {
    When("I create an order with:", async (_ctx: unknown, table: OrderDataTableRow[]) => {
      const data = parseOrderDataTable(table);

      // Generate unique IDs to avoid collision across test runs
      const orderId = `${data.orderId}-${Date.now()}`;
      const customerId = `${data.customerId}-${Date.now()}`;

      scenarioState!.scenario.orderId = orderId;
      scenarioState!.scenario.customerId = customerId;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.createOrder, {
          orderId,
          customerId,
        });
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: `Order ${orderId} projection to process` }
      );
    });

    And(
      "the order {string} should exist with status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        // Use the actual orderId from scenario (includes timestamp suffix)
        const orderId = scenarioState!.scenario.orderId!;

        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
        expect(order?.customerId).toBe(scenarioState!.scenario.customerId);
      }
    );

    And(
      "the order {string} should have {int} items",
      async (_ctx: unknown, _orderId: string, expectedItems: number) => {
        // Use the actual orderId from scenario (includes timestamp suffix)
        const orderId = scenarioState!.scenario.orderId!;

        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.itemCount).toBe(expectedItems);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject duplicate order ID
  // --------------------------------------------------------------------------
  Scenario("Reject duplicate order ID", ({ Given, When, Then }) => {
    Given("an order {string} exists", async (_ctx: unknown, orderId: string) => {
      // Generate unique ID to avoid collision
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      // Create the order first
      await testMutation(scenarioState!.t, api.orders.createOrder, {
        orderId: uniqueOrderId,
        customerId,
      });
    });

    When("I create an order with:", async (_ctx: unknown, table: OrderDataTableRow[]) => {
      const data = parseOrderDataTable(table);

      // Use the same orderId from Given step (the one that already exists)
      const orderId = scenarioState!.scenario.orderId!;
      const customerId = data.customerId || generateCustomerId();

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.createOrder, {
          orderId,
          customerId,
        });
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        // Command was either rejected (status: rejected) or threw an error
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
  // Scenario: CreateOrder is idempotent with same commandId
  // --------------------------------------------------------------------------
  Scenario("CreateOrder is idempotent with same commandId", ({ When, Then, And }) => {
    When(
      "I create an order with commandId {string}:",
      async (_ctx: unknown, commandId: string, table: OrderDataTableRow[]) => {
        const data = parseOrderDataTable(table);

        // Generate unique orderId to avoid collision across runs
        const uniqueOrderId = `${data.orderId}-${Date.now()}`;
        const customerId = data.customerId;

        // Store for subsequent steps
        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.commandId = commandId;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.createOrder, {
            orderId: uniqueOrderId,
            customerId,
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
      "I create an order with commandId {string}:",
      async (_ctx: unknown, commandId: string, table: OrderDataTableRow[]) => {
        const data = parseOrderDataTable(table);

        // Use the SAME orderId from previous step
        const orderId = scenarioState!.scenario.orderId!;
        const customerId = data.customerId;

        try {
          // Second call with same commandId
          scenarioState!.secondResult = await testMutation(
            scenarioState!.t,
            api.orders.createOrder,
            {
              orderId,
              customerId,
              commandId,
            }
          );
        } catch (error) {
          // Store as second result error
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
// ADD ORDER ITEM FEATURE
// =============================================================================

const addOrderItemFeature = await loadFeature(
  "tests/integration-features/orders/add-order-item.feature"
);

describeFeature(addOrderItemFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Add item to draft order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Add item to draft order and verify projection", ({ Given, When, Then, And }) => {
    Given("an order {string} exists in draft status", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.orders.createOrder, {
        orderId: uniqueOrderId,
        customerId,
      });

      // Wait for order to be created
      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
            orderId: uniqueOrderId,
          });
          return order !== null;
        },
        { message: "Order creation" }
      );
    });

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, _orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.orders.addOrderItem,
            {
              orderId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            }
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: `Order ${orderId} item count projection to update` }
      );
    });

    And(
      "the order {string} should have {int} items",
      async (_ctx: unknown, _orderId: string, expectedItems: number) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.itemCount).toBe(expectedItems);
      }
    );

    And(
      "the order {string} total should be {int}",
      async (_ctx: unknown, _orderId: string, expectedTotal: number) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.totalAmount).toBe(expectedTotal);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject adding item to submitted order
  // --------------------------------------------------------------------------
  Scenario("Reject adding item to submitted order", ({ Given, When, Then }) => {
    Given(
      "a submitted order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "submitted",
          items,
        });
      }
    );

    When(
      "I add an item to order {string}:",
      async (_ctx: unknown, _orderId: string, table: ItemTableRow[]) => {
        const items = parseItemTable(table);
        const item = items[0];
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.orders.addOrderItem,
            {
              orderId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            }
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
// SUBMIT ORDER FEATURE
// =============================================================================

const submitOrderFeature = await loadFeature(
  "tests/integration-features/orders/submit-order.feature"
);

describeFeature(submitOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Submit order with items and verify projection
  // --------------------------------------------------------------------------
  Scenario("Submit order with items and verify projection", ({ Given, When, Then, And }) => {
    Given(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });
      }
    );

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should exist with status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );

    And(
      "the order {string} total should be {int}",
      async (_ctx: unknown, _orderId: string, expectedTotal: number) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.totalAmount).toBe(expectedTotal);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject submitting empty order
  // --------------------------------------------------------------------------
  Scenario("Reject submitting empty order", ({ Given, When, Then }) => {
    Given("an empty draft order {string} exists", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.testing.createTestOrder, {
        orderId: uniqueOrderId,
        customerId,
        status: "draft",
        items: [],
      });
    });

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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
  // Scenario: Reject submitting already submitted order
  // --------------------------------------------------------------------------
  Scenario("Reject submitting already submitted order", ({ Given, When, Then }) => {
    Given(
      "a submitted order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "submitted",
          items,
        });
      }
    );

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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
// CANCEL ORDER FEATURE
// =============================================================================

const cancelOrderFeature = await loadFeature(
  "tests/integration-features/orders/cancel-order.feature"
);

describeFeature(cancelOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Cancel draft order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Cancel draft order and verify projection", ({ Given, When, Then, And }) => {
    Given("a draft order {string} exists", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.testing.createTestOrder, {
        orderId: uniqueOrderId,
        customerId,
        status: "draft",
      });
    });

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should exist with status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Cancel submitted order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Cancel submitted order and verify projection", ({ Given, When, Then, And }) => {
    Given(
      "a submitted order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "submitted",
          items,
        });
      }
    );

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should exist with status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reject cancelling already cancelled order
  // --------------------------------------------------------------------------
  Scenario("Reject cancelling already cancelled order", ({ Given, When, Then }) => {
    Given("a cancelled order {string} exists", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.testing.createTestOrder, {
        orderId: uniqueOrderId,
        customerId,
        status: "cancelled",
      });
    });

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
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
  // Scenario: Cancel confirmed order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Cancel confirmed order and verify projection", ({ Given, When, Then, And }) => {
    Given(
      "a confirmed order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "confirmed",
          items,
        });
      }
    );

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should exist with status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Reservation is released when confirmed order is cancelled
  // --------------------------------------------------------------------------
  Scenario("Reservation is released when confirmed order is cancelled", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, available: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.inventory.createProduct, {
          productId: uniqueProductId,
          name: "Test Product",
          initialStock: available,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        // Use the unique productId we created
        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          productName: row.productName,
          quantity: parseInt(row.quantity, 10),
          unitPrice: parseFloat(row.unitPrice),
        }));

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;
        scenarioState!.scenario.sagaType = "OrderFulfillment";
        scenarioState!.scenario.sagaId = uniqueOrderId;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });
      }
    );

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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

    And(
      "I wait for the saga to complete with timeout {int}",
      async (_ctx: unknown, timeoutMs: number) => {
        const sagaType = scenarioState!.scenario.sagaType!;
        const sagaId = scenarioState!.scenario.sagaId!;

        scenarioState!.sagaResult = await waitForSagaCompletion(
          scenarioState!.t,
          sagaType,
          sagaId,
          { timeoutMs }
        );
      }
    );

    And(
      "the order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
            return order?.status === expectedStatus;
          },
          { message: `Order ${orderId} to have status ${expectedStatus}` }
        );

        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (_ctx: unknown, _productIdPlaceholder: string, expectedAvailable: number, expectedReserved: number) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
            return product?.availableStock === expectedAvailable && product?.reservedStock === expectedReserved;
          },
          { message: `Product ${productId} stock to update` }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableStock).toBe(expectedAvailable);
        expect(product?.reservedStock).toBe(expectedReserved);
      }
    );

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And("I wait for projections to process", async () => {
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the reservation for order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const orderInventory = await testQuery(
              scenarioState!.t,
              api.crossContextQueries.getOrderWithInventoryStatus,
              { orderId }
            );
            return orderInventory?.reservationStatus === expectedStatus;
          },
          { message: `Reservation for order ${orderId} to have status ${expectedStatus}` }
        );

        const orderInventory = await testQuery(
          scenarioState!.t,
          api.crossContextQueries.getOrderWithInventoryStatus,
          { orderId }
        );
        expect(orderInventory?.reservationStatus).toBe(expectedStatus);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Cancelling draft order does not trigger reservation release
  // --------------------------------------------------------------------------
  Scenario("Cancelling draft order does not trigger reservation release", ({ Given, When, Then, And }) => {
    Given("a draft order {string} exists", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.testing.createTestOrder, {
        orderId: uniqueOrderId,
        customerId,
        status: "draft",
      });
    });

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );

    And(
      "the order {string} should have no reservation",
      async (_ctx: unknown, _orderId: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        // Draft orders never have reservations, so the projection should show null
        const orderInventory = await testQuery(
          scenarioState!.t,
          api.crossContextQueries.getOrderWithInventoryStatus,
          { orderId }
        );
        // Draft orders may not have a projection record at all, or have null reservationId
        expect(orderInventory?.reservationId ?? null).toBeNull();
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Cancelling submitted order before saga completion releases pending reservation
  // --------------------------------------------------------------------------
  Scenario("Cancelling submitted order before saga completion releases pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, available: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.inventory.createProduct, {
          productId: uniqueProductId,
          name: "Test Product",
          initialStock: available,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        // Use the unique productId we created
        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          productName: row.productName,
          quantity: parseInt(row.quantity, 10),
          unitPrice: parseFloat(row.unitPrice),
        }));

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;
        scenarioState!.scenario.sagaType = "OrderFulfillment";
        scenarioState!.scenario.sagaId = uniqueOrderId;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });
      }
    );

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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

    And(
      "I wait for reservation to be created for order {string}",
      async (_ctx: unknown, _orderId: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const orderInventory = await testQuery(
              scenarioState!.t,
              api.crossContextQueries.getOrderWithInventoryStatus,
              { orderId }
            );
            return orderInventory?.reservationId != null;
          },
          { message: `Reservation to be created for order ${orderId}` }
        );
      }
    );

    And(
      "the product {string} should have reserved stock",
      async (_ctx: unknown, _productIdPlaceholder: string) => {
        const productId = scenarioState!.scenario.productId!;

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.reservedStock).toBeGreaterThan(0);
      }
    );

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And("I wait for projections to process", async () => {
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order).toBeDefined();
        expect(order?.status).toBe(expectedStatus);
      }
    );

    And(
      "the reservation for order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const orderInventory = await testQuery(
              scenarioState!.t,
              api.crossContextQueries.getOrderWithInventoryStatus,
              { orderId }
            );
            return orderInventory?.reservationStatus === expectedStatus;
          },
          { message: `Reservation for order ${orderId} to have status ${expectedStatus}` }
        );

        const orderInventory = await testQuery(
          scenarioState!.t,
          api.crossContextQueries.getOrderWithInventoryStatus,
          { orderId }
        );
        expect(orderInventory?.reservationStatus).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (_ctx: unknown, _productIdPlaceholder: string, expectedAvailable: number, expectedReserved: number) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
            return product?.availableStock === expectedAvailable && product?.reservedStock === expectedReserved;
          },
          { message: `Product ${productId} stock to update` }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableStock).toBe(expectedAvailable);
        expect(product?.reservedStock).toBe(expectedReserved);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: PM handles already released reservation gracefully
  // --------------------------------------------------------------------------
  Scenario("PM handles already released reservation gracefully", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, available: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        scenarioState!.scenario.productId = uniqueProductId;

        await testMutation(scenarioState!.t, api.inventory.createProduct, {
          productId: uniqueProductId,
          name: "Test Product",
          initialStock: available,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        // Use the unique productId we created
        const items = table.map((row) => ({
          productId: scenarioState!.scenario.productId!,
          productName: row.productName,
          quantity: parseInt(row.quantity, 10),
          unitPrice: parseFloat(row.unitPrice),
        }));

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;
        scenarioState!.scenario.sagaType = "OrderFulfillment";
        scenarioState!.scenario.sagaId = uniqueOrderId;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });
      }
    );

    When("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      try {
        scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.submitOrder, {
          orderId,
        });
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

    And(
      "I wait for the saga to complete with timeout {int}",
      async (_ctx: unknown, timeoutMs: number) => {
        const sagaType = scenarioState!.scenario.sagaType!;
        const sagaId = scenarioState!.scenario.sagaId!;

        scenarioState!.sagaResult = await waitForSagaCompletion(
          scenarioState!.t,
          sagaType,
          sagaId,
          { timeoutMs }
        );
      }
    );

    And(
      "the order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
            return order?.status === expectedStatus;
          },
          { message: `Order ${orderId} to have status ${expectedStatus}` }
        );

        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.status).toBe(expectedStatus);
      }
    );

    And(
      "the product {string} should have {int} available and {int} reserved stock",
      async (_ctx: unknown, _productIdPlaceholder: string, expectedAvailable: number, expectedReserved: number) => {
        const productId = scenarioState!.scenario.productId!;

        await waitUntil(
          async () => {
            const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
            return product?.availableStock === expectedAvailable && product?.reservedStock === expectedReserved;
          },
          { message: `Product ${productId} stock to update` }
        );

        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableStock).toBe(expectedAvailable);
        expect(product?.reservedStock).toBe(expectedReserved);
      }
    );

    When(
      "I cancel order {string} with reason {string}",
      async (_ctx: unknown, _orderId: string, reason: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(scenarioState!.t, api.orders.cancelOrder, {
            orderId,
            reason,
          });
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.lastResult = null;
        }
      }
    );

    And("I wait for projections to process", async () => {
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: `Order ${orderId} status projection to update` }
      );
    });

    And(
      "the reservation for order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const orderInventory = await testQuery(
              scenarioState!.t,
              api.crossContextQueries.getOrderWithInventoryStatus,
              { orderId }
            );
            return orderInventory?.reservationStatus === expectedStatus;
          },
          { message: `Reservation for order ${orderId} to have status ${expectedStatus}` }
        );

        const orderInventory = await testQuery(
          scenarioState!.t,
          api.crossContextQueries.getOrderWithInventoryStatus,
          { orderId }
        );
        expect(orderInventory?.reservationStatus).toBe(expectedStatus);
      }
    );
  });

});

// =============================================================================
// QUERY ORDERS FEATURE
// =============================================================================

const queryOrdersFeature = await loadFeature(
  "tests/integration-features/orders/query-orders.feature"
);

describeFeature(queryOrdersFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Query orders by customer ID
  // --------------------------------------------------------------------------
  Scenario("Query orders by customer ID", ({ Given, And, When, Then }) => {
    Given(
      "customer {string} has multiple orders:",
      async (_ctx: unknown, customerId: string, table: MultiOrderTableRow[]) => {
        const uniqueCustomerId = `${customerId}-${Date.now()}`;
        scenarioState!.scenario.customerId = uniqueCustomerId;

        for (const row of table) {
          const uniqueOrderId = `${row.orderId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await testMutation(scenarioState!.t, api.testing.createTestOrder, {
            orderId: uniqueOrderId,
            customerId: uniqueCustomerId,
            status: row.status as "draft" | "submitted" | "confirmed" | "cancelled",
          });
        }
      }
    );

    And("I wait for projections to process", async () => {
      const customerId = scenarioState!.scenario.customerId!;

      await waitUntil(
        async () => {
          const orders = await testQuery(scenarioState!.t, api.orders.getCustomerOrders, {
            customerId,
          });
          return orders?.length === 2;
        },
        { message: "Customer orders projection" }
      );
    });

    When("I query orders for customer {string}", async (_ctx: unknown, _customerId: string) => {
      const customerId = scenarioState!.scenario.customerId!;

      try {
        scenarioState!.queryResult = await testQuery(
          scenarioState!.t,
          api.orders.getCustomerOrders,
          {
            customerId,
          }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.queryResult = null;
      }
    });

    Then("I should receive {int} orders", (_ctx: unknown, expectedCount: number) => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const orders = scenarioState!.queryResult as unknown[];
      expect(orders).toHaveLength(expectedCount);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Query orders by status
  // --------------------------------------------------------------------------
  Scenario("Query orders by status", ({ Given, And, When, Then }) => {
    Given(
      "orders with different statuses exist:",
      async (_ctx: unknown, table: OrderStatusTableRow[]) => {
        for (const row of table) {
          const uniqueOrderId = `${row.orderId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const uniqueCustomerId = `${row.customerId}-${Date.now()}`;

          const items =
            row.status === "submitted"
              ? [{ productId: "p1", productName: "P1", quantity: 1, unitPrice: 10 }]
              : undefined;

          await testMutation(scenarioState!.t, api.testing.createTestOrder, {
            orderId: uniqueOrderId,
            customerId: uniqueCustomerId,
            status: row.status as "draft" | "submitted" | "confirmed" | "cancelled",
            items,
          });
        }
      }
    );

    And("I wait for projections to process", async () => {
      await waitUntil(
        async () => {
          const orders = await testQuery(scenarioState!.t, api.orders.getAllOrders, {});
          return orders?.length >= 2;
        },
        { message: "All orders projection" }
      );
    });

    When("I query orders with status {string}", async (_ctx: unknown, status: string) => {
      try {
        scenarioState!.queryResult = await testQuery(
          scenarioState!.t,
          api.orders.getOrdersByStatus,
          {
            status: status as "draft" | "submitted" | "confirmed" | "cancelled",
          }
        );
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.queryResult = null;
      }
    });

    Then("I should receive at least {int} order", (_ctx: unknown, minCount: number) => {
      if (scenarioState!.lastError) {
        throw new Error(`Query failed with error: ${scenarioState!.lastError.message}`);
      }
      const orders = scenarioState!.queryResult as unknown[];
      expect(orders?.length).toBeGreaterThanOrEqual(minCount);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Remove item from draft order and verify projection
  // --------------------------------------------------------------------------
  Scenario("Remove item from draft order and verify projection", ({ Given, When, Then, And }) => {
    Given(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.items = items;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });
      }
    );

    When(
      "I remove item {string} from order {string}",
      async (_ctx: unknown, productId: string, _orderId: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        try {
          scenarioState!.lastResult = await testMutation(
            scenarioState!.t,
            api.orders.removeOrderItem,
            {
              orderId,
              productId,
            }
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
      const orderId = scenarioState!.scenario.orderId!;

      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: `Order ${orderId} item count projection to update` }
      );
    });

    And(
      "the order {string} should have {int} items",
      async (_ctx: unknown, _orderId: string, expectedItems: number) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.itemCount).toBe(expectedItems);
      }
    );

    And(
      "the order {string} total should be {int}",
      async (_ctx: unknown, _orderId: string, expectedTotal: number) => {
        const orderId = scenarioState!.scenario.orderId!;
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.totalAmount).toBe(expectedTotal);
      }
    );
  });
});
