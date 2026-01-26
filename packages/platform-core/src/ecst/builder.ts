/**
 * Fat Event Builder - Creates ECST (Event-Carried State Transfer) events
 *
 * @libar-docs
 * @libar-docs-pattern EcstFatEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * Builder utilities for creating fat events with embedded context.
 * Fat events carry full context for downstream consumers, eliminating
 * the need for cross-BC queries.
 */

import type { FatEvent, FatEventSchema, FatEventValidationResult } from "./types.js";

/**
 * Default schema version when no schema is provided.
 */
export const DEFAULT_FAT_EVENT_SCHEMA_VERSION = "1.0.0";

/**
 * Options for creating a fat event.
 */
export interface FatEventOptions<T = unknown> {
  /** Schema for validation and versioning */
  schema?: FatEventSchema<T>;
  /** Correlation ID for request tracing */
  correlationId?: string;
}

/**
 * Creates a fat event with embedded context.
 *
 * Fat events enable Event-Carried State Transfer (ECST) where events carry
 * all context needed by downstream consumers, eliminating back-queries to
 * the source bounded context.
 *
 * @param eventType - The event type name (e.g., "OrderSubmitted")
 * @param payload - The event payload with embedded context
 * @param options - Optional configuration (schema, correlationId)
 * @returns A properly structured FatEvent
 * @throws Error if schema validation fails
 *
 * @example
 * ```typescript
 * // Basic fat event
 * const event = createFatEvent("OrderSubmitted", {
 *   orderId: "ord_123",
 *   totalAmount: 150.00,
 * });
 *
 * // With schema validation
 * const schema: FatEventSchema<OrderPayload> = {
 *   version: "2.0.0",
 *   validate: (p): p is OrderPayload => {
 *     return typeof p === "object" && p !== null && "orderId" in p;
 *   },
 * };
 *
 * const event = createFatEvent("OrderSubmitted", payload, { schema });
 * ```
 */
export function createFatEvent<T>(
  eventType: string,
  payload: T,
  options?: FatEventOptions<T>
): FatEvent<T> {
  const { schema, correlationId } = options ?? {};

  // Validate payload against schema if provided
  if (schema && !schema.validate(payload)) {
    const correlationContext = correlationId ? ` [correlationId: ${correlationId}]` : "";
    throw new Error(
      `Schema validation failed for event type "${eventType}" (schema version ${schema.version})${correlationContext}`
    );
  }

  // Determine schema version
  const schemaVersion = schema?.version ?? DEFAULT_FAT_EVENT_SCHEMA_VERSION;

  return {
    type: eventType,
    payload,
    metadata: {
      timestamp: Date.now(),
      schemaVersion,
      ...(correlationId !== undefined && { correlationId }),
    },
  };
}

/**
 * Validates a fat event against a schema.
 *
 * @param event - The fat event to validate
 * @param schema - The schema to validate against
 * @returns Validation result with optional error message
 *
 * @example
 * ```typescript
 * const result = validateFatEvent(event, schema);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateFatEvent<T>(
  event: FatEvent,
  schema: FatEventSchema<T>
): FatEventValidationResult {
  if (!schema.validate(event.payload)) {
    return {
      valid: false,
      error: `Schema validation failed for event type "${event.type}" (schema version ${schema.version})`,
    };
  }
  return { valid: true };
}
