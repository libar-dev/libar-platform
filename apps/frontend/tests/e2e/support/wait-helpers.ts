import { Locator, Page, expect } from "@playwright/test";

export interface WaitOptions {
  timeout?: number;
  interval?: number;
}

/**
 * Default timeout for projection/saga processing.
 * Increased to 30s to allow for eventual consistency in DDD/ES/CQRS architecture.
 * The saga workflow (command → event → projection update) may take time.
 */
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_INTERVAL = 500;

/**
 * Timeout for checking if inventory is already loaded.
 *
 * This is used when waiting for the Current Inventory section to load during
 * setup steps. The timeout is a "fast fail" - if products aren't visible within
 * this time, we assume none exist yet and proceed to create them.
 *
 * Set to 5000ms to handle slower CI environments while still failing quickly
 * if products genuinely don't exist.
 */
export const INVENTORY_LOAD_TIMEOUT = 5000;

/**
 * Wait until a condition becomes true by polling.
 * Useful for eventual consistency scenarios where projections
 * may take time to update after a command is processed.
 */
export async function waitUntilProjection<T>(
  condition: () => Promise<T>,
  options: WaitOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch {
      // Condition threw, keep polling
    }
    await sleep(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for specific text to appear in a locator.
 * Wraps Playwright's built-in text assertions with polling for
 * eventual consistency scenarios.
 */
export async function waitForText(
  locator: Locator,
  text: string | RegExp,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await expect(locator).toContainText(text, { timeout });
}

/**
 * Wait for an element to be visible.
 */
export async function waitForVisible(locator: Locator, options: WaitOptions = {}): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await expect(locator).toBeVisible({ timeout });
}

/**
 * Wait for an element to be hidden or removed from DOM.
 */
export async function waitForHidden(locator: Locator, options: WaitOptions = {}): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await expect(locator).toBeHidden({ timeout });
}

/**
 * Wait for a specific count of elements.
 * Useful for waiting until a list has loaded with expected items.
 */
export async function waitForCount(
  locator: Locator,
  count: number,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await expect(locator).toHaveCount(count, { timeout });
}

/**
 * Simple delay utility.
 * Use sparingly - prefer condition-based waiting when possible.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an action until it succeeds or times out.
 * Useful for flaky operations that may need multiple attempts.
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  options: WaitOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startTime < timeout) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      await sleep(interval);
    }
  }

  throw lastError ?? new Error(`Action failed after ${timeout}ms`);
}

/**
 * Select a product from the stock form dropdown, waiting for the product
 * to appear in the projection first.
 *
 * This handles eventual consistency - after creating a product, it may take
 * some time for the projection to update and show the product in the dropdown.
 *
 * @param page - Playwright page instance
 * @param productName - The prefixed product name to select
 * @param options - Optional timeout and interval settings
 */
export async function selectProductInStockDropdown(
  page: Page,
  productName: string,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = 1000 } = options;

  await waitUntilProjection(
    async () => {
      // Open the dropdown
      const selectTrigger = page.getByTestId("stock-product-select");
      await selectTrigger.click();

      // Wait for dropdown options to appear (content should load)
      const listbox = page.getByRole("listbox");
      try {
        await listbox.waitFor({ state: "visible", timeout: 500 });
      } catch {
        // Dropdown not ready - close and retry
        await page.keyboard.press("Escape");
        return false;
      }

      // Check if our option exists
      const option = page.getByRole("option").filter({ hasText: productName }).first();
      const count = await option.count();

      if (count > 0) {
        // Found the option - click it and return success
        await option.click();
        return true;
      }

      // Option not found - close dropdown by pressing Escape and return false to retry
      await page.keyboard.press("Escape");
      return false;
    },
    { timeout, interval }
  );
}

/**
 * Wait for a product to appear in the product catalog on the order creation page.
 *
 * This handles eventual consistency - after creating a product and adding stock,
 * it may take time for the productCatalog projection to update.
 *
 * @param page - Playwright page instance
 * @param productName - The prefixed product name to wait for
 * @param options - Optional timeout and interval settings
 */
export async function waitForProductInCatalog(
  page: Page,
  productName: string,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = 1000 } = options;

  await waitUntilProjection(
    async () => {
      // Check if the product card exists in the catalog
      const productCard = page
        .getByTestId("product-catalog")
        .locator(`[data-testid^="product-card"]`)
        .filter({ hasText: productName });

      const count = await productCard.count();
      return count > 0;
    },
    { timeout, interval }
  );
}

/**
 * Wait for a product to show a specific stock level in the Current Inventory list.
 *
 * Stock badge text formats recognized:
 * - "X in stock" (e.g., "50 in stock")
 * - "Only X left" (e.g., "Only 5 left")
 * - Returns false for non-numeric formats (e.g., "Out of stock")
 *
 * This follows the integration test pattern: wait for the SPECIFIC value
 * immediately after a mutation, before proceeding to the next step.
 *
 * Use this after "Add Stock" to confirm the projection has processed
 * before navigating to another page.
 *
 * @param page - Playwright page instance
 * @param productName - The prefixed product name to wait for
 * @param expectedStock - The expected stock quantity (e.g., 50)
 * @param options - Optional timeout and interval settings
 */
export async function waitForProductStockInInventory(
  page: Page,
  productName: string,
  expectedStock: number,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = 500 } = options;

  await waitUntilProjection(
    async () => {
      // Find the product card in the Current Inventory section (product-list, not product-catalog)
      const productCard = page
        .getByTestId("product-list")
        .locator(`[data-testid^="product-card"]`)
        .filter({ hasText: productName });

      // Check if the card exists
      const cardCount = await productCard.count();
      if (cardCount === 0) {
        return false;
      }

      // Check if the stock badge shows the expected value
      const stockBadge = productCard.getByTestId("stock-badge");
      const stockText = await stockBadge.textContent();

      // Stock badge shows "X in stock" or "Only X left"
      // Extract the number and compare
      if (stockText) {
        const match = stockText.match(/(\d+)/);
        if (match) {
          const actualStock = parseInt(match[1], 10);
          return actualStock === expectedStock;
        }
      }

      return false;
    },
    { timeout, interval }
  );
}

/**
 * Wait for the product form to be fully hydrated after SSR.
 *
 * The Product ID input shows "Generating..." during SSR and only gets a real
 * value (starting with "prod-") after React hydrates and useEffect fires.
 * This is our reliable hydration signal for the product form.
 *
 * Use this before interacting with any product form fields to ensure
 * React state is ready to receive input.
 *
 * @param page - Playwright page instance
 * @param options - Optional timeout settings
 *
 * @example
 * ```typescript
 * await page.goto("/admin/products");
 * await waitForProductFormHydration(page);
 * // Now safe to fill form fields
 * await page.getByTestId("product-name-input").fill("My Product");
 * ```
 */
export async function waitForProductFormHydration(
  page: Page,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  const productIdInput = page.getByTestId("product-id-input");

  // Wait for hydration signal: input no longer shows SSR placeholder
  await expect(productIdInput).not.toHaveValue("Generating...", { timeout });

  // Confirm hydration complete: input has generated product ID
  await expect(productIdInput).toHaveValue(/^prod-/, { timeout });

  // Confirm form is interactive
  await expect(page.getByTestId("product-form-submit")).toBeEnabled({ timeout });
}
