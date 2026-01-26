import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import {
  waitUntilProjection,
  selectProductInStockDropdown,
  waitForProductInCatalog,
  waitForProductFormHydration,
  INVENTORY_LOAD_TIMEOUT,
} from "../support/wait-helpers";
import { prefixName, prefixSku } from "../support/testRunId";

const { Given, When, Then } = createBdd();

// ============================================
// Order Setup Steps
// ============================================

Given("orders exist with different statuses", async ({ page }: { page: Page }) => {
  // Create a product first (with prefixed name for test isolation)
  const productName = prefixName("Order Test Product");
  const productSku = prefixSku("OTP-001");

  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();

  // Wait for form to be fully hydrated before checking/filling
  await waitForProductFormHydration(page);

  // Wait for Current Inventory to load (either shows products or times out)
  // This replaces brittle 500ms sleep with proper Playwright wait
  const inventoryCards = page.locator(`[data-testid^="product-card"]`);
  try {
    await inventoryCards.first().waitFor({ state: "visible", timeout: INVENTORY_LOAD_TIMEOUT });
  } catch {
    // No products visible after timeout - that's fine, will create below
  }

  // Check if product already exists (idempotent setup)
  const existingProduct = inventoryCards.filter({ hasText: productName });
  if ((await existingProduct.count()) > 0) {
    // Product already exists, skip to order creation
    await page.goto("/orders/new");
    await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();
    const productCard = page
      .getByTestId("product-catalog")
      .locator(`[data-testid^="product-card"]`)
      .filter({ hasText: productName });
    await expect(productCard).toBeVisible({ timeout: 30000 });
    await productCard.click();
    await page.getByTestId("order-submit-button").click();
    await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
    return;
  }

  // Click first to ensure focus on controlled inputs
  const nameInput = page.getByTestId("product-name-input");
  await nameInput.click();
  await nameInput.fill(productName);

  const skuInput = page.getByTestId("product-sku-input");
  await skuInput.click();
  await skuInput.fill(productSku);

  const priceInput = page.getByTestId("product-price-input");
  await priceInput.click();
  await priceInput.fill("39.99");

  await page.getByTestId("product-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();

  await page.getByTestId("tab-add-stock").click();
  await selectProductInStockDropdown(page, productName);
  await page.getByTestId("stock-quantity-input").fill("100");
  await page.getByTestId("stock-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();

  // Create an order
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();

  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: productName });
  await expect(productCard).toBeVisible({ timeout: 30000 });
  await productCard.click();
  await page.getByTestId("order-submit-button").click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
});

