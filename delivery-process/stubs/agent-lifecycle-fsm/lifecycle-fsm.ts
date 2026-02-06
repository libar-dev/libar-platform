/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 *
 * Agent Lifecycle FSM — DS-5 Stub
 *
 * Formal state machine governing agent start/pause/resume/stop/reconfigure transitions.
 * Follows the event-driven Map pattern established by ProcessManagerLifecycle and
 * ProjectionLifecycle.
 *
 * Target: platform-core/src/agent/lifecycle-fsm.ts
 *
 * DS-5 Design Session: Agent Lifecycle FSM
 * PDR: pdr-013-agent-lifecycle-fsm (AD-1)
 *
 * See: platform-core/src/processManager/lifecycle.ts — template pattern (identical structure)
 * See: platform-core/src/projections/lifecycle.ts — also uses this pattern (has PAUSE/RESUME)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Agent lifecycle states.
 *
 * - `stopped`: Not processing events. Restartable via START.
 * - `active`: Processing events normally.
 * - `paused`: Temporarily not processing. Events seen-but-skipped (checkpoint advances).
 * - `error_recovery`: Automatic recovery after repeated failures (DS-3 circuit breaker scope).
 */
export const AGENT_LIFECYCLE_STATES = ["stopped", "active", "paused", "error_recovery"] as const;

export type AgentLifecycleState = (typeof AGENT_LIFECYCLE_STATES)[number];

/**
 * Events that trigger lifecycle state transitions.
 *
 * Events map to lifecycle commands:
 * - START → StartAgent command
 * - PAUSE → PauseAgent command
 * - RESUME → ResumeAgent command
 * - STOP → StopAgent command
 * - RECONFIGURE → ReconfigureAgent command
 * - ENTER_ERROR_RECOVERY → Circuit breaker threshold exceeded (DS-3)
 * - RECOVER → Automatic cooldown timer expired (DS-3)
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

export type AgentLifecycleEvent = (typeof AGENT_LIFECYCLE_EVENTS)[number];

/**
 * Represents a valid state transition.
 */
export interface AgentLifecycleTransition {
  readonly from: AgentLifecycleState;
  readonly event: AgentLifecycleEvent;
  readonly to: AgentLifecycleState;
}

// ============================================================================
// Transition Table
// ============================================================================

/**
 * Valid state transitions.
 *
 * State diagram:
 * ```
 *                       START
 *           ┌──────────────────────────────┐
 *           │                              │
 *           ▼         PAUSE                │
 *       ┌────────┐ ─────────► ┌────────┐  │
 *       │ active │             │ paused │  │
 *       └────────┘ ◄───────── └────────┘  │
 *           │  │     RESUME        │       │
 *           │  │                   │ STOP  │
 *      STOP │  │ ENTER_ERROR_     │       │
 *           │  │  RECOVERY         ▼       │
 *           ▼  ▼              ┌─────────┐  │
 *     ┌─────────┐             │ stopped │──┘
 *     │  error  │  STOP       └─────────┘
 *     │recovery │──────────────────^
 *     └─────────┘
 *          │
 *     RECOVER│
 *          ▼
 *       active
 *
 *     RECONFIGURE: active → active, paused → active
 * ```
 *
 * Notes:
 * - No terminal states — `stopped` is restartable via START.
 * - StopAgent is the universal escape hatch (available from active, paused, error_recovery).
 * - ReconfigureAgent from paused implicitly resumes (transitions to active).
 * - ENTER_ERROR_RECOVERY and RECOVER are internal events (not user-issued commands).
 */
const VALID_TRANSITIONS: readonly AgentLifecycleTransition[] = [
  // From stopped
  { from: "stopped", event: "START", to: "active" },

  // From active
  { from: "active", event: "PAUSE", to: "paused" },
  { from: "active", event: "STOP", to: "stopped" },
  { from: "active", event: "ENTER_ERROR_RECOVERY", to: "error_recovery" },
  { from: "active", event: "RECONFIGURE", to: "active" },

  // From paused
  { from: "paused", event: "RESUME", to: "active" },
  { from: "paused", event: "STOP", to: "stopped" },
  // OPEN QUESTION (Holistic Review): Should `paused + RECONFIGURE -> paused` be valid?
  // Current design: paused + RECONFIGURE -> active (implicit resume).
  // Alternative: allow config update without resume. Use case: operator changes
  // confidence threshold while agent is paused for investigation, wants it to stay paused.
  // Decision: Keep current design for DS-5. Revisit if admin UI use cases demand it.
  { from: "paused", event: "RECONFIGURE", to: "active" },

  // From error_recovery
  { from: "error_recovery", event: "RECOVER", to: "active" },
  { from: "error_recovery", event: "STOP", to: "stopped" },
] as const;

