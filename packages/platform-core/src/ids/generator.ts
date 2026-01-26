/**
 * UUID v7 and prefixed ID generation utilities.
 *
 * ID Format: {context}_{type}_{uuidv7}
 * Example: orders_order_0190a7c4-1234-7abc-8def-1234567890ab
 *
 * Uses the official `uuid` package for RFC 9562 compliant UUID v7 generation.
 */
import { v7 as uuidv7 } from "uuid";
import {
  toCommandId,
  toCorrelationId,
  toEventId,
  type CommandId,
  type CorrelationId,
  type EventId,
} from "./branded.js";

// Re-export for convenience
export { uuidv7 };

/**
 * Valid ID part pattern: lowercase alphanumeric only.
 * This ensures IDs can be correctly parsed since underscores are used as delimiters.
 */
const VALID_ID_PART = /^[a-z0-9]+$/;

/**
 * Maximum length for ID parts (context and type).
 * Prevents excessively long IDs that could cause database issues.
 */
const MAX_ID_PART_LENGTH = 64;

/**
 * Validate an ID part (context or type).
 * @throws Error if the part contains invalid characters or exceeds max length
 */
function validateIdPart(part: string, name: string): void {
  if (!part) {
    throw new Error(`${name} cannot be empty`);
  }
  if (!VALID_ID_PART.test(part)) {
    throw new Error(
      `Invalid ${name}: "${part}". Must contain only lowercase letters and numbers (no underscores, spaces, or special characters).`
    );
  }
  if (part.length > MAX_ID_PART_LENGTH) {
    throw new Error(
      `${name} too long: "${part}" (${part.length} chars). Maximum is ${MAX_ID_PART_LENGTH}.`
    );
  }
}

/**
 * Generate a prefixed ID in the format: {context}_{type}_{uuidv7}
 *
 * @param context - The bounded context (e.g., "orders", "inventory")
 * @param type - The entity type (e.g., "order", "product")
 * @returns A prefixed unique identifier
 * @throws Error if context or type contains invalid characters
 *
 * @example
 * ```typescript
 * generateId("orders", "order"); // "orders_order_0190a7c4-1234-7abc-..."
 * generateId("orders_inventory", "order"); // throws Error (underscore not allowed)
 * ```
 */
export function generateId(context: string, type: string): string {
  validateIdPart(context, "context");
  validateIdPart(type, "type");
  return `${context}_${type}_${uuidv7()}`;
}

/**
 * Parse a prefixed ID into its components.
 *
 * @param id - The prefixed ID to parse
 * @returns An object with context, type, and uuid, or null if invalid
 */
export function parseId(id: string): { context: string; type: string; uuid: string } | null {
  const parts = id.split("_");
  if (parts.length < 3) {
    return null;
  }

  const [context, type, ...uuidParts] = parts;

  if (!context || !type) {
    return null;
  }

  return {
    context,
    type,
    uuid: uuidParts.join("_"),
  };
}

/**
 * Generate a correlation ID for tracking related commands and events.
 * Returns a branded CorrelationId type for compile-time safety.
 */
export function generateCorrelationId(): CorrelationId {
  return toCorrelationId(`corr_${uuidv7()}`);
}

/**
 * Generate a command ID for idempotency.
 * Returns a branded CommandId type for compile-time safety.
 */
export function generateCommandId(): CommandId {
  return toCommandId(`cmd_${uuidv7()}`);
}

/**
 * Generate an event ID.
 * Returns a branded EventId type for compile-time safety.
 */
export function generateEventId(context: string): EventId {
  return toEventId(generateId(context, "event"));
}

/**
 * Generate an integration event ID.
 * Integration events are cross-context and use a standardized prefix.
 * Returns a branded EventId type for compile-time safety.
 */
export function generateIntegrationEventId(): EventId {
  return toEventId(`int_evt_${uuidv7()}`);
}
