/**
 * ## Reactive Projections - Hybrid Workpool + Reactive Model
 *
 * Hybrid architecture for 10-50ms UI updates without polling.
 *
 * Implements reactive layer on top of existing Workpool-based projections to enable
 * near-instant UI updates. Combines Workpool durability (background processing) with
 * reactive push for speed (optimistic client updates). Shares event application logic
 * between server (durable) and client (optimistic) for consistency.
 *
 * ### When to Use
 *
 * - When UI requires near-instant updates (10-50ms response time)
 * - When polling is unacceptable (too slow or resource-intensive)
 * - When you need optimistic UI with server reconciliation
 * - For View category projections only (determined by ProjectionCategories)
 *
 * ### Architecture
 *
 * ```
 * Command Handler
 *      ↓ (append event)
 * Event Store
 *      ↓
 *      ├─→ Workpool (durable, eventual)
 *      │        ↓
 *      │   Projection Update
 *      │
 *      └─→ Reactive Push (immediate, optimistic)
 *               ↓
 *          Client Update
 * ```
 *
 * ### Key Benefits
 *
 * - **Speed**: 10-50ms updates vs 100-500ms polling
 * - **Durability**: Workpool ensures eventual consistency
 * - **Optimistic UX**: Immediate feedback with automatic rollback on conflicts
 * - **Shared Logic**: Same event application code on client and server
 *
 * @example
 * ```typescript
 * // React hook for reactive projection
 * const { state, isOptimistic, pendingEvents } = useReactiveProjection({
 *   projectionQuery: () => useQuery(api.orderSummaries.get, { orderId }),
 *   eventStreamQuery: (pos) => useQuery(api.events.getRecent, { orderId, afterPosition: pos }),
 *   evolve: evolveOrderSummary,
 *   getPosition: (p) => p.lastGlobalPosition,
 * });
 * ```
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

import { isViewProjection, type ProjectionCategory } from "@libar-dev/platform-bc";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for reactive projection operations.
 */
export const REACTIVE_PROJECTION_ERRORS = {
  REACTIVE_NOT_SUPPORTED: "REACTIVE_NOT_SUPPORTED",
  INVALID_CATEGORY: "INVALID_CATEGORY",
  INVALID_PROJECTION_NAME: "INVALID_PROJECTION_NAME",
  INVALID_STREAM_ID: "INVALID_STREAM_ID",
  INVALID_EVOLVE_FUNCTION: "INVALID_EVOLVE_FUNCTION",
  MERGE_FAILED: "MERGE_FAILED",
} as const;

export type ReactiveProjectionErrorCode =
  (typeof REACTIVE_PROJECTION_ERRORS)[keyof typeof REACTIVE_PROJECTION_ERRORS];

// ============================================================================
// Core Types
// ============================================================================

/**
 * Domain event interface for reactive projections.
 *
 * Events must have at minimum:
 * - eventType: discriminator for the evolve switch
 * - globalPosition: ordering for conflict detection
 */
export interface ReactiveDomainEvent {
  /** Event type discriminator */
  eventType: string;
  /** Global ordering position in event store */
  globalPosition: number;
  /** Event payload (type-specific data) */
  payload?: Record<string, unknown>;
}

/**
 * Pure function that transforms projection state based on an event.
 *
 * This function must be:
 * - Pure (no side effects)
 * - Deterministic (same inputs → same outputs)
 * - Total (handles all event types, unknown types return state unchanged)
 *
 * @typeParam TProjection - The projection state type
 * @typeParam TEvent - The domain event type (must extend ReactiveDomainEvent)
 *
 * @example
 * ```typescript
 * const evolveOrderSummary: EvolveFunction<OrderSummary, OrderEvent> = (state, event) => {
 *   switch (event.eventType) {
 *     case 'OrderSubmitted':
 *       return { ...state, status: 'submitted' };
 *     default:
 *       return state; // Unknown events pass through
 *   }
 * };
 * ```
 */
export type EvolveFunction<TProjection, TEvent extends ReactiveDomainEvent> = (
  state: TProjection,
  event: TEvent
) => TProjection;

/**
 * Configuration for reactive projection subscription.
 *
 * @typeParam TProjection - The projection state type
 * @typeParam TEvent - The domain event type
 */
export interface ReactiveProjectionConfig<TProjection, TEvent extends ReactiveDomainEvent> {
  /** Projection name (must be View category) */
  projectionName: string;

  /** Projection category for eligibility check */
  category: ProjectionCategory;

  /** Stream ID to subscribe to (e.g., orderId) */
  streamId: string;

  /** Pure evolve function for state transformation */
  evolve: EvolveFunction<TProjection, TEvent>;

  /**
   * Extract global position from projection state.
   * Used to determine which events to fetch.
   */
  getPosition: (projection: TProjection) => number;
}

