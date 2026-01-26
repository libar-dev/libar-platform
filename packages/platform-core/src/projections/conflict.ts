/**
 * ## Conflict Detection Module for Reactive Projections
 *
 * Detects conflicts between optimistic (client-side) and durable (server-side) state.
 *
 * This module handles the critical reconciliation between what the client thinks
 * happened (optimistic updates) and what actually happened (durable server state).
 *
 * ### Conflict Scenarios
 *
 * | Scenario | Detection | Resolution |
 * |----------|-----------|------------|
 * | Optimistic ahead of durable | `optimisticPosition > durablePosition` | No conflict - wait for catchup |
 * | Same position | `optimisticPosition === durablePosition` | No conflict - converged |
 * | Divergent (durable has different events) | Event IDs don't match | Conflict - rollback |
 *
 * ### Why globalPosition, not timestamps?
 *
 * - `globalPosition` is the canonical ordering from the event store
 * - Timestamps can drift, be out of sync, or have precision issues
 * - Position comparison is deterministic and reliable
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Conflict resolution strategies.
 *
 * - `rollback`: Discard optimistic state, show durable state
 * - `merge`: Attempt to merge (future: sophisticated merge strategies)
 * - `ignore`: Keep optimistic state (use with caution)
 */
export const CONFLICT_RESOLUTIONS = {
  rollback: "rollback",
  merge: "merge",
  ignore: "ignore",
} as const;

export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[keyof typeof CONFLICT_RESOLUTIONS];

/**
 * Represents an applied optimistic event with its position.
 */
export interface AppliedOptimisticEvent {
  /** Event ID */
  eventId: string;
  /** Global position of the event */
  position: number;
}

/**
 * Represents optimistic (client-side) state tracking.
 */
export interface OptimisticState {
  /** Last global position processed optimistically */
  position: number;

  /**
   * Events with their positions for proper partial clearing.
   * Single source of truth - derive event IDs when needed via:
   * `appliedEvents.map(e => e.eventId)`
   */
  appliedEvents: AppliedOptimisticEvent[];

  /** Timestamp when optimistic state was created */
  createdAt: number;
}

/**
 * Represents durable (server-side) state tracking.
 */
export interface DurableState {
  /** Last global position confirmed by durable projection */
  position: number;

  /** Last event ID confirmed by durable projection */
  lastEventId: string;

  /** Timestamp when durable state was last updated */
  updatedAt: number;
}

/**
 * Configuration for conflict detection.
 */
export interface ConflictDetectionConfig {
  /**
   * Maximum age (in ms) before optimistic state is considered stale.
   * Default: 30000 (30 seconds)
   */
  maxOptimisticAge?: number;

  /**
   * Whether to allow divergent event sequences (risky).
   * Default: false
   */
  allowDivergence?: boolean;

  /**
   * Current timestamp for age calculations.
   * Default: Date.now() - inject for testability and purity.
   */
  now?: number;
}

/**
 * Result of conflict detection.
 */
export interface ConflictResult {
  /** Whether a conflict was detected */
  hasConflict: boolean;

  /** Type of conflict (if any) */
  conflictType: ConflictType | null;

  /** Recommended resolution strategy */
  resolution: ConflictResolution;

  /** Human-readable description of the conflict */
  description: string;

  /** Details for debugging/logging */
  details: ConflictDetails;
}

/**
 * Types of conflicts that can be detected.
 */
export type ConflictType =
  | "divergent_branch" // Durable has events not in optimistic
  | "stale_optimistic" // Optimistic state is too old
  | "position_mismatch"; // Positions don't align (unexpected)

/**
 * Detailed information about the conflict.
 */
export interface ConflictDetails {
  /** Optimistic position at time of detection */
  optimisticPosition: number;

  /** Durable position at time of detection */
  durablePosition: number;

  /** Gap between positions */
  positionGap: number;

  /** Whether optimistic is ahead of durable */
  optimisticAhead: boolean;

  /** Age of optimistic state in milliseconds */
  optimisticAgeMs: number;
}

/**
 * Resolved state after conflict resolution.
 */
export interface ResolvedState<T> {
  /** The state to display to the user */
  state: T;

  /** Whether the state is from durable (after rollback) */
  fromDurable: boolean;

  /** Whether any optimistic events were preserved */
  preservedOptimistic: boolean;

