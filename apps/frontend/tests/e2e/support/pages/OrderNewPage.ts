import { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page Object Model for the Create Order page (/orders/new).
 * Allows selecting products and creating new orders.
 */
export class OrderNewPage extends BasePage {
  // Product catalog
  get productCatalog(): Locator {
    return this.getByTestId("product-catalog");
  }

  // Cart elements
  get cartItems(): Locator {
    return this.getByTestId("cart-items");
  }

  get emptyCart(): Locator {
    return this.getByTestId("empty-cart");
  }

  get cartTotal(): Locator {
    return this.getByTestId("cart-total");
  }

  // Action buttons
  get submitButton(): Locator {
    return this.getByTestId("order-submit-button");
  }

  get cancelButton(): Locator {
    return this.getByTestId("order-cancel-button");
  }

  // Error handling
  get errorBanner(): Locator {
    return this.getByTestId("order-create-error-banner");
  }

  get errorDismissButton(): Locator {
    return this.getByTestId("order-create-error-dismiss");
  }

  /**
   * Navigate to the create order page
   */
  override async goto(): Promise<void> {
    await super.goto("/orders/new");
  }

  /**
   * Get a product card in the catalog by product ID
   */
  getProductInCatalog(productId: string): Locator {
    return this.productCatalog.getByTestId(`product-card-${productId}`);
  }

  /**
   * Get a product card in the catalog by product name
   */
  getProductByName(name: string): Locator {
    return this.productCatalog.locator(`[data-testid^="product-card-"]`).filter({
      has: this.page.getByTestId("product-name").filter({ hasText: name }),
    });
  }

  /**
   * Select/add a product to cart by clicking on it
   */
  async selectProduct(productName: string): Promise<void> {
    await this.getProductByName(productName).click();
  }

  /**
   * Add a product to cart with a specific quantity.
   * Clicks the product multiple times to add quantity.
   */
  async addProductToCart(productName: string, quantity: number): Promise<void> {
    for (let i = 0; i < quantity; i++) {
      await this.selectProduct(productName);
    }
  }

  /**
   * Change the quantity of a product in the cart.
   * Finds the cart item and updates the quantity input.
   */
  async changeQuantity(productName: string, quantity: number): Promise<void> {
    const cartItem = this.cartItems.locator("div").filter({ hasText: productName }).first();
    const quantityInput = cartItem.locator('input[type="number"]');
    await quantityInput.fill(quantity.toString());
  }

  /**
   * Remove a product from the cart by clicking its remove button
   */
  async removeFromCart(productName: string): Promise<void> {
    const cartItem = this.cartItems.locator("div").filter({ hasText: productName }).first();
    const removeButton = cartItem.getByRole("button", { name: /remove/i });
    await removeButton.click();
  }

  /**
   * Get the cart total text (formatted currency)
   */
  async getTotal(): Promise<string | null> {
    return await this.cartTotal.textContent();
  }

  /**
   * Submit the order
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Cancel order creation
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Check if the submit button is enabled
   */
  async isSubmitEnabled(): Promise<boolean> {
    return await this.submitButton.isEnabled();
  }

  /**
   * Check if the cart is empty
   */
  async isCartEmpty(): Promise<boolean> {
    return await this.emptyCart.isVisible();
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
   * Get the count of products in the catalog
   */
  async getCatalogProductCount(): Promise<number> {
    return await this.productCatalog.locator(`[data-testid^="product-card-"]`).count();
  }
}
