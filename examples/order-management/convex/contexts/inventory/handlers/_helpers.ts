/**
 * Shared helpers for inventory command handlers.
 *
 * Uses the shared command logging helpers from @libar-dev/platform-core,
 * providing context-specific loggers and type aliases.
 */
import { createScopedLogger, type BaseCommandLogContext } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../../../infrastructure.js";

// Re-export shared helpers (including logCommandFailed for reservation failures)
export {
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandFailed,
  logCommandError,
} from "@libar-dev/platform-core";

/**
 * Default logger for inventory command handler operations.
 * Log format: [Inventory:Command] message {context}
 */
export const defaultInventoryCommandLogger = createScopedLogger(
  "Inventory:Command",
  PLATFORM_LOG_LEVEL
);

/**
 * Context for product command logging.
 */
export type ProductCommandLogContext = BaseCommandLogContext & { productId: string };

/**
 * Context for reservation command logging.
 * Includes both orderId and optional reservationId for cross-context tracing.
 */
export type ReservationCommandLogContext = BaseCommandLogContext & {
  orderId: string;
  reservationId?: string;
};

/**
 * Union type for all inventory command log contexts.
 */
export type CommandLogContext = ProductCommandLogContext | ReservationCommandLogContext;
