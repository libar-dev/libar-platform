/**
 * ECST Type Definitions
 *
 * @libar-docs
 * @libar-docs-pattern EcstFatEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * Core type definitions for Event-Carried State Transfer (ECST) fat events.
 */

/**
 * Fat event with embedded context.
 *
 * Fat events carry full context for downstream consumers, eliminating
 * the need for cross-BC queries. The payload contains all data needed
 * for consumers to process the event independently.
 *
 * @template T - Event payload type
 */
export interface FatEvent<T = unknown> {
  /** Event type (e.g., "OrderSubmitted") */
  type: string;
  /** Event payload with embedded context */
  payload: T;
  /**
   * Event metadata.
   *
   * @warning DO NOT put PII in metadata fields (including correlationId).
   * Metadata is NOT processed by shredEvent(). If you need to include
   * user identifiers, use generic IDs rather than names/emails.
   */
  metadata: {
    /** Unix timestamp in milliseconds */
    timestamp: number;
    /** Optional correlation ID for request tracing */
    correlationId?: string;
    /** Schema version (semver format, e.g., "1.0.0") */
    schemaVersion: string;
  };
}

/**
 * Schema definition for fat event validation and migration.
 *
 * Schemas define the expected structure of fat event payloads and
 * provide migration functions for evolving event structures over time.
 *
 * @template T - Expected payload type after validation
 */
export interface FatEventSchema<T> {
  /** Schema version (semver format, e.g., "1.0.0", "2.0.0") */
  version: string;
  /** Type guard function to validate payload structure */
  validate: (payload: unknown) => payload is T;
  /** Optional migration function for upgrading from older versions */
  migrate?: (payload: unknown, fromVersion: string) => T;
}

/**
 * A field marked for crypto-shredding (GDPR compliance).
 *
 * When embedding entity data that contains PII, fields can be wrapped
 * with this type to mark them for future deletion/redaction.
 *
 * @template T - The underlying value type
 */
export interface ShreddableField<T> {
  /** The actual field value */
  value: T;
  /** Marker indicating this field should be shredded on request */
  __shred: true;
}

/**
 * Options for embedding entities with privacy considerations.
 *
 * @template T - The entity type being embedded (for type-safe field names)
 */
export interface EmbedOptions<T extends object = Record<string, unknown>> {
  /**
   * Field names to mark for crypto-shredding.
   * Must be valid keys of the entity being embedded.
   */
  shred?: (keyof T & string)[];
  /**
   * Fields that must not be shredded (business-critical).
   * If a field appears in both `shred` and `required`, an error is thrown.
   */
  required?: (keyof T & string)[];
}

/**
 * Result of fat event validation operations.
 */
export interface FatEventValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Audit trail for crypto-shredding operations.
 *
 * Provides GDPR Article 17(2) compliance by documenting what was shredded,
 * when, and the correlation context for the erasure request.
 */
export interface ShredAudit {
  /** Unix timestamp when shredding was performed */
  shreddedAt: number;
  /** JSON paths to all fields that were shredded (e.g., ["payload.customer.email"]) */
  fieldsShredded: string[];
  /** Original event type */
  eventType: string;
  /** Optional correlation ID linking to the erasure request */
  correlationId?: string;
}

/**
 * Result of a shredEvent operation including audit trail.
 *
 * @template T - The shredded event payload type (usually unknown after shredding)
 */
export interface ShredResult<T = unknown> {
  /** The event with PII fields replaced by RedactedValue objects */
  event: FatEvent<T>;
  /** Audit trail for compliance documentation */
  audit: ShredAudit;
}

/**
 * Represents a redacted value after crypto-shredding.
 *
 * Preserves type metadata for debugging and downstream handling.
 * Unlike a simple string sentinel, this allows:
 * - Type-safe detection of redacted values
 * - Preservation of original type information
 * - Audit timestamp for compliance
 *
 * @example
 * ```typescript
 * // Before shredding
 * { email: { value: "alice@example.com", __shred: true } }
 *
 * // After shredding
 * { email: { __redacted: true, originalType: "string", redactedAt: 1705590000000 } }
 * ```
 */
export interface RedactedValue {
  /** Marker indicating this field was shredded */
  __redacted: true;
  /** Original type before redaction (for debugging/logging) */
  originalType: "string" | "number" | "boolean" | "object" | "array" | "null";
  /** Unix timestamp when redaction occurred */
  redactedAt: number;
}

/**
 * Type guard for checking if a value has been redacted.
 *
 * @param value - The value to check
 * @returns True if the value is a RedactedValue object
 *
 * @example
 * ```typescript
 * if (isRedactedValue(event.payload.customer.email)) {
 *   console.log("Email was redacted at", event.payload.customer.email.redactedAt);
 * }
 * ```
 */
export function isRedactedValue(value: unknown): value is RedactedValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "__redacted" in value &&
    (value as RedactedValue).__redacted === true
  );
}

/**
 * Result type for embedded entities, properly typing fields that may be shredded.
 *
 * When embedding an entity with shred markers, fields can be either:
 * - Their original type (if not marked for shredding)
 * - A ShreddableField wrapper (if marked for shredding)
 *
 * @template T - The original entity type
 * @template K - The keys being embedded (defaults to all keys)
 */
export type EmbeddedEntity<T extends object, K extends keyof T = keyof T> = {
  [P in K]: T[P] | ShreddableField<T[P]>;
};
