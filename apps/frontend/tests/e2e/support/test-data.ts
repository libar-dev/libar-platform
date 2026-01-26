/**
 * Test data constants and generators for E2E tests.
 * Provides consistent, traceable test data across all test scenarios.
 *
 * ## Test Isolation via Namespacing
 *
 * All entity names and SKUs are prefixed with a unique `testRunId` to ensure
 * logical isolation between test runs. This allows tests to run repeatedly
 * without database cleanup (which is impossible for Convex components).
 *
 * @see ./testRunId.ts for the namespacing mechanism
 */

import { testRunId, prefixName, prefixSku } from "./testRunId";

// Demo customer for all test scenarios (prefixed for isolation)
export const DEMO_CUSTOMER_ID = `${testRunId}-demo-customer-001`;

// Counter for unique ID generation within a test run
let idCounter = 0;

/**
 * Reset the ID counter. Call at the start of each test suite
 * to ensure reproducible IDs within a test run.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Generate a unique product ID for testing.
 * Format: test-product-{timestamp}-{counter}
 */
export function generateProductId(): string {
  return `test-product-${Date.now()}-${++idCounter}`;
}

/**
 * Generate a unique order ID for testing.
 * Format: test-order-{timestamp}-{counter}
 */
export function generateOrderId(): string {
  return `test-order-${Date.now()}-${++idCounter}`;
}

/**
 * Generate a unique SKU for testing.
 * Format: {testRunId}-TST-{timestamp}-{counter}
 * SKU is prefixed with testRunId for isolation.
 */
export function generateSku(): string {
  return prefixSku(`TST-${Date.now()}-${++idCounter}`);
}

/**
 * Generate a unique command ID for idempotency.
 * Format: cmd-{timestamp}-{counter}
 */
export function generateCommandId(): string {
  return `cmd-${Date.now()}-${++idCounter}`;
}

/**
 * Sample product data for tests.
 * Names and SKUs are prefixed with testRunId for isolation.
 *
 * Note: These are functions that return fresh prefixed values each time,
 * ensuring the testRunId is captured at call time.
 */
export function getSampleProducts() {
  return {
    basic: {
      name: prefixName("Test Widget"),
      sku: prefixSku("WIDGET-001"),
      initialStock: 100,
      unitPrice: 29.99,
    },
    premium: {
      name: prefixName("Premium Gadget"),
      sku: prefixSku("GADGET-PRO"),
      initialStock: 50,
      unitPrice: 149.99,
    },
    lowStock: {
      name: prefixName("Limited Item"),
      sku: prefixSku("LIMITED-001"),
      initialStock: 5,
      unitPrice: 99.99,
    },
  };
}

/** Product override options for createTestProduct */
type ProductOverrides = Partial<{
  name: string;
  sku: string;
  initialStock: number;
  unitPrice: number;
}>;

/**
 * Sample order data with properly prefixed SKUs for test isolation.
 * Call this function to get order data with SKUs matching the current test run.
 */
export function getSampleOrders() {
  return {
    singleItem: {
      customerId: DEMO_CUSTOMER_ID,
      items: [{ sku: prefixSku("WIDGET-001"), quantity: 2 }],
    },
    multiItem: {
      customerId: DEMO_CUSTOMER_ID,
      items: [
        { sku: prefixSku("WIDGET-001"), quantity: 1 },
        { sku: prefixSku("GADGET-PRO"), quantity: 1 },
      ],
    },
  };
}

/**
 * Create a unique product test data set with generated IDs.
 * All names and SKUs are automatically prefixed with testRunId.
 */
export function createTestProduct(overrides: ProductOverrides = {}) {
  const productId = generateProductId();
  const sku = generateSku();

  return {
    productId,
    // If name is provided, prefix it; otherwise generate a prefixed name
    name: overrides.name ? prefixName(overrides.name) : prefixName(`Test Product ${idCounter}`),
    sku: overrides.sku ? prefixSku(overrides.sku) : sku,
    initialStock: overrides.initialStock ?? 100,
    unitPrice: overrides.unitPrice ?? 29.99,
  };
}

// Re-export testRunId utilities for convenience
export { testRunId, prefixName, prefixSku } from "./testRunId";
