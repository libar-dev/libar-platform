/**
 * @libar-docs
 * @libar-docs-pattern ProcessManagerLifecycle
 * @libar-docs-status completed
 * @libar-docs-phase 13
 * @libar-docs-uses EventBusAbstraction
 *
 * ## Process Manager Lifecycle FSM
 *
 * FSM for managing PM state transitions (idle/processing/completed/failed) with validation.
 * Ensures correct lifecycle progression and prevents invalid state changes.
 *
 * ### When to Use
 *
 * - Validating PM state transitions before applying them
 * - Tracking PM lifecycle for monitoring and debugging
 * - Implementing recovery logic for failed PMs
 *
 * @example
 * ```typescript
 * import { pmTransitionState, isPMValidTransition } from "@libar-dev/platform-core/processManager";
 *
 * // Check if a transition is valid
 * if (isPMValidTransition("idle", "START")) {
 *   const newState = pmTransitionState("idle", "START");
 *   // newState === "processing"
 * }
 *
 * // Invalid transition returns null
 * const invalid = pmTransitionState("completed", "START");
 * // invalid === null (completed is terminal)
 * ```
 */

import { PROCESS_MANAGER_STATUSES, type ProcessManagerStatus } from "./types.js";

/**
 * Process manager lifecycle state.
 *
 * - `idle`: Waiting for trigger event, no active processing
 * - `processing`: Currently handling an event and emitting commands
 * - `completed`: Successfully finished (terminal for one-shot PMs)
 * - `failed`: Processing failed, requires investigation
 */
export type ProcessManagerLifecycleState = ProcessManagerStatus;

/**
 * Events that can trigger state transitions.
 */
export type ProcessManagerLifecycleEvent =
  | "START" // Begin processing (event received)
  | "SUCCESS" // Processing completed successfully
  | "FAIL" // Processing failed
  | "RETRY" // Retry after failure
  | "RESET"; // Reset to idle (for time-triggered PMs)

/**
 * Represents a valid state transition.
 */
export interface PMStateTransition {
  readonly from: ProcessManagerLifecycleState;
  readonly event: ProcessManagerLifecycleEvent;
  readonly to: ProcessManagerLifecycleState;
}

/**
 * Valid state transitions.
 *
 * State diagram:
 * ```
 *                           RESET
 *         ┌────────────────────────────────────┐
 *         │                                    │
 *         ▼           START                    │
 *     ┌────────┐ ───────────────► ┌────────────┴──┐
 *     │  idle  │                  │  processing   │
 *     └────────┘                  └───────────────┘
 *         ▲                          │        │
 *         │ RESET                    │        │
 *         │                  SUCCESS │        │ FAIL
 *         │                          ▼        ▼
 *     ┌───┴───────┐             ┌───────────────┐
 *     │ completed │             │    failed     │
 *     └───────────┘             └───────────────┘
 *                                    │
 *                              RETRY │
 *                                    ▼
 *                               processing
 * ```
 *
 * Notes:
 * - `completed` is terminal for one-shot event PMs
 * - `idle` can RESET from completed for time-triggered PMs
 * - `failed` can RETRY to go back to processing
 */
const VALID_TRANSITIONS: readonly PMStateTransition[] = [
  // From idle
  { from: "idle", event: "START", to: "processing" },

  // From processing
  { from: "processing", event: "SUCCESS", to: "completed" },
  { from: "processing", event: "FAIL", to: "failed" },

  // From completed (for time-triggered PMs that need to reset)
  { from: "completed", event: "RESET", to: "idle" },

  // From failed
  { from: "failed", event: "RETRY", to: "processing" },
  { from: "failed", event: "RESET", to: "idle" },
] as const;

// Build lookup map for O(1) transition checks
const transitionMap = new Map<string, ProcessManagerLifecycleState>();
for (const t of VALID_TRANSITIONS) {
  transitionMap.set(`${t.from}:${t.event}`, t.to);
}

// Pre-build lookup map for O(1) valid events retrieval
const validEventsMap = new Map<ProcessManagerLifecycleState, ProcessManagerLifecycleEvent[]>();
for (const state of PROCESS_MANAGER_STATUSES) {
  validEventsMap.set(
    state,
    VALID_TRANSITIONS.filter((t) => t.from === state).map((t) => t.event)
  );
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
 * isPMValidTransition("idle", "START"); // true
 * isPMValidTransition("completed", "START"); // false
 * ```
 */
export function isPMValidTransition(
  from: ProcessManagerLifecycleState,
  event: ProcessManagerLifecycleEvent
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
 * pmTransitionState("idle", "START"); // "processing"
 * pmTransitionState("completed", "START"); // null (invalid)
 * ```
 */
export function pmTransitionState(
  currentState: ProcessManagerLifecycleState,
  event: ProcessManagerLifecycleEvent
): ProcessManagerLifecycleState | null {
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
 * getPMValidEventsFrom("idle"); // ["START"]
 * getPMValidEventsFrom("processing"); // ["SUCCESS", "FAIL"]
 * getPMValidEventsFrom("failed"); // ["RETRY", "RESET"]
 * ```
 */
export function getPMValidEventsFrom(
  state: ProcessManagerLifecycleState
): ProcessManagerLifecycleEvent[] {
  return validEventsMap.get(state) ?? [];
}

/**
 * Get all valid transitions (for introspection/documentation).
 *
 * @returns Array of all valid state transitions
 */
export function getAllPMTransitions(): readonly PMStateTransition[] {
  return VALID_TRANSITIONS;
}

/**
 * Assert a transition is valid, throwing if not.
 *
 * @param from - Current state
 * @param event - Transition event
 * @param processManagerName - PM name for error message
 * @param instanceId - Instance ID for error message
 * @returns New state
 * @throws Error if transition is invalid
 *
 * @example
 * ```typescript
 * const newState = assertPMValidTransition("idle", "START", "orderNotification", "inst-123");
 * // newState === "processing"
 *
 * assertPMValidTransition("completed", "START", "orderNotification", "inst-123");
 * // throws Error: Invalid PM transition for "orderNotification" (inst-123): completed -> START
 * ```
 */
export function assertPMValidTransition(
  from: ProcessManagerLifecycleState,
  event: ProcessManagerLifecycleEvent,
  processManagerName: string,
  instanceId: string
): ProcessManagerLifecycleState {
  const newState = pmTransitionState(from, event);
  if (newState === null) {
    throw new Error(
      `Invalid PM transition for "${processManagerName}" (${instanceId}): ${from} -> ${event}`
    );
  }
  return newState;
}

/**
 * Check if a state is terminal for one-shot process managers.
 *
 * Returns true only for `completed` state. This represents:
 * - **One-shot PMs (event-triggered)**: Truly terminal, PM instance is done
 * - **Time-triggered PMs**: A checkpoint; RESET returns to idle for next scheduled run
 *
 * Note: `failed` is not terminal because it can RETRY or RESET.
 *
 * @param state - State to check
 * @returns true if state is `completed`
 */
export function isTerminalState(state: ProcessManagerLifecycleState): boolean {
  return state === "completed";
}

/**
 * Check if a state indicates an error condition.
 *
 * @param state - State to check
 * @returns true if state indicates an error
 */
export function isErrorState(state: ProcessManagerLifecycleState): boolean {
  return state === "failed";
}