/**
 * Result from useReactiveProjection hook.
 *
 * @typeParam T - The projection state type
 */
export interface ReactiveProjectionResult<T> {
  /** Current merged state (durable + optimistic), or null if not loaded */
  state: T | null;

  /** True if loading (projection or events not yet loaded) */
  isLoading: boolean;

  /** True if optimistic events have been applied */
  isOptimistic: boolean;

  /** Last processed global position from durable projection */
  durablePosition: number;

  /** Count of optimistic (pending) events applied */
  pendingEvents: number;

  /** Error if reactive subscription failed */
  error: ReactiveProjectionError | null;
}

/**
 * Error type for reactive projection operations.
 */
export interface ReactiveProjectionError {
  /** Error code for programmatic handling */
  code: ReactiveProjectionErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggestion for resolution */
  suggestion?: string;
}

/**
 * Validation result for reactive projection configuration.
 */
export interface ReactiveConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Error details if invalid */
  error?: ReactiveProjectionError;
}

// ============================================================================
// Eligibility Functions
// ============================================================================

/**
 * Check if a projection category is eligible for reactive updates.
 *
 * Only "view" category projections support reactive subscriptions because:
 * - They are client-facing and need instant feedback
 * - They have denormalized data suitable for optimistic updates
 * - Other categories (logic, reporting, integration) are internal or async
 *
 * @param category - Projection category to check
 * @returns True if category supports reactive updates
 *
 * @example
 * ```typescript
 * isReactiveEligible('view');        // true
 * isReactiveEligible('logic');       // false
 * isReactiveEligible('reporting');   // false
 * isReactiveEligible('integration'); // false
 * ```
 */
export function isReactiveEligible(category: ProjectionCategory): boolean {
  return isViewProjection(category);
}

/**
 * Validate reactive projection configuration.
 *
 * Checks:
 * - Category is reactive-eligible (view only)
 * - Required fields are present
 * - Evolve function is provided
 *
 * @param config - Configuration to validate
 * @returns Validation result with error details if invalid
 *
 * @example
 * ```typescript
 * const result = validateReactiveConfig({
 *   projectionName: 'orderSummary',
 *   category: 'logic', // Invalid!
 *   streamId: 'order-123',
 *   evolve: evolveOrderSummary,
 *   getPosition: (p) => p.lastGlobalPosition,
 * });
 * // result.valid === false
 * // result.error.code === 'REACTIVE_NOT_SUPPORTED'
 * ```
 */
