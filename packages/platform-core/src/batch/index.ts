/**
 * Batch Execution Module
 *
 * Execute multiple commands as a batch operation with atomic or partial mode.
 */

// Types
export type {
  BatchExecutionMode,
  BatchCommand,
  BatchOptions,
  BatchItemResult,
  BatchSummary,
  BatchResult,
  BatchValidationError,
  BatchValidationResult,
  CommandExecutor,
  BatchExecutorConfig,
} from "./types.js";

// Executor
export { BatchExecutor, createBatchExecutor } from "./BatchExecutor.js";

// Validation utilities
export { validateBatch, extractAggregateId, groupByAggregateId } from "./validation.js";
