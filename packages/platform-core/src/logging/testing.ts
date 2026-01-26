/**
 * Testing utilities for logging infrastructure.
 *
 * Provides mock loggers that capture log calls for assertion in tests.
 *
 * @example
 * ```typescript
 * import { createMockLogger } from "@libar-dev/platform-core";
 *
 * const mockLogger = createMockLogger();
 *
 * // Use mockLogger in component under test
 * const executor = new BatchExecutor({ logger: mockLogger, ... });
 *
 * // After test execution, verify logging
 * expect(mockLogger.calls).toContainEqual({
 *   level: "INFO",
 *   message: "Batch execution completed",
 *   data: expect.objectContaining({ status: "success" }),
 * });
 *
 * // Clear for next test
 * mockLogger.clear();
 * ```
 */

import type { Logger, LogLevel } from "./types.js";
import { shouldLog } from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Maps log levels to their corresponding Logger method names.
 * Used internally to simplify method dispatch in filtered loggers.
 */
const LOG_METHOD_MAP: Record<LogLevel, keyof Logger> = {
  DEBUG: "debug",
  TRACE: "trace",
  INFO: "info",
  REPORT: "report",
  WARN: "warn",
  ERROR: "error",
};

/**
 * A single log call captured by the mock logger.
 */
export interface LogCall {
  /** Log level of the call */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Optional structured data (undefined if not provided) */
  data: UnknownRecord | undefined;
  /** Timestamp when the call was made */
  timestamp: number;
}

/**
 * Mock logger that captures all log calls for testing.
 *
 * Extends the Logger interface with testing utilities:
 * - `calls`: Array of all log calls made
 * - `clear()`: Reset the calls array
 * - `getCallsAtLevel(level)`: Get calls at a specific level
 * - `hasLoggedMessage(message)`: Check if a message was logged
 */
export interface MockLogger extends Logger {
  /** All captured log calls */
  readonly calls: ReadonlyArray<LogCall>;

  /** Clear all captured calls */
  clear(): void;

  /**
   * Get calls at a specific log level.
   * @param level - The log level to filter by
   */
  getCallsAtLevel(level: LogLevel): ReadonlyArray<LogCall>;

  /**
   * Check if a message was logged at any level.
   * @param message - The message to search for (partial match)
   */
  hasLoggedMessage(message: string): boolean;

  /**
   * Check if a message was logged at a specific level.
   * @param level - The log level
   * @param message - The message to search for (partial match)
   */
  hasLoggedAt(level: LogLevel, message: string): boolean;

  /**
   * Get the last call at a specific level.
   * @param level - The log level
   */
  getLastCallAt(level: LogLevel): LogCall | undefined;
}

/**
 * Create a mock logger for testing.
 *
 * The mock logger captures all log calls in the `calls` array for assertion.
 *
 * **Memory note:** The `calls` array is unbounded and grows with each log call.
 * For long-running tests or high-volume logging scenarios, use `clear()` periodically
 * to prevent memory growth. In typical unit tests this is not a concern.
 *
 * @returns A MockLogger instance
 *
 * @example
 * ```typescript
 * const logger = createMockLogger();
 *
 * logger.info("Test message", { key: "value" });
 *
 * expect(logger.calls).toHaveLength(1);
 * expect(logger.calls[0].level).toBe("INFO");
 * expect(logger.calls[0].message).toBe("Test message");
 * expect(logger.calls[0].data).toEqual({ key: "value" });
 * ```
 */
export function createMockLogger(): MockLogger {
  const calls: LogCall[] = [];

  const logMethod =
    (level: LogLevel) =>
    (message: string, data?: UnknownRecord): void => {
      calls.push({
        level,
        message,
        data,
        timestamp: Date.now(),
      });
    };

  return {
    get calls(): ReadonlyArray<LogCall> {
      return calls;
    },

    clear(): void {
      calls.length = 0;
    },

    getCallsAtLevel(level: LogLevel): ReadonlyArray<LogCall> {
      return calls.filter((call) => call.level === level);
    },

    hasLoggedMessage(message: string): boolean {
      return calls.some((call) => call.message.includes(message));
    },

    hasLoggedAt(level: LogLevel, message: string): boolean {
      return calls.some((call) => call.level === level && call.message.includes(message));
    },

    getLastCallAt(level: LogLevel): LogCall | undefined {
      const levelCalls = calls.filter((call) => call.level === level);
      return levelCalls[levelCalls.length - 1];
    },

    debug: logMethod("DEBUG"),
    trace: logMethod("TRACE"),
    info: logMethod("INFO"),
    report: logMethod("REPORT"),
    warn: logMethod("WARN"),
    error: logMethod("ERROR"),
  };
}

/**
 * Create a mock logger with a specific log level filter.
 *
 * Only logs at or above the specified level are captured.
 *
 * @param minLevel - Minimum log level to capture
 * @returns A MockLogger that filters by level
 */
export function createFilteredMockLogger(minLevel: LogLevel): MockLogger {
  const baseMock = createMockLogger();
  const { calls, clear, getCallsAtLevel, hasLoggedMessage, hasLoggedAt, getLastCallAt } = baseMock;

  const filteredLogMethod =
    (level: LogLevel) =>
    (message: string, data?: UnknownRecord): void => {
      if (shouldLog(level, minLevel)) {
        baseMock[LOG_METHOD_MAP[level]](message, data);
      }
    };

  return {
    get calls(): ReadonlyArray<LogCall> {
      return calls;
    },
    clear,
    getCallsAtLevel,
    hasLoggedMessage,
    hasLoggedAt,
    getLastCallAt,
    debug: filteredLogMethod("DEBUG"),
    trace: filteredLogMethod("TRACE"),
    info: filteredLogMethod("INFO"),
    report: filteredLogMethod("REPORT"),
    warn: filteredLogMethod("WARN"),
    error: filteredLogMethod("ERROR"),
  };
}
