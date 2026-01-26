/**
 * Saga event definitions for workflow communication.
 *
 * These events are used by @convex-dev/workflow for cross-context coordination.
 */
import { v } from "convex/values";

/**
 * Event payload for inventory reservation result.
 * Sent by Inventory context to signal workflow completion.
 */
export const inventoryReservedPayload = v.object({
  success: v.boolean(),
  reservationId: v.optional(v.string()),
  failureReason: v.optional(v.string()),
});

/**
 * Event name for inventory reservation result.
 */
export const INVENTORY_RESERVED_EVENT = "inventoryReserved" as const;
