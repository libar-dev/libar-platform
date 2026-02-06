/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 *
 * Lifecycle Audit Event Types — DS-5 Stub
 *
 * Six new audit event types for agent lifecycle transitions. These extend the
 * DS-1 audit schema (currently 8 event types → 14 total after DS-5).
 *
 * Target: platform-core/src/agent/component/audit.ts (extends existing auditEventTypeValidator)
 *
 * DS-5 Design Session: Agent Lifecycle FSM
 * PDR: pdr-013-agent-lifecycle-fsm
 *
 * Modifies: delivery-process/stubs/agent-component-isolation/component/schema.ts
 *   The agentAuditEvents.eventType union (lines 71-80) must include these 6 new types.
 * Modifies: delivery-process/stubs/agent-component-isolation/component/audit.ts
 *   The auditEventTypeValidator must include these 6 new types.
 */

import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import type { AgentConfigOverrides } from "./checkpoint-status-extension.js";

// ============================================================================
// Lifecycle Audit Event Types
// ============================================================================

/**
 * New lifecycle audit event types.
 *
 * Combined with existing DS-1 types:
 * - Existing (8): AgentDecisionMade, AgentActionApproved, AgentActionRejected,
 *   AgentActionExpired, AgentAnalysisCompleted, AgentAnalysisFailed,
 *   CommandEmitted, CommandProcessed
 * - DS-4 additions (2): AgentCommandRouted, AgentCommandRoutingFailed
 * - DS-5 additions (6): AgentStarted, AgentPaused, AgentResumed,
 *   AgentStopped, AgentReconfigured, AgentErrorRecoveryStarted
 *
 * Total: 16 event types in the component audit schema.
 */
export const LIFECYCLE_AUDIT_EVENT_TYPES = [
  "AgentStarted",
  "AgentPaused",
  "AgentResumed",
  "AgentStopped",
  "AgentReconfigured",
  "AgentErrorRecoveryStarted",
] as const;

export type LifecycleAuditEventType = (typeof LIFECYCLE_AUDIT_EVENT_TYPES)[number];

// ============================================================================
// Audit Event Payload Types
// ============================================================================

/**
 * Payload for AgentStarted audit event.
 *
 * Recorded when: stopped → active (via StartAgent command)
 */
export interface AgentStartedPayload {
  /** Always "stopped" — StartAgent only valid from stopped state */
  readonly previousState: "stopped";
  /** Correlation ID from the StartAgent command */
  readonly correlationId: string;
  /** Checkpoint position from which processing will resume */
  readonly resumeFromPosition: number;
}

/**
 * Payload for AgentPaused audit event.
 *
 * Recorded when: active → paused (via PauseAgent command)
 */
export interface AgentPausedPayload {
  /** Optional reason for pausing (operator-provided) */
  readonly reason?: string;
  /** Correlation ID from the PauseAgent command */
  readonly correlationId: string;
  /** Checkpoint position at time of pause */
  readonly pausedAtPosition: number;
  /** Total events processed before pause */
  readonly eventsProcessedAtPause: number;
}

/**
 * Payload for AgentResumed audit event.
 *
 * Recorded when: paused → active (via ResumeAgent command)
 */
export interface AgentResumedPayload {
  /** Checkpoint position from which processing will resume */
  readonly resumeFromPosition: number;
  /** Correlation ID from the ResumeAgent command */
  readonly correlationId: string;
}

/**
 * Payload for AgentStopped audit event.
 *
 * Recorded when: any → stopped (via StopAgent command)
 */
export interface AgentStoppedPayload {
  /** State the agent was in before being stopped */
  readonly previousState: AgentLifecycleState;
  /** Optional reason for stopping (operator-provided) */
  readonly reason?: string;
  /** Correlation ID from the StopAgent command */
  readonly correlationId: string;
  /** Checkpoint position at time of stop */
  readonly stoppedAtPosition: number;
}

/**
 * Payload for AgentReconfigured audit event.
 *
 * Recorded when: active/paused → active (via ReconfigureAgent command)
 */
export interface AgentReconfiguredPayload {
  /** State the agent was in before reconfigure */
  readonly previousState: AgentLifecycleState;
  /** Previous config overrides (undefined if none were set) */
  readonly previousOverrides?: AgentConfigOverrides;
  /** New config overrides applied */
  readonly newOverrides: AgentConfigOverrides;
  /** Correlation ID from the ReconfigureAgent command */
  readonly correlationId: string;
}

/**
 * Payload for AgentErrorRecoveryStarted audit event.
 *
 * Recorded when: active → error_recovery (via circuit breaker, DS-3 scope)
 *
 * Note: The trigger mechanism for this event is defined in DS-3 (circuit breaker).
 * DS-5 only provides the FSM transition and audit event type.
 */
