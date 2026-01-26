/**
 * @libar-docs
 * @libar-docs-pattern LoggingInfrastructure
 * @libar-docs-status completed
 * @libar-docs-phase 13
 * @libar-docs-infra
 *
 * ## Logging Infrastructure - Scoped Loggers
 *
 * Factory for domain-specific loggers with scope prefixes and level filtering.
 * Follows the Workpool pattern for consistent logging across the platform.
 *
 * ### When to Use
 *
 * - Creating domain-specific loggers with consistent scope prefixes
 * - Level-based log filtering (DEBUG, TRACE, INFO, REPORT, WARN, ERROR)
 * - Child loggers for hierarchical scoping (e.g., "PM:orderNotification")
 *
 * @example
 * ```typescript
 * // Create a logger for PM operations
 * const logger = createScopedLogger("PM:orderNotification", "INFO");
 *
 * // Logs only at INFO or higher (REPORT, WARN, ERROR)
 * logger.debug("This is suppressed");  // Not logged
 * logger.info("Processing started");   // [PM:orderNotification] Processing started
 * logger.error("Failed");              // [PM:orderNotification] Failed
 * ```
 */

import type { UnknownRecord } from "../types.js";
import type { Logger, LogLevel } from "./types.js";
import { DEFAULT_LOG_LEVEL, shouldLog } from "./types.js";

/**
 * Console interface for Convex runtime.
 * Uses globalThis.console which is available in all JavaScript environments.
 */
interface ConvexConsole {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
}

/**
 * Get the runtime console dynamically.
 * This allows tests to mock globalThis.console after module import.
 */
function getRuntimeConsole(): ConvexConsole {
  return (globalThis as unknown as { console: ConvexConsole }).console;
}

/**
 * Constants for trace timing operations.
 * Use with the `timing` field in trace log data.
 */
export const TRACE_TIMING = {
  START: "start",
  END: "end",
} as const;
export type TraceTiming = (typeof TRACE_TIMING)[keyof typeof TRACE_TIMING];

/**
 * Create a scoped logger with level filtering.
 *
 * The logger:
 * - Prefixes all messages with [scope]
 * - Filters messages below the configured level
 * - Uses appropriate console methods for each level
 *
 * @param scope - Prefix for log messages (e.g., "PM:orderNotification")
 * @param level - Minimum log level to emit (default: INFO)
 * @returns Logger instance with level filtering
 *
 * @example
 * ```typescript
 * const logger = createScopedLogger("PM:orderNotification", "DEBUG");
 *
 * // All levels logged at DEBUG
 * logger.debug("State loaded", { pmName: "orderNotification", status: "idle" });
 * logger.trace("Timing check", { operation: "loadState" });
 * logger.info("Processing started", { eventType: "OrderConfirmed" });
 * logger.report("Batch complete", { processed: 10, failed: 0 });
 * logger.warn("Correlation fallback", { property: "orderId" });
 * logger.error("Handler failed", { error: "Timeout exceeded" });
 * ```
 */
export function createScopedLogger(scope: string, level: LogLevel = DEFAULT_LOG_LEVEL): Logger {
  const prefix = `[${scope}]`;

  const formatMessage = (message: string, data?: UnknownRecord): string => {
    if (data && Object.keys(data).length > 0) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  };

  return {
    debug(message: string, data?: UnknownRecord): void {
      if (shouldLog("DEBUG", level)) {
        getRuntimeConsole().debug(formatMessage(message, data));
      }
    },

    trace(message: string, data?: UnknownRecord): void {
      if (shouldLog("TRACE", level)) {
        // TRACE uses console.time pattern for performance timing
        // When data contains a 'timing' field, use time/timeEnd
        const timing = data?.["timing"];
        if (timing === TRACE_TIMING.START) {
          getRuntimeConsole().time(`${prefix} ${message}`);
        } else if (timing === TRACE_TIMING.END) {
          getRuntimeConsole().timeEnd(`${prefix} ${message}`);
        } else {
          // Regular trace log
          getRuntimeConsole().debug(formatMessage(message, data));
        }
      }
    },

    info(message: string, data?: UnknownRecord): void {
      if (shouldLog("INFO", level)) {
        getRuntimeConsole().info(formatMessage(message, data));
      }
    },

    report(message: string, data?: UnknownRecord): void {
      if (shouldLog("REPORT", level)) {
        // REPORT outputs structured JSON for aggregation systems
        getRuntimeConsole().log(
          JSON.stringify({
            scope,
            message,
            ...data,
            timestamp: Date.now(),
          })
        );
      }
    },

    warn(message: string, data?: UnknownRecord): void {
      if (shouldLog("WARN", level)) {
        getRuntimeConsole().warn(formatMessage(message, data));
      }
    },

    error(message: string, data?: UnknownRecord): void {
      if (shouldLog("ERROR", level)) {
        getRuntimeConsole().error(formatMessage(message, data));
      }
    },
  };
}

/**
 * Create a no-op logger that discards all messages.
 *
 * Use when:
 * - Logging is disabled (e.g., in quiet mode)
 * - Testing where logs are not needed
 * - As a default when no logger is configured
 *
 * Note: This is aliased as `createPlatformNoOpLogger` for disambiguation from
 * the middleware `createNoOpLogger` which returns a `MiddlewareLogger`.
 *
 * @returns Logger instance that does nothing
 *
 * @example
 * ```typescript
 * // Use as default when logger is optional
 * const logger = config.logger ?? createPlatformNoOpLogger();
 * logger.info("This is silently discarded");
 * ```
 */
export function createPlatformNoOpLogger(): Logger {
  return {
    debug: () => {},
    trace: () => {},
    info: () => {},
    report: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Create a child logger with a combined scope.
 *
 * Useful for creating child loggers with more specific scopes.
 *
 * @param parentScope - Parent scope string (e.g., "PM")
 * @param childScope - Additional scope suffix (e.g., "orderNotification")
 * @param level - Log level for the child logger (default: INFO)
 * @returns New logger with combined scope "[parentScope:childScope]"
 *
 * @example
 * ```typescript
 * const orderLogger = createChildLogger("PM", "orderNotification", "DEBUG");
 * // Logs as [PM:orderNotification]
 * ```
 */
export function createChildLogger(
  parentScope: string,
  childScope: string,
  level: LogLevel = DEFAULT_LOG_LEVEL
): Logger {
  return createScopedLogger(`${parentScope}:${childScope}`, level);
}
