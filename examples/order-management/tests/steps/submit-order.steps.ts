/**
 * Submit Order Step Definitions for Unit Tests
 *
 * Tests the SubmitOrder command behavior.
 * Uses convex-test for mock backend testing.
 *
 * NOTE: convex-test cannot verify projections (Workpool doesn't execute).
 * Status verification steps only verify command success/failure.
 * Full projection verification happens in integration tests.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  type ScenarioState,
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

// Load the submit-order feature
const submitOrderFeature = await loadFeature("tests/features/behavior/orders/submit-order.feature");

describeFeature(submitOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
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
  // Scenario: Successfully submit order with items
  // =========================================================================
  Scenario("Successfully submit order with items", ({ Given, And, When, Then }) => {
    Given(
      "an order {string} exists with status {string}",
      async (_ctx: unknown, orderId: string, _status: string) => {
        scenarioState!.scenario.orderId = orderId;
        // Items will be set up in the next step
      }
    );

    And("the order has the following items:", async (_ctx: unknown, table: ItemTableRow[]) => {
      const items = parseItemTable(table);
      await setupOrderWithStatus(scenarioState!, scenarioState!.scenario.orderId!, "draft", items);
    });

    When("I send a SubmitOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.submitOrder, {
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

    And("the order total should be {int}", (_ctx: unknown, _total: number) => {
      // In unit tests, we only verify the command succeeded.
      // Total verification happens in integration tests.
      assertCommandSucceeded(scenarioState!);
    });
  });

  // =========================================================================
  // Scenario: Cannot submit empty order
  // =========================================================================
  Scenario("Cannot submit empty order", ({ Given, And, When, Then }) => {
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
      // Order was created without items in Given step
      scenarioState!.scenario.items = [];
    });

    When("I send a SubmitOrder command for {string}", async (_ctx: unknown, orderId: string) => {
      await executeMutation(scenarioState!, async () => {
        return await scenarioState!.t.mutation(api.orders.submitOrder, {
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

  // NOTE: The following scenarios are tested in integration tests only:
  // - Cannot submit already submitted order
  // - Cannot submit cancelled order
  // - SubmitOrder is idempotent with same commandId
  //
  // These require real Convex infrastructure because submitOrder triggers
  // the OrderFulfillment saga workflow, which doesn't work in convex-test.
  // See: tests/integration/orders/orders.integration.test.ts
});