export interface AgentErrorRecoveryStartedPayload {
  /** Number of consecutive failures that triggered error recovery */
  readonly failureCount: number;
  /** Last error message that triggered the transition */
  readonly lastError: string;
  /** Cooldown duration in milliseconds before automatic RECOVER attempt */
  readonly cooldownMs: number;
  /** Correlation ID of the last failed event processing */
  readonly correlationId: string;
}

// ============================================================================
// Discriminated Union of All Lifecycle Payloads
// ============================================================================

/**
 * Union of all lifecycle audit event payloads, discriminated by event type.
 *
 * Usage in lifecycle command handlers:
 * ```typescript
 * await agentComponent.audit.record(ctx, {
 *   eventType: "AgentPaused",
 *   agentId: command.agentId,
 *   decisionId: `lifecycle_${command.agentId}_${Date.now()}`,
 *   timestamp: Date.now(),
 *   payload: {
 *     reason: command.reason,
 *     correlationId: command.correlationId,
 *     pausedAtPosition: checkpoint.lastProcessedPosition,
 *     eventsProcessedAtPause: checkpoint.eventsProcessed,
 *   } satisfies AgentPausedPayload,
 * });
 * ```
 */
export type LifecycleAuditPayload =
  | AgentStartedPayload
  | AgentPausedPayload
  | AgentResumedPayload
  | AgentStoppedPayload
  | AgentReconfiguredPayload
  | AgentErrorRecoveryStartedPayload;

// ============================================================================
// Schema Extension Notes
// ============================================================================

/**
 * DS-1 Schema Modification Required:
 *
 * The agentAuditEvents.eventType union in the component schema must be extended.
 *
 * Before (DS-1, 8 types):
 * ```
 * eventType: v.union(
 *   v.literal("AgentDecisionMade"),
 *   v.literal("AgentActionApproved"),
 *   v.literal("AgentActionRejected"),
 *   v.literal("AgentActionExpired"),
 *   v.literal("AgentAnalysisCompleted"),
 *   v.literal("AgentAnalysisFailed"),
 *   v.literal("CommandEmitted"),
 *   v.literal("CommandProcessed"),
 * )
 * ```
 *
 * After (DS-5, 16 types — includes DS-4's 2 routing types):
 * ```
 * eventType: v.union(
 *   // DS-1: Core agent events
 *   v.literal("AgentDecisionMade"),
 *   v.literal("AgentActionApproved"),
 *   v.literal("AgentActionRejected"),
 *   v.literal("AgentActionExpired"),
 *   v.literal("AgentAnalysisCompleted"),
 *   v.literal("AgentAnalysisFailed"),
 *   v.literal("CommandEmitted"),
 *   v.literal("CommandProcessed"),
 *   // DS-4: Command routing events
 *   v.literal("AgentCommandRouted"),
 *   v.literal("AgentCommandRoutingFailed"),
 *   // DS-5: Lifecycle events
 *   v.literal("AgentStarted"),
 *   v.literal("AgentPaused"),
 *   v.literal("AgentResumed"),
 *   v.literal("AgentStopped"),
 *   v.literal("AgentReconfigured"),
 *   v.literal("AgentErrorRecoveryStarted"),
 * )
 * ```
 *
 * Lifecycle audit events use a synthetic decisionId:
 * `lifecycle_${agentId}_${timestamp}`
 *
 * This distinguishes lifecycle events from analysis-triggered events (which use
 * `dec_${agentId}_${globalPosition}` format from DS-2).
 */

/**
 * Generate a lifecycle-specific decisionId.
 *
 * Format: `lifecycle_${agentId}_${timestamp}_${randomSuffix}`
 *
 * Lifecycle events are not triggered by pattern analysis, so they don't have
 * a globalPosition-based decisionId. This format prevents collision with
 * analysis-triggered decisionIds (`dec_${agentId}_${globalPosition}`).
 *
 * L6 fix: Added random suffix to prevent collision when two lifecycle commands
 * execute in the same millisecond (e.g., concurrent stop + start via admin UI).
 */
export function createLifecycleDecisionId(agentId: string, timestamp: number = Date.now()): string {
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `lifecycle_${agentId}_${timestamp}_${randomSuffix}`;
}

// @future: Consider lightweight "EventSkipped" audit entries during pause.
// Would enable audit trail of events seen-but-skipped when agent is paused.
// Useful for observability: operator can see which events arrived during downtime.
// Deferred to holistic review — high volume concern (every skipped event = 1 audit row).
