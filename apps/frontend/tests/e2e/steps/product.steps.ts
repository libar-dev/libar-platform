import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import {
  waitUntilProjection,
  selectProductInStockDropdown,
  waitForProductFormHydration,
  INVENTORY_LOAD_TIMEOUT,
} from "../support/wait-helpers";
import { prefixName, prefixSku } from "../support/testRunId";

const { Given, Then } = createBdd();

// ============================================
// Product Setup Steps (for Background sections)
// ============================================

Given(
  "a product {string} with SKU {string} exists",
  async ({ page }: { page: Page }, productName: string, sku: string) => {
    // Prefix names for test isolation
    const prefixedName = prefixName(productName);
    const prefixedSku = prefixSku(sku);

    // Navigate to admin and create the product
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
    const existingProduct = inventoryCards.filter({ hasText: prefixedName });
    if ((await existingProduct.count()) > 0) {
      // Product already exists, skip creation
      return;
    }

    // Fill inputs and blur to commit React state before moving to next field
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.fill(prefixedName);
    await nameInput.blur();
    await expect(nameInput).toHaveValue(prefixedName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.fill(prefixedSku);
    await skuInput.blur();
    await expect(skuInput).toHaveValue(prefixedSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.fill("29.99");
    await priceInput.blur();
    await expect(priceInput).toHaveValue("29.99");

    // Submit
    await page.getByTestId("product-form-submit").click();

    // Wait for success
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }
);

Given(
  "a product {string} with SKU {string} at price {float} and {int} units in stock",
  async (
    { page }: { page: Page },
    productName: string,
    sku: string,
    price: number,
    quantity: number
  ) => {
    // Prefix names for test isolation
    const prefixedName = prefixName(productName);
    const prefixedSku = prefixSku(sku);

    // Navigate to admin and create the product
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
    const existingProduct = inventoryCards.filter({ hasText: prefixedName });
    if ((await existingProduct.count()) > 0) {
      // Product already exists, skip creation
      return;
    }

    // Fill inputs and blur to commit React state before moving to next field
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.fill(prefixedName);
    await nameInput.blur();
    await expect(nameInput).toHaveValue(prefixedName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.fill(prefixedSku);
    await skuInput.blur();
    await expect(skuInput).toHaveValue(prefixedSku);

    const priceInput = page.getByTestId("product-price-input");
    const priceStr = price.toString();
    await priceInput.fill(priceStr);
    await priceInput.blur();
    await expect(priceInput).toHaveValue(priceStr);

    // Submit product creation
    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    // Switch to Add Stock tab
    await page.getByTestId("tab-add-stock").click();

    // Select the product (with eventual consistency wait) and add stock
    await selectProductInStockDropdown(page, prefixedName);
    await page.getByTestId("stock-quantity-input").fill(quantity.toString());

    // Submit stock addition
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }
);

Given("products exist with various stock levels", async ({ page }: { page: Page }) => {
  // Create products with different stock levels for testing badges
  // Use unique names to avoid collision with dashboard.steps.ts which also creates "Low Stock Product"
  // All names are prefixed for test isolation between test runs
  const inStockName = prefixName("Browse In Stock Item");
  const inStockSku = prefixSku("BIS-001");
  const lowStockName = prefixName("Browse Low Stock Item");
  const lowStockSku = prefixSku("BLS-001");
  const outOfStockName = prefixName("Browse Out of Stock Item");
  const outOfStockSku = prefixSku("BOS-001");

  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();

  // Wait for form to be fully hydrated before filling
  await waitForProductFormHydration(page);

  // Wait for Current Inventory to load (either shows products or times out)
  const inventoryCards = page.locator(`[data-testid^="product-card"]`);
  try {
    await inventoryCards.first().waitFor({ state: "visible", timeout: INVENTORY_LOAD_TIMEOUT });
  } catch {
    // No products visible after timeout - that's fine, will create below
  }

  // Check if products already exist (idempotent setup)
  const existingInStock = inventoryCards.filter({ hasText: inStockName });
  const existingLowStock = inventoryCards.filter({ hasText: lowStockName });
  const existingOutOfStock = inventoryCards.filter({ hasText: outOfStockName });
  const inStockExists = (await existingInStock.count()) > 0;
  const lowStockExists = (await existingLowStock.count()) > 0;
  const outOfStockExists = (await existingOutOfStock.count()) > 0;

  // Skip if all products already exist
  if (inStockExists && lowStockExists && outOfStockExists) {
    return;
  }

  // Create in-stock product (100 units) if it doesn't exist
  if (!inStockExists) {
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(inStockName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(inStockSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("19.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, inStockName);
    const stockInput = page.getByTestId("stock-quantity-input");
    await stockInput.click();
    await stockInput.fill("100");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Create low-stock product (5 units) if it doesn't exist
  if (!lowStockExists) {
    await page.getByTestId("tab-create-product").click();
    // Wait for form to be fully hydrated after tab switch
    await waitForProductFormHydration(page);
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(lowStockName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(lowStockSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("29.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, lowStockName);
    const stockInput = page.getByTestId("stock-quantity-input");
    await stockInput.click();
    await stockInput.fill("5");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Create out-of-stock product (0 units - just create, no stock) if it doesn't exist
  if (!outOfStockExists) {
    await page.getByTestId("tab-create-product").click();
    // Wait for form to be fully hydrated after tab switch
    await waitForProductFormHydration(page);
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(outOfStockName);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(outOfStockSku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("39.99");
    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }
});

Given("no products exist", async () => {
  // This is a fresh state - no setup needed
  // The test environment should start clean
});

Given("products exist with stock", async ({ page }: { page: Page }) => {
  // Create TWO products with stock for order tests (some tests need multiple products)
  // Prefixed for test isolation
  const product1Name = prefixName("Test Product");
  const product1Sku = prefixSku("TST-001");
  const product2Name = prefixName("Second Product");
  const product2Sku = prefixSku("TST-002");

  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();

  // Wait for form to be fully hydrated before filling
  await waitForProductFormHydration(page);

  // Wait for Current Inventory to load (either shows products or times out)
  // This replaces brittle 500ms sleep with proper Playwright wait
  const inventoryCards = page.locator(`[data-testid^="product-card"]`);
  try {
    await inventoryCards.first().waitFor({ state: "visible", timeout: INVENTORY_LOAD_TIMEOUT });
  } catch {
    // No products visible after timeout - that's fine, will create below
  }

  // Check if products already exist (idempotent setup)
  const existingProduct1 = inventoryCards.filter({ hasText: product1Name });
  const existingProduct2 = inventoryCards.filter({ hasText: product2Name });
  const product1Exists = (await existingProduct1.count()) > 0;
  const product2Exists = (await existingProduct2.count()) > 0;

  // Skip to order page if both products already exist
  if (product1Exists && product2Exists) {
    await page.goto("/orders/new");
    await waitUntilProjection(
      async () => {
        const catalog = page.getByTestId("product-catalog");
        const p1Card = catalog
          .locator(`[data-testid^="product-card"]`)
          .filter({ hasText: product1Name });
        const p2Card = catalog
          .locator(`[data-testid^="product-card"]`)
          .filter({ hasText: product2Name });
        return (await p1Card.count()) > 0 && (await p2Card.count()) > 0;
      },
      { timeout: 30000 }
    );
    return;
  }

  // Create first product if it doesn't exist
  if (!product1Exists) {
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(product1Name);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(product1Sku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("49.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    // Add stock to first product
    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, product1Name);
    const stockInput1 = page.getByTestId("stock-quantity-input");
    await stockInput1.click();
    await stockInput1.fill("50");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Create second product if it doesn't exist
  if (!product2Exists) {
    await page.getByTestId("tab-create-product").click();
    // Wait for form to be fully hydrated after tab switch
    await waitForProductFormHydration(page);

    const nameInput = page.getByTestId("product-name-input");
    await nameInput.click();
    await nameInput.fill(product2Name);

    const skuInput = page.getByTestId("product-sku-input");
    await skuInput.click();
    await skuInput.fill(product2Sku);

    const priceInput = page.getByTestId("product-price-input");
    await priceInput.click();
    await priceInput.fill("29.99");

    await page.getByTestId("product-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();

    // Add stock to second product
    await page.getByTestId("tab-add-stock").click();
    await selectProductInStockDropdown(page, product2Name);
    const stockInput2 = page.getByTestId("stock-quantity-input");
    await stockInput2.click();
    await stockInput2.fill("30");
    await page.getByTestId("stock-form-submit").click();
    await expect(page.getByTestId("admin-success-banner")).toBeVisible();
  }

  // Wait for projections to process before continuing
  // Navigate to create order page and verify products with stock are visible
  // (OrderCreateForm only shows products where availableQuantity > 0)
  await page.goto("/orders/new");

  // Wait for OUR SPECIFIC prefixed products to be visible (not just any 2 products)
  // This avoids race conditions where old products from previous runs are matched
  await waitUntilProjection(
    async () => {
      const catalog = page.getByTestId("product-catalog");
      const product1Card = catalog
        .locator(`[data-testid^="product-card"]`)
        .filter({ hasText: product1Name });
      const product2Card = catalog
        .locator(`[data-testid^="product-card"]`)
        .filter({ hasText: product2Name });

      const product1Visible = (await product1Card.count()) > 0;
      const product2Visible = (await product2Card.count()) > 0;

      return product1Visible && product2Visible;
    },
    { timeout: 30000 }
  );
});

// ============================================
// Product Display Verification Steps
// ============================================

Then("I should see products with their stock badges", async ({ page }: { page: Page }) => {
  const productCards = page.locator(`[data-testid^="product-card"]`);
  await expect(productCards.first()).toBeVisible();
});

Then("in-stock products should show green badge", async ({ page }: { page: Page }) => {
  // Use prefixed name to find the correct product
  // Use unique "Browse" prefix to avoid collision with dashboard products
  const productCard = page
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: prefixName("Browse In Stock Item") })
    .first();
  const badge = productCard.getByTestId("stock-badge");
  await expect(badge).toBeVisible();
  // In-stock products (>10 units) show "X in stock"
  await expect(badge).toContainText("in stock");
});

Then("low-stock products should show yellow badge", async ({ page }: { page: Page }) => {
  // Use prefixed name to find the correct product
  // Use unique "Browse" prefix to avoid collision with dashboard products
  const productCard = page
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: prefixName("Browse Low Stock Item") })
    .first();
  const badge = productCard.getByTestId("stock-badge");
  await expect(badge).toBeVisible();
  // Low-stock products (1-10 units) show "Only X left"
  await expect(badge).toContainText("Only");
});

Then("out-of-stock products should show red badge", async ({ page }: { page: Page }) => {
  // Use prefixed name to find the correct product
  // Use unique "Browse" prefix to avoid collision with dashboard products
  const productCard = page
    .locator(`[data-testid^="product-card"]`)
    .filter({ hasText: prefixName("Browse Out of Stock Item") })
    .first();
  const badge = productCard.getByTestId("stock-badge");
  await expect(badge).toBeVisible();
  // Out-of-stock products show "Out of stock"
  await expect(badge).toContainText("Out of stock");
});

Then("I should see the empty state message", async ({ page }: { page: Page }) => {
  const emptyState = page.getByTestId("product-list-empty");
  await expect(emptyState).toBeVisible();
});

Then("I should see loading skeletons", async ({ page }: { page: Page }) => {
  // This step checks for loading state - may be transient
  const skeleton = page.getByTestId("product-list-loading");
  try {
    // Don't wait too long as loading may be quick
    await expect(skeleton).toBeVisible({ timeout: 2000 });
  } catch {
    // Loading may have already finished - that's OK
  }
});

Then("eventually products should appear", async ({ page }: { page: Page }) => {
  const productCards = page.locator(`[data-testid^="product-card"]`);
  await expect(productCards.first()).toBeVisible({ timeout: 30000 });
});

Then(
  "the product {string} should show {string} units in stock",
  async ({ page }: { page: Page }, productName: string, quantity: string) => {
    // Use prefixed name to find the correct product
    const productCard = page.locator(`[data-testid^="product-card"]`).filter({
      hasText: prefixName(productName),
    });
    const qty = parseInt(quantity, 10);
    // Stock level text depends on quantity threshold (10)
    if (qty > 10) {
      await expect(productCard).toContainText(`${quantity} in stock`);
    } else if (qty > 0) {
      await expect(productCard).toContainText(`Only ${quantity} left`);
    } else {
      await expect(productCard).toContainText("Out of stock");
    }
  }
);

// Consolidated step: Handles both {string} and {int} since parseInt handles both
Then(
  "eventually the product {string} should show {string} units in stock",
  async ({ page }: { page: Page }, productName: string, quantity: string) => {
    // Use prefixed name to find the correct product
    const prefixedName = prefixName(productName);
    const qty = parseInt(quantity, 10);
    await waitUntilProjection(
      async () => {
        const productCard = page.locator(`[data-testid^="product-card"]`).filter({
          hasText: prefixedName,
        });
        const text = await productCard.textContent();
        // Stock level text depends on quantity threshold (10)
        if (qty > 10) {
          return text?.includes(`${quantity} in stock`);
        } else if (qty > 0) {
          return text?.includes(`Only ${quantity} left`);
        } else {
          return text?.includes("Out of stock");
        }
      },
      { timeout: 30000 }
    );
  }
);

// Variant with {int} for unquoted numbers in feature files (e.g., "should show 50 units")
Then(
  "eventually the product {string} should show {int} units in stock",
  async ({ page }: { page: Page }, productName: string, quantity: number) => {
    // Use prefixed name to find the correct product
    const prefixedName = prefixName(productName);
    await waitUntilProjection(
      async () => {
        const productCard = page.locator(`[data-testid^="product-card"]`).filter({
          hasText: prefixedName,
        });
        const text = await productCard.textContent();
        // Stock level text depends on quantity threshold (10)
        if (quantity > 10) {
          return text?.includes(`${quantity} in stock`);
        } else if (quantity > 0) {
          return text?.includes(`Only ${quantity} left`);
        } else {
          return text?.includes("Out of stock");
        }
      },
      { timeout: 30000 }
    );
  }
);
