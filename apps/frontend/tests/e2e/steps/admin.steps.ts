import { createBdd, DataTable } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { prefixName, prefixSku } from "../support/testRunId";
import { selectProductInStockDropdown } from "../support/wait-helpers";

const { When } = createBdd();

// ============================================
// Product Form Steps
// ============================================

When("I fill in product details:", async ({ page }: { page: Page }, dataTable: DataTable) => {
  const rows = dataTable.hashes();
  const row = rows[0];

  // Wait for form to be fully hydrated before filling
  // The Product ID input shows "Generating..." during SSR and only gets a real value
  // after React hydrates and useEffect fires. This is our hydration signal.
  const productIdInput = page.getByTestId("product-id-input");
  await expect(productIdInput).not.toHaveValue("Generating...");
  await expect(productIdInput).toHaveValue(/^prod-/);
  await expect(page.getByTestId("product-form-submit")).toBeEnabled();

  // Fill inputs and blur to commit React state before moving to next field
  if (row?.name) {
    const nameInput = page.getByTestId("product-name-input");
    const prefixedName = prefixName(row.name);
    await nameInput.fill(prefixedName);
    await nameInput.blur();
    await expect(nameInput).toHaveValue(prefixedName);
  }
  if (row?.sku) {
    const skuInput = page.getByTestId("product-sku-input");
    const prefixedSku = prefixSku(row.sku);
    await skuInput.fill(prefixedSku);
    await skuInput.blur();
    await expect(skuInput).toHaveValue(prefixedSku);
  }
  if (row?.price) {
    const priceInput = page.getByTestId("product-price-input");
    await priceInput.fill(row.price);
    await priceInput.blur();
    await expect(priceInput).toHaveValue(row.price);
  }
});

When("I fill in the product name {string}", async ({ page }: { page: Page }, name: string) => {
  const nameInput = page.getByTestId("product-name-input");
  const prefixedName = prefixName(name);
  await nameInput.fill(prefixedName);
  await nameInput.blur();
  await expect(nameInput).toHaveValue(prefixedName);
});

When("I fill in the SKU {string}", async ({ page }: { page: Page }, sku: string) => {
  const skuInput = page.getByTestId("product-sku-input");
  const prefixedSku = prefixSku(sku);
  await skuInput.fill(prefixedSku);
  await skuInput.blur();
  await expect(skuInput).toHaveValue(prefixedSku);
});

When("I fill in the price {string}", async ({ page }: { page: Page }, price: string) => {
  const priceInput = page.getByTestId("product-price-input");
  await priceInput.fill(price);
  await priceInput.blur();
  await expect(priceInput).toHaveValue(price);
});

// Shared helper to click buttons by text with special handling for known buttons
async function clickButton(page: Page, buttonText: string): Promise<void> {
  if (buttonText === "Create Product") {
    await page.getByTestId("product-form-submit").click();
  } else if (buttonText === "Add Stock") {
    await page.getByTestId("stock-form-submit").click();
  } else if (buttonText === "Create Order") {
    await page.getByTestId("order-submit-button").click();
  } else if (buttonText === "New Order") {
    await page.getByRole("link", { name: buttonText }).click();
  } else {
    await page.getByRole("button", { name: buttonText }).click();
  }
}

When("I click {string}", async ({ page }: { page: Page }, buttonText: string) => {
  await clickButton(page, buttonText);
});

When(
  "I click {string} without filling the form",
  async ({ page }: { page: Page }, buttonText: string) => {
    // Just click without filling anything
    await clickButton(page, buttonText);
  }
);

// ============================================
// Stock Form Steps
// ============================================

When("I select the product {string}", async ({ page }: { page: Page }, productName: string) => {
  // Use prefixed name and helper that handles eventual consistency
  const prefixedName = prefixName(productName);
  await selectProductInStockDropdown(page, prefixedName);
});

When("I enter quantity {int}", async ({ page }: { page: Page }, quantity: number) => {
  await page.getByTestId("stock-quantity-input").fill(quantity.toString());
});

When("I enter reason {string}", async ({ page }: { page: Page }, reason: string) => {
  await page.getByTestId("stock-reason-input").fill(reason);
});
