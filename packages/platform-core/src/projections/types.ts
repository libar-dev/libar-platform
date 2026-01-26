/**
 * Projection types for event-driven read model updates.
 */

import type { UnknownRecord } from "../types.js";

/**
 * Checkpoint for tracking projection progress.
 *
 * Uses globalPosition for idempotency and resumable processing.
 */
export interface ProjectionCheckpoint {
  /** Name of the projection */
  projectionName: string;

  /** Partition key (streamId for per-entity, "global" for global) */
  partitionKey: string;

  /** Last processed global position */
  lastGlobalPosition: number;

  /** Last processed event ID (for debugging) */
  lastEventId: string;

  /** When the checkpoint was last updated */
  updatedAt: number;
}

/**
 * Status of a projection.
 */
export type ProjectionStatus = "active" | "rebuilding" | "paused" | "error";

/**
 * Metadata about a projection's current state.
 */
export interface ProjectionState {
  /** Name of the projection */
  projectionName: string;

  /** Current status */
  status: ProjectionStatus;

  /** Current checkpoint position */
  lastGlobalPosition: number;

  /** Number of events processed */
  eventsProcessed: number;

  /** Number of events that failed processing */
  eventsFailed: number;

  /** When the projection was last updated */
  lastUpdatedAt: number;

  /** Error message if status is "error" */
  errorMessage?: string;
}

/**
 * Dead letter entry for failed projection processing.
 */
export interface ProjectionDeadLetter {
  /** ID of the event that failed */
  eventId: string;

  /** Name of the projection that failed */
  projectionName: string;

  /** Error message */
  error: string;

  /** Number of processing attempts */
  attemptCount: number;

  /** Current status */
  status: "pending" | "replayed" | "ignored";

  /** When the failure occurred */
  failedAt: number;

  /** Additional context */
  context?: UnknownRecord;
}

/**
 * Result of processing a projection event.
 */
export interface ProjectionProcessResult {
  /** Whether the event was processed or skipped */
  status: "processed" | "skipped" | "failed";

  /** Error message if failed */
  error?: string;
}

/**
 * Options for rebuilding a projection.
 */
export interface ProjectionRebuildOptions {
  /** Start from this global position (default: 0) */
  fromPosition?: number;

  /** Process events up to this position (default: current) */
  toPosition?: number;

  /** Batch size for processing (default: 100) */
  batchSize?: number;
}
