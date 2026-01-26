/**
 * ## Event Stream Queries for Reactive Projections
 *
 * Provides Convex queries for subscribing to recent events for a specific entity.
 *
 * These queries enable the hybrid reactive model where the client:
 * 1. Subscribes to the durable projection (via regular useQuery)
 * 2. Subscribes to recent events after the projection's checkpoint
 * 3. Applies events optimistically using the shared evolve function
 *
 * ### Security Note
 *
 * Event payloads may contain sensitive data. These queries filter events
 * to only return those for the requesting entity (streamId match).
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";

/**
 * Maximum number of recent events to return.
 * Limits memory usage and network transfer.
 */
const MAX_RECENT_EVENTS = 20;

/**
 * Get recent order events for reactive projection updates.
 *
 * Returns events for a specific order after a given global position.
 * Used by useReactiveProjection to apply optimistic updates on the client.
 *
 * @example
 * ```typescript
 * // In React component
 * const recentEvents = useQuery(api.queries.events.getRecentOrderEvents, {
 *   orderId: "order-123",
 *   afterGlobalPosition: projection.lastGlobalPosition,
 * });
 * ```
 */
export const getRecentOrderEvents = query({
  args: {
    /** Order ID to get events for */
    orderId: v.string(),
    /** Only return events after this global position (exclusive) */
    afterGlobalPosition: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      globalPosition: v.number(),
      timestamp: v.number(),
      // Use record type for better type safety than v.any()
      payload: v.record(v.string(), v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const { orderId, afterGlobalPosition } = args;

    // Read events from the Order stream
    const events = await ctx.runQuery(components.eventStore.lib.readStream, {
      streamType: "Order",
      streamId: orderId,
      // Note: readStream uses version, not globalPosition
      // We'll filter by globalPosition after fetching
    });

    // Filter to events after the checkpoint and limit to recent ones
    let filteredEvents = events;

    if (afterGlobalPosition !== undefined) {
      filteredEvents = events.filter((e) => e.globalPosition > afterGlobalPosition);
    }

    // Take only the most recent events to limit payload size
    const recentEvents = filteredEvents.slice(-MAX_RECENT_EVENTS);

    // Map to reactive-friendly format (exclude internal fields)
    return recentEvents.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      globalPosition: event.globalPosition,
      timestamp: event.timestamp,
      payload: event.payload,
    }));
  },
});

/**
 * Get the latest global position for an order's event stream.
 *
 * Useful for checking if there are new events without fetching all data.
 *
 * @example
 * ```typescript
 * const latestPosition = useQuery(api.queries.events.getOrderStreamPosition, {
 *   orderId: "order-123",
 * });
 *
 * if (latestPosition > projection.lastGlobalPosition) {
 *   // New events available
 * }
 * ```
 */
export const getOrderStreamPosition = query({
  args: {
    orderId: v.string(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const { orderId } = args;

    // Read all events from the Order stream to find the highest globalPosition
    // Note: We can't use limit here because events are ordered by version, not globalPosition
    const events = await ctx.runQuery(components.eventStore.lib.readStream, {
      streamType: "Order",
      streamId: orderId,
    });

    if (events.length === 0) {
      return null;
    }

    // Find the highest global position across all events
    // (events are returned in order by version, not global position)
    return Math.max(...events.map((e) => e.globalPosition));
  },
});

/**
 * Get recent inventory events for reactive projection updates.
 *
 * Returns events for a specific product after a given global position.
 * Used for inventory-related reactive projections.
 */
export const getRecentInventoryEvents = query({
  args: {
    /** Product ID to get events for */
    productId: v.string(),
    /** Only return events after this global position (exclusive) */
    afterGlobalPosition: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      globalPosition: v.number(),
      timestamp: v.number(),
      // Use record type for better type safety than v.any()
      payload: v.record(v.string(), v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const { productId, afterGlobalPosition } = args;

    // Read events from the Product stream
    const events = await ctx.runQuery(components.eventStore.lib.readStream, {
      streamType: "Product",
      streamId: productId,
    });

    // Filter to events after the checkpoint
    let filteredEvents = events;

    if (afterGlobalPosition !== undefined) {
      filteredEvents = events.filter((e) => e.globalPosition > afterGlobalPosition);
    }

    // Take only the most recent events
    const recentEvents = filteredEvents.slice(-MAX_RECENT_EVENTS);

    return recentEvents.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      globalPosition: event.globalPosition,
      timestamp: event.timestamp,
      payload: event.payload,
    }));
  },
});
