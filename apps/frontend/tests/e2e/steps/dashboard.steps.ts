import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { prefixName, prefixSku } from "../support/testRunId";
import { INVENTORY_LOAD_TIMEOUT, waitForProductFormHydration } from "../support/wait-helpers";

const { Given, When, Then } = createBdd();

// Helper to escape RegExp special characters in product names
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================
// Dashboard Setup Steps
// ============================================

Given("products and orders exist in the system", async ({ page }: { page: Page }) => {
  // Setup: Create a product and an order via admin (prefixed for test isolation)
  const productName = prefixName("Dashboard Test Product");
  const productSku = prefixSku("DTP-001");

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

    // Add product to cart
    const productCard = page
      .getByTestId("product-catalog")
      .locator(`[data-testid^="product-card"]`)
      .filter({ hasText: productName });
    await productCard.click();

    // Submit the order
    await page.getByTestId("order-submit-button").click();
    await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
    return;
  }

  // Create a product - click first to ensure focus on controlled inputs
  const nameInput = page.getByTestId("product-name-input");
  await nameInput.click();
  await nameInput.fill(productName);

  const skuInput = page.getByTestId("product-sku-input");
  await skuInput.click();
  await skuInput.fill(productSku);

  const priceInput = page.getByTestId("product-price-input");
  await priceInput.click();
  await priceInput.fill("29.99");

  await page.getByTestId("product-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();

  // Add stock
  await page.getByTestId("tab-add-stock").click();
  await page.getByTestId("stock-product-select").click();
  await page
    .getByRole("option", { name: new RegExp(escapeRegExp(productName)) })
    .first()
    .click();
  await page.getByTestId("stock-quantity-input").fill("100");
  await page.getByTestId("stock-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();

  // Create an order
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();

  // Add product to cart
  const productCard = page
    .getByTestId("product-catalog")
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: productName });
  await productCard.click();

  // Submit the order
  await page.getByTestId("order-submit-button").click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
});

Given("a product with low stock exists", async ({ page }: { page: Page }) => {
  // Create a product with low stock (< 10 units) - prefixed for test isolation
  const productName = prefixName("Low Stock Product");
  const productSku = prefixSku("LSP-001");

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
    // Product already exists, skip creation
    return;
  }

  // Create product - click first to ensure focus on controlled inputs
  const nameInput = page.getByTestId("product-name-input");
  await nameInput.click();
  await nameInput.fill(productName);

  const skuInput = page.getByTestId("product-sku-input");
  await skuInput.click();
  await skuInput.fill(productSku);

  const priceInput = page.getByTestId("product-price-input");
  await priceInput.click();
  await priceInput.fill("19.99");

  await page.getByTestId("product-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();

  // Add minimal stock
  await page.getByTestId("tab-add-stock").click();
  await page.getByTestId("stock-product-select").click();
  await page
    .getByRole("option", { name: new RegExp(escapeRegExp(productName)) })
    .first()
    .click();
  await page.getByTestId("stock-quantity-input").fill("5");
  await page.getByTestId("stock-form-submit").click();
  await expect(page.getByTestId("admin-success-banner")).toBeVisible();
});

// ============================================
// Dashboard Navigation Steps
// ============================================

// Shared helper for navigating to the dashboard
async function navigateToDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-page")).toBeVisible();
}

When("I navigate to the dashboard", async ({ page }: { page: Page }) => {
  await navigateToDashboard(page);
});

When("I am on the dashboard", async ({ page }: { page: Page }) => {
  await navigateToDashboard(page);
});

When("I click the {string} quick action", async ({ page }: { page: Page }, actionName: string) => {
  const quickAction = page.getByTestId("quick-actions").getByRole("button", { name: actionName });
  await quickAction.click();
});

// ============================================
// Dashboard Verification Steps
// ============================================

Then("I should see the product count", async ({ page }: { page: Page }) => {
  const productCount = page.getByTestId("stat-product-count");
  await expect(productCount).toBeVisible();
});

Then("I should see the order count", async ({ page }: { page: Page }) => {
  const orderCount = page.getByTestId("stat-order-count");
  await expect(orderCount).toBeVisible();
});

Then("I should see the pending orders count", async ({ page }: { page: Page }) => {
  const pendingCount = page.getByTestId("stat-pending-count");
  await expect(pendingCount).toBeVisible();
});

Then("I should see the low stock warning", async ({ page }: { page: Page }) => {
  const lowStockWarning = page.getByTestId("low-stock-warning");
  await expect(lowStockWarning).toBeVisible();
});

Then("I should be on the create order page", async ({ page }: { page: Page }) => {
  await expect(page).toHaveURL("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();
});
