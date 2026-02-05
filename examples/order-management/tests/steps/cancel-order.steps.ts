/**
 * Cancel Order Step Definitions for Unit Tests
 *
 * Tests the CancelOrder command behavior.
 * Uses convex-test for mock backend testing.
 *
 * NOTE: convex-test cannot verify projections (Workpool doesn't execute).
 * Status verification steps only verify command success/failure.
 * Full projection verification happens in integration tests.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { generateCommandId } from "../fixtures/orders";
import {
  type ScenarioState,
  type OrderItem,
  initState,
  setupOrderWithStatus,
  executeMutation,
  assertCommandSucceeded,
  assertCommandReturnedRejection,
} from "./common.helpers";

// Module-level state shared across steps within a scenario
let scenarioState: ScenarioState | null = null;

// Load the cancel-order feature
const cancelOrderFeature = await loadFeature("tests/features/behavior/orders/cancel-order.feature");

describeFeature(cancelOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Cancel draft order
  // =========================================================================
  Scenario("Cancel draft order", ({ Given, When, Then, And }) => {
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
      "I send a CancelOrder command for {string} with reason {string}",
      async (_ctx: unknown, orderId: string, reason: string) => {
        scenarioState!.scenario.reason = reason;

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.cancelOrder, {
            orderId,
            reason,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    // NOTE: Status verification cannot be done in unit tests.
    // Projections don't run in convex-test. Verified in integration tests.
    And(
      "the order {string} status should be {string}",
      (_ctx: unknown, _orderId: string, _status: string) => {
        // In unit tests, we only verify the command succeeded.
        // Status verification happens in integration tests.
        assertCommandSucceeded(scenarioState!);
      }
    );
  });

  // =========================================================================
  // Scenario: Cancel submitted order
  // =========================================================================
  Scenario("Cancel submitted order", ({ Given, When, Then, And }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Create order with submitted status and items
        const items: OrderItem[] = [
          { productId: "prod_sub", productName: "Submitted Item", quantity: 1, unitPrice: 10 },
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
      "I send a CancelOrder command for {string} with reason {string}",
      async (_ctx: unknown, orderId: string, reason: string) => {
        scenarioState!.scenario.reason = reason;

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.cancelOrder, {
            orderId,
            reason,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    And(
      "the order {string} status should be {string}",
      (_ctx: unknown, _orderId: string, _status: string) => {
        // Status verification happens in integration tests.
        assertCommandSucceeded(scenarioState!);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot cancel already cancelled order
  // =========================================================================
  Scenario("Cannot cancel already cancelled order", ({ Given, When, Then }) => {
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
      "I send a CancelOrder command for {string} with reason {string}",
      async (_ctx: unknown, orderId: string, reason: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.cancelOrder, {
            orderId,
            reason,
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
  // Scenario: Cancel confirmed order
  // =========================================================================
  Scenario("Cancel confirmed order", ({ Given, When, Then, And }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Create order with confirmed status and items
        const items: OrderItem[] = [
          { productId: "prod_conf", productName: "Confirmed Item", quantity: 1, unitPrice: 10 },
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
      "I send a CancelOrder command for {string} with reason {string}",
      async (_ctx: unknown, orderId: string, reason: string) => {
        scenarioState!.scenario.reason = reason;

        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.cancelOrder, {
            orderId,
            reason,
          });
        });
      }
    );

    Then("the command should succeed", () => {
      assertCommandSucceeded(scenarioState!);
    });

    And(
      "the order {string} status should be {string}",
      (_ctx: unknown, _orderId: string, _status: string) => {
        // Status verification happens in integration tests.
        assertCommandSucceeded(scenarioState!);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot cancel non-existent order
  // =========================================================================
  Scenario("Cannot cancel non-existent order", ({ Given, When, Then }) => {
    Given("no order exists with ID {string}", async (_ctx: unknown, orderId: string) => {
      scenarioState!.scenario.orderId = orderId;
      // Don't create the order - it should not exist
    });

    When(
      "I send a CancelOrder command for {string} with reason {string}",
      async (_ctx: unknown, orderId: string, reason: string) => {
        await executeMutation(scenarioState!, async () => {
          return await scenarioState!.t.mutation(api.orders.cancelOrder, {
            orderId,
            reason,
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
  // Scenario: CancelOrder is idempotent with same commandId
  // =========================================================================
  Scenario("CancelOrder is idempotent with same commandId", ({ Given, When, Then }) => {
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
      "I send a CancelOrder command twice with the same commandId for {string}",
      async (_ctx: unknown, orderId: string) => {
        const commandId = generateCommandId();
        scenarioState!.scenario.commandId = commandId;
        const reason = "Idempotency test";

        // First cancel
        const result1 = await scenarioState!.t.mutation(api.orders.cancelOrder, {
          orderId,
          reason,
          commandId,
        });

        // Second cancel with same commandId
        const result2 = await scenarioState!.t.mutation(api.orders.cancelOrder, {
          orderId,
          reason,
          commandId,
        });

        scenarioState!.lastResult = { first: result1, second: result2 };
        scenarioState!.lastError = null;
      }
    );

    Then("the order should only be cancelled once", () => {
      const results = scenarioState!.lastResult as {
        first: { status: string };
        second: { status: string };
      };

      // First call should succeed
      expect(results.first.status).toBe("success");

      // Second call should return duplicate
      expect(results.second.status).toBe("duplicate");
    });
  });
});
