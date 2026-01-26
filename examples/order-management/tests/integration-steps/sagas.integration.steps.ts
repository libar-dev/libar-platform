/**
 * Sagas Integration Step Definitions
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests saga workflow execution including:
 * - Order fulfillment saga (happy path and compensation)
 * - Saga admin operations (details, steps, cancel, cleanup)
 *
 * These steps require:
 * - Docker backend running (port 3210)
 * - `just start && just deploy-local` executed
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";
import { generateSku } from "../fixtures/inventory";
import { generateCustomerId } from "../fixtures/orders";
import {
  waitUntil,
  waitForSagaCompletion,
  waitForOrderStatus,
} from "../support/localBackendHelpers";
import { testMutation, testQuery } from "../support/integrationHelpers";

// =============================================================================
// Types
// =============================================================================

/** DataTable row for item data */
type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

/** State interface for each scenario */
interface SagaIntegrationScenarioState {
  t: ConvexTestingHelper;
  lastResult: unknown;
  lastError: Error | null;
  sagaResult: { status: string; error?: string } | null;
  sagaDetails: unknown;
  sagaSteps: unknown;
  cancelResult: unknown;
  cleanupResult: unknown;
  scenario: {
    orderId?: string;
    customerId?: string;
    productIds: string[];
    sagaType?: string;
    sagaId?: string;
  };
}

// Module-level state shared across steps within a scenario
let scenarioState: SagaIntegrationScenarioState | null = null;

// Initialize state for a scenario
function initState(): SagaIntegrationScenarioState {
  return {
    t: new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    }),
    lastResult: null,
    lastError: null,
    sagaResult: null,
    sagaDetails: null,
    sagaSteps: null,
    cancelResult: null,
    cleanupResult: null,
    scenario: {
      productIds: [],
    },
  };
}

/**
 * Parse item table rows into order items.
 */
function parseItemTable(
  table: ItemTableRow[],
  productIdMap: Map<string, string>
): Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> {
  return table.map((row) => ({
    productId: productIdMap.get(row.productId) || row.productId,
    productName: row.productName,
    quantity: parseInt(row.quantity, 10),
    unitPrice: parseFloat(row.unitPrice),
  }));
}

// =============================================================================
// ORDER FULFILLMENT SAGA FEATURE
// =============================================================================

const orderFulfillmentFeature = await loadFeature(
  "tests/integration-features/sagas/order-fulfillment.feature"
);

