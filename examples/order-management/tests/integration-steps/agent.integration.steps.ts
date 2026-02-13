/**
 * Agent Integration Step Definitions
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests the complete churn-risk agent pipeline:
 *   EventBus -> pattern detection -> audit -> command -> outreach.
 *
 * These steps require:
 * - Docker backend running (port 3210)
 * - `just start && just deploy-local` executed
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";
import { generateOrderId, generateCustomerId } from "../fixtures/orders";
import { generateProductId, generateSku } from "../fixtures/inventory";
import { waitUntil, DEFAULT_TIMEOUT_MS } from "../support/localBackendHelpers";
import { testMutation, testQuery } from "../support/integrationHelpers";
import { CHURN_RISK_AGENT_ID } from "../../convex/contexts/agent/_config";

// ============================================================================
// Types
// ============================================================================

/**
 * State interface for agent integration scenarios.
 * Tracks product, customer, and order data across steps.
 */
interface AgentScenarioState {
  t: ConvexTestingHelper;
  scenario: {
    productId?: string;
    productName?: string;
    sku?: string;
    customerId?: string;
    orderIds?: string[];
  };
}

// Module-level state shared across steps within a scenario
let scenarioState: AgentScenarioState | null = null;

/**
 * Initialize fresh state for a scenario.
 */
function initState(): AgentScenarioState {
  return {
    t: new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    }),
    scenario: {},
  };
}

// Extended timeout for agent pipeline (3x default = 60s)
const AGENT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS * 3;

// ============================================================================
// Feature: Churn Risk Agent — Full Pipeline
// ============================================================================

const churnRiskFeature = await loadFeature("tests/integration-features/agent/churn-risk.feature");