  /** Message for UI notification (if rollback occurred) */
  notificationMessage?: string;
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if optimistic state is ahead of durable state.
 *
 * This is the normal case when client has processed recent events
 * that the durable projection hasn't caught up to yet.
 *
 * @param optimisticPosition - Client's last processed position
 * @param durablePosition - Server's last confirmed position
 * @returns True if optimistic is ahead (no conflict expected)
 *
 * @example
 * ```typescript
 * // Client processed events 1-5, server only has 1-3
 * isOptimisticAhead(5, 3); // true - no conflict, wait for catchup
 *
 * // Both at same position - converged
 * isOptimisticAhead(5, 5); // false
 *
 * // Server ahead (unusual - might indicate conflict)
 * isOptimisticAhead(3, 5); // false
 * ```
 */
export function isOptimisticAhead(optimisticPosition: number, durablePosition: number): boolean {
  return optimisticPosition > durablePosition;
}

/**
 * Quick check if there's any conflict.
 *
 * Use this for fast checks before doing full detection.
 *
 * @param optimistic - Optimistic state
 * @param durable - Durable state
 * @param config - Optional configuration
 * @returns True if a conflict exists
 */
export function hasConflict(
  optimistic: OptimisticState,
  durable: DurableState,
  config?: ConflictDetectionConfig
): boolean {
  const result = detectConflict(optimistic, durable, config);
  return result.hasConflict;
}

/**
 * Detect conflicts between optimistic and durable state.
 *
 * Analyzes the relationship between client-side optimistic state and
 * server-side durable state to determine if there's a conflict.
 *
 * @param optimistic - Current optimistic state
 * @param durable - Current durable state
 * @param config - Optional conflict detection configuration
 * @returns Conflict detection result with resolution strategy
 *
 * @example
 * ```typescript
 * const optimistic = {
 *   position: 5,
 *   appliedEvents: [
 *     { eventId: 'evt-3', position: 3 },
 *     { eventId: 'evt-4', position: 4 },
 *     { eventId: 'evt-5', position: 5 }
 *   ],
 *   createdAt: Date.now() - 1000,
 * };
 *
 * const durable = {
 *   position: 4,
 *   lastEventId: 'evt-4',
 *   updatedAt: Date.now(),
 * };
 *
 * const result = detectConflict(optimistic, durable);
 * // result.hasConflict === false (optimistic is ahead, waiting for catchup)
 * ```
 */
export function detectConflict(
  optimistic: OptimisticState,
  durable: DurableState,
  config: ConflictDetectionConfig = {}
): ConflictResult {
  const { maxOptimisticAge = 30000, allowDivergence = false, now = Date.now() } = config;

  const optimisticAgeMs = now - optimistic.createdAt;
  const positionGap = optimistic.position - durable.position;
  const optimisticAhead = positionGap > 0;

  const details: ConflictDetails = {
    optimisticPosition: optimistic.position,
    durablePosition: durable.position,
    positionGap: Math.abs(positionGap),
    optimisticAhead,
    optimisticAgeMs,
  };

  // Case 1: Optimistic state is stale (too old)
  // Only check staleness if there are pending optimistic events
  // Long-lived trackers without pending events should not trigger stale rollbacks
  const hasPendingOptimistic = optimistic.appliedEvents.length > 0;
  if (hasPendingOptimistic && optimisticAgeMs > maxOptimisticAge) {
    return {
      hasConflict: true,
      conflictType: "stale_optimistic",
      resolution: "rollback",
      description: `Optimistic state is stale (${Math.round(optimisticAgeMs / 1000)}s old). Rolling back to durable state.`,
      details,
    };
  }

  // Case 2: Both at same position - converged, no conflict
  if (optimistic.position === durable.position) {
    // Check if the last event ID matches
    // Derive event ID from appliedEvents (single source of truth)
    const lastAppliedEvent = optimistic.appliedEvents[optimistic.appliedEvents.length - 1];
    const lastOptimisticEventId = lastAppliedEvent?.eventId;

    if (lastOptimisticEventId && lastOptimisticEventId !== durable.lastEventId) {
      // Same position but different event IDs - divergent branch!
      if (!allowDivergence) {
        return {
          hasConflict: true,
          conflictType: "divergent_branch",
          resolution: "rollback",
          description:
            "Same position but different events detected. Server processed different events than expected.",
          details,
        };
      }
    }

    // No conflict - states have converged
    return {
      hasConflict: false,
      conflictType: null,
      resolution: "ignore",
      description: "States have converged. No conflict.",
      details,
    };
  }

  // Case 3: Optimistic is ahead of durable - normal case, no conflict
  if (optimisticAhead) {
    // Check if durable's last event is in our optimistic history
    // Use Set for O(1) lookup instead of Array.includes which is O(n)
    // Derive event IDs from appliedEvents (single source of truth)
    const appliedEventIdsSet = new Set(optimistic.appliedEvents.map((e) => e.eventId));
    const durableEventInHistory = appliedEventIdsSet.has(durable.lastEventId);

    if (!durableEventInHistory && optimistic.appliedEvents.length > 0) {
      // Durable processed an event we don't know about - divergent!
      if (!allowDivergence) {
        return {
          hasConflict: true,
          conflictType: "divergent_branch",
          resolution: "rollback",
          description:
            "Durable state contains events not in optimistic history. Rolling back to durable state.",
          details,
        };
      }
    }

    // No conflict - optimistic is just ahead, waiting for durable to catch up
    return {
      hasConflict: false,
      conflictType: null,
      resolution: "ignore",
      description: `Optimistic is ahead by ${positionGap} event(s). Waiting for durable to catch up.`,
      details,
    };
  }

  // Case 4: Durable is ahead of optimistic - unexpected, likely conflict
  // This happens when server processed events the client doesn't know about
  return {
    hasConflict: true,
    conflictType: "position_mismatch",
    resolution: "rollback",
    description: `Durable state is ahead by ${Math.abs(positionGap)} event(s). Client missed events. Rolling back.`,
    details,
  };
}

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Resolve a conflict by applying the recommended resolution strategy.
 *
 * @param result - Conflict detection result
 * @param optimisticState - Current optimistic projection state
 * @param durableState - Current durable projection state
 * @returns Resolved state to display to user
 *
 * @example
 * ```typescript
 * const conflictResult = detectConflict(optimistic, durable);
 *
 * if (conflictResult.hasConflict) {
 *   const resolved = resolveConflict(conflictResult, optimisticData, durableData);
 *   // resolved.state is the state to show
 *   // resolved.notificationMessage can be shown to user
 * }
 * ```
 */
export function resolveConflict<T>(
  result: ConflictResult,
  optimisticState: T,
  durableState: T
): ResolvedState<T> {
  switch (result.resolution) {
    case "rollback":
      return {
        state: durableState,
        fromDurable: true,
        preservedOptimistic: false,
        notificationMessage: `Your changes were updated. ${result.description}`,
      };

    case "merge":
      // Future: implement sophisticated merge strategies
      // For now, fall back to rollback (safer default)
      return {
        state: durableState,
        fromDurable: true,
        preservedOptimistic: false,
        notificationMessage: "Merge not yet implemented. Using server state.",
      };

    case "ignore":
    default:
      // No conflict or explicitly ignoring - keep optimistic
      return {
        state: optimisticState,
        fromDurable: false,
        preservedOptimistic: true,
      };
  }
}

/**
 * Create initial optimistic state tracking.
 *
 * @param position - Starting global position
 * @param now - Optional timestamp for testability (defaults to Date.now())
 * @returns New optimistic state tracker
 */
export function createOptimisticState(position: number = 0, now?: number): OptimisticState {
  return {
    position,
    appliedEvents: [],
    createdAt: now ?? Date.now(),
  };
}

/**
 * Update optimistic state after applying an event.
 *
 * @param state - Current optimistic state
 * @param eventId - ID of the event being applied
 * @param eventPosition - Global position of the event
 * @param now - Optional timestamp for testability (defaults to Date.now())
 * @returns Updated optimistic state
 */
export function addOptimisticEvent(
  state: OptimisticState,
  eventId: string,
  eventPosition: number,
  now: number = Date.now()
): OptimisticState {
  // Refresh createdAt when first event is added to avoid stale rollbacks
  // on long-lived trackers that were created but had no pending events
  const isFirstPending = state.appliedEvents.length === 0;

  return {
    ...state,
    position: eventPosition,
    createdAt: isFirstPending ? now : state.createdAt,
    appliedEvents: [...state.appliedEvents, { eventId, position: eventPosition }],
  };
}

/**
 * Clear optimistic events that have been confirmed by durable state.
 *
 * Call this when durable catches up to optimistic position.
 *
 * @param state - Current optimistic state
 * @param confirmedPosition - Position confirmed by durable state
 * @returns Updated optimistic state with confirmed events removed
 */
export function clearConfirmedEvents(
  state: OptimisticState,
  confirmedPosition: number
): OptimisticState {
  // If durable has caught up to or passed our position, clear all
  if (confirmedPosition >= state.position) {
    return {
      ...state,
      appliedEvents: [],
    };
  }

  // Filter to keep only events after the confirmed position
  const remainingEvents = state.appliedEvents.filter((e) => e.position > confirmedPosition);

  // Update position to match the highest remaining event, or keep original if none remain
  const newPosition =
    remainingEvents.length > 0
      ? Math.max(...remainingEvents.map((e) => e.position))
      : confirmedPosition;

  return {
    ...state,
    position: newPosition,
    appliedEvents: remainingEvents,
  };
}
