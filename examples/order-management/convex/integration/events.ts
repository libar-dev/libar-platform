/**
 * Integration events for cross-context communication.
 *
 * These events follow the Published Language pattern from DDD:
 * - Minimal DTO payloads (only what consumers need)
 * - Versioned schemas for contract evolution
 * - No internal domain details exposed
 * - Stable contracts between bounded contexts
 */
import { z } from "zod";
import { createIntegrationEventSchema } from "@libar-dev/platform-core";

// =============================================================================
// Orders → Inventory Integration Events
// =============================================================================

/**
 * OrderPlacedIntegration payload - minimal DTO for inventory context.
 *
 * Contains only the data inventory needs to know an order was placed:
 * - orderId: for correlation
 * - customerId: for potential customer-specific rules
 * - items: product IDs and quantities for pre-check
 * - totalAmount: for potential threshold-based rules
 * - placedAt: timestamp for sequencing
 */
export const OrderPlacedIntegrationPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number(),
    })
  ),
  totalAmount: z.number(),
  placedAt: z.number(),
});

export type OrderPlacedIntegrationPayload = z.infer<typeof OrderPlacedIntegrationPayloadSchema>;

/**
 * OrderPlacedIntegration event schema.
 *
 * Published by Orders context when an order is submitted.
 * Consumed by Inventory context for pre-checks or notifications.
 *
 * Note: This is separate from the saga flow - the saga directly calls
 * inventory commands. This integration event is for loosely-coupled
 * subscribers that want to react to order placements.
 */
export const OrderPlacedIntegrationSchema = createIntegrationEventSchema({
  eventType: "OrderPlacedIntegration",
  payloadSchema: OrderPlacedIntegrationPayloadSchema,
  schemaVersion: 1,
});

export type OrderPlacedIntegrationEvent = z.infer<typeof OrderPlacedIntegrationSchema>;

// =============================================================================
// All Integration Event Types
// =============================================================================

export const INTEGRATION_EVENT_TYPES = ["OrderPlacedIntegration"] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];