describeFeature(churnRiskFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario: Three cancellations trigger churn risk pattern detection
  // --------------------------------------------------------------------------
  Scenario(
    "Three cancellations trigger churn risk pattern detection",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with no stock",
        async (_ctx: unknown, productName: string) => {
          const productId = generateProductId();
          const sku = generateSku();
          scenarioState!.scenario.productId = productId;
          scenarioState!.scenario.productName = productName;
          scenarioState!.scenario.sku = sku;

          await testMutation(scenarioState!.t, api.inventory.createProduct, {
            productId,
            productName,
            sku,
            unitPrice: 49.99,
          });

          // Wait for product projection to be available
          await waitUntil(
            async () => {
              const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
                productId,
              });
              return product !== null ? product : null;
            },
            { message: `Product ${productId} projection to be available` }
          );
        }
      );

      And(
        "customer {string} has created and submitted {int} orders for {string}",
        async (_ctx: unknown, customerPrefix: string, orderCount: number, _productName: string) => {
          const customerId = generateCustomerId(customerPrefix);
          scenarioState!.scenario.customerId = customerId;
          scenarioState!.scenario.orderIds = [];

          const productId = scenarioState!.scenario.productId!;
          const productName = scenarioState!.scenario.productName!;

          for (let i = 0; i < orderCount; i++) {
            const orderId = generateOrderId(`agent_${i}`);
            scenarioState!.scenario.orderIds!.push(orderId);

            // Create the order
            await testMutation(scenarioState!.t, api.orders.createOrder, {
              orderId,
              customerId,
            });

            // Wait for order projection
            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order !== null ? order : null;
              },
              { message: `Order ${orderId} projection to be available` }
            );

            // Add an item to the order
            await testMutation(scenarioState!.t, api.orders.addOrderItem, {
              orderId,
              productId,
              productName,
              quantity: 1,
              unitPrice: 49.99,
            });

            // Wait for item to be added
            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order?.itemCount === 1 ? order : null;
              },
              { message: `Order ${orderId} item to be added` }
            );

            // Submit the order (triggers OrderFulfillment saga)
            await testMutation(scenarioState!.t, api.orders.submitOrder, {
              orderId,
            });
          }
        }
      );

      And(
        "all {int} orders are cancelled by saga compensation",
        async (_ctx: unknown, orderCount: number) => {
          const orderIds = scenarioState!.scenario.orderIds!;
          expect(orderIds).toHaveLength(orderCount);

          // Wait for each order to reach "cancelled" status via saga compensation.
          // The saga tries to reserve stock -> fails (0 stock) -> compensates -> cancels.
          for (const orderId of orderIds) {
            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order?.status === "cancelled" ? order : null;
              },
              {
                timeoutMs: AGENT_TIMEOUT_MS,
                message: `Order ${orderId} to be cancelled by saga compensation`,
              }
            );
          }
        }
      );

      When("the churn-risk agent processes the cancellation events", async () => {
        const customerId = scenarioState!.scenario.customerId!;

        // Wait for the customerCancellations projection to reflect all cancellations
        await waitUntil(
          async () => {
            const cancellations = await testQuery(
              scenarioState!.t,
              api.testing.getTestCustomerCancellations,
              { customerId }
            );
            return cancellations?.cancellationCount >= 3 ? cancellations : null;
          },
          {
            timeoutMs: AGENT_TIMEOUT_MS,
            message: `customerCancellations projection to have 3+ for ${customerId}`,
          }
        );

        // Wait for the agent checkpoint to advance past our events.
        // The agent processes events via EventBus subscription -> workpool action.
        await waitUntil(
          async () => {
            const checkpoint = await testQuery(scenarioState!.t, api.queries.agent.getCheckpoint, {
              agentId: CHURN_RISK_AGENT_ID,
            });
            return checkpoint?.eventsProcessed && checkpoint.eventsProcessed >= 3
              ? checkpoint
              : null;
          },
          {
            timeoutMs: AGENT_TIMEOUT_MS,
            message: `Agent checkpoint to process 3+ events`,
          }
        );
      });

      Then("a PatternDetected audit event is recorded for the churn-risk agent", async () => {
        // Query audit events for the churn-risk agent filtered by PatternDetected
        const audits = await testQuery(scenarioState!.t, api.queries.agent.getAuditEvents, {
          agentId: CHURN_RISK_AGENT_ID,
          eventType: "PatternDetected",
          limit: 10,
        });

        expect(audits).toBeDefined();
        const auditList = audits as unknown[];
        expect(auditList.length).toBeGreaterThanOrEqual(1);
      });
    }
  );

  // --------------------------------------------------------------------------
  // Scenario: Two cancellations do not trigger churn risk
  // --------------------------------------------------------------------------
  Scenario("Two cancellations do not trigger churn risk", ({ Given, And, When, Then }) => {
    Given("a product {string} exists with no stock", async (_ctx: unknown, productName: string) => {
      const productId = generateProductId();
      const sku = generateSku();
      scenarioState!.scenario.productId = productId;
      scenarioState!.scenario.productName = productName;
      scenarioState!.scenario.sku = sku;

      await testMutation(scenarioState!.t, api.inventory.createProduct, {
        productId,
        productName,
        sku,
        unitPrice: 49.99,
      });

      await waitUntil(
        async () => {
          const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
            productId,
          });
          return product !== null ? product : null;
        },
        { message: `Product ${productId} projection to be available` }
      );
    });

    And(
      "customer {string} has created and submitted {int} orders for {string}",
      async (_ctx: unknown, customerPrefix: string, orderCount: number, _productName: string) => {
        const customerId = generateCustomerId(customerPrefix);
        scenarioState!.scenario.customerId = customerId;
        scenarioState!.scenario.orderIds = [];

        const productId = scenarioState!.scenario.productId!;
        const productName = scenarioState!.scenario.productName!;

        for (let i = 0; i < orderCount; i++) {
          const orderId = generateOrderId(`agent_${i}`);
          scenarioState!.scenario.orderIds!.push(orderId);

          await testMutation(scenarioState!.t, api.orders.createOrder, {
            orderId,
            customerId,
          });

          await waitUntil(
            async () => {
              const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                orderId,
              });
              return order !== null ? order : null;
            },
            { message: `Order ${orderId} projection to be available` }
          );

          await testMutation(scenarioState!.t, api.orders.addOrderItem, {
            orderId,
            productId,
            productName,
            quantity: 1,
            unitPrice: 49.99,
          });

          await waitUntil(
            async () => {
              const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                orderId,
              });
              return order?.itemCount === 1 ? order : null;
            },
            { message: `Order ${orderId} item to be added` }
          );

          await testMutation(scenarioState!.t, api.orders.submitOrder, {
            orderId,
          });
        }
      }
    );

    And(
      "all {int} orders are cancelled by saga compensation",
      async (_ctx: unknown, orderCount: number) => {
        const orderIds = scenarioState!.scenario.orderIds!;
        expect(orderIds).toHaveLength(orderCount);

        for (const orderId of orderIds) {
          await waitUntil(
            async () => {
              const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                orderId,
              });
              return order?.status === "cancelled" ? order : null;
            },
            {
              timeoutMs: AGENT_TIMEOUT_MS,
              message: `Order ${orderId} to be cancelled by saga compensation`,
            }
          );
        }
      }
    );

    When("the churn-risk agent checkpoint has advanced past the cancellation events", async () => {
      const customerId = scenarioState!.scenario.customerId!;

      // Wait for the customerCancellations projection to reflect both cancellations
      await waitUntil(
        async () => {
          const cancellations = await testQuery(
            scenarioState!.t,
            api.testing.getTestCustomerCancellations,
            { customerId }
          );
          return cancellations?.cancellationCount >= 2 ? cancellations : null;
        },
        {
          timeoutMs: AGENT_TIMEOUT_MS,
          message: `customerCancellations projection to have 2+ for ${customerId}`,
        }
      );

      // Wait for the agent checkpoint to advance past these events.
      // With only 2 cancellations, the agent should process them but NOT detect a pattern.
      await waitUntil(
        async () => {
          const checkpoint = await testQuery(scenarioState!.t, api.queries.agent.getCheckpoint, {
            agentId: CHURN_RISK_AGENT_ID,
          });
          return checkpoint?.eventsProcessed && checkpoint.eventsProcessed >= 2 ? checkpoint : null;
        },
        {
          timeoutMs: AGENT_TIMEOUT_MS,
          message: `Agent checkpoint to process 2+ events`,
        }
      );
    });

    Then(
      "no PatternDetected audit event is recorded for customer {string}",
      async (_ctx: unknown, _customerPrefix: string) => {
        const customerId = scenarioState!.scenario.customerId!;

        // Query audit events for PatternDetected and verify none reference this customer
        const audits = await testQuery(scenarioState!.t, api.queries.agent.getAuditEvents, {
          agentId: CHURN_RISK_AGENT_ID,
          eventType: "PatternDetected",
          limit: 100,
        });

        const auditList = (audits ?? []) as Array<{
          data?: { customerId?: string; matchingEventIds?: string[] };
        }>;

        // Verify no PatternDetected audit references this customer's events
        const matchingAudits = auditList.filter((audit) => {
          const data = audit.data as Record<string, unknown> | undefined;
          return data?.["customerId"] === customerId;
        });

        expect(matchingAudits).toHaveLength(0);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Detected pattern emits SuggestCustomerOutreach command
  // --------------------------------------------------------------------------
  Scenario(
    "Detected pattern emits SuggestCustomerOutreach command",
    ({ Given, And, When, Then }) => {
      Given(
        "a product {string} exists with no stock",
        async (_ctx: unknown, productName: string) => {
          const productId = generateProductId();
          const sku = generateSku();
          scenarioState!.scenario.productId = productId;
          scenarioState!.scenario.productName = productName;
          scenarioState!.scenario.sku = sku;

          await testMutation(scenarioState!.t, api.inventory.createProduct, {
            productId,
            productName,
            sku,
            unitPrice: 49.99,
          });

          await waitUntil(
            async () => {
              const product = await testQuery(scenarioState!.t, api.inventory.getProduct, {
                productId,
              });
              return product !== null ? product : null;
            },
            { message: `Product ${productId} projection to be available` }
          );
        }
      );

      And(
        "customer {string} has created and submitted {int} orders for {string}",
        async (_ctx: unknown, customerPrefix: string, orderCount: number, _productName: string) => {
          const customerId = generateCustomerId(customerPrefix);
          scenarioState!.scenario.customerId = customerId;
          scenarioState!.scenario.orderIds = [];

          const productId = scenarioState!.scenario.productId!;
          const productName = scenarioState!.scenario.productName!;

          for (let i = 0; i < orderCount; i++) {
            const orderId = generateOrderId(`agent_${i}`);
            scenarioState!.scenario.orderIds!.push(orderId);

            await testMutation(scenarioState!.t, api.orders.createOrder, {
              orderId,
              customerId,
            });

            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order !== null ? order : null;
              },
              { message: `Order ${orderId} projection to be available` }
            );

            await testMutation(scenarioState!.t, api.orders.addOrderItem, {
              orderId,
              productId,
              productName,
              quantity: 1,
              unitPrice: 49.99,
            });

            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order?.itemCount === 1 ? order : null;
              },
              { message: `Order ${orderId} item to be added` }
            );

            await testMutation(scenarioState!.t, api.orders.submitOrder, {
              orderId,
            });
          }
        }
      );

      And(
        "all {int} orders are cancelled by saga compensation",
        async (_ctx: unknown, orderCount: number) => {
          const orderIds = scenarioState!.scenario.orderIds!;
          expect(orderIds).toHaveLength(orderCount);

          for (const orderId of orderIds) {
            await waitUntil(
              async () => {
                const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
                  orderId,
                });
                return order?.status === "cancelled" ? order : null;
              },
              {
                timeoutMs: AGENT_TIMEOUT_MS,
                message: `Order ${orderId} to be cancelled by saga compensation`,
              }
            );
          }
        }
      );

      When("the churn-risk agent detects the pattern and emits a command", async () => {
        const customerId = scenarioState!.scenario.customerId!;

        // Wait for the customerCancellations projection to reflect all cancellations
        await waitUntil(
          async () => {
            const cancellations = await testQuery(
              scenarioState!.t,
              api.testing.getTestCustomerCancellations,
              { customerId }
            );
            return cancellations?.cancellationCount >= 3 ? cancellations : null;
          },
          {
            timeoutMs: AGENT_TIMEOUT_MS,
            message: `customerCancellations projection to have 3+ for ${customerId}`,
          }
        );

        // Wait for PatternDetected audit event to confirm pattern was detected
        await waitUntil(
          async () => {
            const audits = await testQuery(scenarioState!.t, api.queries.agent.getAuditEvents, {
              agentId: CHURN_RISK_AGENT_ID,
              eventType: "PatternDetected",
              limit: 10,
            });
            const auditList = (audits ?? []) as unknown[];
            return auditList.length > 0 ? audits : null;
          },
          {
            timeoutMs: AGENT_TIMEOUT_MS,
            message: `PatternDetected audit event to be recorded`,
          }
        );
      });

      Then("a SuggestCustomerOutreach outreach task is recorded for the customer", async () => {
        const customerId = scenarioState!.scenario.customerId!;

        // Wait for the outreach task to be created via the command bridge
        await waitUntil(
          async () => {
            const tasks = await testQuery(scenarioState!.t, api.testing.getTestOutreachTasks, {
              customerId,
            });
            const taskList = (tasks ?? []) as unknown[];
            return taskList.length > 0 ? tasks : null;
          },
          {
            timeoutMs: AGENT_TIMEOUT_MS,
            message: `Outreach task to be created for customer ${customerId}`,
          }
        );

        const tasks = await testQuery(scenarioState!.t, api.testing.getTestOutreachTasks, {
          customerId,
        });

        const taskList = tasks as Array<{
          customerId: string;
          status: string;
          agentId: string;
          riskLevel: string;
          cancellationCount: number;
        }>;

        expect(taskList.length).toBeGreaterThanOrEqual(1);

        const outreachTask = taskList[0];
        expect(outreachTask.customerId).toBe(customerId);
        expect(outreachTask.status).toBe("pending");
        expect(outreachTask.agentId).toBe(CHURN_RISK_AGENT_ID);
        expect(outreachTask.cancellationCount).toBeGreaterThanOrEqual(3);
      });
    }
  );
});