describeFeature(orderFulfillmentFeature, ({ Scenario, Background, AfterEachScenario }) => {
  // Map from feature productId to actual unique productId
  let productIdMap: Map<string, string>;

  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
    productIdMap = new Map();
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      scenarioState = initState();
      productIdMap = new Map();
      expect(scenarioState.t).toBeDefined();
      // No clearAll needed - namespace isolation via testRunId prefix
    });
  });

  // ---------------------------------------------------------------------------
  // Happy Path: Single item order
  // ---------------------------------------------------------------------------
  Scenario(
    "Complete saga when stock is available for single item order",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: "Test Widget",
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a draft order {string} exists with items:",
        async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const uniqueOrderId = `${orderId}-${Date.now()}`;
          const customerId = generateCustomerId();
          const items = parseItemTable(table, productIdMap);

          scenarioState!.scenario.orderId = uniqueOrderId;
          scenarioState!.scenario.customerId = customerId;
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
            {
              timeoutMs,
            }
          );
        }
      );

      And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(scenarioState!.sagaResult).toBeDefined();
        expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
      });

      And(
        "the order {string} should have status {string}",
        async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
          const orderId = scenarioState!.scenario.orderId!;

          await waitForOrderStatus(scenarioState!.t, orderId, expectedStatus, { timeoutMs: 30000 });

          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          expect(order?.status).toBe(expectedStatus);
        }
      );

      And(
        "the reservation for order {string} should have status {string}",
        async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
          const orderId = scenarioState!.scenario.orderId!;

          await waitUntil(
            async () => {
              const res = await testQuery(scenarioState!.t, api.inventory.getReservationByOrderId, {
                orderId,
              });
              return res?.status === expectedStatus;
            },
            {
              message: `Reservation for order ${orderId} to have status "${expectedStatus}"`,
              timeoutMs: 30000,
            }
          );

          const reservation = await testQuery(
            scenarioState!.t,
            api.inventory.getReservationByOrderId,
            {
              orderId,
            }
          );
          expect(reservation).toBeDefined();
          expect(reservation?.status).toBe(expectedStatus);
        }
      );

      And(
        "the product {string} should have less than {int} available stock",
        async (_ctx: unknown, productIdPlaceholder: string, maxStock: number) => {
          const productId = productIdMap.get(productIdPlaceholder) || productIdPlaceholder;
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          expect(product?.availableQuantity).toBeLessThan(maxStock);
        }
      );
    }
  );

  // ---------------------------------------------------------------------------
  // Happy Path: Multi-item order
  // ---------------------------------------------------------------------------
  Scenario(
    "Complete saga when stock is available for multi-item order",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

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
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: `Product ${productId}`,
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a draft order {string} exists with items:",
        async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const uniqueOrderId = `${orderId}-${Date.now()}`;
          const customerId = generateCustomerId();
          const items = parseItemTable(table, productIdMap);

          scenarioState!.scenario.orderId = uniqueOrderId;
          scenarioState!.scenario.customerId = customerId;
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
            {
              timeoutMs,
            }
          );
        }
      );

      And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(scenarioState!.sagaResult).toBeDefined();
        expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
      });

      And(
        "the order {string} should have status {string}",
        async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
          const orderId = scenarioState!.scenario.orderId!;

          await waitForOrderStatus(scenarioState!.t, orderId, expectedStatus, { timeoutMs: 30000 });

          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          expect(order?.status).toBe(expectedStatus);
        }
      );
    }
  );

  // ---------------------------------------------------------------------------
  // Compensation: Insufficient stock single item
  // ---------------------------------------------------------------------------
  Scenario("Cancel order when insufficient stock for single item", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Limited Stock Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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
          {
            timeoutMs,
          }
        );
      }
    );

    And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(scenarioState!.sagaResult).toBeDefined();
      expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
    });

    And(
      "the order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitForOrderStatus(scenarioState!.t, orderId, expectedStatus, { timeoutMs: 30000 });

        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
        expect(order?.status).toBe(expectedStatus);
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
        const productId = productIdMap.get(productIdPlaceholder) || productIdPlaceholder;
        const product = await testQuery(scenarioState!.t, api.inventory.getProduct, { productId });
        expect(product?.availableQuantity).toBe(expectedAvailable);
        expect(product?.reservedQuantity).toBe(expectedReserved);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Compensation: One item fails in multi-item order
  // ---------------------------------------------------------------------------
  Scenario(
    "Cancel order when one item in multi-item order has insufficient stock",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: "Plenty Stock Product",
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: "Limited Stock Product",
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a draft order {string} exists with items:",
        async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const uniqueOrderId = `${orderId}-${Date.now()}`;
          const customerId = generateCustomerId();
          const items = parseItemTable(table, productIdMap);

          scenarioState!.scenario.orderId = uniqueOrderId;
          scenarioState!.scenario.customerId = customerId;
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
            {
              timeoutMs,
            }
          );
        }
      );

      And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(scenarioState!.sagaResult).toBeDefined();
        expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
      });

      And(
        "the order {string} should have status {string}",
        async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
          const orderId = scenarioState!.scenario.orderId!;

          await waitForOrderStatus(scenarioState!.t, orderId, expectedStatus, { timeoutMs: 30000 });

          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
          expect(order?.status).toBe(expectedStatus);
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
          const productId = productIdMap.get(productIdPlaceholder) || productIdPlaceholder;
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          expect(product?.availableQuantity).toBe(expectedAvailable);
          expect(product?.reservedQuantity).toBe(expectedReserved);
        }
      );
    }
  );

  // ---------------------------------------------------------------------------
  // Idempotency: Saga runs only once
  // ---------------------------------------------------------------------------
  Scenario("Saga runs only once per order", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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
          {
            timeoutMs,
          }
        );
      }
    );

    And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(scenarioState!.sagaResult).toBeDefined();
      expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
    });

    And(
      "only one saga should exist for order {string}",
      async (_ctx: unknown, _orderId: string) => {
        const sagaType = scenarioState!.scenario.sagaType!;
        const sagaId = scenarioState!.scenario.sagaId!;

        const saga = await testQuery(scenarioState!.t, api.sagas.getSaga, { sagaType, sagaId });
        expect(saga).toBeDefined();
        expect(saga?.status).toBe("completed");
      }
    );

    And(
      "the reservation for order {string} should have status {string}",
      async (_ctx: unknown, _orderId: string, expectedStatus: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await waitUntil(
          async () => {
            const res = await testQuery(scenarioState!.t, api.inventory.getReservationByOrderId, {
              orderId,
            });
            return res?.status === expectedStatus;
          },
          {
            message: `Reservation for order ${orderId} to have status "${expectedStatus}"`,
            timeoutMs: 30000,
          }
        );

        const reservation = await testQuery(
          scenarioState!.t,
          api.inventory.getReservationByOrderId,
          {
            orderId,
          }
        );
        expect(reservation?.status).toBe(expectedStatus);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Workflow State: Completed status after success
  // ---------------------------------------------------------------------------
  Scenario(
    "Saga status is completed after successful fulfillment",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: "Test Product",
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a draft order {string} exists with items:",
        async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const uniqueOrderId = `${orderId}-${Date.now()}`;
          const customerId = generateCustomerId();
          const items = parseItemTable(table, productIdMap);

          scenarioState!.scenario.orderId = uniqueOrderId;
          scenarioState!.scenario.customerId = customerId;
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
            {
              timeoutMs,
            }
          );
        }
      );

      And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(scenarioState!.sagaResult).toBeDefined();
        expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
      });

      And("the saga should have a workflow ID", async () => {
        const sagaType = scenarioState!.scenario.sagaType!;
        const sagaId = scenarioState!.scenario.sagaId!;

        const saga = await testQuery(scenarioState!.t, api.sagas.getSaga, { sagaType, sagaId });
        expect(saga?.workflowId).toBeDefined();
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Workflow State: Completed status after compensation
  // ---------------------------------------------------------------------------
  Scenario("Saga status is completed after compensation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Limited Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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
          {
            timeoutMs,
          }
        );
      }
    );

    And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(scenarioState!.sagaResult).toBeDefined();
      expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
    });
  });

  // ---------------------------------------------------------------------------
  // Workflow State: completedAt timestamp
  // ---------------------------------------------------------------------------
  Scenario("Saga has completedAt timestamp after completion", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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
          {
            timeoutMs,
          }
        );
      }
    );

    And("the saga status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(scenarioState!.sagaResult).toBeDefined();
      expect(scenarioState!.sagaResult?.status).toBe(expectedStatus);
    });

    And("the saga should have a completedAt timestamp", async () => {
      const sagaType = scenarioState!.scenario.sagaType!;
      const sagaId = scenarioState!.scenario.sagaId!;

      const saga = await testQuery(scenarioState!.t, api.sagas.getSaga, { sagaType, sagaId });
      expect(saga?.completedAt).toBeDefined();
      expect(typeof saga?.completedAt).toBe("number");
    });
  });
});

