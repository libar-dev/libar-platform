/**
 * Test Run Identifier for E2E Test Isolation
 *
 * This module provides a unique identifier for each test run. All entity names
 * (products, orders, customers) are prefixed with this ID to ensure logical
 * isolation between test runs without needing database cleanup.
 *
 * ## Why Namespacing?
 *
 * Convex components (Workpool, Workflow) have isolated databases with no cleanup API.
 * The only true state reset is Docker volume deletion, which is slow and impractical
 * per-test. Instead, we prefix entity names so each test run "sees" only its own data.
 *
 * ## Usage
 *
 * ```typescript
 * import { testRunId, prefixName } from '../support/testRunId';
 *
 * // In Given steps - create with prefix
 * const productName = prefixName("Widget Pro"); // "r1a2bxy Widget Pro"
 *
 * // In Then steps - search with same prefix
 * await expect(page.getByText(prefixName("Widget Pro"))).toBeVisible();
 * ```
 *
 * ## Format
 *
 * The testRunId is a 7-character alphanumeric string: 4 chars from timestamp +
 * 2 random chars. This keeps entity names readable while preventing collisions
 * when tests start within the same ~60ms window.
 *
 * Example: "r1a2bxy" (timestamp slice + random slice)
 */

/**
 * Unique identifier for this test run.
 * Generated once when the module is loaded (start of test suite).
 *
 * Format: "r" + last 4 chars of base36 timestamp + 2 random chars
 * Example: "r1a2bxy"
 *
 * The random suffix prevents collisions when tests start within ~60ms window.
 */
export const testRunId = `r${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-2)}`;

/**
 * Prefix an entity name with the test run ID.
 *
 * @param name - The original entity name (e.g., "Widget Pro")
 * @returns The prefixed name (e.g., "r1a2bxy Widget Pro")
 *
 * @example
 * ```typescript
 * prefixName("Widget Pro")  // "r1a2bxy Widget Pro"
 * prefixName("TST-SKU-001") // "r1a2bxy TST-SKU-001"
 * ```
 */
export function prefixName(name: string): string {
  return `${testRunId} ${name}`;
}

/**
 * Prefix an SKU with the test run ID.
 * SKUs use hyphen separator to maintain valid SKU format.
 *
 * @param sku - The original SKU (e.g., "WIDGET-001")
 * @returns The prefixed SKU (e.g., "R1A2BXY-WIDGET-001")
 *
 * @example
 * ```typescript
 * prefixSku("WIDGET-001")  // "R1A2BXY-WIDGET-001"
 * prefixSku("TEST-SKU")    // "R1A2BXY-TEST-SKU"
 * ```
 */
export function prefixSku(sku: string): string {
  // SKUs are typically uppercase with hyphens, so we use uppercase prefix
  return `${testRunId.toUpperCase()}-${sku}`;
}
