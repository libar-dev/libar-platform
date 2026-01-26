/**
 * Logging Module
 *
 * Configurable logging infrastructure aligned with Workpool's 6-level hierarchy.
 * Provides scoped loggers for PM execution, EventBus, and EventStore operations.
 *
 * @example
 * ```typescript
 * import { createScopedLogger, createPlatformNoOpLogger, type LogLevel } from "@libar-dev/platform-core";
 *
 * // Platform-wide log level from infrastructure.ts
 * const PLATFORM_LOG_LEVEL: LogLevel = "INFO";
 *
 * // Create loggers for different components
 * const pmLogger = createScopedLogger("PM:orderNotification", PLATFORM_LOG_LEVEL);
 * const eventBusLogger = createScopedLogger("EventBus", PLATFORM_LOG_LEVEL);
 *
 * // Use no-op logger for testing or when logging is disabled
 * const silentLogger = createPlatformNoOpLogger();
 * ```
 */

// Types
export type { Logger, LogLevel } from "./types.js";
export { LOG_LEVEL_PRIORITY, DEFAULT_LOG_LEVEL, shouldLog } from "./types.js";

// Factories
export {
  createScopedLogger,
  createPlatformNoOpLogger,
  createChildLogger,
  TRACE_TIMING,
} from "./scoped.js";
export type { TraceTiming } from "./scoped.js";

// Testing utilities
export type { LogCall, MockLogger } from "./testing.js";
export { createMockLogger, createFilteredMockLogger } from "./testing.js";

// Command logging helpers
export type { BaseCommandLogContext } from "./commands.js";
export {
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandFailed,
  logCommandError,
  logCommandSkipped,
} from "./commands.js";
