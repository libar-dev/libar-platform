/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role service
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer domain
 *
 * Customer Utility Functions for Agent BC
 *
 * Shared utilities for extracting customer information from events.
 *
 * @module contexts/agent/utils/customer
 */

import type { PublishedEvent } from "@libar-dev/platform-core";

/**
 * Extract customer ID from an event payload.
 *
 * Supports multiple extraction strategies:
 * 1. Direct `customerId` field in payload
 * 2. Extract from orderId pattern (e.g., "cust_123_ord_456")
 *
 * @param event - Published event
 * @returns Customer ID or null if not found
 *
 * @example
 * ```typescript
 * const customerId = extractCustomerId(event);
 * if (customerId) {
 *   // Group events by customer
 *   customerEvents[customerId].push(event);
 * }
 * ```
 */
export function extractCustomerId(event: PublishedEvent): string | null {
  const payload = event.payload as Record<string, unknown>;

  // Direct customerId field
  if (typeof payload["customerId"] === "string") {
    return payload["customerId"];
  }

  // Extract from orderId pattern (e.g., "cust_123_ord_456")
  const orderId = payload["orderId"];
  if (typeof orderId === "string" && orderId.includes("_")) {
    const parts = orderId.split("_");
    if (parts[0] === "cust" && parts[1]) {
      return `cust_${parts[1]}`;
    }
  }

  return null;
}

/**
 * Group events by customer ID.
 *
 * @param events - Events to group
 * @returns Map of customer ID to events
 */
export function groupEventsByCustomer(
  events: readonly PublishedEvent[]
): Map<string, PublishedEvent[]> {
  const grouped = new Map<string, PublishedEvent[]>();

  for (const event of events) {
    const customerId = extractCustomerId(event);
    if (customerId) {
      const existing = grouped.get(customerId) ?? [];
      existing.push(event);
      grouped.set(customerId, existing);
    }
  }

  return grouped;
}
