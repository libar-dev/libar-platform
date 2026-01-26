/**
 * Customer snapshot for fat events enrichment.
 *
 * This module provides customer data lookup for enriching OrderSubmitted events
 * with point-in-time customer information. Since no Customer BC exists in this
 * example app, we use a simple lookup table for demonstration purposes.
 *
 * In a real application, this would:
 * - Query a Customer BC via component API
 * - Or use a denormalized customer cache
 * - Or call an external customer service
 */

/**
 * Customer snapshot captured at event time.
 *
 * Uses nullable fields to handle missing data gracefully.
 * Order submission should never fail due to missing customer data.
 */
export interface CustomerSnapshot {
  /** Customer ID (always present) */
  id: string;
  /** Customer name at time of capture (null if not available) */
  name: string | null;
  /** Customer email at time of capture (null if not available) */
  email: string | null;
}

/**
 * Demo customer data for the example app.
 *
 * In a real application, this would be replaced with a proper
 * customer lookup mechanism (BC query, cache, external service).
 */
const DEMO_CUSTOMERS: Record<string, { name: string; email: string }> = {
  "cust-001": { name: "John Doe", email: "john@example.com" },
  "cust-002": { name: "Jane Smith", email: "jane@example.com" },
  "cust-003": { name: "Bob Wilson", email: "bob@example.com" },
};

/**
 * Load customer snapshot for event enrichment.
 *
 * This function is synchronous and never throws - it gracefully handles
 * missing customer data by returning null fields.
 *
 * @param customerId - Customer ID to look up
 * @returns CustomerSnapshot with available data (null for missing fields)
 *
 * @example
 * ```typescript
 * const snapshot = loadCustomerSnapshot("cust-001");
 * // { id: "cust-001", name: "John Doe", email: "john@example.com" }
 *
 * const unknown = loadCustomerSnapshot("unknown-id");
 * // { id: "unknown-id", name: null, email: null }
 * ```
 */
export function loadCustomerSnapshot(customerId: string): CustomerSnapshot {
  const customer = DEMO_CUSTOMERS[customerId];
  return {
    id: customerId,
    name: customer?.name ?? null,
    email: customer?.email ?? null,
  };
}

/**
 * Check if a customer ID exists in the demo data.
 * Useful for test setup.
 */
export function isKnownCustomer(customerId: string): boolean {
  return customerId in DEMO_CUSTOMERS;
}

/**
 * Get all demo customer IDs.
 * Useful for test fixtures.
 */
export function getDemoCustomerIds(): string[] {
  return Object.keys(DEMO_CUSTOMERS);
}