// Build lookup map for O(1) transition checks: "from:event" → toState
const transitionMap = new Map<string, AgentLifecycleState>();
for (const t of VALID_TRANSITIONS) {
  transitionMap.set(`${t.from}:${t.event}`, t.to);
}

// Pre-build lookup map for O(1) valid events retrieval per state
const validEventsMap = new Map<AgentLifecycleState, AgentLifecycleEvent[]>();
for (const state of AGENT_LIFECYCLE_STATES) {
  validEventsMap.set(
    state,
    VALID_TRANSITIONS.filter((t) => t.from === state).map((t) => t.event)
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a state transition is valid.
 *
 * @param from - Current state
 * @param event - Transition event
 * @returns true if the transition is valid
 *
 * @example
 * ```typescript
 * isValidAgentTransition("stopped", "START"); // true
 * isValidAgentTransition("stopped", "PAUSE"); // false
 * ```
 */
export function isValidAgentTransition(
  from: AgentLifecycleState,
  event: AgentLifecycleEvent
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
 * transitionAgentState("stopped", "START"); // "active"
 * transitionAgentState("stopped", "PAUSE"); // null (invalid)
 * ```
 */
export function transitionAgentState(
  currentState: AgentLifecycleState,
  event: AgentLifecycleEvent
): AgentLifecycleState | null {
  return transitionMap.get(`${currentState}:${event}`) ?? null;
}

/**
 * Assert a transition is valid, throwing if not.
 *
 * @param from - Current state
 * @param event - Transition event
 * @param agentId - Agent ID for error message
 * @returns New state
 * @throws Error if transition is invalid
 *
 * @example
 * ```typescript
 * const newState = assertValidAgentTransition("stopped", "START", "churn-risk-agent");
 * // newState === "active"
 *
 * assertValidAgentTransition("stopped", "PAUSE", "churn-risk-agent");
 * // throws: Invalid agent lifecycle transition for "churn-risk-agent": stopped -> PAUSE.
 * //         Valid events from "stopped": START
 * ```
 */
export function assertValidAgentTransition(
  from: AgentLifecycleState,
  event: AgentLifecycleEvent,
  agentId: string
): AgentLifecycleState {
  const newState = transitionAgentState(from, event);
  if (newState === null) {
    const validEvents = getValidAgentEventsFrom(from);
    throw new Error(
      `Invalid agent lifecycle transition for "${agentId}": ${from} -> ${event}. ` +
        `Valid events from "${from}": ${validEvents.length > 0 ? validEvents.join(", ") : "(none — state has no outbound transitions)"}`
    );
  }
  return newState;
}

/**
 * Get all valid events from a given state.
 *
 * @param state - Current state
 * @returns Array of valid events from this state
 *
 * @example
 * ```typescript
 * getValidAgentEventsFrom("stopped"); // ["START"]
 * getValidAgentEventsFrom("active");  // ["PAUSE", "STOP", "ENTER_ERROR_RECOVERY", "RECONFIGURE"]
 * getValidAgentEventsFrom("paused");  // ["RESUME", "STOP", "RECONFIGURE"]
 * ```
 */
export function getValidAgentEventsFrom(state: AgentLifecycleState): AgentLifecycleEvent[] {
  return validEventsMap.get(state) ?? [];
}

/**
 * Get all valid transitions (for introspection/documentation).
 *
 * @returns Array of all valid state transitions
 */
export function getAllAgentTransitions(): readonly AgentLifecycleTransition[] {
  return VALID_TRANSITIONS;
}

// No terminal state in agent lifecycle — agents can always be restarted

/**
 * Check if a state indicates an error condition.
 *
 * @param state - State to check
 * @returns true if state is `error_recovery`
 */
export function isErrorState(state: AgentLifecycleState): boolean {
  return state === "error_recovery";
}

/**
 * Check if a state means the agent should process events.
 *
 * Only `active` state processes events. All other states (paused, stopped,
 * error_recovery) skip event processing.
 *
 * @param state - State to check
 * @returns true if state is `active`
 */
export function isProcessingState(state: AgentLifecycleState): boolean {
  return state === "active";
}

/**
 * Map lifecycle command type to FSM event.
 *
 * Convenience for handlers that receive command type strings and need
 * the corresponding FSM event.
 *
 * @param commandType - Lifecycle command type string
 * @returns Corresponding FSM event, or null if not a lifecycle command
 */
export function commandToEvent(commandType: string): AgentLifecycleEvent | null {
  switch (commandType) {
    case "StartAgent":
      return "START";
    case "PauseAgent":
      return "PAUSE";
    case "ResumeAgent":
      return "RESUME";
    case "StopAgent":
      return "STOP";
    case "ReconfigureAgent":
      return "RECONFIGURE";
    default:
      return null;
  }
}
