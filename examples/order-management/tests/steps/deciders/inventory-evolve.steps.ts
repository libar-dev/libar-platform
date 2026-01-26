/**
 * Inventory Evolve Step Definitions
 *
 * BDD step definitions for testing pure evolve functions.
 * NO convex-test, NO database - pure TypeScript function testing.
 *
 * These tests validate state evolution in isolation:
 * - Given: Create state and event objects
 * - When: Call pure evolve functions
 * - Then: Assert on new state
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  evolveCreateProduct,
  evolveAddStock,
  evolveReserveStockForProduct,
  evolveReservationFailed,
  evolveConfirmReservation,
  evolveReleaseReservation,
  evolveExpireReservation,
} from "../../../convex/contexts/inventory/domain/deciders";
import type {
  ProductCreatedEvent,
  StockAddedEvent,
  StockReservedEvent,
  ReservationFailedEvent,
  ReservationConfirmedEvent,
  ReservationReleasedEvent,
  ReservationExpiredEvent,
} from "../../../convex/contexts/inventory/domain/deciders";
import type { InventoryCMS } from "../../../convex/contexts/inventory/domain/inventory";
import type { ReservationCMS } from "../../../convex/contexts/inventory/domain/reservation";
import {
  type DataTableRow,
  tableRowsToObject,
  createInventoryStateFromTable,
  createReservationStateFromTable,
} from "./decider.helpers";

// =============================================================================
// Module-level state (reset per scenario)
// =============================================================================

interface EvolveScenarioState {
  inventoryState: InventoryCMS | null;
  reservationState: ReservationCMS | null;
  evolvedInventoryState: InventoryCMS | null;
  evolvedReservationState: ReservationCMS | null;
}

let state: EvolveScenarioState | null = null;

function initEvolveState(): EvolveScenarioState {
  return {
    inventoryState: null,
    reservationState: null,
    evolvedInventoryState: null,
    evolvedReservationState: null,
  };
}

// =============================================================================
// Inventory Evolve Tests
// =============================================================================

const inventoryEvolveFeature = await loadFeature(
  "tests/features/behavior/deciders/inventory-evolve.feature"
);

describeFeature(inventoryEvolveFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initEvolveState();
    });
  });

  // ==========================================================================
  // ProductCreated Evolve
  // ==========================================================================

  Scenario("Evolve null state with ProductCreated event", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I evolve with ProductCreated event:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const now = Date.now();
      const event: ProductCreatedEvent = {
        eventType: "ProductCreated" as const,
        payload: {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
          createdAt: now,
        },
      };
      state!.evolvedInventoryState = evolveCreateProduct(null, event);
    });

    Then("the evolved state should have productId {string}", (_ctx: unknown, productId: string) => {
      expect(state!.evolvedInventoryState!.productId).toBe(productId);
    });

    And(
      "the evolved state should have productName {string}",
      (_ctx: unknown, productName: string) => {
        expect(state!.evolvedInventoryState!.productName).toBe(productName);
      }
    );

    And("the evolved state should have sku {string}", (_ctx: unknown, sku: string) => {
      expect(state!.evolvedInventoryState!.sku).toBe(sku);
    });

    And("the evolved state should have unitPrice {string}", (_ctx: unknown, unitPrice: string) => {
      expect(state!.evolvedInventoryState!.unitPrice).toBe(parseFloat(unitPrice));
    });

    And("the evolved state should have availableQuantity {int}", (_ctx: unknown, qty: number) => {
      expect(state!.evolvedInventoryState!.availableQuantity).toBe(qty);
    });

    And("the evolved state should have reservedQuantity {int}", (_ctx: unknown, qty: number) => {
      expect(state!.evolvedInventoryState!.reservedQuantity).toBe(qty);
    });

    And("the evolved state should have version {int}", (_ctx: unknown, version: number) => {
      expect(state!.evolvedInventoryState!.version).toBe(version);
    });
  });

  // ==========================================================================
  // StockAdded Evolve
  // ==========================================================================

  Scenario("Evolve inventory state with StockAdded event", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When(
      "I evolve with StockAdded event with quantity {int}",
      (_ctx: unknown, quantity: number) => {
        const event: StockAddedEvent = {
          eventType: "StockAdded" as const,
          payload: {
            productId: state!.inventoryState!.productId,
            quantity,
            newAvailableQuantity: state!.inventoryState!.availableQuantity + quantity,
          },
        };
        state!.evolvedInventoryState = evolveAddStock(state!.inventoryState!, event);
      }
    );

    Then(
      "the evolved state should have availableQuantity {int}",
      (_ctx: unknown, expected: number) => {
        expect(state!.evolvedInventoryState!.availableQuantity).toBe(expected);
      }
    );

    And(
      "the evolved state should have reservedQuantity {int}",
      (_ctx: unknown, expected: number) => {
        expect(state!.evolvedInventoryState!.reservedQuantity).toBe(expected);
      }
    );
  });

  Scenario("Evolve inventory from zero stock", ({ Given, When, Then }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When(
      "I evolve with StockAdded event with quantity {int}",
      (_ctx: unknown, quantity: number) => {
        const event: StockAddedEvent = {
          eventType: "StockAdded" as const,
          payload: {
            productId: state!.inventoryState!.productId,
            quantity,
            newAvailableQuantity: state!.inventoryState!.availableQuantity + quantity,
          },
        };
        state!.evolvedInventoryState = evolveAddStock(state!.inventoryState!, event);
      }
    );

    Then(
      "the evolved state should have availableQuantity {int}",
      (_ctx: unknown, expected: number) => {
        expect(state!.evolvedInventoryState!.availableQuantity).toBe(expected);
      }
    );
  });

  // ==========================================================================
  // StockReserved Evolve (Hybrid Pattern)
  // ==========================================================================

  Scenario("Evolve inventory state with StockReserved event", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When(
      "I evolve with StockReserved event for productId {string} with quantity {int}",
      (_ctx: unknown, productId: string, quantity: number) => {
        const event: StockReservedEvent = {
          eventType: "StockReserved" as const,
          payload: {
            reservationId: "res_test_001",
            orderId: "ord_test_001",
            items: [{ productId, quantity }],
            expiresAt: Date.now() + 300000,
          },
        };
        state!.evolvedInventoryState = evolveReserveStockForProduct(
          state!.inventoryState!,
          event,
          state!.inventoryState!.productId
        );
      }
    );

    Then(
      "the evolved state should have availableQuantity {int}",
      (_ctx: unknown, expected: number) => {
        expect(state!.evolvedInventoryState!.availableQuantity).toBe(expected);
      }
    );

    And(
      "the evolved state should have reservedQuantity {int}",
      (_ctx: unknown, expected: number) => {
        expect(state!.evolvedInventoryState!.reservedQuantity).toBe(expected);
      }
    );
  });

  Scenario(
    "Evolve inventory state when product not in reservation",
    ({ Given, When, Then, And }) => {
      Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
        state!.inventoryState = createInventoryStateFromTable(table);
      });

      When(
        "I evolve with StockReserved event for productId {string} with quantity {int}",
        (_ctx: unknown, productId: string, quantity: number) => {
          const event: StockReservedEvent = {
            eventType: "StockReserved" as const,
            payload: {
              reservationId: "res_test_001",
              orderId: "ord_test_001",
              items: [{ productId, quantity }],
              expiresAt: Date.now() + 300000,
            },
          };
          // Use the inventory state's productId, not the event's productId
          // This tests the case where the product is NOT in the reservation
          state!.evolvedInventoryState = evolveReserveStockForProduct(
            state!.inventoryState!,
            event,
            state!.inventoryState!.productId
          );
        }
      );

      Then(
        "the evolved state should have availableQuantity {int}",
        (_ctx: unknown, expected: number) => {
          expect(state!.evolvedInventoryState!.availableQuantity).toBe(expected);
        }
      );

      And(
        "the evolved state should have reservedQuantity {int}",
        (_ctx: unknown, expected: number) => {
          expect(state!.evolvedInventoryState!.reservedQuantity).toBe(expected);
        }
      );
    }
  );

  // ==========================================================================
  // ReservationFailed Evolve
  // ==========================================================================

  Scenario(
    "Evolve inventory state with ReservationFailed event (no change)",
    ({ Given, When, Then, And }) => {
      Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
        state!.inventoryState = createInventoryStateFromTable(table);
      });

      When("I evolve with ReservationFailed event", () => {
        const event: ReservationFailedEvent = {
          eventType: "ReservationFailed" as const,
          payload: {
            orderId: "ord_test_001",
            reason: "Insufficient stock",
            failedItems: [
              {
                productId: state!.inventoryState!.productId,
                requestedQuantity: 100,
                availableQuantity: state!.inventoryState!.availableQuantity,
              },
            ],
          },
        };
        state!.evolvedInventoryState = evolveReservationFailed(state!.inventoryState!, event);
      });

      Then(
        "the evolved state should have availableQuantity {int}",
        (_ctx: unknown, expected: number) => {
          expect(state!.evolvedInventoryState!.availableQuantity).toBe(expected);
        }
      );

      And(
        "the evolved state should have reservedQuantity {int}",
        (_ctx: unknown, expected: number) => {
          expect(state!.evolvedInventoryState!.reservedQuantity).toBe(expected);
        }
      );
    }
  );
});

// =============================================================================
// Reservation Evolve Tests
// =============================================================================

const reservationEvolveFeature = await loadFeature(
  "tests/features/behavior/deciders/reservation-evolve.feature"
);

describeFeature(reservationEvolveFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initEvolveState();
    });
  });

  // ==========================================================================
  // ReservationConfirmed Evolve
  // ==========================================================================

  Scenario("Evolve reservation state with ReservationConfirmed", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I evolve with ReservationConfirmed event", () => {
      const event: ReservationConfirmedEvent = {
        eventType: "ReservationConfirmed" as const,
        payload: {
          reservationId: state!.reservationState!.reservationId,
          orderId: state!.reservationState!.orderId,
          items: state!.reservationState!.items,
        },
      };
      state!.evolvedReservationState = evolveConfirmReservation(state!.reservationState!, event);
    });

    Then("the evolved reservation should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedReservationState!.status).toBe(status);
    });

    And(
      "the evolved reservation should have reservationId {string}",
      (_ctx: unknown, reservationId: string) => {
        expect(state!.evolvedReservationState!.reservationId).toBe(reservationId);
      }
    );
  });

  // ==========================================================================
  // ReservationReleased Evolve
  // ==========================================================================

  Scenario("Evolve pending reservation with ReservationReleased", ({ Given, When, Then }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I evolve with ReservationReleased event", () => {
      const event: ReservationReleasedEvent = {
        eventType: "ReservationReleased" as const,
        payload: {
          reservationId: state!.reservationState!.reservationId,
          orderId: state!.reservationState!.orderId,
          reason: "Order cancelled",
          items: state!.reservationState!.items,
        },
      };
      state!.evolvedReservationState = evolveReleaseReservation(state!.reservationState!, event);
    });

    Then("the evolved reservation should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedReservationState!.status).toBe(status);
    });
  });

  Scenario("Evolve confirmed reservation with ReservationReleased", ({ Given, When, Then }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I evolve with ReservationReleased event", () => {
      const event: ReservationReleasedEvent = {
        eventType: "ReservationReleased" as const,
        payload: {
          reservationId: state!.reservationState!.reservationId,
          orderId: state!.reservationState!.orderId,
          reason: "Order cancelled after confirmation",
          items: state!.reservationState!.items,
        },
      };
      state!.evolvedReservationState = evolveReleaseReservation(state!.reservationState!, event);
    });

    Then("the evolved reservation should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedReservationState!.status).toBe(status);
    });
  });

  // ==========================================================================
  // ReservationExpired Evolve
  // ==========================================================================

  Scenario("Evolve pending reservation with ReservationExpired", ({ Given, When, Then }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I evolve with ReservationExpired event", () => {
      const event: ReservationExpiredEvent = {
        eventType: "ReservationExpired" as const,
        payload: {
          reservationId: state!.reservationState!.reservationId,
          orderId: state!.reservationState!.orderId,
          items: state!.reservationState!.items,
        },
      };
      state!.evolvedReservationState = evolveExpireReservation(state!.reservationState!, event);
    });

    Then("the evolved reservation should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedReservationState!.status).toBe(status);
    });
  });
});
