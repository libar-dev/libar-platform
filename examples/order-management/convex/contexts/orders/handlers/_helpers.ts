/**
 * Shared helpers for order command handlers.
 *
 * Uses the shared command logging helpers from @libar-dev/platform-core,
 * providing a context-specific logger and type alias.
 */
import { createScopedLogger, type BaseCommandLogContext } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../../../infrastructure.js";

// Re-export shared helpers
export {
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandError,
} from "@libar-dev/platform-core";

/**
 * Default logger for order command handler operations.
 * Log format: [Order:Command] message {context}
 */
export const defaultOrderCommandLogger = createScopedLogger("Order:Command", PLATFORM_LOG_LEVEL);

/**
 * Context for order command logging.
 * Extends base with orderId for order-specific tracing.
 */
export type CommandLogContext = BaseCommandLogContext & { orderId: string };
