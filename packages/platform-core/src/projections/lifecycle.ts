/**
 * Projection Lifecycle State Machine
 *
 * Manages projection state transitions with validation.
 * Projections can be active, rebuilding, paused, or in error state.
 *
 * @example
 * ```typescript
 * import { transitionState, isValidTransition } from "@libar-dev/platform-core";
 *
 * // Check if a transition is valid
 * if (isValidTransition("active", "START_REBUILD")) {
 *   const newState = transitionState("active", "START_REBUILD");
 *   // newState === "rebuilding"
 * }
 *
 * // Invalid transition returns null
 * const invalid = transitionState("paused", "COMPLETE_REBUILD");
 * // invalid === null (can't complete rebuild from paused state)
 * ```
 */

import type { ProjectionStatus } from "./types.js";

/**
 * Projection lifecycle state.
 *
 * - `active`: Normal operation, processing events as they arrive
 * - `rebuilding`: Processing historical events, new events are queued
 * - `paused`: Temporarily stopped, no event processing
 * - `error`: Failed state, requires intervention
 */
export type ProjectionLifecycleState = ProjectionStatus;

/**
 * Events that can trigger state transitions.
 */
export type ProjectionLifecycleEvent =
  | "START_REBUILD" // Begin rebuilding from scratch
  | "COMPLETE_REBUILD" // Rebuild finished successfully
  | "FAIL" // Processing failed
  | "PAUSE" // Temporarily stop processing
  | "RESUME" // Resume from paused state
  | "RECOVER"; // Recover from error state

/**
 * Represents a valid state transition.
 */
export interface StateTransition {
  readonly from: ProjectionLifecycleState;
  readonly event: ProjectionLifecycleEvent;
  readonly to: ProjectionLifecycleState;
}

/**
 * Valid state transitions.
 *
 * State diagram:
 * ```
 *                    START_REBUILD
 *         ┌─────────────────────────────────────┐
 *         │                                     │
 *         ▼                                     │
 *     ┌────────┐    COMPLETE_REBUILD    ┌──────────────┐
 *     │ active │ ◄───────────────────── │ rebuilding   │
 *     └────────┘                        └──────────────┘
 *         │  │                                │
 *   PAUSE │  │ FAIL                     FAIL │
 *         │  │                                │
 *         ▼  ▼                                ▼
 *     ┌────────┐                        ┌──────────┐
 *     │ paused │ ─────────────────────► │  error   │ ◄── START_REBUILD
 *     └────────┘         FAIL           └──────────┘        (can retry)
 *         │  │                                │
 *  RESUME │  │ START_REBUILD         RECOVER  │
 *         │  │                                │
 *         │  └───────────► rebuilding ◄───────┘
 *         │
 *         └───────────────► active
 * ```
 */
const VALID_TRANSITIONS: readonly StateTransition[] = [
  // From active
  { from: "active", event: "START_REBUILD", to: "rebuilding" },
  { from: "active", event: "PAUSE", to: "paused" },
  { from: "active", event: "FAIL", to: "error" },

  // From rebuilding
  { from: "rebuilding", event: "COMPLETE_REBUILD", to: "active" },
  { from: "rebuilding", event: "FAIL", to: "error" },

  // From paused
  { from: "paused", event: "RESUME", to: "active" },
  { from: "paused", event: "START_REBUILD", to: "rebuilding" },
  { from: "paused", event: "FAIL", to: "error" },

  // From error
  { from: "error", event: "RECOVER", to: "active" },
  { from: "error", event: "START_REBUILD", to: "rebuilding" },
] as const;

// Build lookup map for O(1) transition checks
const transitionMap = new Map<string, ProjectionLifecycleState>();
for (const t of VALID_TRANSITIONS) {
  transitionMap.set(`${t.from}:${t.event}`, t.to);
}

/**
 * Check if a state transition is valid.
 *
 * @param from - Current state
 * @param event - Transition event
 * @returns true if the transition is valid
 *
 * @example
 * ```typescript
 * isValidTransition("active", "START_REBUILD"); // true
 * isValidTransition("paused", "COMPLETE_REBUILD"); // false
 * ```
 */
export function isValidTransition(
  from: ProjectionLifecycleState,
  event: ProjectionLifecycleEvent
): boolean {
  return transitionMap.has(`${from}:${event}`);
}

/**
 * Perform a state transition.
 *
 * @param currentState - Current state
 * @param event - Transition event
 * @returns New state if transition is valid, null otherwise
 *
 * @example
 * ```typescript
 * transitionState("active", "START_REBUILD"); // "rebuilding"
 * transitionState("paused", "COMPLETE_REBUILD"); // null (invalid)
 * ```
 */
export function transitionState(
  currentState: ProjectionLifecycleState,
  event: ProjectionLifecycleEvent
): ProjectionLifecycleState | null {
  return transitionMap.get(`${currentState}:${event}`) ?? null;
}

/**
 * Get all valid events from a given state.
 *
 * @param state - Current state
 * @returns Array of valid events from this state
 *
 * @example
 * ```typescript
 * getValidEventsFrom("active"); // ["START_REBUILD", "PAUSE", "FAIL"]
 * getValidEventsFrom("paused"); // ["RESUME", "START_REBUILD", "FAIL"]
 * ```
 */
export function getValidEventsFrom(state: ProjectionLifecycleState): ProjectionLifecycleEvent[] {
  return VALID_TRANSITIONS.filter((t) => t.from === state).map((t) => t.event);
}

/**
 * Get all valid transitions (for introspection/documentation).
 *
 * @returns Array of all valid state transitions
 */
export function getAllTransitions(): readonly StateTransition[] {
  return VALID_TRANSITIONS;
}

/**
 * Assert a transition is valid, throwing if not.
 *
 * @param from - Current state
 * @param event - Transition event
 * @param projectionName - Projection name for error message
 * @returns New state
 * @throws Error if transition is invalid
 *
 * @example
 * ```typescript
 * const newState = assertValidTransition("active", "START_REBUILD", "orderSummary");
 * // newState === "rebuilding"
 *
 * assertValidTransition("paused", "COMPLETE_REBUILD", "orderSummary");
 * // throws Error: Invalid transition for projection "orderSummary": paused -> COMPLETE_REBUILD
 * ```
 */
export function assertValidTransition(
  from: ProjectionLifecycleState,
  event: ProjectionLifecycleEvent,
  projectionName: string
): ProjectionLifecycleState {
  const newState = transitionState(from, event);
  if (newState === null) {
    throw new Error(`Invalid transition for projection "${projectionName}": ${from} -> ${event}`);
  }
  return newState;
}
