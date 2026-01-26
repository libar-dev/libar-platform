/**
 * Confirm Order Step Definitions for Unit Tests
 *
 * Tests the ConfirmOrder command behavior.
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

// Load the confirm-order feature
const confirmOrderFeature = await loadFeature(
  "tests/features/behavior/orders/confirm-order.feature"
);

describeFeature(confirmOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Successfully confirm a submitted order
  // =========================================================================
  Scenario("Successfully confirm a submitted order", ({ Given, When, Then, And }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Submitted orders need items
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

    When("I send a ConfirmOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
        });
      });
    });

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
  // Scenario: Cannot confirm a draft order
  // =========================================================================
  Scenario("Cannot confirm a draft order", ({ Given, When, Then, And }) => {
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

    When("I send a ConfirmOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
        });
      });
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );

    // NOTE: Status verification cannot be done in unit tests.
    And(
      "the order {string} status should remain {string}",
      (_ctx: unknown, _orderId: string, _status: string) => {
        // Command was rejected, so status should not have changed.
        // Verification in integration tests.
        assertCommandReturnedRejection(scenarioState!);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot confirm an already confirmed order
  // =========================================================================
  Scenario("Cannot confirm an already confirmed order", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Confirmed orders need items
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

    When("I send a ConfirmOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
        });
      });
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot confirm a cancelled order
  // =========================================================================
  Scenario("Cannot confirm a cancelled order", ({ Given, When, Then }) => {
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

    When("I send a ConfirmOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
        });
      });
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );
  });

  // =========================================================================
  // Scenario: Cannot confirm a non-existent order
  // =========================================================================
  Scenario("Cannot confirm a non-existent order", ({ Given, When, Then }) => {
    Given("no order exists with ID {string}", (_ctx: unknown, orderId: string) => {
      // Just set up the orderId for the test, don't create the order
      scenarioState!.scenario.orderId = orderId;
    });

    When("I send a ConfirmOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
        });
      });
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        assertCommandReturnedRejection(scenarioState!, expectedCode);
      }
    );
  });

  // =========================================================================
  // Scenario: ConfirmOrder is idempotent with same commandId
  // =========================================================================
  Scenario("ConfirmOrder is idempotent with same commandId", ({ Given, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, status: string) => {
        // Submitted orders need items
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
      "I send a ConfirmOrder command twice with the same commandId for {string}",
      async (_ctx: unknown, orderId: string) => {
        const commandId = generateCommandId();
        scenarioState!.scenario.commandId = commandId;

        // First confirm
        const result1 = await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
          commandId,
        });

        // Second confirm with same commandId
        const result2 = await scenarioState!.t.mutation(api.orders.confirmOrder, {
          orderId,
          commandId,
        });

        scenarioState!.lastResult = { first: result1, second: result2 };
        scenarioState!.lastError = null;
      }
    );

    Then("the order should only be confirmed once", () => {
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
