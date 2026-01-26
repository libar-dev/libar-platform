/**
 * Batch Execution Types
 *
 * Types for batch command execution with single-aggregate scope.
 * Atomic mode requires all commands target the same aggregate instance.
 * Uses branded types for compile-time safety of identifiers.
 */
import type { CommandHandlerResult } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";
import type { CommandId, CorrelationId } from "../ids/branded.js";
import type { Logger } from "../logging/types.js";

/**
 * Execution mode for batch operations.
 *
 * - `atomic`: All commands must target the same aggregate instance.
 *             If any command fails, previously executed commands remain
 *             (Convex doesn't support cross-mutation rollback).
 * - `partial`: Commands can target different aggregates.
 *              Execution continues on individual failures.
 */
export type BatchExecutionMode = "atomic" | "partial";

/**
 * A command in a batch operation.
 */
export interface BatchCommand<TArgs = UnknownRecord> {
  /** Command type name (e.g., "AddOrderItem") */
  commandType: string;

  /** Command arguments */
  args: TArgs;

  /** Optional command ID (generated if not provided) */
  commandId?: CommandId;

  /** Optional correlation ID override */
  correlationId?: CorrelationId;
}

/**
 * Options for batch execution.
 */
export interface BatchOptions {
  /** Execution mode */
  mode: BatchExecutionMode;

  /**
   * For atomic mode: the aggregate ID that all commands must target.
   * Required when mode is "atomic".
   */
  aggregateId?: string;

  /**
   * For atomic mode: the field name that contains the aggregate ID.
   * Defaults to auto-detection from command registration.
   */
  aggregateIdField?: string;

  /**
   * Maximum commands to execute concurrently in partial mode.
   * Defaults to 10. Ignored in atomic mode (sequential execution).
   */
  maxConcurrency?: number;

  /**
   * In partial mode, continue executing remaining commands on failure.
   * Defaults to true.
   */
  continueOnError?: boolean;

  /**
   * Shared correlation ID for all commands in the batch.
   * Individual commands can override with their own correlationId.
   */
  correlationId?: CorrelationId;

  /**
   * Optional bounded context filter.
   * If provided, all commands must belong to this context.
   */
  boundedContext?: string;
}

/**
 * Result for an individual command in a batch.
 */
export interface BatchItemResult<TData = unknown> {
  /** Index of the command in the batch */
  index: number;

  /** The command type */
  commandType: string;

  /** The command ID used */
  commandId: CommandId;

  /** Execution status */
  status: "success" | "rejected" | "failed" | "skipped";

  /** The command result (if executed) */
  result?: CommandHandlerResult<TData>;

  /** Error message (for failed/rejected) */
  error?: string;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Summary of batch execution results.
 */
export interface BatchSummary {
  /** Total number of commands in batch */
  total: number;

  /** Number of successful commands */
  succeeded: number;

  /** Number of failed commands */
  failed: number;

  /** Number of rejected commands */
  rejected: number;

  /** Number of skipped commands (due to earlier failure in atomic mode) */
  skipped: number;

  /** Total execution duration in milliseconds */
  totalDurationMs: number;
}

/**
 * Overall batch execution result.
 */
export interface BatchResult<TData = unknown> {
  /**
   * Overall batch status:
   * - `success`: All commands succeeded
   * - `partial`: Some commands failed (partial mode only)
   * - `failed`: Batch failed (validation error or all commands failed)
   */
  status: "success" | "partial" | "failed";

  /** Individual results for each command */
  results: BatchItemResult<TData>[];

  /** Summary statistics */
  summary: BatchSummary;

  /** Batch correlation ID */
  correlationId: CorrelationId;
}

/**
 * Validation error for batch operations.
 */
export interface BatchValidationError {
  /** Error code */
  code:
    | "EMPTY_BATCH"
    | "CROSS_AGGREGATE_ATOMIC"
    | "MISSING_AGGREGATE_ID"
    | "UNREGISTERED_COMMAND"
    | "WRONG_BOUNDED_CONTEXT"
    | "WRONG_CATEGORY"
    | "VALIDATION_FAILED";

  /** Error message */
  message: string;

  /** Index of the problematic command (if applicable) */
  commandIndex?: number;

  /** Additional context */
  context?: UnknownRecord;
}

/**
 * Result of batch pre-flight validation.
 */
export type BatchValidationResult =
  | { valid: true }
  | { valid: false; errors: BatchValidationError[] };

/**
 * Command executor function type.
 * This is what the BatchExecutor calls to execute individual commands.
 */
export type CommandExecutor = <TArgs extends UnknownRecord, TData>(
  commandType: string,
  args: TArgs,
  options: {
    commandId: CommandId;
    correlationId: CorrelationId;
  }
) => Promise<CommandHandlerResult<TData>>;

/**
 * Configuration for the BatchExecutor.
 */
export interface BatchExecutorConfig {
  /**
   * Function to execute individual commands.
   * Typically wraps CommandOrchestrator.execute().
   */
  executor: CommandExecutor;

  /**
   * Function to get command registration info.
   * Used for validation and aggregate ID extraction.
   */
  getRegistration?: (commandType: string) =>
    | {
        category: string;
        boundedContext: string;
        targetAggregate?: { type: string; idField: string };
      }
    | undefined;

  /**
   * Default bounded context for commands.
   */
  defaultBoundedContext?: string;

  /**
   * Optional logger for batch execution tracing.
   * If not provided, logging is disabled.
   *
   * Logging points:
   * - DEBUG: Batch execution started (mode, commandCount, correlationId)
   * - DEBUG: Command executed (index, commandType, durationMs)
   * - WARN: Batch validation failed (error, commandCount)
   * - WARN: Command failed (index, commandType, error)
   * - INFO: Atomic batch stopped early (index, failedCommand, skippedCount)
   * - INFO: Batch execution completed (status, succeeded, failed, totalDurationMs)
   */
  logger?: Logger;
}
