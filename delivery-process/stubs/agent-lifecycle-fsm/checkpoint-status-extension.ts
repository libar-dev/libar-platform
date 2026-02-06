/**
 * @target platform-core/src/agent/checkpoint.ts
 *
 * Checkpoint Status Extension for Agent Lifecycle FSM
 *
 * Extends the existing AgentCheckpointStatus (3 states) to include error_recovery
 * (4 states), aligning production code with the DS-1 component schema stub.
 * Adds configOverrides field for ReconfigureAgent command support.
 *
 * DS-5 Design Session: Agent Lifecycle FSM
 * PDR: pdr-013-agent-lifecycle-fsm (AD-2, AD-5)
 *
 * @modifies platform-core/src/agent/checkpoint.ts — extends existing types
 * @see delivery-process/stubs/agent-component-isolation/component/schema.ts (DS-1, lines 44-49)
 * @see platform-core/src/processManager/types.ts — precedent for status const arrays
 */

import { z } from "zod";

// ============================================================================
// Status Types (EVOLUTION: 3 states → 4 states)
// ============================================================================

/**
 * Agent checkpoint status values.
 *
 * EVOLUTION from existing checkpoint.ts:21:
 * - Before: ["active", "paused", "stopped"]
 * - After:  ["active", "paused", "stopped", "error_recovery"]
 *
 * Now matches DS-1 component schema stub (schema.ts:44-49).
 */
export const AGENT_CHECKPOINT_STATUSES = ["active", "paused", "stopped", "error_recovery"] as const;

/**
 * Status of an agent checkpoint.
 *
 * - `active`: Agent is actively processing events
 * - `paused`: Agent is temporarily paused (events seen-but-skipped, checkpoint advances)
 * - `stopped`: Agent is not processing (restartable via StartAgent)
 * - `error_recovery`: Automatic recovery after repeated failures (DS-3 circuit breaker)
 */
export type AgentCheckpointStatus = (typeof AGENT_CHECKPOINT_STATUSES)[number];

// ============================================================================
// Config Overrides (NEW: for ReconfigureAgent)
// ============================================================================

/**
 * Runtime-configurable agent settings.
 *
 * Stored as optional overrides on the checkpoint. Base config comes from
 * AgentBCConfig (code-level). Runtime overrides are merged at handler
 * execution time.
 *
 * Fields chosen per PDR-013 AD-5:
 * - confidenceThreshold: tune sensitivity without restart
 * - patternWindowDuration: adjust analysis time window
 * - rateLimits: adjust throughput limits
 *
 * NOT configurable at runtime:
 * - id (identity), subscriptions (requires EventBus re-registration),
 *   patterns/onEvent (requires handler restart)
 */
export interface AgentConfigOverrides {
  /** Override confidence threshold (0-1). Merged over AgentBCConfig.confidenceThreshold */
  readonly confidenceThreshold?: number;

  /** Override pattern window duration (e.g., "7d", "24h"). Merged over AgentBCConfig.patternWindow */
  readonly patternWindowDuration?: string;

  /**
   * Override rate limits. Merged over AgentBCConfig.rateLimits.
   * Shape matches AgentRateLimitConfig from agent/types.ts.
   */
  readonly rateLimits?: {
    readonly maxEventsPerMinute?: number;
    readonly maxLLMCallsPerHour?: number;
    readonly dailyCostBudgetUSD?: number;
  };
}

/**
 * Zod schema for AgentConfigOverrides.
 */
export const AgentConfigOverridesSchema = z
  .object({
    confidenceThreshold: z.number().min(0).max(1).optional(),
    patternWindowDuration: z.string().optional(),
    rateLimits: z
      .object({
        maxEventsPerMinute: z.number().positive().optional(),
        maxLLMCallsPerHour: z.number().positive().optional(),
        dailyCostBudgetUSD: z.number().positive().optional(),
      })
      .optional(),
  })
  .optional();

// ============================================================================
// Zod Schemas (EVOLUTION)
// ============================================================================

/**
 * Schema for agent checkpoint status.
 *
 * EVOLUTION: adds "error_recovery" to the enum.
 */
export const AgentCheckpointStatusSchema = z.enum([
  "active",
  "paused",
  "stopped",
  "error_recovery",
]);

/**
 * Schema for agent checkpoint.
 *
 * EVOLUTION: adds optional configOverrides field.
 */
