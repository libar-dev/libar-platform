/**
 * Process Manager types for event-reactive coordination.
 *
 * Process Managers react to events and emit commands.
 * Distinct from Sagas (multi-step with compensation) and
 * Projections (events → read models).
 */

import type { UnknownRecord } from "../types.js";

/**
 * Status of a process manager instance.
 *
 * - `idle`: No active processing, waiting for trigger event
 * - `processing`: Currently handling an event and emitting commands
 * - `completed`: Successfully finished processing
 * - `failed`: Processing failed, requires investigation
 */
export type ProcessManagerStatus = "idle" | "processing" | "completed" | "failed";

/**
 * All valid process manager status values.
 */
export const PROCESS_MANAGER_STATUSES: readonly ProcessManagerStatus[] = [
  "idle",
  "processing",
  "completed",
  "failed",
] as const;

// O(1) lookup Set for type guard performance
const PROCESS_MANAGER_STATUS_SET = new Set<string>(PROCESS_MANAGER_STATUSES);

/**
 * Type guard to check if a value is a valid ProcessManagerStatus.
 *
 * @param value - Value to check
 * @returns True if value is a valid ProcessManagerStatus
 */
export function isProcessManagerStatus(value: unknown): value is ProcessManagerStatus {
  return typeof value === "string" && PROCESS_MANAGER_STATUS_SET.has(value);
}

/**
 * Status of a dead letter entry.
 *
 * - `pending`: Awaiting investigation/replay
 * - `replayed`: Successfully replayed and processed
 * - `ignored`: Manually marked as ignored (e.g., obsolete event)
 */
export type DeadLetterStatus = "pending" | "replayed" | "ignored";

/**
 * All valid dead letter status values.
 */
export const DEAD_LETTER_STATUSES: readonly DeadLetterStatus[] = [
  "pending",
  "replayed",
  "ignored",
] as const;

// O(1) lookup Set for type guard performance
const DEAD_LETTER_STATUS_SET = new Set<string>(DEAD_LETTER_STATUSES);

/**
 * Type guard to check if a value is a valid DeadLetterStatus.
 *
 * @param value - Value to check
 * @returns True if value is a valid DeadLetterStatus
 */
export function isDeadLetterStatus(value: unknown): value is DeadLetterStatus {
  return typeof value === "string" && DEAD_LETTER_STATUS_SET.has(value);
}

/**
 * State of a process manager instance.
 *
 * Tracks the processing lifecycle of a specific PM instance,
 * including position, custom state, and metrics.
 */
export interface ProcessManagerState {
  /** Name of the process manager */
  processManagerName: string;

  /**
   * Unique instance ID for this PM instance.
   * Used to correlate events to specific instances.
   */
  instanceId: string;

  /** Current processing status */
  status: ProcessManagerStatus;

  /** Last processed global position */
  lastGlobalPosition: number;

  /**
   * Custom state specific to this PM instance.
   * Used for hybrid PMs that need to track state across events.
   */
  customState?: UnknownRecord;

  /**
   * Version of the custom state schema.
   * Used for state schema evolution.
   */
  stateVersion: number;

  /** Number of commands successfully emitted */
  commandsEmitted: number;

  /** Number of commands that failed to emit */
  commandsFailed: number;

  /** When this instance was created */
  createdAt: number;

  /** When this instance was last updated */
  lastUpdatedAt: number;

  /** Error message if status is "failed" */
  errorMessage?: string;

  /** ID of the event that triggered this instance (for event-triggered PMs) */
  triggerEventId?: string;

  /** Correlation ID for linking related events/commands */
  correlationId?: string;
}

/**
 * Dead letter entry for failed process manager processing.
 *
 * Separate from projection dead letters since PMs have different
 * semantics (command emission failures vs read model update failures).
 */
export interface ProcessManagerDeadLetter {
  /** Name of the process manager that failed */
  processManagerName: string;

  /** Instance ID of the failed PM */
  instanceId: string;

  /** ID of the event that caused the failure (optional) */
  eventId?: string;

  /** Error message describing the failure */
  error: string;

  /** Number of processing attempts */
  attemptCount: number;

  /** Current status of this dead letter */
  status: DeadLetterStatus;

  /** The command that failed to emit (if applicable) */
  failedCommand?: {
    commandType: string;
    payload: UnknownRecord;
  };

  /** Additional context for debugging */
  context?: UnknownRecord;

  /** When the failure occurred */
  failedAt: number;
}

/**
 * Result of processing an event in a process manager.
 */
export interface ProcessManagerProcessResult {
  /** Whether the event was processed, skipped, or failed */
  status: "processed" | "skipped" | "failed";

  /** Commands emitted during processing */
  commandsEmitted?: string[];

  /** Error message if failed */
  error?: string;
}

/**
 * Maximum allowed query limit for process manager queries.
 * Prevents unbounded queries that could exhaust resources.
 */
export const MAX_PM_QUERY_LIMIT = 1000;

/**
 * Default query limit for process manager queries.
 */
export const DEFAULT_PM_QUERY_LIMIT = 100;

/**
 * Options for querying process manager instances.
 */
export interface ProcessManagerQueryOptions {
  /** Filter by process manager name */
  processManagerName?: string;

  /** Filter by status */
  status?: ProcessManagerStatus;

  /** Filter by correlation ID */
  correlationId?: string;

  /**
   * Maximum number of results.
   * Capped at MAX_PM_QUERY_LIMIT (1000).
   * @default 100
   */
  limit?: number;
}
