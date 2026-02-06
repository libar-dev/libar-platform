/**
 * @libar-docs
 * @libar-docs-pattern IntegrationEventHandlers
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 *
 * Integration event handlers. Processes integration events from the Published Language
 * and dispatches to appropriate bounded context commands.
 */

// Console declaration for Convex edge runtime
declare const console: { log: (...args: unknown[]) => void };

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Handler for OrderPlacedIntegration events.
 *
 * Receives notification when an order is placed. This handler can:
 * - Log for observability
 * - Update analytics/metrics
 * - Trigger pre-emptive inventory checks
 * - Notify external systems
 *
 * Note: The actual inventory reservation is handled by the saga flow.
 * This handler is for additional loosely-coupled processing.
 */
export const onOrderPlaced = internalMutation({
  args: {
    // IntegrationEvent structure
    integrationEventId: v.string(),
    eventType: v.string(),
    schemaVersion: v.number(),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
    sourceBoundedContext: v.string(),
    correlationId: v.string(),
    causationId: v.string(),
    timestamp: v.number(),
    sourceGlobalPosition: v.number(),
    payload: v.object({
      orderId: v.string(),
      customerId: v.string(),
      items: v.array(
        v.object({
          productId: v.string(),
          quantity: v.number(),
        })
      ),
      totalAmount: v.number(),
      placedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Log the integration event for observability
    console.log(
      `[Integration] OrderPlaced received: orderId=${args.payload.orderId}, ` +
        `items=${args.payload.items.length}, totalAmount=${args.payload.totalAmount}`
    );

    // Example: Could store in an analytics table, send to external webhook, etc.
    // For now, this demonstrates the handler pattern.

    // Return success for workpool tracking
    return { processed: true, integrationEventId: args.integrationEventId };
  },
});