export const AgentCheckpointSchema = z.object({
  agentId: z.string().min(1),
  subscriptionId: z.string().min(1),
  lastProcessedPosition: z.number().int().min(-1),
  lastEventId: z.string(),
  status: AgentCheckpointStatusSchema,
  eventsProcessed: z.number().int().nonnegative(),
  updatedAt: z.number(),
  /** Runtime config overrides from ReconfigureAgent. undefined = no overrides */
  configOverrides: AgentConfigOverridesSchema,
});

// ============================================================================
// TypeScript Types (EVOLUTION)
// ============================================================================

/**
 * Agent checkpoint state.
 *
 * EVOLUTION: adds optional configOverrides field for ReconfigureAgent support.
 */
export interface AgentCheckpoint {
  readonly agentId: string;
  readonly subscriptionId: string;
  readonly lastProcessedPosition: number;
  readonly lastEventId: string;
  readonly status: AgentCheckpointStatus;
  readonly eventsProcessed: number;
  readonly updatedAt: number;
  /** Runtime config overrides from ReconfigureAgent. undefined = use base config */
  readonly configOverrides?: AgentConfigOverrides;
}

/**
 * Update payload for patching a checkpoint.
 *
 * EVOLUTION: adds optional configOverrides field.
 */
export interface AgentCheckpointUpdate {
  readonly lastProcessedPosition?: number;
  readonly lastEventId?: string;
  readonly status?: AgentCheckpointStatus;
  readonly incrementEventsProcessed?: number;
  /** Merge new config overrides (undefined = no change, {} = clear all) */
  readonly configOverrides?: AgentConfigOverrides;
}

// ============================================================================
// Factory Functions (EVOLUTION)
// ============================================================================

/**
 * Apply an update to an existing checkpoint.
 *
 * EVOLUTION: merges configOverrides when present.
 */
export function applyCheckpointUpdate(
  checkpoint: AgentCheckpoint,
  update: AgentCheckpointUpdate
): AgentCheckpoint {
  return {
    ...checkpoint,
    lastProcessedPosition: update.lastProcessedPosition ?? checkpoint.lastProcessedPosition,
    lastEventId: update.lastEventId ?? checkpoint.lastEventId,
    status: update.status ?? checkpoint.status,
    eventsProcessed: checkpoint.eventsProcessed + (update.incrementEventsProcessed ?? 0),
    updatedAt: Date.now(),
    // Merge config overrides: new overrides replace previous ones per-field
    configOverrides:
      update.configOverrides !== undefined
        ? { ...checkpoint.configOverrides, ...update.configOverrides }
        : checkpoint.configOverrides,
  };
}

// ============================================================================
// Helper Functions (EVOLUTION: adds isAgentInErrorRecovery)
// ============================================================================

/**
 * Check if agent is in error recovery state.
 *
 * NEW in DS-5. Complements existing isAgentActive, isAgentPaused, isAgentStopped.
 */
export function isAgentInErrorRecovery(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.status === "error_recovery";
}

/**
 * Resolve effective config by merging base AgentBCConfig with runtime overrides.
 *
 * NEW in DS-5. Used by action handler to get the effective confidence threshold,
 * pattern window, and rate limits at execution time.
 *
 * @param baseConfig - Code-level AgentBCConfig
 * @param overrides - Runtime overrides from checkpoint (may be undefined)
 * @returns Merged config values for handler execution
 *
 * @example
 * ```typescript
 * const effective = resolveEffectiveConfig(agentBCConfig, checkpoint.configOverrides);
 * // effective.confidenceThreshold uses override if set, otherwise base config
 * ```
 */
export function resolveEffectiveConfig(
  baseConfig: {
    readonly confidenceThreshold: number;
    readonly patternWindow: { readonly duration: string };
    readonly rateLimits?: {
      readonly maxEventsPerMinute?: number;
      readonly maxLLMCallsPerHour?: number;
      readonly dailyCostBudgetUSD?: number;
    };
  },
  overrides?: AgentConfigOverrides
): {
  confidenceThreshold: number;
  patternWindowDuration: string;
  rateLimits?: {
    maxEventsPerMinute?: number;
    maxLLMCallsPerHour?: number;
    dailyCostBudgetUSD?: number;
  };
} {
  if (!overrides) {
    return {
      confidenceThreshold: baseConfig.confidenceThreshold,
      patternWindowDuration: baseConfig.patternWindow.duration,
      rateLimits: baseConfig.rateLimits,
    };
  }

  return {
    confidenceThreshold: overrides.confidenceThreshold ?? baseConfig.confidenceThreshold,
    patternWindowDuration: overrides.patternWindowDuration ?? baseConfig.patternWindow.duration,
    rateLimits: overrides.rateLimits ?? baseConfig.rateLimits,
  };
}
