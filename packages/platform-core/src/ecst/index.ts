/**
 * ## Event-Carried State Transfer (ECST) - Fat Events for Service Independence
 *
 * Enable bounded contexts to operate independently via Fat Events with embedded context.
 *
 * Implements Event-Carried State Transfer pattern where events carry full context
 * needed by downstream consumers, eliminating query dependencies between bounded
 * contexts. Fat Events embed related entity data directly in events, enabling
 * consumers to process events without making synchronous cross-context queries.
 *
 * ### When to Use
 *
 * - When bounded contexts need to remain independent
 * - When you want to eliminate synchronous cross-context queries
 * - When event consumers need denormalized data for processing
 * - When implementing integration category projections
 *
 * ### Key Benefits
 *
 * - **Independence**: Consumers don't query producers
 * - **Resilience**: Downstream contexts work even if upstream is down
 * - **Performance**: No synchronous cross-context calls
 * - **Versioning**: Schema validation ensures backward compatibility
 *
 * ### Fat Event Pattern
 *
 * ```typescript
 * // Create a fat event with embedded context
 * const event = createFatEvent('OrderSubmitted', {
 *   orderId: 'ord_123',
 *   customer: embedEntity(customer, ['id', 'name', 'email']),
 *   items: embedCollection(orderItems, ['productId', 'name', 'quantity']),
 *   totalAmount: 150.00,
 * });
 * ```
 *
 * ### GDPR Compliance (Crypto-Shredding)
 *
 * ```typescript
 * // Mark PII fields for later deletion
 * const event = createFatEvent('OrderSubmitted', {
 *   orderId: 'ord_123',
 *   customer: embedEntity(customer, ['id', 'name', 'email'], { shred: ['email'] }),
 * });
 *
 * // Find and shred PII when processing deletion request
 * const paths = findShreddableFields(event); // ['payload.customer.email']
 * const { event: shredded, audit } = shredEvent(event, 'erasure-req-123');
 * // shredded.payload.customer.email === { __redacted: true, originalType: 'string', redactedAt: ... }
 * // audit.fieldsShredded === ['payload.customer.email']
 *
 * // Check if a value was redacted
 * if (isRedactedValue(shredded.payload.customer.email)) {
 *   console.log('Email was redacted');
 * }
 * ```
 *
 * @libar-docs
 * @libar-docs-implements EcstFatEvents
 */

// Type exports
export type {
  FatEvent,
  FatEventSchema,
  ShreddableField,
  EmbedOptions,
  EmbeddedEntity,
  FatEventValidationResult,
  ShredAudit,
  ShredResult,
  RedactedValue,
} from "./types.js";

// Type guard exports from types.ts
export { isRedactedValue } from "./types.js";

// Builder exports
export {
  createFatEvent,
  validateFatEvent,
  DEFAULT_FAT_EVENT_SCHEMA_VERSION,
  type FatEventOptions,
} from "./builder.js";

// Embed helper exports
export { embedEntity, embedCollection } from "./embed.js";

// Versioning exports
export { migrateEvent, compareVersions, needsMigration } from "./versioning.js";

// Privacy exports
export {
  findShreddableFields,
  shredEvent,
  isShreddableField,
  hasShreddableFields,
  countShreddableFields,
  MAX_TRAVERSAL_DEPTH,
} from "./privacy.js";
