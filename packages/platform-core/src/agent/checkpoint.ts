/**
 * Agent Checkpoint - Position Tracking for Durability
 *
 * Tracks the agent's position in the event stream to enable:
 * - Resumption after restarts
 * - Exactly-once processing semantics
 * - Progress monitoring
 *
 * @module agent/checkpoint
 */

import { z } from "zod";
import type { AgentConfigOverrides } from "./lifecycle-commands.js";
import type { AgentRateLimitConfig } from "./types.js";

// ============================================================================
// Status Types
// ============================================================================

/**
 * Agent checkpoint status values.
 */
export const AGENT_CHECKPOINT_STATUSES = ["active", "paused", "stopped", "error_recovery"] as const;

/**
 * Status of an agent checkpoint.
 *
 * - `active`: Agent is actively processing events
 * - `paused`: Agent is temporarily paused (can resume)
 * - `stopped`: Agent has been permanently stopped
 * - `error_recovery`: Agent is recovering from an error (DS-5 lifecycle)
 */
export type AgentCheckpointStatus = (typeof AGENT_CHECKPOINT_STATUSES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for agent checkpoint status.
 */
export const AgentCheckpointStatusSchema = z.enum([
  "active",
  "paused",
  "stopped",
  "error_recovery",
]);

/**
 * Schema for agent checkpoint.
 */
export const AgentCheckpointSchema = z.object({
  /** Agent BC identifier */
  agentId: z.string().min(1),

  /** Subscription instance ID (for multi-instance scenarios) */
  subscriptionId: z.string().min(1),

  /**
   * Last processed global position.
   * -1 is sentinel value indicating no events have been processed.
   */
  lastProcessedPosition: z.number().int().min(-1),

  /** Last processed event ID for causation tracking */
  lastEventId: z.string(),

  /** Current checkpoint status */
  status: AgentCheckpointStatusSchema,

  /** Total events processed by this agent */
  eventsProcessed: z.number().int().nonnegative(),

  /** Timestamp of last checkpoint update */
  updatedAt: z.number(),

  /** Runtime configuration overrides applied via ReconfigureAgent command */
  configOverrides: z.unknown().optional(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * Agent checkpoint state.
 *
 * Tracks the agent's position in the event stream for durability
 * and exactly-once processing semantics.
 */
export interface AgentCheckpoint {
  /** Agent BC identifier */
  readonly agentId: string;

  /** Subscription instance ID (for multi-instance scenarios) */
  readonly subscriptionId: string;

  /**
   * Last processed global position.
   * -1 indicates no events have been processed yet.
   */
  readonly lastProcessedPosition: number;

  /** Last processed event ID for causation tracking */
  readonly lastEventId: string;

  /** Current checkpoint status */
  readonly status: AgentCheckpointStatus;

  /** Total events processed by this agent */
  readonly eventsProcessed: number;

  /** Timestamp of last checkpoint update */
  readonly updatedAt: number;

  /** Runtime configuration overrides applied via ReconfigureAgent command */
  readonly configOverrides?: AgentConfigOverrides;
}

/**
 * Update payload for patching a checkpoint.
 */
export interface AgentCheckpointUpdate {
  /** New last processed position */
  readonly lastProcessedPosition?: number;

  /** New last event ID */
  readonly lastEventId?: string;

  /** New status */
  readonly status?: AgentCheckpointStatus;

  /** Increment events processed count */
  readonly incrementEventsProcessed?: number;

  /** Configuration overrides to merge into checkpoint */
  readonly configOverrides?: AgentConfigOverrides;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial checkpoint for a new agent.
 *
 * Uses lastProcessedPosition: -1 as sentinel value (all real events have globalPosition >= 0)
 * and empty string for lastEventId (no events processed yet).
 *
 * @param agentId - Agent BC identifier
 * @param subscriptionId - Subscription instance ID
 * @returns Initial checkpoint with sentinel values
 *
 * @example
 * ```typescript
 * const checkpoint = createInitialAgentCheckpoint("churn-risk-agent", "sub-001");
 * // checkpoint.lastProcessedPosition === -1
 * // checkpoint.status === "active"
 * ```
 */
export function createInitialAgentCheckpoint(
  agentId: string,
  subscriptionId: string
): AgentCheckpoint {
  return {
    agentId,
    subscriptionId,
    lastProcessedPosition: -1, // Sentinel: all real events have globalPosition >= 0
    lastEventId: "", // No events processed yet
    status: "active",
    eventsProcessed: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Apply an update to an existing checkpoint.
 *
 * @param checkpoint - Current checkpoint state
 * @param update - Update to apply
 * @returns Updated checkpoint
 */
export function applyCheckpointUpdate(
  checkpoint: AgentCheckpoint,
  update: AgentCheckpointUpdate
): AgentCheckpoint {
  const mergedOverrides = mergeConfigOverrides(checkpoint.configOverrides, update.configOverrides);

  return {
    ...checkpoint,
    lastProcessedPosition: update.lastProcessedPosition ?? checkpoint.lastProcessedPosition,
    lastEventId: update.lastEventId ?? checkpoint.lastEventId,
    status: update.status ?? checkpoint.status,
    eventsProcessed: checkpoint.eventsProcessed + (update.incrementEventsProcessed ?? 0),
    ...(mergedOverrides !== undefined ? { configOverrides: mergedOverrides } : {}),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an event should be processed based on checkpoint.
 *
 * An event should be processed if its global position is greater than
 * the checkpoint's last processed position.
 *
 * @param eventGlobalPosition - The global position of the event
 * @param checkpointPosition - The last processed global position from checkpoint
 * @returns true if the event should be processed, false if it's a duplicate
 *
 * @example
 * ```typescript
 * const checkpoint = { lastProcessedPosition: 100, ... };
 * shouldProcessAgentEvent(101, checkpoint.lastProcessedPosition); // true
 * shouldProcessAgentEvent(100, checkpoint.lastProcessedPosition); // false (duplicate)
 * shouldProcessAgentEvent(50, checkpoint.lastProcessedPosition);  // false (already processed)
 * ```
 */
export function shouldProcessAgentEvent(
  eventGlobalPosition: number,
  checkpointPosition: number
): boolean {
  return eventGlobalPosition > checkpointPosition;
}

/**
 * Check if agent can process events (is active).
 *
 * @param checkpoint - Agent checkpoint to check
 * @returns true if agent is in active state
 */
export function isAgentActive(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.status === "active";
}

/**
 * Check if agent is paused.
 *
 * @param checkpoint - Agent checkpoint to check
 * @returns true if agent is paused
 */
export function isAgentPaused(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.status === "paused";
}

/**
 * Check if agent is stopped.
 *
 * @param checkpoint - Agent checkpoint to check
 * @returns true if agent is stopped
 */
export function isAgentStopped(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.status === "stopped";
}

/**
 * Validate a checkpoint object.
 *
 * @param checkpoint - Object to validate
 * @returns true if valid, false otherwise
 */
export function isValidAgentCheckpoint(checkpoint: unknown): checkpoint is AgentCheckpoint {
  const result = AgentCheckpointSchema.safeParse(checkpoint);
  return result.success;
}

// ============================================================================
// Config Override Merging
// ============================================================================

/**
 * Merge config overrides with field-level granularity.
 *
 * If update overrides are provided, they are merged on top of existing overrides.
 * Nested `rateLimits.costBudget` is deep-merged when both exist.
 *
 * @param existing - Current config overrides (may be undefined)
 * @param update - New config overrides to merge (may be undefined)
 * @returns Merged overrides, or undefined if both are undefined
 */
function mergeConfigOverrides(
  existing: AgentConfigOverrides | undefined,
  update: AgentConfigOverrides | undefined
): AgentConfigOverrides | undefined {
  if (update === undefined) {
    return existing;
  }
  if (existing === undefined) {
    return update;
  }

  const mergedRateLimits =
    existing.rateLimits || update.rateLimits
      ? {
          ...existing.rateLimits,
          ...update.rateLimits,
          ...(existing.rateLimits?.costBudget || update.rateLimits?.costBudget
            ? {
                costBudget: {
                  ...existing.rateLimits?.costBudget,
                  ...update.rateLimits?.costBudget,
                },
              }
            : {}),
        }
      : undefined;

  return {
    ...existing,
    ...update,
    ...(mergedRateLimits !== undefined ? { rateLimits: mergedRateLimits } : {}),
  };
}

// ============================================================================
// Lifecycle State Helpers
// ============================================================================

/**
 * Check if an agent checkpoint is in error recovery state.
 *
 * @param checkpoint - Agent checkpoint to check
 * @returns true if agent is in error_recovery state
 */
export function isAgentInErrorRecovery(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.status === "error_recovery";
}

// ============================================================================
// Effective Config Resolution
// ============================================================================

/**
 * Resolve effective configuration by merging base config with optional overrides.
 *
 * Deep-merges `rateLimits.costBudget` when both base and overrides provide values.
 * Override values take precedence over base config values.
 *
 * @param baseConfig - Base agent configuration
 * @param overrides - Optional runtime overrides to apply on top
 * @returns Resolved effective configuration
 */
export function resolveEffectiveConfig(
  baseConfig: {
    readonly confidenceThreshold: number;
    readonly patternWindow: { readonly duration: string };
    readonly rateLimits?: AgentRateLimitConfig;
  },
  overrides?: AgentConfigOverrides
): {
  confidenceThreshold: number;
  patternWindowDuration: string;
  rateLimits?: AgentRateLimitConfig;
} {
  if (overrides === undefined) {
    const base: {
      confidenceThreshold: number;
      patternWindowDuration: string;
      rateLimits?: AgentRateLimitConfig;
    } = {
      confidenceThreshold: baseConfig.confidenceThreshold,
      patternWindowDuration: baseConfig.patternWindow.duration,
    };
    if (baseConfig.rateLimits !== undefined) {
      base.rateLimits = baseConfig.rateLimits;
    }
    return base;
  }

  // Deep-merge rate limits with costBudget granularity
  const mergedRateLimits = buildMergedRateLimits(baseConfig.rateLimits, overrides.rateLimits);

  const result: {
    confidenceThreshold: number;
    patternWindowDuration: string;
    rateLimits?: AgentRateLimitConfig;
  } = {
    confidenceThreshold: overrides.confidenceThreshold ?? baseConfig.confidenceThreshold,
    patternWindowDuration: overrides.patternWindowDuration ?? baseConfig.patternWindow.duration,
  };

  if (mergedRateLimits !== undefined) {
    result.rateLimits = mergedRateLimits;
  }

  return result;
}

/**
 * Build merged rate limit config from base and overrides.
 *
 * @param baseRL - Base rate limit config (may be undefined)
 * @param overRL - Rate limit overrides (may be undefined)
 * @returns Merged rate limit config, or undefined if neither exists
 */
function buildMergedRateLimits(
  baseRL: AgentRateLimitConfig | undefined,
  overRL: AgentConfigOverrides["rateLimits"]
): AgentRateLimitConfig | undefined {
  if (!overRL) {
    return baseRL;
  }

  const mergedCostBudget =
    baseRL?.costBudget || overRL.costBudget
      ? {
          daily: overRL.costBudget?.daily ?? baseRL?.costBudget?.daily ?? 0,
          alertThreshold:
            overRL.costBudget?.alertThreshold ?? baseRL?.costBudget?.alertThreshold ?? 0,
        }
      : undefined;

  const merged: AgentRateLimitConfig = {
    maxRequestsPerMinute: overRL.maxRequestsPerMinute ?? baseRL?.maxRequestsPerMinute ?? 0,
  };

  const maxConcurrent = overRL.maxConcurrent ?? baseRL?.maxConcurrent;
  if (maxConcurrent !== undefined) {
    (merged as { maxConcurrent: number }).maxConcurrent = maxConcurrent;
  }

  const queueDepth = overRL.queueDepth ?? baseRL?.queueDepth;
  if (queueDepth !== undefined) {
    (merged as { queueDepth: number }).queueDepth = queueDepth;
  }

  if (mergedCostBudget !== undefined) {
    (merged as { costBudget: { daily: number; alertThreshold: number } }).costBudget =
      mergedCostBudget;
  }

  return merged;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from AgentCheckpointSchema.
 */
export type AgentCheckpointSchemaType = z.infer<typeof AgentCheckpointSchema>;

/**
 * Type inferred from AgentCheckpointStatusSchema.
 */
export type AgentCheckpointStatusSchemaType = z.infer<typeof AgentCheckpointStatusSchema>;
