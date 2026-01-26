/**
 * Handler utilities for dual-write command handlers.
 *
 * Provides result helper functions and re-exports handler types
 * from the orchestration module for convenience.
 */

// Result helper functions
export { successResult, rejectedResult, failedResult } from "./result.js";

// Re-export handler types from orchestration for convenience
export type {
  EventData,
  CommandHandlerSuccess,
  CommandHandlerRejected,
  CommandHandlerFailed,
  CommandHandlerResult,
} from "../orchestration/types.js";