// =============================================================================
// SAGA ADMIN FEATURE
// =============================================================================

const sagaAdminFeature = await loadFeature("tests/integration-features/sagas/saga-admin.feature");

describeFeature(sagaAdminFeature, ({ Scenario, Background, AfterEachScenario }) => {
  let productIdMap: Map<string, string>;

  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
    productIdMap = new Map();
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      scenarioState = initState();
      productIdMap = new Map();
      expect(scenarioState.t).toBeDefined();
      // No clearAll needed - namespace isolation via testRunId prefix
    });
  });

  // ---------------------------------------------------------------------------
  // getSagaDetails: Workflow ID for completed saga
  // ---------------------------------------------------------------------------
  Scenario(
    "Get saga details returns workflow ID for completed saga",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with {int} available stock",
        async (_ctx: unknown, productId: string, availableQuantity: number) => {
          const uniqueProductId = `${productId}-${Date.now()}`;
          productIdMap.set(productId, uniqueProductId);
          scenarioState!.scenario.productIds.push(uniqueProductId);

          await testMutation(scenarioState!.t, api.testing.createTestProduct, {
            productId: uniqueProductId,
            productName: "Test Widget",
            sku: generateSku(),
            availableQuantity,
          });
        }
      );

      And(
        "a draft order {string} exists with items:",
        async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const uniqueOrderId = `${orderId}-${Date.now()}`;
          const customerId = generateCustomerId();
          const items = parseItemTable(table, productIdMap);

          scenarioState!.scenario.orderId = uniqueOrderId;
          scenarioState!.scenario.customerId = customerId;
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

      And("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
        const orderId = scenarioState!.scenario.orderId!;

        await testMutation(scenarioState!.t, api.orders.submitOrder, { orderId });
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
            {
              timeoutMs,
            }
          );
        }
      );

      When(
        "I get saga details for {string} saga with ID {string}",
        async (_ctx: unknown, sagaType: string, _sagaIdPlaceholder: string) => {
          const sagaId = scenarioState!.scenario.sagaId!;

          scenarioState!.sagaDetails = await testQuery(
            scenarioState!.t,
            api.sagas.admin.getSagaDetails,
            {
              sagaType,
              sagaId,
            }
          );
        }
      );

      Then("the saga details should not be null", () => {
        expect(scenarioState!.sagaDetails).not.toBeNull();
      });

      And(
        "the saga details should have status {string}",
        (_ctx: unknown, expectedStatus: string) => {
          const details = scenarioState!.sagaDetails as { saga: { status: string } };
          expect(details.saga.status).toBe(expectedStatus);
        }
      );

      And("the saga details should have a workflow ID", () => {
        const details = scenarioState!.sagaDetails as { saga: { workflowId: string } };
        expect(details.saga.workflowId).toBeDefined();
      });
    }
  );

  // ---------------------------------------------------------------------------
  // getSagaSteps: Step history
  // ---------------------------------------------------------------------------
  Scenario("Get saga steps returns step history", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Limited Product",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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

    And("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      await testMutation(scenarioState!.t, api.orders.submitOrder, { orderId });
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
          {
            timeoutMs,
          }
        );
      }
    );

    When(
      "I get saga steps for {string} saga with ID {string}",
      async (_ctx: unknown, sagaType: string, _sagaIdPlaceholder: string) => {
        const sagaId = scenarioState!.scenario.sagaId!;

        scenarioState!.sagaSteps = await testQuery(scenarioState!.t, api.sagas.admin.getSagaSteps, {
          sagaType,
          sagaId,
        });
      }
    );

    Then("the saga steps should not be null", () => {
      expect(scenarioState!.sagaSteps).not.toBeNull();
    });

    And(
      "the saga steps should have saga ID {string}",
      (_ctx: unknown, _sagaIdPlaceholder: string) => {
        const sagaId = scenarioState!.scenario.sagaId!;
        const steps = scenarioState!.sagaSteps as { sagaId: string };
        expect(steps.sagaId).toBe(sagaId);
      }
    );

    And("the saga steps should have a workflow ID", () => {
      const steps = scenarioState!.sagaSteps as { workflowId: string };
      expect(steps.workflowId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getSagaSteps: Non-existent saga
  // ---------------------------------------------------------------------------
  Scenario("Get saga steps returns null for non-existent saga", ({ When, Then }) => {
    When(
      "I get saga steps for {string} saga with ID {string}",
      async (_ctx: unknown, sagaType: string, sagaId: string) => {
        scenarioState!.sagaSteps = await testQuery(scenarioState!.t, api.sagas.admin.getSagaSteps, {
          sagaType,
          sagaId,
        });
      }
    );

    Then("the saga steps should be null", () => {
      expect(scenarioState!.sagaSteps).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // cancelSaga: Running saga
  // ---------------------------------------------------------------------------
  Scenario("Cancel running saga", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Widget",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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

    And("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      await testMutation(scenarioState!.t, api.orders.submitOrder, { orderId });
    });

    And("I wait for {int} milliseconds", async (_ctx: unknown, ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

    When(
      "I cancel the {string} saga with ID {string} with reason {string}",
      async (_ctx: unknown, sagaType: string, _sagaIdPlaceholder: string, reason: string) => {
        const sagaId = scenarioState!.scenario.sagaId!;

        scenarioState!.cancelResult = await testMutation(
          scenarioState!.t,
          api.sagas.admin.cancelSaga,
          {
            sagaType,
            sagaId,
            reason,
          }
        );
      }
    );

    Then(
      "the cancel result status should be one of {string}, {string}, {string}",
      (_ctx: unknown, status1: string, status2: string, status3: string) => {
        const result = scenarioState!.cancelResult as { status: string };
        expect([status1, status2, status3]).toContain(result.status);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // cancelSaga: Non-existent saga
  // ---------------------------------------------------------------------------
  Scenario("Cancel non-existent saga returns not_found", ({ When, Then }) => {
    When(
      "I cancel the {string} saga with ID {string} with reason {string}",
      async (_ctx: unknown, sagaType: string, sagaId: string, reason: string) => {
        scenarioState!.cancelResult = await testMutation(
          scenarioState!.t,
          api.sagas.admin.cancelSaga,
          {
            sagaType,
            sagaId,
            reason,
          }
        );
      }
    );

    Then("the cancel result status should be {string}", (_ctx: unknown, expectedStatus: string) => {
      const result = scenarioState!.cancelResult as { status: string };
      expect(result.status).toBe(expectedStatus);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanupSagaWorkflow: Completed saga
  // ---------------------------------------------------------------------------
  Scenario("Cleanup completed saga workflow", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, availableQuantity: number) => {
        const uniqueProductId = `${productId}-${Date.now()}`;
        productIdMap.set(productId, uniqueProductId);
        scenarioState!.scenario.productIds.push(uniqueProductId);

        await testMutation(scenarioState!.t, api.testing.createTestProduct, {
          productId: uniqueProductId,
          productName: "Test Widget",
          sku: generateSku(),
          availableQuantity,
        });
      }
    );

    And(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table, productIdMap);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;
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

    And("I submit order {string}", async (_ctx: unknown, _orderId: string) => {
      const orderId = scenarioState!.scenario.orderId!;

      await testMutation(scenarioState!.t, api.orders.submitOrder, { orderId });
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
          {
            timeoutMs,
          }
        );
      }
    );

    When(
      "I cleanup the {string} saga workflow with ID {string}",
      async (_ctx: unknown, sagaType: string, _sagaIdPlaceholder: string) => {
        const sagaId = scenarioState!.scenario.sagaId!;

        scenarioState!.cleanupResult = await testMutation(
          scenarioState!.t,
          api.sagas.admin.cleanupSagaWorkflow,
          { sagaType, sagaId }
        );
      }
    );

    Then(
      "the cleanup result status should be one of {string}, {string}",
      (_ctx: unknown, status1: string, status2: string) => {
        const result = scenarioState!.cleanupResult as { status: string };
        expect([status1, status2]).toContain(result.status);
      }
    );
  });
});
