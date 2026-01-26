/**
 * Event upcasting for Order domain events.
 *
 * Transforms events from older schema versions to current versions at read time.
 * This enables non-breaking schema evolution - old events remain valid and are
 * automatically migrated when processed.
 *
 * ## Migration Chain
 *
 * - OrderSubmitted: V1 → V2 (adds customer snapshot with null)
 *
 * ## Usage
 *
 * ```typescript
 * import { upcastOrderSubmitted, orderEventUpcasterRegistry } from "./upcasting.js";
 *
 * // Single event type
 * const { event, wasUpcasted } = upcastOrderSubmitted(rawEvent);
 *
 * // Or use registry for all event types
 * const { event, wasUpcasted } = orderEventUpcasterRegistry.upcast(rawEvent);
 * ```
 */

import {
  createEventUpcaster,
  createUpcasterRegistry,
  addFieldMigration,
  type EventMigration,
} from "@libar-dev/platform-core/events";
import type { OrderSubmittedV2Payload } from "./events.js";

// =============================================================================
// ORDERSUBMITTED UPCASTER (V1 → V2)
// =============================================================================

/**
 * Upcast OrderSubmitted events from V1 to V2.
 *
 * V1 events (without customer snapshot) are migrated to V2 format with
 * `customer: null`. This indicates the event was created before the
 * Fat Events pattern was implemented.
 *
 * @example
 * ```typescript
 * // V1 event (legacy)
 * const v1Event = {
 *   eventType: "OrderSubmitted",
 *   schemaVersion: 1,
 *   payload: { orderId: "ord-1", customerId: "cust-1", ... }
 * };
 *
 * // After upcasting
 * const { event, wasUpcasted } = upcastOrderSubmitted(v1Event);
 * // event.schemaVersion === 2
 * // event.payload.customer === null
 * // wasUpcasted === true
 * ```
 */
export const upcastOrderSubmitted = createEventUpcaster<OrderSubmittedV2Payload>({
  currentVersion: 2,
  migrations: {
    // V1 → V2: Add customer field with null.
    // Null indicates this is a legacy event created before Fat Events.
    // Consumers can distinguish newly created V2 events (with customer data)
    // from upcasted V1 events (with null customer).
    // Type assertion needed because addFieldMigration returns a more specific type
    1: addFieldMigration("customer", null, 2) as EventMigration,
  },
});

// =============================================================================
// ORDER EVENT UPCASTER REGISTRY
// =============================================================================

/**
 * Registry of all order event upcasters.
 *
 * Use this in projection handlers to automatically upcast any order event
 * to its current schema version before processing.
 *
 * @example
 * ```typescript
 * import { orderEventUpcasterRegistry } from "./upcasting.js";
 *
 * // In projection handler
 * const { event: upcastedEvent, wasUpcasted } = orderEventUpcasterRegistry.upcast(rawEvent);
 *
 * if (wasUpcasted) {
 *   console.log(`Upcasted ${rawEvent.eventType} from v${rawEvent.schemaVersion}`);
 * }
 *
 * // Process upcastedEvent with current schema
 * ```
 */
export const orderEventUpcasterRegistry = createUpcasterRegistry();

// Register all order event upcasters
orderEventUpcasterRegistry.register("OrderSubmitted", upcastOrderSubmitted);

// Future migrations can be added here:
// orderEventUpcasterRegistry.register("OrderCreated", upcastOrderCreated);
// orderEventUpcasterRegistry.register("OrderConfirmed", upcastOrderConfirmed);
