/**
 * Shared command logging helpers for bounded contexts.
 *
 * These helpers provide consistent logging patterns for command handlers,
 * reducing duplication across bounded contexts.
 */
import type { Logger } from "./types.js";

/**
 * Base context for command logging.
 * Bounded contexts extend this with entity-specific fields.
 */
export type BaseCommandLogContext = {
  commandType: string;
  commandId: string;
  correlationId: string;
  [key: string]: unknown;
};

/**
 * Log command execution start.
 * Called at the beginning of each handler.
 */
export function logCommandStart(logger: Logger, context: BaseCommandLogContext): void {
  logger.info("Command started", context);
}

/**
 * Log successful command execution.
 * Called after CMS update and event creation.
 */
export function logCommandSuccess(
  logger: Logger,
  context: BaseCommandLogContext,
  result: { version: number; eventType: string }
): void {
  logger.info("Command succeeded", {
    ...context,
    version: result.version,
    eventType: result.eventType,
  });
}

/**
 * Log command rejection (business rule violation).
 * Called when invariant validation fails or business rules prevent execution.
 */
export function logCommandRejected(
  logger: Logger,
  context: BaseCommandLogContext,
  reason: { code: string; message: string }
): void {
  logger.warn("Command rejected", {
    ...context,
    rejectionCode: reason.code,
    rejectionMessage: reason.message,
  });
}

/**
 * Log command business failure (expected failure with event emission).
 * Called when business logic fails but an event is still emitted (e.g., ReservationFailed).
 */
export function logCommandFailed(
  logger: Logger,
  context: BaseCommandLogContext,
  failure: { eventType: string; reason: string }
): void {
  logger.warn("Command failed (business)", {
    ...context,
    eventType: failure.eventType,
    failureReason: failure.reason,
  });
}

/**
 * Log command failure (unexpected error).
 * Called when an unexpected exception occurs.
 */
export function logCommandError(
  logger: Logger,
  context: BaseCommandLogContext,
  error: unknown
): void {
  logger.error("Command failed", {
    ...context,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
}

/**
 * Log command skipped (idempotent duplicate).
 * Called when a command is skipped because it was already processed.
 */
export function logCommandSkipped(
  logger: Logger,
  context: BaseCommandLogContext,
  reason: { existingVersion: number }
): void {
  logger.debug("Command skipped (idempotent)", {
    ...context,
    existingVersion: reason.existingVersion,
  });
}
