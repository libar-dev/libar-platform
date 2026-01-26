import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";
import type { OrderStatus } from "../../../../types";

/**
 * Page Object Model for the Orders page (/orders).
 * Displays the list of orders with status and totals.
 */
export class OrdersPage extends BasePage {
  // Order list states
  get orderList(): Locator {
    return this.getByTestId("order-list");
  }

  get loadingState(): Locator {
    return this.getByTestId("order-list-loading");
  }

  get emptyState(): Locator {
    return this.getByTestId("order-list-empty");
  }

  // New order button
  get newOrderButton(): Locator {
    return this.getByTestId("new-order-button");
  }

  /**
   * Navigate to the orders page
   */
  override async goto(): Promise<void> {
    await super.goto("/orders");
  }

  /**
   * Get an order card by its order ID
   */
  getOrderCard(orderId: string): Locator {
    return this.getByTestId(`order-card-${orderId}`);
  }

  /**
   * Get all order cards with a specific status
   */
  getOrdersByStatus(status: OrderStatus): Locator {
    const statusText = this.getStatusDisplayText(status);
    return this.orderList.locator(`[data-testid^="order-card-"]`).filter({
      has: this.page.getByTestId("order-status").filter({ hasText: statusText }),
    });
  }

  /**
   * Map status to display text used in badges
   */
  private getStatusDisplayText(status: OrderStatus): string {
    const mapping: Record<OrderStatus, string> = {
      draft: "Draft",
      submitted: "Submitted",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
    };
    return mapping[status];
  }

  /**
   * Click the new order button
   */
  async clickNewOrder(): Promise<void> {
    await this.newOrderButton.click();
  }

  /**
   * Click on an order card to view details
   */
  async clickOrder(orderId: string): Promise<void> {
    await this.getOrderCard(orderId).click();
  }

  /**
   * Check if the order list is in loading state
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingState.isVisible();
  }

  /**
   * Check if the order list is empty
   */
  async isEmpty(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Get all order cards currently displayed
   */
  getAllOrderCards(): Locator {
    return this.orderList.locator(`[data-testid^="order-card-"]`);
  }

  /**
   * Get the count of orders displayed
   */
  async getOrderCount(): Promise<number> {
    return await this.getAllOrderCards().count();
  }

  /**
   * Get the status text for a specific order
   */
  async getOrderStatus(orderId: string): Promise<string | null> {
    const card = this.getOrderCard(orderId);
    return await card.getByTestId("order-status").textContent();
  }

  /**
   * Get the total amount text for a specific order
   */
  async getOrderTotal(orderId: string): Promise<string | null> {
    const card = this.getOrderCard(orderId);
    return await card.getByTestId("order-total").textContent();
  }

  /**
   * Get the item count text for a specific order
   */
  async getOrderItemCount(orderId: string): Promise<string | null> {
    const card = this.getOrderCard(orderId);
    return await card.getByTestId("order-item-count").textContent();
  }
}
