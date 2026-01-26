"use client";

/**
 * ## useReactiveProjection - Hybrid Durable + Optimistic React Hook
 *
 * Combines Workpool durability with reactive push for 10-50ms UI updates.
 *
 * This hook implements the hybrid model:
 * 1. Subscribes to durable projection (Convex reactive query)
 * 2. Subscribes to recent events after projection checkpoint
 * 3. Applies events optimistically using shared evolve function
 *
 * ### Usage
 *
 * ```typescript
 * const { state, isOptimistic, pendingEvents } = useReactiveProjection({
 *   projection: durableProjection,
 *   recentEvents: eventsAfterCheckpoint,
 *   evolve: evolveOrderSummary,
 *   getPosition: (p) => p.lastGlobalPosition ?? 0,
 * });
 * ```
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

import { useMemo } from "react";

// Import types from platform-core to avoid duplication
import type { ReactiveDomainEvent, EvolveFunction } from "@libar-dev/platform-core/projections";

// Re-export for convenience
export type { ReactiveDomainEvent, EvolveFunction };

/**
 * Options for useReactiveProjection hook.
 */
export interface UseReactiveProjectionOptions<TProjection, TEvent extends ReactiveDomainEvent> {
  /**
   * Durable projection state from useQuery.
   * Pass null/undefined when loading.
   */
  projection: TProjection | null | undefined;

  /**
   * Recent events after the projection's checkpoint.
   * Pass null/undefined when loading.
   */
  recentEvents: TEvent[] | null | undefined;

  /**
   * Pure evolve function for state transformation.
   * IMPORTANT: Must be stable (memoized or module-level) to prevent re-renders.
   */
  evolve: EvolveFunction<TProjection, TEvent>;

  /**
   * Extract global position from projection state.
   * Returns 0 for missing projections.
   */
  getPosition: (projection: TProjection) => number;
}

/**
 * Result from useReactiveProjection hook.
 */
export interface ReactiveProjectionResult<T> {
  /** Current merged state (durable + optimistic), or null if loading */
  state: T | null;

  /** True if loading (projection or events not yet loaded) */
  isLoading: boolean;

  /** True if optimistic events have been applied */
  isOptimistic: boolean;

  /** Last processed global position from durable projection */
  durablePosition: number;

  /** Count of optimistic (pending) events applied */
  pendingEvents: number;

  /** Error when optimistic merge fails (null on success) */
  error: Error | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for reactive projections with optimistic updates.
 *
 * Merges durable projection state with recent events for instant UI feedback.
 * The evolve function runs client-side to apply events optimistically.
 *
 * @param options - Hook configuration
 * @returns Merged state with optimistic metadata
 *
 * @example
 * ```tsx
 * function OrderDetail({ orderId }: { orderId: string }) {
 *   // Durable projection from Convex
 *   const projection = useQuery(api.orders.getOrderSummary, { orderId });
 *
 *   // Recent events after projection checkpoint
 *   const recentEvents = useQuery(api.queries.events.getRecentOrderEvents, {
 *     orderId,
 *     afterGlobalPosition: projection?.updatedAt ?? 0,
 *   });
 *
 *   // Merge with optimistic updates
 *   const { state, isOptimistic, pendingEvents } = useReactiveProjection({
 *     projection,
 *     recentEvents,
 *     evolve: evolveOrderSummary,
 *     getPosition: (p) => p.updatedAt,
 *   });
 *
 *   if (!state) return <Skeleton />;
 *
 *   return (
 *     <div>
 *       <h1>Order {state.orderId}</h1>
 *       <p>Status: {state.status}</p>
 *       {isOptimistic && (
 *         <Badge>Updating... ({pendingEvents} pending)</Badge>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useReactiveProjection<TProjection, TEvent extends ReactiveDomainEvent>({
  projection,
  recentEvents,
  evolve,
  getPosition,
}: UseReactiveProjectionOptions<TProjection, TEvent>): ReactiveProjectionResult<TProjection> {
  // Compute merged state
  const result = useMemo<ReactiveProjectionResult<TProjection>>(() => {
    // Still loading - projection not yet available
    if (projection === undefined || projection === null) {
      return {
        state: null,
        isLoading: projection === undefined,
        isOptimistic: false,
        durablePosition: 0,
        pendingEvents: 0,
        error: null,
      };
    }

    const durablePosition = getPosition(projection);

    // No events or events still loading - return durable state
    if (!recentEvents || recentEvents.length === 0) {
      return {
        state: projection,
        isLoading: recentEvents === undefined,
        isOptimistic: false,
        durablePosition,
        pendingEvents: 0,
        error: null,
      };
    }

    // Filter events that might already be in durable state
    // This provides defense against duplicate event processing
    const optimisticEvents = recentEvents.filter((event) => event.globalPosition > durablePosition);

    // No optimistic events - return durable state
    if (optimisticEvents.length === 0) {
      return {
        state: projection,
        isLoading: false,
        isOptimistic: false,
        durablePosition,
        pendingEvents: 0,
        error: null,
      };
    }

    // Sort filtered events by globalPosition to ensure correct ordering
    const sortedEvents = [...optimisticEvents].sort((a, b) => a.globalPosition - b.globalPosition);

    // Apply events in sequence with error handling
    // Falls back to durable state if evolve fails (malformed events, bugs)
    try {
      const mergedState = sortedEvents.reduce<TProjection>((state, event, index) => {
        try {
          return evolve(state, event);
        } catch (innerError) {
          // Include event context in error for debugging
          const eventInfo = `eventType=${event.eventType}, position=${event.globalPosition}`;
          throw new Error(
            `Failed to apply event ${index + 1}/${sortedEvents.length} (${eventInfo}): ${
              innerError instanceof Error ? innerError.message : String(innerError)
            }`
          );
        }
      }, projection);

      return {
        state: mergedState,
        isLoading: false,
        isOptimistic: true,
        durablePosition,
        pendingEvents: sortedEvents.length,
        error: null,
      };
    } catch (err) {
      // Gracefully degrade to durable state on error
      // This prevents component crashes from malformed events
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn(
        "[useReactiveProjection] Failed to apply optimistic events, falling back to durable state:",
        error.message
      );
      return {
        state: projection,
        isLoading: false,
        isOptimistic: false,
        durablePosition,
        pendingEvents: 0,
        error,
      };
    }
  }, [projection, recentEvents, evolve, getPosition]);

  return result;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Create a stable getPosition function for common patterns.
 *
 * @param field - Field name to extract position from
 * @returns Memoized getPosition function
 *
 * @example
 * ```typescript
 * const getPosition = useGetPosition<OrderSummary>('updatedAt');
 * ```
 */
export function createGetPosition<T>(field: keyof T): (projection: T) => number {
  return (projection: T) => {
    const value = projection[field];
    return typeof value === "number" ? value : 0;
  };
}