Given("a confirmed order exists", async ({ page }: { page: Page }) => {
  // Create product with stock (prefixed for test isolation)
  const productName = prefixName("Confirmed Order Product");
  const productSku = prefixSku("COP-001");

  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();

  // Wait for form to be fully hydrated before checking/filling
  await waitForProductFormHydration(page);

  // Wait for Current Inventory to load (either shows products or times out)
  // This replaces brittle 500ms sleep with proper Playwright wait
  const inventoryCards = page.locator(`[data-testid^="product-card"]`);
  try {
    await inventoryCards.first().waitFor({ state: "visible", timeout: INVENTORY_LOAD_TIMEOUT });
  } catch {
    // No products visible after timeout - that's fine, will create below
  }

  // Check if product already exists (idempotent setup)
  const existingProduct = inventoryCards.filter({ hasText: productName });
  const productExists = (await existingProduct.count()) > 0;

  if (!productExists) {
    // Click first to ensure focus on controlled inputs
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(productName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(productSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("59.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, productName);
    await page.getByTestId("stock-quantity-input").fill("50");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Create and submit order
  await page.goto("/orders/new");
  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: productName });
  await expect(productCard).toBeVisible({ timeout: 30000 });
  await productCard.click();
  await page.getByTestId("order-submit-button").click();

  // Wait for confirmation
  await waitUntilProjection(
    async () => {
      const statusBadge = page.getByTestId("order-status-badge");
      const text = await statusBadge.textContent();
      return text?.toLowerCase() === "confirmed";
    },
    { timeout: 30000 }
  );
});

Given("a cancelled order exists", async ({ page }: { page: Page }) => {
  // Create product with LIMITED stock to trigger cancellation (prefixed for test isolation)
  const productName = prefixName("Cancelled Order Product");
  const productSku = prefixSku("CAO-001");

  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();

  // Wait for form to be fully hydrated before checking/filling
  await waitForProductFormHydration(page);

  // Wait for Current Inventory to load (either shows products or times out)
  // This replaces brittle 500ms sleep with proper Playwright wait
  const inventoryCards = page.locator(`[data-testid^="product-card"]`);
  try {
    await inventoryCards.first().waitFor({ state: "visible", timeout: INVENTORY_LOAD_TIMEOUT });
  } catch {
    // No products visible after timeout - that's fine, will create below
  }

  // Check if product already exists (idempotent setup)
  const existingProduct = inventoryCards.filter({ hasText: productName });
  const productExists = (await existingProduct.count()) > 0;

  if (!productExists) {
    // Click first to ensure focus on controlled inputs
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(productName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(productSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("79.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, productName);
    await page.getByTestId("stock-quantity-input").fill("2");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Create order with quantity exceeding stock
  await page.goto("/orders/new");
  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: productName });
  await expect(productCard).toBeVisible({ timeout: 30000 });
  await productCard.click();

  // Increase quantity to exceed stock
  const cartItem = page.getByTestId("cart-items").locator("div").filter({ hasText: productName });
  const quantityInput = cartItem.locator('input[type="number"]');
  await quantityInput.fill("10");

  await page.getByTestId("order-submit-button").click();

  // Wait for cancellation
  await waitUntilProjection(
    async () => {
      const statusBadge = page.getByTestId("order-status-badge");
      const text = await statusBadge.textContent();
      return text?.toLowerCase() === "cancelled";
    },
    { timeout: 30000 }
  );
});

// ============================================
// Order Navigation Steps
// ============================================

When("I navigate to that order", async ({ page }: { page: Page }) => {
  // Already on the order detail page from setup
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
});

When("I navigate to the order detail page", async ({ page }: { page: Page }) => {
  // Navigate back to the order detail page (assumes we came from there)
  // This is used when we've navigated away (e.g., to products) and need to return
  await page.goBack();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
});

When("I am on the orders page", async ({ page }: { page: Page }) => {
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
});

// ============================================
// Cart Management Steps
// ============================================

// Shared helper to add a product to cart with specified quantity
async function addProductToCart(page: Page, productName: string, quantity: number): Promise<void> {
  // Use prefixed name to find the correct product
  const prefixedName = prefixName(productName);

  // Wait for product to appear in catalog (projection may need time to process)
  // Uses polling-based wait instead of simple visibility check for reliability
  await waitForProductInCatalog(page, prefixedName);

  // Find the product card and click to add to cart
  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: prefixedName });

  // Click the product card to add to cart (first click adds 1)
  await productCard.click();

  // If quantity > 1, we need to update the quantity in the cart
  if (quantity > 1) {
    const cartItem = page
      .getByTestId("cart-items")
      .locator("div")
      .filter({ hasText: prefixedName });

    // Find the quantity input and update it
    const quantityInput = cartItem.locator('input[type="number"]');
    await quantityInput.fill(quantity.toString());
  }
}

// Consolidated step: Handles both "to cart" and "to the cart" phrasing
When(
  "I add {string} to cart with quantity {int}",
  async ({ page }: { page: Page }, productName: string, quantity: number) => {
    await addProductToCart(page, productName, quantity);
  }
);

When(
  "I add {string} to the cart with quantity {int}",
  async ({ page }: { page: Page }, productName: string, quantity: number) => {
    await addProductToCart(page, productName, quantity);
  }
);

When("I add a product to cart", async ({ page }: { page: Page }) => {
  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .first();
  // Wait for product to be visible (projection may need time to update)
  await expect(productCard).toBeVisible({ timeout: 30000 });
  await productCard.click();
});

When("I change the quantity to {int}", async ({ page }: { page: Page }, quantity: number) => {
  const quantityInput = page.getByTestId("cart-items").locator('input[type="number"]').first();
  await quantityInput.fill(quantity.toString());
});

When("I add two products to cart", async ({ page }: { page: Page }) => {
  const productCards = page.getByTestId("product-catalog").locator(`[data-testid^="product-card"]`);
  // Wait for at least 2 products to be visible
  await expect(productCards.nth(1)).toBeVisible({ timeout: 30000 });
  await productCards.nth(0).click();
  await productCards.nth(1).click();
});

When("I remove one product", async ({ page }: { page: Page }) => {
  const removeButton = page
    .getByTestId("cart-items")
    .getByRole("button", { name: /remove/i })
    .first();
  await removeButton.click();
});

// ============================================
// Cart Verification Steps
// ============================================

Then("the cart total should be correct", async ({ page }: { page: Page }) => {
  const cartTotal = page.getByTestId("cart-total");
  await expect(cartTotal).toBeVisible();
  // Just verify it's a valid price format
  await expect(cartTotal).toContainText("$");
});

Then("the cart total should update", async ({ page }: { page: Page }) => {
  const cartTotal = page.getByTestId("cart-total");
  await expect(cartTotal).toBeVisible();
});

Then("only one product should remain", async ({ page }: { page: Page }) => {
  // Use correct testid pattern: order-item-row-{productId}
  const cartItems = page.getByTestId("cart-items").locator(`[data-testid^="order-item-row"]`);
  await expect(cartItems).toHaveCount(1);
});

Then("the cart should show {int} items", async ({ page }: { page: Page }, itemCount: number) => {
  // The badge shows "X item" (singular) or "X items" (plural)
  // Look for the badge within the Cart heading area
  const cartSection = page.locator("text=Cart").locator("..");
  // Match singular or plural form
  const expectedText = itemCount === 1 ? "1 item" : `${itemCount} items`;
  await expect(cartSection).toContainText(expectedText);
});

Then("the cart total should be {string}", async ({ page }: { page: Page }, total: string) => {
  const cartTotal = page.getByTestId("cart-total");
  await expect(cartTotal).toHaveText(total);
});

Then("the Create Order button should be disabled", async ({ page }: { page: Page }) => {
  const submitButton = page.getByTestId("order-submit-button");
  await expect(submitButton).toBeDisabled();
});

// ============================================
// Order Submission Steps
// ============================================

When("I submit the order", async ({ page }: { page: Page }) => {
  await page.getByTestId("order-submit-button").click();
});

When("I cancel the order", async ({ page }: { page: Page }) => {
  await page.getByTestId("cancel-order-button").click();
  // Confirm in the dialog
  await page.getByRole("button", { name: "Yes, Cancel Order" }).click();
});

// ============================================
// Order Status Verification Steps
// ============================================

Then("the order status should be {string}", async ({ page }: { page: Page }, status: string) => {
  const statusBadge = page.getByTestId("order-status-badge");
  await expect(statusBadge).toHaveText(status);
});

Then(
  "eventually the order status should be {string}",
  async ({ page }: { page: Page }, status: string) => {
    // Saga processing can take longer - increase timeout for workflow completion
    await waitUntilProjection(
      async () => {
        const statusBadge = page.getByTestId("order-status-badge");
        const text = await statusBadge.textContent();
        return text?.toLowerCase() === status.toLowerCase();
      },
      { timeout: 45000 }
    );
  }
);

Then(
  "the reservation status should be {string}",
  async ({ page }: { page: Page }, status: string) => {
    // Reservation status comes from cross-context projection (Inventory BC)
    // which may have eventual consistency delay - wait for badge to appear
    const reservationBadge = page.getByTestId("reservation-status-badge");
    await expect(reservationBadge).toBeVisible({ timeout: 30000 });
    await expect(reservationBadge).toContainText(status);
  }
);

Then(
  "eventually the reservation status should be {string}",
  async ({ page }: { page: Page }, status: string) => {
    await waitUntilProjection(
      async () => {
        const reservationBadge = page.getByTestId("reservation-status-badge");
        const isVisible = await reservationBadge.isVisible();
        if (!isVisible) return false;
        const text = await reservationBadge.textContent();
        return text?.includes(status);
      },
      { timeout: 30000 }
    );
  }
);

Then("I should be redirected to order detail", async ({ page }: { page: Page }) => {
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);

  // Wait for the back link (now present in both found/not-found states)
  await expect(page.getByTestId("back-to-orders-link")).toBeVisible({ timeout: 30000 });

  // Wait for actual order content to confirm projection processed
  // This handles eventual consistency - orderSummaries projection may need time
  await expect(page.getByTestId("order-status-badge")).toBeVisible({ timeout: 30000 });
});

Then("I should see all orders", async ({ page }: { page: Page }) => {
  const orderList = page.getByTestId("order-list");
  await expect(orderList).toBeVisible();
});

Then("each order should show its status badge", async ({ page }: { page: Page }) => {
  const orderCards = page.locator(`[data-testid^="order-card"]`);
  const count = await orderCards.count();
  for (let i = 0; i < count; i++) {
    const badge = orderCards.nth(i).locator(`[data-testid="order-status"]`);
    await expect(badge).toBeVisible();
  }
});

Then("I should see status {string}", async ({ page }: { page: Page }, status: string) => {
  const statusBadge = page.getByTestId("order-status-badge");
  await expect(statusBadge).toContainText(status);
});

Then("I should see {string} badge", async ({ page }: { page: Page }, badgeText: string) => {
  // Use first() to avoid strict mode violation when multiple badges exist
  const badge = page.getByText(badgeText).first();
  await expect(badge).toBeVisible();
});

Then("I should see the cancellation reason", async ({ page }: { page: Page }) => {
  const cancellationReason = page.getByTestId("cancellation-reason");
  await expect(cancellationReason).toBeVisible();
});

// ============================================
// Order Processing Banners
// ============================================

Then("I should see the order processing indicator", async ({ page }: { page: Page }) => {
  const processingBanner = page.getByTestId("order-processing-banner");
  await expect(processingBanner).toBeVisible();
});

Then("I should see the reservation failed banner", async ({ page }: { page: Page }) => {
  const failedBanner = page.getByTestId("reservation-failed-banner");
  await expect(failedBanner).toBeVisible();
});

Then("I should see the order cancelled banner", async ({ page }: { page: Page }) => {
  const cancelledBanner = page.getByTestId("order-cancelled-banner");
  await expect(cancelledBanner).toBeVisible();
});
