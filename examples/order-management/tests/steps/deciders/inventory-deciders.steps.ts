/**
 * Inventory Decider Step Definitions
 *
 * BDD step definitions for testing pure Inventory decider functions.
 * NO convex-test, NO database - pure TypeScript function testing.
 *
 * These tests validate domain logic in isolation:
 * - Given: Create state objects
 * - When: Call pure decider functions
 * - Then: Assert on DeciderOutput
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  decideCreateProduct,
  decideAddStock,
  decideReserveStock,
  decideConfirmReservation,
  decideReleaseReservation,
  decideExpireReservation,
} from "../../../convex/contexts/inventory/domain/deciders";
import type { InventoryCMS } from "../../../convex/contexts/inventory/domain/inventory";
import type {
  ReservationCMS,
  ReservationItem,
} from "../../../convex/contexts/inventory/domain/reservation";
import type { DeciderContext, DeciderOutput } from "@libar-dev/platform-core/decider";
import {
  type DataTableRow,
  createInventoryCMS,
  createInventoryStateFromTable,
  createReservationStateFromTable,
  assertEventType,
  assertRejectionCode,
  tableRowsToObject,
} from "./decider.helpers";

// =============================================================================
// Extended State for Inventory Tests
// =============================================================================

interface InventoryDeciderState {
  context: DeciderContext;
  inventoryState: InventoryCMS | null;
  reservationState: ReservationCMS | null;
  productsMap: Map<string, InventoryCMS>;
  command: Record<string, unknown>;
  result: DeciderOutput<unknown, unknown, unknown> | null;
}

function initInventoryState(): InventoryDeciderState {
  return {
    context: {
      now: Date.now(),
      commandId: "cmd_test_001",
      correlationId: "corr_test_001",
    },
    inventoryState: null,
    reservationState: null,
    productsMap: new Map(),
    command: {},
    result: null,
  };
}

// =============================================================================
// Module-level state (reset per scenario)
// =============================================================================

let state: InventoryDeciderState | null = null;

// =============================================================================
// CreateProduct Decider Tests
// =============================================================================

const createProductFeature = await loadFeature(
  "tests/features/behavior/deciders/create-product.decider.feature"
);

describeFeature(createProductFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario("Decide to create a new product when none exists", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the data should contain productId {string}", (_ctx: unknown, productId: string) => {
      if (state!.result!.status === "success") {
        const data = state!.result!.data as { productId: string };
        expect(data.productId).toBe(productId);
      }
    });
  });

  Scenario("Reject create when product already exists", ({ Given, When, Then, And }) => {
    Given(
      "an existing inventory state with productId {string}",
      (_ctx: unknown, productId: string) => {
        state!.inventoryState = createInventoryCMS({ productId });
      }
    );

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject create with empty product name", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName || "",
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject create with empty SKU", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku || "",
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject create with zero price", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject create with negative price", ({ Given, When, Then, And }) => {
    Given("no existing inventory state", () => {
      state!.inventoryState = null;
    });

    When("I decide to create product with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.result = decideCreateProduct(
        state!.inventoryState,
        {
          productId: data.productId,
          productName: data.productName,
          sku: data.sku,
          unitPrice: parseFloat(data.unitPrice),
        },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });
});

// =============================================================================
// AddStock Decider Tests
// =============================================================================

const addStockFeature = await loadFeature(
  "tests/features/behavior/deciders/add-stock.decider.feature"
);

describeFeature(addStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario("Decide to add stock to product", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When("I decide to add stock with quantity {int}", (_ctx: unknown, quantity: number) => {
      state!.result = decideAddStock(
        state!.inventoryState!,
        { productId: state!.inventoryState!.productId, quantity },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the data should have newAvailableQuantity {int}", (_ctx: unknown, expected: number) => {
      if (state!.result!.status === "success") {
        const data = state!.result!.data as { newAvailableQuantity: number };
        expect(data.newAvailableQuantity).toBe(expected);
      }
    });

    And("the data should have quantity {int}", (_ctx: unknown, expected: number) => {
      if (state!.result!.status === "success") {
        const data = state!.result!.data as { quantity: number };
        expect(data.quantity).toBe(expected);
      }
    });
  });

  Scenario("Add stock with reason", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When(
      "I decide to add stock with quantity {int} and reason {string}",
      (_ctx: unknown, quantity: number, reason: string) => {
        state!.result = decideAddStock(
          state!.inventoryState!,
          { productId: state!.inventoryState!.productId, quantity, reason },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And(
      "the event payload should have reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (state!.result!.status === "success") {
          const event = state!.result!.event as { payload: { reason?: string } };
          expect(event.payload.reason).toBe(expectedReason);
        }
      }
    );
  });

  Scenario("Reject add stock with zero quantity", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When("I decide to add stock with quantity {int}", (_ctx: unknown, quantity: number) => {
      state!.result = decideAddStock(
        state!.inventoryState!,
        { productId: state!.inventoryState!.productId, quantity },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject add stock with negative quantity", ({ Given, When, Then, And }) => {
    Given("an inventory state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.inventoryState = createInventoryStateFromTable(table);
    });

    When("I decide to add stock with quantity {int}", (_ctx: unknown, quantity: number) => {
      state!.result = decideAddStock(
        state!.inventoryState!,
        { productId: state!.inventoryState!.productId, quantity },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });
});

// =============================================================================
// ReserveStock Decider Tests
// =============================================================================

interface ProductTableRow {
  productId: string;
  availableQuantity: string;
}

interface ItemTableRow {
  productId: string;
  quantity: string;
}

const reserveStockFeature = await loadFeature(
  "tests/features/behavior/deciders/reserve-stock.decider.feature"
);

describeFeature(reserveStockFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario(
    "Decide to reserve stock when all products have sufficient availability",
    ({ Given, When, Then, And }) => {
      Given("products with available stock:", (_ctx: unknown, table: ProductTableRow[]) => {
        state!.productsMap = new Map();
        for (const row of table) {
          state!.productsMap.set(
            row.productId,
            createInventoryCMS({
              productId: row.productId,
              availableQuantity: parseInt(row.availableQuantity, 10),
            })
          );
        }
      });

      When(
        "I decide to reserve stock for order {string} with items:",
        (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const items: ReservationItem[] = table.map((row) => ({
            productId: row.productId,
            quantity: parseInt(row.quantity, 10),
          }));
          state!.result = decideReserveStock(
            state!.productsMap,
            { orderId, items, reservationId: "res_test_001" },
            state!.context
          );
        }
      );

      Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(state!.result!.status).toBe(expectedStatus);
      });

      And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
        assertEventType(state!.result, eventType);
      });

      And("the data should have orderId {string}", (_ctx: unknown, orderId: string) => {
        if (state!.result!.status === "success") {
          const data = state!.result!.data as { orderId: string };
          expect(data.orderId).toBe(orderId);
        }
      });

      And("the data should have itemCount {int}", (_ctx: unknown, itemCount: number) => {
        if (state!.result!.status === "success") {
          const data = state!.result!.data as { itemCount: number };
          expect(data.itemCount).toBe(itemCount);
        }
      });
    }
  );

  Scenario(
    "Fail reservation when one product has insufficient stock",
    ({ Given, When, Then, And }) => {
      Given("products with available stock:", (_ctx: unknown, table: ProductTableRow[]) => {
        state!.productsMap = new Map();
        for (const row of table) {
          state!.productsMap.set(
            row.productId,
            createInventoryCMS({
              productId: row.productId,
              availableQuantity: parseInt(row.availableQuantity, 10),
            })
          );
        }
      });

      When(
        "I decide to reserve stock for order {string} with items:",
        (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
          const items: ReservationItem[] = table.map((row) => ({
            productId: row.productId,
            quantity: parseInt(row.quantity, 10),
          }));
          state!.result = decideReserveStock(
            state!.productsMap,
            { orderId, items, reservationId: "res_test_002" },
            state!.context
          );
        }
      );

      Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(state!.result!.status).toBe(expectedStatus);
      });

      And("the failure reason should contain {string}", (_ctx: unknown, reason: string) => {
        if (state!.result!.status === "failed") {
          expect(state!.result!.reason).toContain(reason);
        }
      });

      And("the failure event type should be {string}", (_ctx: unknown, eventType: string) => {
        if (state!.result!.status === "failed") {
          const event = state!.result!.event as { eventType: string };
          expect(event.eventType).toBe(eventType);
        }
      });
    }
  );

  Scenario("Fail reservation when product does not exist", ({ Given, When, Then, And }) => {
    Given("products with available stock:", (_ctx: unknown, table: ProductTableRow[]) => {
      state!.productsMap = new Map();
      for (const row of table) {
        state!.productsMap.set(
          row.productId,
          createInventoryCMS({
            productId: row.productId,
            availableQuantity: parseInt(row.availableQuantity, 10),
          })
        );
      }
    });

    When(
      "I decide to reserve stock for order {string} with items:",
      (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const items: ReservationItem[] = table.map((row) => ({
          productId: row.productId,
          quantity: parseInt(row.quantity, 10),
        }));
        state!.result = decideReserveStock(
          state!.productsMap,
          { orderId, items, reservationId: "res_test_003" },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the failure reason should contain {string}", (_ctx: unknown, reason: string) => {
      if (state!.result!.status === "failed") {
        expect(state!.result!.reason).toContain(reason);
      }
    });
  });

  Scenario("Reject reservation with empty items", ({ Given, When, Then, And }) => {
    Given("products with available stock:", (_ctx: unknown, table: ProductTableRow[]) => {
      state!.productsMap = new Map();
      for (const row of table) {
        state!.productsMap.set(
          row.productId,
          createInventoryCMS({
            productId: row.productId,
            availableQuantity: parseInt(row.availableQuantity, 10),
          })
        );
      }
    });

    When(
      "I decide to reserve stock for order {string} with empty items",
      (_ctx: unknown, orderId: string) => {
        state!.result = decideReserveStock(
          state!.productsMap,
          { orderId, items: [], reservationId: "res_test_004" },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });
});

// =============================================================================
// ConfirmReservation Decider Tests
// =============================================================================

const confirmReservationFeature = await loadFeature(
  "tests/features/behavior/deciders/confirm-reservation.decider.feature"
);

describeFeature(confirmReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario("Decide to confirm a pending reservation", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to confirm the reservation", () => {
      state!.result = decideConfirmReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the state update should have status {string}", (_ctx: unknown, expectedStatus: string) => {
      if (state!.result!.status === "success") {
        const stateUpdate = state!.result!.stateUpdate as { status: string };
        expect(stateUpdate.status).toBe(expectedStatus);
      }
    });
  });

  Scenario("Reject confirm when reservation is already confirmed", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to confirm the reservation", () => {
      state!.result = decideConfirmReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject confirm when reservation is released", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to confirm the reservation", () => {
      state!.result = decideConfirmReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject confirm when reservation is expired", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to confirm the reservation", () => {
      state!.result = decideConfirmReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario(
    "Reject confirm when reservation has passed its expiration time",
    ({ Given, When, Then, And }) => {
      Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
        state!.reservationState = createReservationStateFromTable(table);
      });

      When("I decide to confirm the reservation", () => {
        state!.result = decideConfirmReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId },
          state!.context
        );
      });

      Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(state!.result!.status).toBe(expectedStatus);
      });

      And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
        assertRejectionCode(state!.result, code);
      });
    }
  );
});

// =============================================================================
// ReleaseReservation Decider Tests
// =============================================================================

const releaseReservationFeature = await loadFeature(
  "tests/features/behavior/deciders/release-reservation.decider.feature"
);

describeFeature(releaseReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario("Decide to release a pending reservation", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When(
      "I decide to release the reservation with reason {string}",
      (_ctx: unknown, reason: string) => {
        state!.result = decideReleaseReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId, reason },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And(
      "the event payload should have reason {string}",
      (_ctx: unknown, expectedReason: string) => {
        if (state!.result!.status === "success") {
          const event = state!.result!.event as { payload: { reason: string } };
          expect(event.payload.reason).toBe(expectedReason);
        }
      }
    );

    And("the state update should have status {string}", (_ctx: unknown, expectedStatus: string) => {
      if (state!.result!.status === "success") {
        const stateUpdate = state!.result!.stateUpdate as { status: string };
        expect(stateUpdate.status).toBe(expectedStatus);
      }
    });
  });

  Scenario("Decide to release a confirmed reservation", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When(
      "I decide to release the reservation with reason {string}",
      (_ctx: unknown, reason: string) => {
        state!.result = decideReleaseReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId, reason },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the state update should have status {string}", (_ctx: unknown, expectedStatus: string) => {
      if (state!.result!.status === "success") {
        const stateUpdate = state!.result!.stateUpdate as { status: string };
        expect(stateUpdate.status).toBe(expectedStatus);
      }
    });
  });

  Scenario("Reject release when reservation is already released", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When(
      "I decide to release the reservation with reason {string}",
      (_ctx: unknown, reason: string) => {
        state!.result = decideReleaseReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId, reason },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject release when reservation is expired", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When(
      "I decide to release the reservation with reason {string}",
      (_ctx: unknown, reason: string) => {
        state!.result = decideReleaseReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId, reason },
          state!.context
        );
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });
});

// =============================================================================
// ExpireReservation Decider Tests
// =============================================================================

const expireReservationFeature = await loadFeature(
  "tests/features/behavior/deciders/expire-reservation.decider.feature"
);

describeFeature(expireReservationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initInventoryState();
    });
  });

  Scenario(
    "Decide to expire a pending reservation that has timed out",
    ({ Given, When, Then, And }) => {
      Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
        state!.reservationState = createReservationStateFromTable(table);
      });

      When("I decide to expire the reservation", () => {
        state!.result = decideExpireReservation(
          state!.reservationState!,
          { reservationId: state!.reservationState!.reservationId },
          state!.context
        );
      });

      Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
        expect(state!.result!.status).toBe(expectedStatus);
      });

      And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
        assertEventType(state!.result, eventType);
      });

      And(
        "the state update should have status {string}",
        (_ctx: unknown, expectedStatus: string) => {
          if (state!.result!.status === "success") {
            const stateUpdate = state!.result!.stateUpdate as { status: string };
            expect(stateUpdate.status).toBe(expectedStatus);
          }
        }
      );
    }
  );

  Scenario("Reject expire when reservation has not timed out yet", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to expire the reservation", () => {
      state!.result = decideExpireReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject expire when reservation is already confirmed", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to expire the reservation", () => {
      state!.result = decideExpireReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject expire when reservation is already released", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to expire the reservation", () => {
      state!.result = decideExpireReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });

  Scenario("Reject expire when reservation is already expired", ({ Given, When, Then, And }) => {
    Given("a reservation state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.reservationState = createReservationStateFromTable(table);
    });

    When("I decide to expire the reservation", () => {
      state!.result = decideExpireReservation(
        state!.reservationState!,
        { reservationId: state!.reservationState!.reservationId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the rejection code should be {string}", (_ctx: unknown, code: string) => {
      assertRejectionCode(state!.result, code);
    });
  });
});
