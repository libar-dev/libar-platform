/**
 * Logging Types (Workpool-Aligned)
 *
 * Defines the Logger interface and LogLevel type aligned with Workpool's
 * 6-level logging hierarchy. Used for PM execution, EventBus, and EventStore
 * component logging.
 *
 * Log levels (most to least verbose):
 * - DEBUG: Internal scheduling, state details
 * - TRACE: Performance timing (console.time/timeEnd)
 * - INFO: Event processing started/completed
 * - REPORT: Aggregated metrics, batch summaries
 * - WARN: Fallback behavior, degraded state
 * - ERROR: Failures, dead letters
 */

import type { UnknownRecord } from "../types.js";

/**
 * Log level type aligned with Workpool's 6-level hierarchy.
 *
 * Priority order (lower number = more verbose):
 * DEBUG(0) > TRACE(1) > INFO(2) > REPORT(3) > WARN(4) > ERROR(5)
 */
export type LogLevel = "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";

/**
 * Priority mapping for log levels.
 * Lower numbers are more verbose (logged at higher verbosity settings).
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  TRACE: 1,
  INFO: 2,
  REPORT: 3,
  WARN: 4,
  ERROR: 5,
};

/**
 * Default log level for production use.
 * INFO is appropriate for observability without excessive noise.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = "INFO";

/**
 * Logger interface with Workpool-aligned log levels.
 *
 * Each method corresponds to a log level and accepts:
 * - message: A descriptive string
 * - data: Optional structured context data
 *
 * @example
 * ```typescript
 * const logger = createScopedLogger("PM:orderNotification", "DEBUG");
 *
 * logger.debug("State loaded", { pmName: "orderNotification", status: "idle" });
 * logger.info("Processing started", { eventType: "OrderConfirmed" });
 * logger.warn("Correlation property not found", { property: "orderId" });
 * logger.error("Processing failed", { error: "Handler threw" });
 * ```
 */
export interface Logger {
  /**
   * Log debug-level message.
   * Use for internal scheduling, state details, verbose debugging.
   */
  debug(message: string, data?: UnknownRecord): void;

  /**
   * Log trace-level message.
   * Use for performance timing (typically with console.time/timeEnd).
   */
  trace(message: string, data?: UnknownRecord): void;

  /**
   * Log info-level message.
   * Use for event processing started/completed, normal operation milestones.
   */
  info(message: string, data?: UnknownRecord): void;

  /**
   * Log report-level message.
   * Use for aggregated metrics, batch summaries (typically JSON output).
   */
  report(message: string, data?: UnknownRecord): void;

  /**
   * Log warn-level message.
   * Use for fallback behavior, degraded state, non-fatal issues.
   */
  warn(message: string, data?: UnknownRecord): void;

  /**
   * Log error-level message.
   * Use for failures, dead letters, unrecoverable issues.
   */
  error(message: string, data?: UnknownRecord): void;
}

/**
 * Check if a message at the given level should be logged.
 *
 * @param messageLevel - Level of the message being logged
 * @param configuredLevel - Minimum level configured for the logger
 * @returns true if the message should be emitted
 *
 * @example
 * ```typescript
 * shouldLog("DEBUG", "INFO"); // false - DEBUG is below INFO
 * shouldLog("WARN", "INFO");  // true - WARN is at or above INFO
 * shouldLog("INFO", "INFO");  // true - exact match
 * ```
 */
export function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
}
