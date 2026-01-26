/**
 * Logging Middleware
 *
 * Correlation-aware logging with timing metrics.
 * Logs command execution before and after handler.
 */
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareBeforeResult,
  LoggingConfig,
} from "./types.js";
import type { CommandHandlerResult } from "../orchestration/types.js";
import { isSuccessResult, isRejectedResult, isFailedResult } from "../commands/guards.js";
import { assertNever, type UnknownRecord } from "../types.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/** Middleware execution order for logging */
export const LOGGING_ORDER = 40;

/**
 * Create a logging middleware.
 *
 * Logs command execution with correlation context.
 * Includes timing metrics for performance monitoring.
 *
 * @param config - Configuration with logger instance
 * @returns A middleware that logs command execution
 *
 * @example
 * ```typescript
 * const loggingMiddleware = createLoggingMiddleware({
 *   logger: {
 *     info: (msg, data) => myLogger.info(msg, data),
 *     error: (msg, data) => myLogger.error(msg, data),
 *   },
 *   includePayload: false, // Don't log sensitive data
 *   includeTiming: true,
 * });
 * ```
 */
export function createLoggingMiddleware(config: LoggingConfig): Middleware {
  const { logger, includePayload = false, includeTiming = true } = config;

  return {
    name: "logging",
    order: LOGGING_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const logData: UnknownRecord = {
        commandType: ctx.command.type,
        commandId: ctx.command.commandId,
        correlationId: ctx.command.correlationId,
        boundedContext: ctx.command.boundedContext,
        category: ctx.command.category,
      };

      if (includePayload) {
        logData["args"] = ctx.command.args;
      }

      if (ctx.command.targetAggregate) {
        logData["targetAggregate"] = ctx.command.targetAggregate.type;
        logData["aggregateIdField"] = ctx.command.targetAggregate.idField;
      }

      logger.info(`Command started: ${ctx.command.type}`, logData);

      return { continue: true, ctx };
    },

    async after(
      ctx: MiddlewareContext,
      result: CommandHandlerResult<unknown>
    ): Promise<CommandHandlerResult<unknown>> {
      const durationMs = includeTiming ? Date.now() - ctx.startedAt : undefined;

      const logData: UnknownRecord = {
        commandType: ctx.command.type,
        commandId: ctx.command.commandId,
        correlationId: ctx.command.correlationId,
        status: result.status,
      };

      if (durationMs !== undefined) {
        logData["durationMs"] = durationMs;
      }

      // Add result-specific data based on status using type guards
      if (isSuccessResult(result)) {
        logData["eventId"] = result.event.eventId;
        logger.info(`Command succeeded: ${ctx.command.type}`, logData);
      } else if (isRejectedResult(result)) {
        logData["errorCode"] = result.code;
        logData["errorReason"] = result.reason;
        logger.info(`Command rejected: ${ctx.command.type}`, logData);
      } else if (isFailedResult(result)) {
        logData["errorReason"] = result.reason;
        logData["eventId"] = result.event.eventId;
        logger.error(`Command failed: ${ctx.command.type}`, logData);
      } else {
        // Exhaustiveness check - TypeScript will error if a new status is added
        assertNever(result);
      }

      return result;
    },
  };
}

/**
 * Create a logger from a Convex console object.
 *
 * Convex provides console.log/error/debug in its runtime.
 * Pass the console object from your Convex function.
 *
 * @param consoleObj - The console object from Convex runtime
 * @param prefix - Optional prefix for log messages
 * @returns A Logger instance wrapping the console
 *
 * @example
 * ```typescript
 * // In a Convex mutation/query:
 * const logger = createConvexLogger(console, "[Order]");
 * ```
 */
export function createConvexLogger(
  consoleObj: {
    log: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
    debug?: (message: string, ...args: unknown[]) => void;
    warn?: (message: string, ...args: unknown[]) => void;
    time?: (label: string) => void;
    timeEnd?: (label: string) => void;
  },
  prefix = "[Command]"
): Logger {
  const logWithPrefix = (
    method: (message: string, ...args: unknown[]) => void,
    message: string,
    data?: UnknownRecord
  ): void => {
    if (data && Object.keys(data).length > 0) {
      method(`${prefix} ${message}`, data);
    } else {
      method(`${prefix} ${message}`);
    }
  };

  return {
    debug(message: string, data?: UnknownRecord): void {
      if (consoleObj.debug) {
        logWithPrefix(consoleObj.debug, message, data);
      }
    },

    trace(message: string, data?: UnknownRecord): void {
      // Use console.time for trace-level timing
      if (data?.["timing"] === "start" && consoleObj.time) {
        consoleObj.time(`${prefix} ${message}`);
      } else if (data?.["timing"] === "end" && consoleObj.timeEnd) {
        consoleObj.timeEnd(`${prefix} ${message}`);
      } else if (consoleObj.debug) {
        logWithPrefix(consoleObj.debug, message, data);
      }
    },

    info(message: string, data?: UnknownRecord): void {
      logWithPrefix(consoleObj.log, message, data);
    },

    report(message: string, data?: UnknownRecord): void {
      // Report uses structured JSON output
      if (data && Object.keys(data).length > 0) {
        consoleObj.log(`${prefix} ${message} ${JSON.stringify(data)}`);
      } else {
        consoleObj.log(`${prefix} ${message}`);
      }
    },

    warn(message: string, data?: UnknownRecord): void {
      if (consoleObj.warn) {
        logWithPrefix(consoleObj.warn, message, data);
      } else {
        logWithPrefix(consoleObj.log, `[WARN] ${message}`, data);
      }
    },

    error(message: string, data?: UnknownRecord): void {
      logWithPrefix(consoleObj.error, message, data);
    },
  };
}

/**
 * Create a structured JSON logger.
 *
 * Outputs logs as JSON for log aggregation systems.
 *
 * **Warning:** The default output is a no-op function that discards logs.
 * You must provide an `output` function to capture logs in production.
 *
 * @param options - Logger options
 * @returns A JSON-structured Logger
 */
export function createJsonLogger(
  options: {
    /** Output function - required in production. Defaults to no-op which discards logs. */
    output?: (json: string) => void;
    /** Add timestamp to each log */
    includeTimestamp?: boolean;
    /** Service name for log aggregation */
    serviceName?: string;
  } = {}
): Logger {
  const {
    output = () => {}, // Default to no-op
    includeTimestamp = true,
    serviceName,
  } = options;

  const log = (level: string, message: string, data?: UnknownRecord): void => {
    const entry: UnknownRecord = {
      level,
      message,
      ...data,
    };

    if (includeTimestamp) {
      entry["timestamp"] = new Date().toISOString();
    }

    if (serviceName) {
      entry["service"] = serviceName;
    }

    output(JSON.stringify(entry));
  };

  return {
    debug: (msg, data) => log("debug", msg, data),
    trace: (msg, data) => log("trace", msg, data),
    info: (msg, data) => log("info", msg, data),
    report: (msg, data) => log("report", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}

/**
 * Create a no-op logger for testing or when logging is disabled.
 *
 * @returns A Logger that discards all messages
 */
export function createNoOpLogger(): Logger {
  return createPlatformNoOpLogger();
}
