import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { waitUntilProjection, waitForProductStockInInventory } from "../support/wait-helpers";
import { prefixName } from "../support/testRunId";

const { Given, When, Then } = createBdd();

// ============================================
// Navigation Steps
// ============================================

Given("I am on the admin products page", async ({ page }: { page: Page }) => {
  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();
  // Wait for React hydration - the Product ID input shows "Generating..." during SSR
  // and only gets a real value after React hydrates and useEffect fires
  const productIdInput = page.getByTestId("product-id-input");
  await expect(productIdInput).not.toHaveValue("Generating...");
  await expect(productIdInput).toHaveValue(/^prod-/);
  await expect(page.getByTestId("product-form-submit")).toBeEnabled();
});

When("I navigate to the admin products page", async ({ page }: { page: Page }) => {
  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products-page-header")).toBeVisible();
});

When("I navigate to the products page", async ({ page }: { page: Page }) => {
  await page.goto("/products");
  await expect(page.getByTestId("products-page-header")).toBeVisible();
});

When("I navigate to the create order page", async ({ page }: { page: Page }) => {
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();
});

When("I navigate to the orders page", async ({ page }: { page: Page }) => {
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
});

// ============================================
// Tab Navigation Steps
// ============================================

When("I switch to the {string} tab", async ({ page }: { page: Page }, tabName: string) => {
  if (tabName === "Add Stock") {
    await page.getByTestId("tab-add-stock").click();
  } else if (tabName === "Create Product") {
    await page.getByTestId("tab-create-product").click();
    // Wait for form to be fully hydrated after tab switch
    const productIdInput = page.getByTestId("product-id-input");
    await expect(productIdInput).not.toHaveValue("Generating...");
    await expect(productIdInput).toHaveValue(/^prod-/);
  } else {
    throw new Error(`Unknown tab: ${tabName}`);
  }
});

// ============================================
// Success/Error Message Steps
// ============================================

Then(
  "I should see a success message containing {string}",
  async ({ page }: { page: Page }, text: string) => {
    const successBanner = page.getByTestId("admin-success-banner");
    await expect(successBanner).toBeVisible();
    await expect(successBanner).toContainText(text);
  }
);

Then(
  "I should see validation error {string}",
  async ({ page }: { page: Page }, errorText: string) => {
    // Look for error in field errors or error banner
    const errorElement = page.getByText(errorText);
    await expect(errorElement).toBeVisible();
  }
);

Then(
  "I should see an error message containing {string}",
  async ({ page }: { page: Page }, text: string) => {
    const errorBanner = page.getByTestId("admin-error-banner");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(text);
  }
);

// ============================================
// Eventual Consistency - Waiting Steps
// ============================================

Then(
  "eventually I should see {string} in the product list",
  async ({ page }: { page: Page }, productName: string) => {
    // Use prefixed name to find the correct product
    const prefixedName = prefixName(productName);
    await waitUntilProjection(
      async () => {
        const productCard = page.getByText(prefixedName);
        const isVisible = await productCard.isVisible();
        return isVisible;
      },
      { timeout: 30000 }
    );
  }
);

Then(
  "eventually the product {string} should appear in the inventory list",
  async ({ page }: { page: Page }, productName: string) => {
    // Wait for product to appear in the Current Inventory section
    // Use prefixed name to find the correct product
    const prefixedName = prefixName(productName);
    await waitUntilProjection(
      async () => {
        // Look for a product card containing the product name
        // (ProductCard uses data-testid="product-card-{productId}")
        const productCard = page
          .locator(`[data-testid^="product-card"]`)
          .filter({ hasText: prefixedName })
          .first();
        const count = await productCard.count();
        return count > 0;
      },
      { timeout: 30000 }
    );
  }
);

Then(
  "eventually the product {string} should show {string} units in Current Inventory",
  async ({ page }: { page: Page }, productName: string, expectedQuantity: string) => {
    // Wait for the product to show the expected stock level in Current Inventory.
    // This follows the integration test pattern: wait for SPECIFIC value after mutation.
    const prefixedName = prefixName(productName);
    const quantity = parseInt(expectedQuantity, 10);
    await waitForProductStockInInventory(page, prefixedName, quantity);
  }
);

// ============================================
// Redirect Steps
// ============================================

Then("I should be redirected to the order detail page", async ({ page }: { page: Page }) => {
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
  await expect(page.getByTestId("back-to-orders-link")).toBeVisible();
});

Then("I should be redirected to the orders page", async ({ page }: { page: Page }) => {
  await expect(page).toHaveURL("/orders");
});
