import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page Object Model for the Dashboard page (/).
 * Displays stats cards and quick action buttons.
 */
export class DashboardPage extends BasePage {
  // Locators for stat cards
  get productCountCard(): Locator {
    return this.getByTestId("stat-product-count");
  }

  get orderCountCard(): Locator {
    return this.getByTestId("stat-order-count");
  }

  get pendingCountCard(): Locator {
    return this.getByTestId("stat-pending-count");
  }

  // Low stock warning
  get lowStockWarning(): Locator {
    return this.getByTestId("low-stock-warning");
  }

  // Quick action buttons
  get quickNewOrderButton(): Locator {
    return this.getByTestId("quick-new-order");
  }

  get quickViewProductsButton(): Locator {
    return this.getByTestId("quick-view-products");
  }

  get quickManageStockButton(): Locator {
    return this.getByTestId("quick-manage-stock");
  }

  get quickAdminButton(): Locator {
    return this.getByTestId("quick-admin");
  }

  /**
   * Navigate to the dashboard page
   */
  override async goto(): Promise<void> {
    await super.goto("/");
  }

  /**
   * Get the product count displayed in the stat card.
   * Returns the number or null if loading/unavailable.
   */
  async getProductCount(): Promise<number | null> {
    const text = await this.productCountCard.locator(".text-3xl").textContent();
    if (!text || text === "...") return null;
    return parseInt(text, 10);
  }

  /**
   * Get the order count displayed in the stat card.
   * Returns the number or null if loading/unavailable.
   */
  async getOrderCount(): Promise<number | null> {
    const text = await this.orderCountCard.locator(".text-3xl").textContent();
    if (!text || text === "...") return null;
    return parseInt(text, 10);
  }

  /**
   * Get the pending orders count displayed in the stat card.
   * Returns the number or null if loading/unavailable.
   */
  async getPendingCount(): Promise<number | null> {
    const text = await this.pendingCountCard.locator(".text-3xl").textContent();
    if (!text || text === "...") return null;
    return parseInt(text, 10);
  }

  /**
   * Check if the low stock warning banner is visible
   */
  async isLowStockWarningVisible(): Promise<boolean> {
    return await this.lowStockWarning.isVisible();
  }

  /**
   * Click the "New Order" quick action button
   */
  async clickNewOrder(): Promise<void> {
    await this.quickNewOrderButton.click();
  }

  /**
   * Click the "View Products" quick action button
   */
  async clickViewProducts(): Promise<void> {
    await this.quickViewProductsButton.click();
  }

  /**
   * Click the "Manage Stock" quick action button
   */
  async clickManageStock(): Promise<void> {
    await this.quickManageStockButton.click();
  }

  /**
   * Click the "Admin Panel" quick action button
   */
  async clickAdminPanel(): Promise<void> {
    await this.quickAdminButton.click();
  }
}
