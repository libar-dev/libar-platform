/**
 * Agent Lifecycle FSM - Pure State Machine for Agent Lifecycle Management
 *
 * Defines the agent lifecycle state machine using an event-driven Map pattern.
 * This is a pure module with no I/O, no Convex imports, and no side effects.
 *
 * States: stopped, active, paused, error_recovery
 * Events: START, PAUSE, RESUME, STOP, RECONFIGURE, ENTER_ERROR_RECOVERY, RECOVER
 *
 * @module agent/lifecycle-fsm
 */

// ============================================================================
// State & Event Constants
// ============================================================================

/**
 * All possible agent lifecycle states.
 */
export const AGENT_LIFECYCLE_STATES = ["stopped", "active", "paused", "error_recovery"] as const;

/**
 * Agent lifecycle state.
 *
 * - `stopped`: Agent is not running
 * - `active`: Agent is actively processing events
 * - `paused`: Agent is temporarily paused (can resume)
 * - `error_recovery`: Agent is recovering from a failure
 */
export type AgentLifecycleState = (typeof AGENT_LIFECYCLE_STATES)[number];

/**
 * All possible agent lifecycle events (triggers for state transitions).
 */
export const AGENT_LIFECYCLE_EVENTS = [
  "START",
  "PAUSE",
  "RESUME",
  "STOP",
  "RECONFIGURE",
  "ENTER_ERROR_RECOVERY",
  "RECOVER",
] as const;

/**
 * Agent lifecycle event that triggers a state transition.
 */
export type AgentLifecycleEvent = (typeof AGENT_LIFECYCLE_EVENTS)[number];

// ============================================================================
// Transition Definition
// ============================================================================

/**
 * A single lifecycle state transition.
 */
export interface AgentLifecycleTransition {
  readonly from: AgentLifecycleState;
  readonly event: AgentLifecycleEvent;
  readonly to: AgentLifecycleState;
}

/**
 * Complete transition table for the agent lifecycle FSM.
 */
const TRANSITIONS: readonly AgentLifecycleTransition[] = [
  { from: "stopped", event: "START", to: "active" },
  { from: "active", event: "PAUSE", to: "paused" },
  { from: "active", event: "STOP", to: "stopped" },
  { from: "active", event: "ENTER_ERROR_RECOVERY", to: "error_recovery" },
  { from: "active", event: "RECONFIGURE", to: "active" },
  { from: "paused", event: "RESUME", to: "active" },
  { from: "paused", event: "STOP", to: "stopped" },
  { from: "paused", event: "RECONFIGURE", to: "active" },
  { from: "error_recovery", event: "RECOVER", to: "active" },
  { from: "error_recovery", event: "STOP", to: "stopped" },
] as const;

// ============================================================================
// Lookup Maps (O(1) Access)
// ============================================================================

/**
 * O(1) transition lookup map keyed by "from:event".
 */
const transitionMap = new Map<string, AgentLifecycleState>(
  TRANSITIONS.map((t) => [`${t.from}:${t.event}`, t.to])
);

/**
 * O(1) valid events lookup map keyed by state.
 */
const validEventsMap = new Map<AgentLifecycleState, readonly AgentLifecycleEvent[]>();

// Build validEventsMap from transitions
for (const state of AGENT_LIFECYCLE_STATES) {
  const events = TRANSITIONS.filter((t) => t.from === state).map((t) => t.event);
  validEventsMap.set(state, events);
}

// ============================================================================
// Command-to-Event Mapping
// ============================================================================

/**
 * Maps command type strings to lifecycle events.
 */
const COMMAND_TO_EVENT_MAP = new Map<string, AgentLifecycleEvent>([
  ["StartAgent", "START"],
  ["PauseAgent", "PAUSE"],
  ["ResumeAgent", "RESUME"],
  ["StopAgent", "STOP"],
  ["ReconfigureAgent", "RECONFIGURE"],
]);

// ============================================================================
// Transition Functions
// ============================================================================

/**
 * Check if a transition is valid for the given state and event.
 *
 * @param from - Current lifecycle state
 * @param event - Lifecycle event to apply
 * @returns true if the transition is valid
 */
export function isValidAgentTransition(
  from: AgentLifecycleState,
  event: AgentLifecycleEvent
): boolean {
  return transitionMap.has(`${from}:${event}`);
}

/**
 * Compute the next state for a given current state and event.
 *
 * Returns null if the transition is invalid (no matching entry in the transition table).
 *
 * @param currentState - Current lifecycle state
 * @param event - Lifecycle event to apply
 * @returns The next state, or null if the transition is invalid
 */
export function transitionAgentState(
  currentState: AgentLifecycleState,
  event: AgentLifecycleEvent
): AgentLifecycleState | null {
  return transitionMap.get(`${currentState}:${event}`) ?? null;
}

/**
 * Assert that a transition is valid and return the next state.
 *
 * Throws an error if the transition is invalid.
 *
 * @param from - Current lifecycle state
 * @param event - Lifecycle event to apply
 * @param agentId - Agent identifier for error context
 * @returns The next state
 * @throws Error if the transition is invalid
 */
export function assertValidAgentTransition(
  from: AgentLifecycleState,
  event: AgentLifecycleEvent,
  agentId: string
): AgentLifecycleState {
  const nextState = transitionMap.get(`${from}:${event}`);
  if (nextState === undefined) {
    const validEvents = validEventsMap.get(from) ?? [];
    throw new Error(
      `Invalid agent lifecycle transition: agent="${agentId}" ` +
        `from="${from}" event="${event}". ` +
        `Valid events from "${from}": [${validEvents.join(", ")}]`
    );
  }
  return nextState;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all valid events that can be applied from a given state.
 *
 * @param state - Current lifecycle state
 * @returns Array of valid events for the given state
 */
export function getValidAgentEventsFrom(
  state: AgentLifecycleState
): readonly AgentLifecycleEvent[] {
  return validEventsMap.get(state) ?? [];
}

/**
 * Get the complete transition table.
 *
 * @returns All defined agent lifecycle transitions
 */
export function getAllAgentTransitions(): readonly AgentLifecycleTransition[] {
  return TRANSITIONS;
}

// ============================================================================
// State Classification Helpers
// ============================================================================

/**
 * Check if a lifecycle state is an error state.
 *
 * @param state - Lifecycle state to check
 * @returns true if the state is "error_recovery"
 */
export function isAgentErrorState(state: AgentLifecycleState): boolean {
  return state === "error_recovery";
}

/**
 * Check if a lifecycle state is a processing state (agent is actively handling events).
 *
 * @param state - Lifecycle state to check
 * @returns true if the state is "active"
 */
export function isAgentProcessingState(state: AgentLifecycleState): boolean {
  return state === "active";
}

/**
 * Map a command type string to its corresponding lifecycle event.
 *
 * @param commandType - Command type (e.g., "StartAgent", "PauseAgent")
 * @returns The corresponding lifecycle event, or null if no mapping exists
 */
export function commandToEvent(commandType: string): AgentLifecycleEvent | null {
  return COMMAND_TO_EVENT_MAP.get(commandType) ?? null;
}
