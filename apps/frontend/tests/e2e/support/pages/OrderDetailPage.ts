import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";
import type { OrderStatus } from "../../../../types";

/**
 * Reservation status types used in the order detail page
 */
export type ReservationStatus = "pending" | "confirmed" | "released" | "expired" | "failed";

/**
 * Page Object Model for the Order Detail page (/orders/[orderId]).
 * Displays order information, items, and status with action buttons.
 */
export class OrderDetailPage extends BasePage {
  // Status badges
  get statusBadge(): Locator {
    return this.getByTestId("order-status-badge");
  }

  get reservationBadge(): Locator {
    return this.getByTestId("reservation-status-badge");
  }

  // Status-specific banners
  get processingBanner(): Locator {
    return this.getByTestId("order-processing-banner");
  }

  get cancelledBanner(): Locator {
    return this.getByTestId("order-cancelled-banner");
  }

  get reservationFailedBanner(): Locator {
    return this.getByTestId("reservation-failed-banner");
  }

  // Error handling
  get errorBanner(): Locator {
    return this.getByTestId("order-error-banner");
  }

  get errorDismissButton(): Locator {
    return this.getByTestId("order-error-dismiss");
  }

  // Action buttons (for draft orders)
  get submitOrderButton(): Locator {
    return this.getByTestId("submit-order-button");
  }

  get cancelOrderButton(): Locator {
    return this.getByTestId("cancel-order-button");
  }

  // Navigation
  get backToOrdersLink(): Locator {
    return this.getByTestId("back-to-orders-link");
  }

  /**
   * Navigate to an order detail page by order ID
   */
  async gotoOrder(orderId: string): Promise<void> {
    await super.goto(`/orders/${orderId}`);
  }

  /**
   * Get the order status text from the badge
   */
  async getStatus(): Promise<OrderStatus | null> {
    const text = await this.statusBadge.textContent();
    if (!text) return null;
    return text.toLowerCase() as OrderStatus;
  }

  /**
   * Get the reservation status text from the badge
   */
  async getReservationStatus(): Promise<ReservationStatus | null> {
    if (!(await this.reservationBadge.isVisible())) return null;
    const text = await this.reservationBadge.textContent();
    if (!text) return null;

    // Map display text back to status
    const displayToStatus: Record<string, ReservationStatus> = {
      "Reservation Pending": "pending",
      "Stock Reserved": "confirmed",
      "Stock Released": "released",
      "Reservation Expired": "expired",
      "Reservation Failed": "failed",
    };
    return displayToStatus[text] ?? null;
  }

  /**
   * Check if the order is currently processing (submitted with pending reservation)
   */
  async isProcessing(): Promise<boolean> {
    return await this.processingBanner.isVisible();
  }

  /**
   * Check if the order has been cancelled
   */
  async isCancelled(): Promise<boolean> {
    return await this.cancelledBanner.isVisible();
  }

  /**
   * Check if the reservation failed
   */
  async isReservationFailed(): Promise<boolean> {
    return await this.reservationFailedBanner.isVisible();
  }

  /**
   * Check if an error banner is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorBanner.isVisible();
  }

  /**
   * Get the error message text
   */
  async getErrorMessage(): Promise<string | null> {
    if (!(await this.hasError())) return null;
    return await this.errorBanner.textContent();
  }

  /**
   * Dismiss the error banner
   */
  async dismissError(): Promise<void> {
    await this.errorDismissButton.click();
  }

  /**
   * Submit a draft order
   */
  async submitOrder(): Promise<void> {
    await this.submitOrderButton.click();
  }

  /**
   * Check if the submit button is visible and enabled
   */
  async canSubmitOrder(): Promise<boolean> {
    const visible = await this.submitOrderButton.isVisible();
    if (!visible) return false;
    return await this.submitOrderButton.isEnabled();
  }

  /**
   * Open the cancel order confirmation dialog
   */
  async clickCancelOrder(): Promise<void> {
    await this.cancelOrderButton.click();
  }

  /**
   * Check if the cancel button is visible and enabled
   */
  async canCancelOrder(): Promise<boolean> {
    const visible = await this.cancelOrderButton.isVisible();
    if (!visible) return false;
    return await this.cancelOrderButton.isEnabled();
  }

  /**
   * Navigate back to the orders list
   */
  async goBackToOrders(): Promise<void> {
    await this.backToOrdersLink.click();
  }

  /**
   * Wait for the order status to change to a specific value
   */
  async waitForStatus(status: OrderStatus, timeout: number = 15000): Promise<void> {
    await this.statusBadge.filter({ hasText: new RegExp(status, "i") }).waitFor({ timeout });
  }

  /**
   * Wait for the reservation status to change to a specific value
   */
  async waitForReservationStatus(
    status: ReservationStatus,
    timeout: number = 15000
  ): Promise<void> {
    const displayText: Record<ReservationStatus, string> = {
      pending: "Reservation Pending",
      confirmed: "Stock Reserved",
      released: "Stock Released",
      expired: "Reservation Expired",
      failed: "Reservation Failed",
    };
    await this.reservationBadge.filter({ hasText: displayText[status] }).waitFor({ timeout });
  }
}
