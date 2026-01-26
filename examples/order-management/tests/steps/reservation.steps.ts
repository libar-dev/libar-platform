/**
 * Reservation Step Definitions for Unit Tests
 *
 * Uses convex-test for mock backend testing.
 * Tests ReserveStock, ConfirmReservation, and ReleaseReservation commands.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { generateSku } from "../fixtures/inventory";
import { generateOrderId, generateCommandId } from "../fixtures/orders";
import {
  initInventoryState,
  tableRowsToObject,
  parseInventoryItemTable,
  type InventoryScenarioState,
  type DataTableRow,
  type InventoryItemTableRow,
} from "./common.helpers";

// Module-level state shared across steps within a scenario
let state: InventoryScenarioState | null = null;

// ============================================
// RESERVE STOCK FEATURE
// ============================================

const reserveStockFeature = await loadFeature(
  "tests/features/behavior/inventory/reserve-stock.feature"
);

describeFeature(reserveStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      state = initInventoryState();
      expect(state.t).toBeDefined();
    });
  });

  Scenario("Successfully reserve available stock", ({ Given, When, And, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    When("I send a ReserveStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.reservationId = data.reservationId;
      state!.scenario.orderId = data.orderId;
    });

    And("the reservation includes:", async (_ctx: unknown, table: InventoryItemTableRow[]) => {
      const items = parseInventoryItemTable(table);
      state!.scenario.reservationItems = items;

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.reserveStock, {
          orderId: state!.scenario.orderId!,
          items,
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

    // NOTE: Stock verification (available/reserved quantities) is done in
    // integration tests only. Projections don't run in unit tests.
  });

  Scenario("Reserve multiple items atomically", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    And(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    When("I send a ReserveStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.reservationId = data.reservationId;
      state!.scenario.orderId = data.orderId;
    });

    And("the reservation includes:", async (_ctx: unknown, table: InventoryItemTableRow[]) => {
      const items = parseInventoryItemTable(table);
      state!.scenario.reservationItems = items;

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.reserveStock, {
          orderId: state!.scenario.orderId!,
          items,
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
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    // NOTE: Stock verification is done in integration tests only.
  });

  Scenario("Reservation fails when insufficient stock", ({ Given, When, And, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: "Limited Stock Product",
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    When("I send a ReserveStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.reservationId = data.reservationId;
      state!.scenario.orderId = data.orderId;
    });

    And("the reservation includes:", async (_ctx: unknown, table: InventoryItemTableRow[]) => {
      const items = parseInventoryItemTable(table);
      state!.scenario.reservationItems = items;

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.reserveStock, {
          orderId: state!.scenario.orderId!,
          items,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then(
      "the command should fail with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (state!.lastError) {
          throw new Error(`Command threw an error: ${state!.lastError.message}`);
        }
        const result = state!.lastResult as { status?: string; reason?: string };
        expect(result.status).toBe("failed");
        expect(result.reason).toContain(expectedReason);
      }
    );

    // NOTE: Stock verification is done in integration tests only.
  });

  Scenario("Multi-item reservation is all-or-nothing", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    And(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: `Product ${productId}`,
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    When("I send a ReserveStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.reservationId = data.reservationId;
      state!.scenario.orderId = data.orderId;
    });

    And("the reservation includes:", async (_ctx: unknown, table: InventoryItemTableRow[]) => {
      const items = parseInventoryItemTable(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.reserveStock, {
          orderId: state!.scenario.orderId!,
          items,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then(
      "the command should fail with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (state!.lastError) {
          throw new Error(`Command threw an error: ${state!.lastError.message}`);
        }
        const result = state!.lastResult as { status?: string; reason?: string };
        expect(result.status).toBe("failed");
        expect(result.reason).toContain(expectedReason);
      }
    );

    // NOTE: Stock verification is done in integration tests only.
  });

  Scenario("Cannot reserve non-existent product", ({ Given, When, And, Then }) => {
    Given("no product exists with ID {string}", async (_ctx: unknown, _productId: string) => {
      // Product doesn't exist - nothing to do
    });

    When("I send a ReserveStock command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.scenario.reservationId = data.reservationId;
      state!.scenario.orderId = data.orderId;
    });

    And("the reservation includes:", async (_ctx: unknown, table: InventoryItemTableRow[]) => {
      const items = parseInventoryItemTable(table);

      try {
        state!.lastResult = await state!.t.mutation(api.inventory.reserveStock, {
          orderId: state!.scenario.orderId!,
          items,
        });
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    // Non-existent products are treated as having 0 stock (all-or-nothing pattern)
    Then(
      "the command should fail with reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (state!.lastError) {
          throw new Error(`Command threw an error: ${state!.lastError.message}`);
        }
        const result = state!.lastResult as { status?: string; reason?: string };
        expect(result).toBeDefined();
        expect(result.status).toBe("failed");
        expect(result.reason).toBe(expectedReason);
      }
    );
  });

  Scenario("ReserveStock is idempotent with same commandId", ({ Given, When, Then }) => {
    Given(
      "a product {string} exists with {int} available stock",
      async (_ctx: unknown, productId: string, quantity: number) => {
        state!.scenario.productId = productId;
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: quantity,
        });
      }
    );

    When(
      "I send a ReserveStock command twice with the same commandId for reservation {string}",
      async (_ctx: unknown, _reservationId: string) => {
        const commandId = generateCommandId();
        const orderId = generateOrderId();
        const items = [{ productId: state!.scenario.productId!, quantity: 10 }];

        // First call
        const result1 = await state!.t.mutation(api.inventory.reserveStock, {
          orderId,
          items,
          commandId,
        });

        // Second call with same commandId
        const result2 = await state!.t.mutation(api.inventory.reserveStock, {
          orderId,
          items,
          commandId,
        });

        state!.lastResult = { first: result1, second: result2 };
      }
    );

    Then("the second command should return duplicate status", () => {
      const results = state!.lastResult as { first: unknown; second: { status: string } };
      expect(results.second.status).toBe("duplicate");
    });

    // NOTE: Stock verification is done in integration tests only.
  });
});

// ============================================
// CONFIRM RESERVATION FEATURE
// ============================================

const confirmReservationFeature = await loadFeature(
  "tests/features/behavior/inventory/confirm-reservation.feature"
);

describeFeature(confirmReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      state = initInventoryState();
      expect(state.t).toBeDefined();
    });
  });

  Scenario("Successfully confirm pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available and {int} reserved stock",
      async (_ctx: unknown, productId: string, available: number, reserved: number) => {
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: available,
          reservedQuantity: reserved,
        });
      }
    );

    And(
      "a pending reservation {string} exists for order {string}",
      async (_ctx: unknown, reservationId: string, orderId: string) => {
        state!.scenario.reservationId = reservationId;
        state!.scenario.orderId = orderId;

        await state!.t.mutation(api.testing.createTestReservation, {
          reservationId,
          orderId,
          items: [{ productId: "prod_confirm_001", quantity: 10 }],
          status: "pending",
        });
      }
    );

    When(
      "I send a ConfirmReservation command for {string}",
      async (_ctx: unknown, reservationId: string) => {
        try {
          state!.lastResult = await state!.t.mutation(api.inventory.confirmReservation, {
            reservationId,
          });
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (state!.lastError) {
        throw new Error(`Command failed with error: ${state!.lastError.message}`);
      }
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    // NOTE: Reservation status verification is done in integration tests only.
    // Projections don't run in unit tests (convex-test).
  });

  Scenario("Cannot confirm non-existent reservation", ({ Given, When, Then }) => {
    Given(
      "no reservation exists with ID {string}",
      async (_ctx: unknown, _reservationId: string) => {
        // Reservation doesn't exist - nothing to do
      }
    );

    When(
      "I send a ConfirmReservation command for {string}",
      async (_ctx: unknown, reservationId: string) => {
        try {
          state!.lastResult = await state!.t.mutation(api.inventory.confirmReservation, {
            reservationId,
          });
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      }
    );

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

  Scenario("Cannot confirm already confirmed reservation", ({ Given, When, Then }) => {
    Given(
      "a confirmed reservation {string} exists for order {string}",
      async (_ctx: unknown, reservationId: string, orderId: string) => {
        state!.scenario.reservationId = reservationId;
        state!.scenario.orderId = orderId;

        await state!.t.mutation(api.testing.createTestReservation, {
          reservationId,
          orderId,
          items: [{ productId: "prod_confirm_002", quantity: 5 }],
          status: "confirmed",
        });
      }
    );

    When(
      "I send a ConfirmReservation command for {string}",
      async (_ctx: unknown, reservationId: string) => {
        try {
          state!.lastResult = await state!.t.mutation(api.inventory.confirmReservation, {
            reservationId,
          });
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      }
    );

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

  Scenario("ConfirmReservation is idempotent with same commandId", ({ Given, When, Then }) => {
    Given(
      "a pending reservation {string} exists for order {string}",
      async (_ctx: unknown, reservationId: string, orderId: string) => {
        state!.scenario.reservationId = reservationId;

        // First create a product for the reservation
        await state!.t.mutation(api.testing.createTestProduct, {
          productId: "prod_confirm_003",
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: 50,
          reservedQuantity: 10,
        });

        await state!.t.mutation(api.testing.createTestReservation, {
          reservationId,
          orderId,
          items: [{ productId: "prod_confirm_003", quantity: 10 }],
          status: "pending",
        });
      }
    );

    When(
      "I send a ConfirmReservation command twice with the same commandId for {string}",
      async (_ctx: unknown, reservationId: string) => {
        const commandId = generateCommandId();

        // First call
        const result1 = await state!.t.mutation(api.inventory.confirmReservation, {
          reservationId,
          commandId,
        });

        // Second call with same commandId
        const result2 = await state!.t.mutation(api.inventory.confirmReservation, {
          reservationId,
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
// RELEASE RESERVATION FEATURE
// ============================================

const releaseReservationFeature = await loadFeature(
  "tests/features/behavior/inventory/release-reservation.feature"
);

describeFeature(releaseReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      state = initInventoryState();
      expect(state.t).toBeDefined();
    });
  });

  Scenario("Successfully release pending reservation", ({ Given, And, When, Then }) => {
    Given(
      "a product {string} exists with {int} available and {int} reserved stock",
      async (_ctx: unknown, productId: string, available: number, reserved: number) => {
        state!.scenario.productId = productId;
        await state!.t.mutation(api.testing.createTestProduct, {
          productId,
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: available,
          reservedQuantity: reserved,
        });
      }
    );

    And(
      "a pending reservation {string} exists for order {string} with:",
      async (
        _ctx: unknown,
        reservationId: string,
        orderId: string,
        table: InventoryItemTableRow[]
      ) => {
        state!.scenario.reservationId = reservationId;
        state!.scenario.orderId = orderId;
        const items = parseInventoryItemTable(table);

        await state!.t.mutation(api.testing.createTestReservation, {
          reservationId,
          orderId,
          items,
          status: "pending",
        });
      }
    );

    When(
      "I send a ReleaseReservation command for {string} with reason {string}",
      async (_ctx: unknown, reservationId: string, reason: string) => {
        try {
          state!.lastResult = await state!.t.mutation(api.inventory.releaseReservation, {
            reservationId,
            reason,
          });
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      }
    );

    Then("the command should succeed", () => {
      if (state!.lastError) {
        throw new Error(`Command failed with error: ${state!.lastError.message}`);
      }
      const result = state!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });

    // NOTE: Reservation status and stock verification is done in integration tests only.
    // Projections don't run in unit tests (convex-test).
  });

  Scenario(
    "Can release confirmed reservation (for order cancellation)",
    ({ Given, When, Then }) => {
      Given(
        "a confirmed reservation {string} exists for order {string}",
        async (_ctx: unknown, reservationId: string, orderId: string) => {
          state!.scenario.reservationId = reservationId;

          // Create product first
          await state!.t.mutation(api.testing.createTestProduct, {
            productId: "prod_release_002",
            productName: "Test Product",
            sku: generateSku(),
            availableQuantity: 50,
          });

          await state!.t.mutation(api.testing.createTestReservation, {
            reservationId,
            orderId,
            items: [{ productId: "prod_release_002", quantity: 10 }],
            status: "confirmed",
          });
        }
      );

      When(
        "I send a ReleaseReservation command for {string} with reason {string}",
        async (_ctx: unknown, reservationId: string, reason: string) => {
          try {
            state!.lastResult = await state!.t.mutation(api.inventory.releaseReservation, {
              reservationId,
              reason,
            });
            state!.lastError = null;
          } catch (error) {
            state!.lastError = error as Error;
            state!.lastResult = null;
          }
        }
      );

      Then("the command should succeed", () => {
        if (state!.lastError) {
          throw new Error(`Command failed with error: ${state!.lastError.message}`);
        }
        const result = state!.lastResult as { status: string };
        expect(result.status).toBe("success");
      });
    }
  );

  Scenario("ReleaseReservation is idempotent with same commandId", ({ Given, When, Then }) => {
    Given(
      "a pending reservation {string} exists for order {string}",
      async (_ctx: unknown, reservationId: string, orderId: string) => {
        state!.scenario.reservationId = reservationId;

        // Create product first
        await state!.t.mutation(api.testing.createTestProduct, {
          productId: "prod_release_003",
          productName: "Test Product",
          sku: generateSku(),
          availableQuantity: 50,
          reservedQuantity: 10,
        });

        await state!.t.mutation(api.testing.createTestReservation, {
          reservationId,
          orderId,
          items: [{ productId: "prod_release_003", quantity: 10 }],
          status: "pending",
        });
      }
    );

    When(
      "I send a ReleaseReservation command twice with the same commandId for {string}",
      async (_ctx: unknown, reservationId: string) => {
        const commandId = generateCommandId();
        const reason = "Order cancelled";

        // First call
        const result1 = await state!.t.mutation(api.inventory.releaseReservation, {
          reservationId,
          reason,
          commandId,
        });

        // Second call with same commandId
        const result2 = await state!.t.mutation(api.inventory.releaseReservation, {
          reservationId,
          reason,
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
