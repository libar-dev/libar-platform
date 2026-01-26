import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

// Helper to escape RegExp special characters in product names
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Page Object Model for the Admin Products page (/admin/products).
 * Allows creating products and managing stock levels.
 */
export class AdminProductsPage extends BasePage {
  // Page header
  get pageHeader(): Locator {
    return this.getByTestId("admin-products-page-header");
  }

  // Tabs
  get createProductTab(): Locator {
    return this.getByTestId("tab-create-product");
  }

  get addStockTab(): Locator {
    return this.getByTestId("tab-add-stock");
  }

  // Product form fields
  get productIdInput(): Locator {
    return this.getByTestId("product-id-input");
  }

  get productNameInput(): Locator {
    return this.getByTestId("product-name-input");
  }

  get productSkuInput(): Locator {
    return this.getByTestId("product-sku-input");
  }

  get productPriceInput(): Locator {
    return this.getByTestId("product-price-input");
  }

  get productFormSubmit(): Locator {
    return this.getByTestId("product-form-submit");
  }

  get productFormCancel(): Locator {
    return this.getByTestId("product-form-cancel");
  }

  // Stock form fields
  get stockProductSelect(): Locator {
    return this.getByTestId("stock-product-select");
  }

  get stockQuantityInput(): Locator {
    return this.getByTestId("stock-quantity-input");
  }

  get stockReasonInput(): Locator {
    return this.getByTestId("stock-reason-input");
  }

  get stockFormSubmit(): Locator {
    return this.getByTestId("stock-form-submit");
  }

  // Feedback banners
  get successBanner(): Locator {
    return this.getByTestId("admin-success-banner");
  }

  get errorBanner(): Locator {
    return this.getByTestId("admin-error-banner");
  }

  get successDismissButton(): Locator {
    return this.getByTestId("admin-success-dismiss");
  }

  get errorDismissButton(): Locator {
    return this.getByTestId("admin-error-dismiss");
  }

  // Product list (inventory display)
  get productList(): Locator {
    return this.getByTestId("product-list");
  }

  get productListLoading(): Locator {
    return this.getByTestId("product-list-loading");
  }

  get productListEmpty(): Locator {
    return this.getByTestId("product-list-empty");
  }

  /**
   * Navigate to the admin products page
   */
  override async goto(): Promise<void> {
    await super.goto("/admin/products");
  }

  /**
   * Switch to the Create Product tab
   */
  async switchToCreateProduct(): Promise<void> {
    await this.createProductTab.click();
  }

  /**
   * Switch to the Add Stock tab
   */
  async switchToAddStock(): Promise<void> {
    await this.addStockTab.click();
  }

  /**
   * Fill the product creation form
   */
  async fillProductForm(data: { name: string; sku: string; price: string }): Promise<void> {
    await this.productNameInput.fill(data.name);
    await this.productSkuInput.fill(data.sku);
    await this.productPriceInput.fill(data.price);
  }

  /**
   * Submit the product creation form
   */
  async submitProductForm(): Promise<void> {
    await this.productFormSubmit.click();
  }

  /**
   * Create a product with the given data (fill and submit)
   */
  async createProduct(data: { name: string; sku: string; price: string }): Promise<void> {
    await this.switchToCreateProduct();
    await this.fillProductForm(data);
    await this.submitProductForm();
  }

  /**
   * Select a product for adding stock
   */
  async selectProductForStock(productName: string): Promise<void> {
    await this.stockProductSelect.click();
    // Wait for dropdown to open and click the option
    await this.page.getByRole("option", { name: new RegExp(escapeRegExp(productName)) }).click();
  }

  /**
   * Fill the stock form
   */
  async fillStockForm(data: { quantity: string; reason?: string }): Promise<void> {
    await this.stockQuantityInput.fill(data.quantity);
    if (data.reason) {
      await this.stockReasonInput.fill(data.reason);
    }
  }

  /**
   * Submit the stock form
   */
  async submitStockForm(): Promise<void> {
    await this.stockFormSubmit.click();
  }

  /**
   * Add stock to a product (select, fill, submit)
   */
  async addStock(data: { productName: string; quantity: string; reason?: string }): Promise<void> {
    await this.switchToAddStock();
    await this.selectProductForStock(data.productName);
    await this.fillStockForm({ quantity: data.quantity, reason: data.reason });
    await this.submitStockForm();
  }

  /**
   * Get the success message text
   */
  async getSuccessMessage(): Promise<string | null> {
    if (!(await this.successBanner.isVisible())) return null;
    return await this.successBanner.textContent();
  }

  /**
   * Get the error message text
   */
  async getErrorMessage(): Promise<string | null> {
    if (!(await this.errorBanner.isVisible())) return null;
    return await this.errorBanner.textContent();
  }

  /**
   * Check if success banner is visible
   */
  async hasSuccessMessage(): Promise<boolean> {
    return await this.successBanner.isVisible();
  }

  /**
   * Check if error banner is visible
   */
  async hasErrorMessage(): Promise<boolean> {
    return await this.errorBanner.isVisible();
  }

  /**
   * Dismiss the success banner
   */
  async dismissSuccess(): Promise<void> {
    await this.successDismissButton.click();
  }

  /**
   * Dismiss the error banner
   */
  async dismissError(): Promise<void> {
    await this.errorDismissButton.click();
  }

  /**
   * Get a product card from the inventory list by ID
   */
  getProductCard(productId: string): Locator {
    return this.getByTestId(`product-card-${productId}`);
  }

  /**
   * Get a product card by name
   */
  getProductByName(name: string): Locator {
    return this.productList.locator(`[data-testid^="product-card-"]`).filter({
      has: this.page.getByTestId("product-name").filter({ hasText: name }),
    });
  }

  /**
   * Check if the product list is loading
   */
  async isProductListLoading(): Promise<boolean> {
    return await this.productListLoading.isVisible();
  }

  /**
   * Check if the product list is empty
   */
  async isProductListEmpty(): Promise<boolean> {
    return await this.productListEmpty.isVisible();
  }

  /**
   * Get the stock badge text for a product
   */
  async getProductStockText(productName: string): Promise<string | null> {
    const card = this.getProductByName(productName);
    return await card.getByTestId("stock-badge").textContent();
  }

  /**
   * Click on a product in the inventory list (switches to stock tab)
   */
  async clickProductInList(productName: string): Promise<void> {
    await this.getProductByName(productName).click();
  }
}
