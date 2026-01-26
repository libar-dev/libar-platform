/**
 * Order Decider Step Definitions
 *
 * BDD step definitions for testing pure decider functions.
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
  decideCreateOrder,
  decideAddOrderItem,
  decideRemoveOrderItem,
  decideSubmitOrder,
  decideConfirmOrder,
  decideCancelOrder,
} from "../../../convex/contexts/orders/domain/deciders";
import type { OrderItem } from "../../../convex/contexts/orders/domain/order";
import {
  type DeciderScenarioState,
  type DataTableRow,
  initDeciderState,
  createOrderStateFromTable,
  createOrderCMS,
  createTestItems,
  assertEventType,
  assertEventPayload,
  assertStateUpdate,
  assertRejectionCode,
} from "./decider.helpers";

// =============================================================================
// Module-level state (reset per scenario)
// =============================================================================

let state: DeciderScenarioState | null = null;

// =============================================================================
// Submit Order Decider Tests
// =============================================================================

const submitOrderFeature = await loadFeature(
  "tests/features/behavior/deciders/submit-order.decider.feature"
);

describeFeature(submitOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context with timestamp {int}", (_ctx: unknown, timestamp: number) => {
      state = initDeciderState();
      state.context.now = timestamp;
    });
  });

  Scenario("Decide to submit draft order with items", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to submit the order", () => {
      state!.result = decideSubmitOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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
      "the event payload should contain {string} with value {int}",
      (_ctx: unknown, field: string, value: number) => {
        assertEventPayload(state!.result, field, value);
      }
    );

    And("the state update should set status to {string}", (_ctx: unknown, status: string) => {
      assertStateUpdate(state!.result, "status", status);
    });
  });

  Scenario("Reject submit for order not in draft status", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to submit the order", () => {
      state!.result = decideSubmitOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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

  Scenario("Reject submit for order with no items", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to submit the order", () => {
      state!.result = decideSubmitOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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
// Create Order Decider Tests
// =============================================================================

const createOrderFeature = await loadFeature(
  "tests/features/behavior/deciders/create-order.decider.feature"
);

describeFeature(createOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initDeciderState();
    });
  });

  Scenario("Decide to create a new order when none exists", ({ Given, When, Then, And }) => {
    Given("no existing order state", () => {
      state!.orderState = null;
    });

    When(
      "I decide to create order with orderId {string} and customerId {string}",
      (_ctx: unknown, orderId: string, customerId: string) => {
        state!.result = decideCreateOrder(null, { orderId, customerId }, state!.context);
      }
    );

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the data should contain orderId {string}", (_ctx: unknown, orderId: string) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { orderId: string }).orderId).toBe(orderId);
      }
    });
  });

  Scenario("Reject create when order already exists", ({ Given, When, Then, And }) => {
    Given("an existing order state with orderId {string}", (_ctx: unknown, orderId: string) => {
      state!.orderState = createOrderCMS({ orderId });
    });

    When(
      "I decide to create order with orderId {string} and customerId {string}",
      (_ctx: unknown, orderId: string, customerId: string) => {
        state!.result = decideCreateOrder(
          state!.orderState,
          { orderId, customerId },
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
// Add Order Item Decider Tests
// =============================================================================

const addOrderItemFeature = await loadFeature(
  "tests/features/behavior/deciders/add-order-item.decider.feature"
);

describeFeature(addOrderItemFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initDeciderState();
    });
  });

  Scenario("Decide to add item to draft order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to add item:", (_ctx: unknown, table: DataTableRow[]) => {
      const itemData = table.reduce(
        (acc, row) => {
          acc[row.field] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );

      const item: OrderItem = {
        productId: itemData.productId,
        productName: itemData.productName,
        quantity: parseInt(itemData.quantity, 10),
        unitPrice: parseFloat(itemData.unitPrice),
      };

      state!.result = decideAddOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, item },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the data should have itemCount {int}", (_ctx: unknown, itemCount: number) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { itemCount: number }).itemCount).toBe(itemCount);
      }
    });

    And("the data should have totalAmount {string}", (_ctx: unknown, total: string) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { totalAmount: number }).totalAmount).toBe(
          parseFloat(total)
        );
      }
    });
  });

  Scenario("Reject add item when order is not in draft", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to add any item", () => {
      const item: OrderItem = {
        productId: "prod_test",
        productName: "Test Product",
        quantity: 1,
        unitPrice: 10.0,
      };

      state!.result = decideAddOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, item },
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

  Scenario("Reject add item with invalid quantity", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to add item with negative quantity:", (_ctx: unknown, table: DataTableRow[]) => {
      const itemData = table.reduce(
        (acc, row) => {
          acc[row.field] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );

      const item: OrderItem = {
        productId: itemData.productId,
        productName: itemData.productName,
        quantity: parseInt(itemData.quantity, 10),
        unitPrice: parseFloat(itemData.unitPrice),
      };

      state!.result = decideAddOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, item },
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

  Scenario("Accumulate items and recalculate total", ({ Given, When, Then, And }) => {
    Given("an order state with existing items:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to add item:", (_ctx: unknown, table: DataTableRow[]) => {
      const itemData = table.reduce(
        (acc, row) => {
          acc[row.field] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );

      const item: OrderItem = {
        productId: itemData.productId,
        productName: itemData.productName,
        quantity: parseInt(itemData.quantity, 10),
        unitPrice: parseFloat(itemData.unitPrice),
      };

      state!.result = decideAddOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, item },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the data should have itemCount {int}", (_ctx: unknown, itemCount: number) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { itemCount: number }).itemCount).toBe(itemCount);
      }
    });

    And("the data should have totalAmount {string}", (_ctx: unknown, total: string) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { totalAmount: number }).totalAmount).toBe(
          parseFloat(total)
        );
      }
    });
  });
});

// =============================================================================
// Remove Order Item Decider Tests
// =============================================================================

const removeOrderItemFeature = await loadFeature(
  "tests/features/behavior/deciders/remove-order-item.decider.feature"
);

describeFeature(removeOrderItemFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initDeciderState();
    });
  });

  Scenario("Decide to remove existing item from draft order", ({ Given, When, Then, And }) => {
    Given("an order state with item:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = table.reduce(
        (acc, row) => {
          acc[row.field] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );

      const item: OrderItem = {
        productId: data.productId,
        productName: data.productName || "Test Product",
        quantity: parseInt(data.quantity || "1", 10),
        unitPrice: parseFloat(data.unitPrice || "20.00"),
      };

      state!.orderState = createOrderCMS({
        status: "draft",
        items: [item],
        totalAmount: item.quantity * item.unitPrice,
      });
    });

    When("I decide to remove item with productId {string}", (_ctx: unknown, productId: string) => {
      state!.result = decideRemoveOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, productId },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the data should have itemCount {int}", (_ctx: unknown, itemCount: number) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { itemCount: number }).itemCount).toBe(itemCount);
      }
    });

    And("the data should have totalAmount {string}", (_ctx: unknown, total: string) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { totalAmount: number }).totalAmount).toBe(
          parseFloat(total)
        );
      }
    });
  });

  Scenario("Reject remove item when order is not in draft", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
      // Add an item to remove
      state!.orderState.items = createTestItems(1);
    });

    When("I decide to remove item with productId {string}", (_ctx: unknown, productId: string) => {
      state!.result = decideRemoveOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, productId },
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

  Scenario("Reject remove when item does not exist", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to remove item with productId {string}", (_ctx: unknown, productId: string) => {
      state!.result = decideRemoveOrderItem(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, productId },
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
// Confirm Order Decider Tests
// =============================================================================

const confirmOrderFeature = await loadFeature(
  "tests/features/behavior/deciders/confirm-order.decider.feature"
);

describeFeature(confirmOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context with timestamp {int}", (_ctx: unknown, timestamp: number) => {
      state = initDeciderState();
      state.context.now = timestamp;
    });
  });

  Scenario("Decide to confirm a submitted order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to confirm the order", () => {
      state!.result = decideConfirmOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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
      "the event payload should contain {string} with value {int}",
      (_ctx: unknown, field: string, value: number) => {
        assertEventPayload(state!.result, field, value);
      }
    );

    And("the state update should set status to {string}", (_ctx: unknown, status: string) => {
      assertStateUpdate(state!.result, "status", status);
    });
  });

  Scenario("Reject confirm for order in draft status", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to confirm the order", () => {
      state!.result = decideConfirmOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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

  Scenario("Reject confirm for already confirmed order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to confirm the order", () => {
      state!.result = decideConfirmOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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

  Scenario("Reject confirm for cancelled order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to confirm the order", () => {
      state!.result = decideConfirmOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId },
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
// Cancel Order Decider Tests
// =============================================================================

const cancelOrderFeature = await loadFeature(
  "tests/features/behavior/deciders/cancel-order.decider.feature"
);

describeFeature(cancelOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("a decider context", () => {
      state = initDeciderState();
    });
  });

  Scenario("Decide to cancel a draft order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to cancel the order with reason {string}", (_ctx: unknown, reason: string) => {
      state!.result = decideCancelOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, reason },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the state update should set status to {string}", (_ctx: unknown, status: string) => {
      assertStateUpdate(state!.result, "status", status);
    });

    And("the data should contain reason {string}", (_ctx: unknown, reason: string) => {
      if (state!.result!.status === "success") {
        expect((state!.result!.data as { reason: string }).reason).toBe(reason);
      }
    });
  });

  Scenario("Decide to cancel a submitted order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to cancel the order with reason {string}", (_ctx: unknown, reason: string) => {
      state!.result = decideCancelOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, reason },
        state!.context
      );
    });

    Then("the decision should be {string}", (_ctx: unknown, expectedStatus: string) => {
      expect(state!.result!.status).toBe(expectedStatus);
    });

    And("the event type should be {string}", (_ctx: unknown, eventType: string) => {
      assertEventType(state!.result, eventType);
    });

    And("the state update should set status to {string}", (_ctx: unknown, status: string) => {
      assertStateUpdate(state!.result, "status", status);
    });
  });

  Scenario("Reject cancel for confirmed order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to cancel the order with reason {string}", (_ctx: unknown, reason: string) => {
      state!.result = decideCancelOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, reason },
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

  Scenario("Reject cancel for already cancelled order", ({ Given, When, Then, And }) => {
    Given("an order state:", (_ctx: unknown, table: DataTableRow[]) => {
      state!.orderState = createOrderStateFromTable(table);
    });

    When("I decide to cancel the order with reason {string}", (_ctx: unknown, reason: string) => {
      state!.result = decideCancelOrder(
        state!.orderState!,
        { orderId: state!.orderState!.orderId, reason },
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
