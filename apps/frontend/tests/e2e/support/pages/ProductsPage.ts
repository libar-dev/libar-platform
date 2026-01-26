import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page Object Model for the Products page (/products).
 * Displays the product catalog with stock information.
 */
export class ProductsPage extends BasePage {
  // Product list states
  get productList(): Locator {
    return this.getByTestId("product-list");
  }

  get loadingState(): Locator {
    return this.getByTestId("product-list-loading");
  }

  get emptyState(): Locator {
    return this.getByTestId("product-list-empty");
  }

  get errorState(): Locator {
    return this.getByTestId("product-list-error");
  }

  get pageHeader(): Locator {
    return this.getByTestId("products-page-header");
  }

  /**
   * Navigate to the products page
   */
  override async goto(): Promise<void> {
    await super.goto("/products");
  }

  /**
   * Get a product card by its product ID
   */
  getProductCard(productId: string): Locator {
    return this.getByTestId(`product-card-${productId}`);
  }

  /**
   * Get a product card by the product name (finds first matching)
   */
  getProductByName(name: string): Locator {
    return this.productList.locator(`[data-testid^="product-card-"]`).filter({
      has: this.page.getByTestId("product-name").filter({ hasText: name }),
    });
  }

  /**
   * Get the stock badge text for a product by name
   */
  async getStockBadgeText(productName: string): Promise<string | null> {
    const card = this.getProductByName(productName);
    return await card.getByTestId("stock-badge").textContent();
  }

  /**
   * Get the price text for a product by name
   */
  async getPriceText(productName: string): Promise<string | null> {
    const card = this.getProductByName(productName);
    return await card.getByTestId("product-price").textContent();
  }

  /**
   * Get the SKU text for a product by name
   */
  async getSkuText(productName: string): Promise<string | null> {
    const card = this.getProductByName(productName);
    return await card.getByTestId("product-sku").textContent();
  }

  /**
   * Check if the product list is in loading state
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingState.isVisible();
  }

  /**
   * Check if the product list is empty
   */
  async isEmpty(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Check if the product list shows an error
   */
  async hasError(): Promise<boolean> {
    return await this.errorState.isVisible();
  }

  /**
   * Get all product cards currently displayed
   */
  getAllProductCards(): Locator {
    return this.productList.locator(`[data-testid^="product-card-"]`);
  }

  /**
   * Get the count of products displayed
   */
  async getProductCount(): Promise<number> {
    return await this.getAllProductCards().count();
  }

  /**
   * Click on a product card by product ID
   */
  async clickProduct(productId: string): Promise<void> {
    await this.getProductCard(productId).click();
  }

  /**
   * Click on a product card by product name
   */
  async clickProductByName(name: string): Promise<void> {
    await this.getProductByName(name).click();
  }
}
