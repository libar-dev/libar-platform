/**
 * Order Evolve Step Definitions
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
  evolveCreateOrder,
  evolveAddOrderItem,
  evolveRemoveOrderItem,
  evolveSubmitOrder,
  evolveConfirmOrder,
  evolveCancelOrder,
} from "../../../convex/contexts/orders/domain/deciders";
import type { OrderCMS, OrderItem } from "../../../convex/contexts/orders/domain/order";
import type {
  OrderCreatedEvent,
  OrderItemAddedEvent,
  OrderItemRemovedEvent,
  OrderSubmittedEvent,
  OrderConfirmedEvent,
  OrderCancelledEvent,
} from "../../../convex/contexts/orders/domain/deciders";
import {
  type DataTableRow,
  createOrderCMS,
  createTestItems,
  tableRowsToObject,
} from "./decider.helpers";

// =============================================================================
// Module-level state (reset per scenario)
// =============================================================================

interface EvolveScenarioState {
  orderState: OrderCMS | null;
  evolvedState: OrderCMS | null;
}

let state: EvolveScenarioState | null = null;

function initEvolveState(): EvolveScenarioState {
  return {
    orderState: null,
    evolvedState: null,
  };
}

// =============================================================================
// Order Evolve Tests
// =============================================================================

const evolveFeature = await loadFeature("tests/features/behavior/deciders/order-evolve.feature");

describeFeature(evolveFeature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the evolve functions are available", () => {
      state = initEvolveState();
    });
  });

  // ==========================================================================
  // OrderCreated Evolve
  // ==========================================================================

  Scenario("OrderCreated evolves null to initial state", ({ Given, When, Then, And }) => {
    Given("no prior order state", () => {
      state!.orderState = null;
    });

    When("OrderCreated event is applied:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const event: OrderCreatedEvent = {
        eventType: "OrderCreated" as const,
        payload: {
          orderId: data.orderId,
          customerId: data.customerId,
        },
      };
      state!.evolvedState = evolveCreateOrder(null, event);
    });

    Then("state should have orderId {string}", (_ctx: unknown, orderId: string) => {
      expect(state!.evolvedState!.orderId).toBe(orderId);
    });

    And("state should have customerId {string}", (_ctx: unknown, customerId: string) => {
      expect(state!.evolvedState!.customerId).toBe(customerId);
    });

    And("state should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedState!.status).toBe(status);
    });

    And("state should have empty items", () => {
      expect(state!.evolvedState!.items).toHaveLength(0);
    });

    And("state should have totalAmount {int}", (_ctx: unknown, total: number) => {
      expect(state!.evolvedState!.totalAmount).toBe(total);
    });
  });

  // ==========================================================================
  // OrderItemAdded Evolve
  // ==========================================================================

  Scenario("OrderItemAdded appends item to empty order", ({ Given, When, Then, And }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.orderState = createOrderCMS({
        orderId: data.orderId || "ord_test",
        status: (data.status as OrderCMS["status"]) || "draft",
        items: data.itemCount ? createTestItems(parseInt(data.itemCount, 10)) : [],
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : 0,
      });
    });

    When("OrderItemAdded event is applied:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const item: OrderItem = {
        productId: data.productId,
        productName: data.productName,
        quantity: parseInt(data.quantity, 10),
        unitPrice: parseFloat(data.unitPrice),
      };
      const event: OrderItemAddedEvent = {
        eventType: "OrderItemAdded" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          item,
          newTotalAmount: parseFloat(data.newTotalAmount),
        },
      };
      state!.evolvedState = evolveAddOrderItem(state!.orderState!, event);
    });

    Then("state should have {int} items", (_ctx: unknown, count: number) => {
      expect(state!.evolvedState!.items).toHaveLength(count);
    });

    And("state should have totalAmount {string}", (_ctx: unknown, total: string) => {
      expect(state!.evolvedState!.totalAmount).toBe(parseFloat(total));
    });

    And("state should have item with productId {string}", (_ctx: unknown, productId: string) => {
      const hasItem = state!.evolvedState!.items.some((item) => item.productId === productId);
      expect(hasItem).toBe(true);
    });
  });

  Scenario("OrderItemAdded accumulates with existing items", ({ Given, When, Then, And }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const itemCount = data.itemCount ? parseInt(data.itemCount, 10) : 0;
      state!.orderState = createOrderCMS({
        orderId: data.orderId || "ord_test",
        status: (data.status as OrderCMS["status"]) || "draft",
        items: createTestItems(itemCount),
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : 0,
      });
    });

    When("OrderItemAdded event is applied:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const item: OrderItem = {
        productId: data.productId,
        productName: data.productName,
        quantity: parseInt(data.quantity, 10),
        unitPrice: parseFloat(data.unitPrice),
      };
      const event: OrderItemAddedEvent = {
        eventType: "OrderItemAdded" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          item,
          newTotalAmount: parseFloat(data.newTotalAmount),
        },
      };
      state!.evolvedState = evolveAddOrderItem(state!.orderState!, event);
    });

    Then("state should have {int} items", (_ctx: unknown, count: number) => {
      expect(state!.evolvedState!.items).toHaveLength(count);
    });

    And("state should have totalAmount {string}", (_ctx: unknown, total: string) => {
      expect(state!.evolvedState!.totalAmount).toBe(parseFloat(total));
    });
  });

  // ==========================================================================
  // OrderItemRemoved Evolve
  // ==========================================================================

  Scenario("OrderItemRemoved removes item and updates total", ({ Given, When, Then, And }) => {
    Given("an order state with item:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const item: OrderItem = {
        productId: data.productId,
        productName: data.productName,
        quantity: parseInt(data.quantity, 10),
        unitPrice: parseFloat(data.unitPrice),
      };
      state!.orderState = createOrderCMS({
        status: "draft",
        items: [item],
        totalAmount: item.quantity * item.unitPrice,
      });
    });

    When("OrderItemRemoved event is applied:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const event: OrderItemRemovedEvent = {
        eventType: "OrderItemRemoved" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          productId: data.productId,
          newTotalAmount: parseFloat(data.newTotalAmount),
        },
      };
      state!.evolvedState = evolveRemoveOrderItem(state!.orderState!, event);
    });

    Then("state should have {int} items", (_ctx: unknown, count: number) => {
      expect(state!.evolvedState!.items).toHaveLength(count);
    });

    And("state should have totalAmount {int}", (_ctx: unknown, total: number) => {
      expect(state!.evolvedState!.totalAmount).toBe(total);
    });
  });

  // ==========================================================================
  // OrderSubmitted Evolve
  // ==========================================================================

  Scenario("OrderSubmitted changes status to submitted", ({ Given, When, Then }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.orderState = createOrderCMS({
        status: (data.status as OrderCMS["status"]) || "draft",
      });
    });

    When("OrderSubmitted event is applied", () => {
      const event: OrderSubmittedEvent = {
        eventType: "OrderSubmitted" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          customerId: state!.orderState!.customerId,
          items: state!.orderState!.items,
          totalAmount: state!.orderState!.totalAmount,
          submittedAt: Date.now(),
        },
      };
      state!.evolvedState = evolveSubmitOrder(state!.orderState!, event);
    });

    Then("state should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedState!.status).toBe(status);
    });
  });

  // ==========================================================================
  // OrderConfirmed Evolve
  // ==========================================================================

  Scenario("OrderConfirmed changes status to confirmed", ({ Given, When, Then }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.orderState = createOrderCMS({
        status: (data.status as OrderCMS["status"]) || "submitted",
      });
    });

    When("OrderConfirmed event is applied", () => {
      const event: OrderConfirmedEvent = {
        eventType: "OrderConfirmed" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          confirmedAt: Date.now(),
        },
      };
      state!.evolvedState = evolveConfirmOrder(state!.orderState!, event);
    });

    Then("state should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedState!.status).toBe(status);
    });
  });

  // ==========================================================================
  // OrderCancelled Evolve
  // ==========================================================================

  Scenario("OrderCancelled changes status from draft to cancelled", ({ Given, When, Then }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.orderState = createOrderCMS({
        status: (data.status as OrderCMS["status"]) || "draft",
      });
    });

    When("OrderCancelled event is applied", () => {
      const event: OrderCancelledEvent = {
        eventType: "OrderCancelled" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          reason: "Test cancellation",
        },
      };
      state!.evolvedState = evolveCancelOrder(state!.orderState!, event);
    });

    Then("state should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedState!.status).toBe(status);
    });
  });

  Scenario("OrderCancelled changes status from submitted to cancelled", ({ Given, When, Then }) => {
    Given("an order state with:", (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      state!.orderState = createOrderCMS({
        status: (data.status as OrderCMS["status"]) || "submitted",
      });
    });

    When("OrderCancelled event is applied", () => {
      const event: OrderCancelledEvent = {
        eventType: "OrderCancelled" as const,
        payload: {
          orderId: state!.orderState!.orderId,
          reason: "Test cancellation",
        },
      };
      state!.evolvedState = evolveCancelOrder(state!.orderState!, event);
    });

    Then("state should have status {string}", (_ctx: unknown, status: string) => {
      expect(state!.evolvedState!.status).toBe(status);
    });
  });
});
