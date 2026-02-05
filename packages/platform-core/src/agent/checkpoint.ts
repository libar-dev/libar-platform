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

// ============================================================================
// Status Types
// ============================================================================

/**
 * Agent checkpoint status values.
 */
export const AGENT_CHECKPOINT_STATUSES = ["active", "paused", "stopped"] as const;

/**
 * Status of an agent checkpoint.
 *
 * - `active`: Agent is actively processing events
 * - `paused`: Agent is temporarily paused (can resume)
 * - `stopped`: Agent has been permanently stopped
 */
export type AgentCheckpointStatus = (typeof AGENT_CHECKPOINT_STATUSES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for agent checkpoint status.
 */
export const AgentCheckpointStatusSchema = z.enum(["active", "paused", "stopped"]);

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
  return {
    ...checkpoint,
    lastProcessedPosition: update.lastProcessedPosition ?? checkpoint.lastProcessedPosition,
    lastEventId: update.lastEventId ?? checkpoint.lastEventId,
    status: update.status ?? checkpoint.status,
    eventsProcessed:
      checkpoint.eventsProcessed + (update.incrementEventsProcessed ?? 0),
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