export function validateReactiveConfig<TProjection, TEvent extends ReactiveDomainEvent>(
  config: ReactiveProjectionConfig<TProjection, TEvent>
): ReactiveConfigValidationResult {
  // Check required string fields are not empty
  if (!config.projectionName || config.projectionName.trim() === "") {
    return {
      valid: false,
      error: {
        code: REACTIVE_PROJECTION_ERRORS.INVALID_PROJECTION_NAME,
        message: "Projection name cannot be empty.",
        suggestion: "Provide a non-empty projection name.",
      },
    };
  }

  if (!config.streamId || config.streamId.trim() === "") {
    return {
      valid: false,
      error: {
        code: REACTIVE_PROJECTION_ERRORS.INVALID_STREAM_ID,
        message: "Stream ID cannot be empty.",
        suggestion: "Provide a valid stream ID (e.g., an order ID or entity ID).",
      },
    };
  }

  // Check category eligibility
  if (!isReactiveEligible(config.category)) {
    return {
      valid: false,
      error: {
        code: REACTIVE_PROJECTION_ERRORS.REACTIVE_NOT_SUPPORTED,
        message: `Projection category "${config.category}" does not support reactive updates. Only "view" projections are reactive-eligible.`,
        suggestion:
          "Use regular useQuery for non-view projections, or change the projection category to 'view' if appropriate.",
      },
    };
  }

  // Check evolve function
  if (typeof config.evolve !== "function") {
    return {
      valid: false,
      error: {
        code: REACTIVE_PROJECTION_ERRORS.INVALID_EVOLVE_FUNCTION,
        message: "Evolve function must be a valid function.",
        suggestion: "Provide a pure function with signature (state, event) => state.",
      },
    };
  }

  return { valid: true };
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merge durable projection state with optimistic events.
 *
 * Applies events in sequence using the evolve function to produce
 * the current optimistic state. Events should be ordered by globalPosition.
 *
 * This function is pure and can run on both server and client.
 *
 * @typeParam TProjection - The projection state type
 * @typeParam TEvent - The domain event type
 *
 * @param projection - Base durable projection state
 * @param events - Recent events to apply optimistically
 * @param evolve - Pure evolve function
 * @returns Merged state with all events applied
 *
 * @example
 * ```typescript
 * const durableState = { status: 'draft', itemCount: 0 };
 * const recentEvents = [
 *   { eventType: 'OrderItemAdded', globalPosition: 5, payload: { itemCount: 1 } },
 *   { eventType: 'OrderSubmitted', globalPosition: 6, payload: {} },
 * ];
 *
 * const merged = mergeProjectionWithEvents(durableState, recentEvents, evolveOrderSummary);
 * // merged = { status: 'submitted', itemCount: 1 }
 * ```
 */
export function mergeProjectionWithEvents<TProjection, TEvent extends ReactiveDomainEvent>(
  projection: TProjection,
  events: TEvent[],
  evolve: EvolveFunction<TProjection, TEvent>
): TProjection {
  if (!events || events.length === 0) {
    return projection;
  }

  // Sort events by globalPosition to ensure correct ordering
  const sortedEvents = [...events].sort((a, b) => a.globalPosition - b.globalPosition);

  // Apply each event in sequence with error handling
  return sortedEvents.reduce((state, event, index) => {
    try {
      return evolve(state, event);
    } catch (error) {
      const eventInfo = `eventType=${event.eventType}, position=${event.globalPosition}`;
      throw new Error(
        `Failed to apply event ${index + 1}/${sortedEvents.length} (${eventInfo}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, projection);
}

/**
 * Create an initial reactive projection result for loading state.
 *
 * @returns Initial result with null state and loading indicators
 */
export function createInitialReactiveResult<T>(): ReactiveProjectionResult<T> {
  return {
    state: null,
    isLoading: true,
    isOptimistic: false,
    durablePosition: 0,
    pendingEvents: 0,
    error: null,
  };
}

/**
 * Create a reactive projection result from durable state and events.
 *
 * @param projection - Durable projection state (or null if not loaded)
 * @param events - Recent events after durable position
 * @param evolve - Pure evolve function
 * @param getPosition - Function to extract position from projection
 * @returns Complete reactive projection result
 */
export function createReactiveResult<TProjection, TEvent extends ReactiveDomainEvent>(
  projection: TProjection | null,
  events: TEvent[] | null,
  evolve: EvolveFunction<TProjection, TEvent>,
  getPosition: (p: TProjection) => number
): ReactiveProjectionResult<TProjection> {
  // Handle null projection
  if (projection === null) {
    return {
      state: null,
      isLoading: false,
      isOptimistic: false,
      durablePosition: 0,
      pendingEvents: 0,
      error: null,
    };
  }

  const durablePosition = getPosition(projection);
  const pendingEvents = events?.length ?? 0;

  // No events to apply
  if (!events || events.length === 0) {
    return {
      state: projection,
      isLoading: false,
      isOptimistic: false,
      durablePosition,
      pendingEvents: 0,
      error: null,
    };
  }

  // Merge durable state with optimistic events
  try {
    const mergedState = mergeProjectionWithEvents(projection, events, evolve);

    return {
      state: mergedState,
      isLoading: false,
      isOptimistic: true,
      durablePosition,
      pendingEvents,
      error: null,
    };
  } catch (error) {
    // Return structured error instead of crashing
    return {
      state: projection,
      isLoading: false,
      isOptimistic: false,
      durablePosition,
      pendingEvents,
      error: {
        code: REACTIVE_PROJECTION_ERRORS.MERGE_FAILED,
        message: error instanceof Error ? error.message : "Failed to merge reactive events.",
        suggestion: "Verify evolve handles all event types and does not throw.",
      },
    };
  }
}

// ============================================================================
// Hook Placeholder (for documentation - actual hook is in frontend)
// ============================================================================

/**
 * React hook for reactive projections with optimistic updates.
 *
 * @deprecated This is a stub that always throws. Use the actual implementation from
 * `apps/frontend/hooks/use-reactive-projection.ts` in React contexts.
 *
 * This stub exists only for type documentation purposes. The actual React hook
 * cannot be implemented in this package because:
 * - React hooks require React to be installed
 * - This package is framework-agnostic
 * - The hook needs Convex's useQuery which is frontend-specific
 *
 * The hook combines:
 * - Durable projection query (Convex reactive subscription)
 * - Event stream query (recent events after durable position)
 * - Shared evolve logic (same function used on server)
 *
 * @param _config - Reactive projection configuration (unused in stub)
 * @returns Never returns - always throws
 * @throws Error indicating this is a stub implementation
 */
export function useReactiveProjection<TProjection, TEvent extends ReactiveDomainEvent>(
  _config: ReactiveProjectionConfig<TProjection, TEvent>
): ReactiveProjectionResult<TProjection> {
  throw new Error(
    "useReactiveProjection stub: Use the actual implementation from 'apps/frontend/hooks/use-reactive-projection.ts'"
  );
}
