import { z } from "zod";
import { EventCategorySchema, DEFAULT_EVENT_CATEGORY, DEFAULT_SCHEMA_VERSION } from "./category.js";

/**
 * Base schema for event metadata.
 */
export const EventMetadataSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  streamType: z.string(),
  streamId: z.string(),
  version: z.number().int().positive(),
  globalPosition: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(), // Unix timestamp in milliseconds
  correlationId: z.string(),
  causationId: z.string().optional(),
  boundedContext: z.string(),
});

/**
 * Schema for a domain event with any payload.
 */
export const DomainEventSchema = EventMetadataSchema.extend({
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Enhanced event metadata schema with category and schema versioning.
 *
 * Adds:
 * - `category`: Event taxonomy (domain, integration, trigger, fat)
 * - `schemaVersion`: Version for schema evolution and upcasting
 */
export const EnhancedEventMetadataSchema = EventMetadataSchema.extend({
  category: EventCategorySchema.default(DEFAULT_EVENT_CATEGORY),
  schemaVersion: z.number().int().positive().default(DEFAULT_SCHEMA_VERSION),
});

/**
 * Enhanced domain event schema with category and versioning.
 */
export const EnhancedDomainEventSchema = EnhancedEventMetadataSchema.extend({
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Return type for createEventSchema.
 * Extends EventMetadataSchema with typed eventType literal and payload.
 */
export type TypedEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof EventMetadataSchema.shape & {
    eventType: z.ZodLiteral<TEventType>;
    payload: TPayload;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }
>;

/**
 * Factory function to create a typed event schema.
 *
 * Returns a Zod schema that extends EventMetadataSchema with:
 * - A literal eventType for type safety
 * - A typed payload based on the provided schema
 * - Optional metadata for additional context
 *
 * @param eventType - The event type literal (e.g., "OrderCreated")
 * @param payloadSchema - Zod schema for the event payload
 * @returns A typed Zod schema for the event
 *
 * @example
 * ```typescript
 * const OrderCreatedSchema = createEventSchema(
 *   "OrderCreated",
 *   z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *   })
 * );
 *
 * // Type inference:
 * type OrderCreatedEvent = z.infer<typeof OrderCreatedSchema>;
 * // { eventId: string, eventType: "OrderCreated", payload: { orderId: string, customerId: string }, ... }
 * ```
 */
export function createEventSchema<TEventType extends string, TPayload extends z.ZodTypeAny>(
  eventType: TEventType,
  payloadSchema: TPayload
): TypedEventSchema<TEventType, TPayload> {
  return EventMetadataSchema.extend({
    eventType: z.literal(eventType),
    payload: payloadSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as TypedEventSchema<TEventType, TPayload>;
}

/**
 * Return type for createDomainEventSchema.
 * Extends EnhancedEventMetadataSchema with typed eventType literal, category, schemaVersion, and payload.
 */
export type TypedDomainEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number,
> = z.ZodObject<
  typeof EnhancedEventMetadataSchema.shape & {
    eventType: z.ZodLiteral<TEventType>;
    category: z.ZodDefault<z.ZodLiteral<"domain">>;
    schemaVersion: z.ZodDefault<z.ZodLiteral<TSchemaVersion>>;
    payload: TPayload;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }
>;

/**
 * Configuration for domain event schema creation.
 */
export interface DomainEventSchemaConfig<TEventType extends string, TPayload extends z.ZodTypeAny> {
  /** Event type name (e.g., "OrderCreated") */
  eventType: TEventType;
  /** Zod schema for the event payload */
  payloadSchema: TPayload;
  /** Schema version for this event type (defaults to 1) */
  schemaVersion?: number;
}

/**
 * Enhanced factory function for domain events with schema versioning.
 *
 * Creates a Zod schema for domain events with:
 * - Literal eventType for type safety
 * - Fixed category as "domain"
 * - Explicit schemaVersion for evolution support
 * - Typed payload based on provided schema
 *
 * @param config - Configuration object with eventType, payloadSchema, and optional schemaVersion
 * @returns A typed Zod schema for the domain event
 *
 * @example
 * ```typescript
 * // Version 1 (initial)
 * const OrderCreatedV1Schema = createDomainEventSchema({
 *   eventType: "OrderCreated",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *   }),
 *   schemaVersion: 1,
 * });
 *
 * // Version 2 (added createdAt field)
 * const OrderCreatedV2Schema = createDomainEventSchema({
 *   eventType: "OrderCreated",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *     createdAt: z.number(),
 *   }),
 *   schemaVersion: 2,
 * });
 *
 * // Type inference:
 * type OrderCreatedV2Event = z.infer<typeof OrderCreatedV2Schema>;
 * ```
 */
export function createDomainEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number = 1,
>(
  config: DomainEventSchemaConfig<TEventType, TPayload> & { schemaVersion?: TSchemaVersion }
): TypedDomainEventSchema<TEventType, TPayload, TSchemaVersion> {
  const { eventType, payloadSchema, schemaVersion = 1 as TSchemaVersion } = config;

  // Note: The literal defaults (e.g., .literal(schemaVersion).default(schemaVersion))
  // ensure type safety - the default matches the literal type exactly.
  // This is intentional: if schemaVersion is 2, then default is also 2, not a global default.
  return EnhancedEventMetadataSchema.extend({
    eventType: z.literal(eventType),
    category: z.literal("domain").default("domain"),
    schemaVersion: z.literal(schemaVersion).default(schemaVersion),
    payload: payloadSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as TypedDomainEventSchema<TEventType, TPayload, TSchemaVersion>;
}

/**
 * Return type for createIntegrationEventSchema.
 */
export type TypedIntegrationEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number,
> = z.ZodObject<
  typeof EnhancedEventMetadataSchema.shape & {
    eventType: z.ZodLiteral<TEventType>;
    category: z.ZodDefault<z.ZodLiteral<"integration">>;
    schemaVersion: z.ZodDefault<z.ZodLiteral<TSchemaVersion>>;
    payload: TPayload;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }
>;

/**
 * Configuration for integration event schema creation.
 * Integration events follow the Published Language pattern.
 */
export interface IntegrationEventSchemaConfig<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
> {
  /** Event type name (e.g., "OrderPlacedIntegration") */
  eventType: TEventType;
  /** Minimal DTO payload schema - only stable, public data */
  payloadSchema: TPayload;
  /** Schema version for contract evolution */
  schemaVersion?: number;
}

/**
 * Factory for integration events (Published Language pattern).
 *
 * Integration events are for cross bounded context communication:
 * - Minimal payload (only what consumer needs)
 * - Versioned schemas with backward compatibility guarantees
 * - No internal domain details exposed
 *
 * @param config - Configuration with eventType, payloadSchema
 * @returns A typed Zod schema for the integration event
 *
 * @example
 * ```typescript
 * const OrderPlacedIntegrationSchema = createIntegrationEventSchema({
 *   eventType: "OrderPlacedIntegration",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *     totalAmount: z.number(),
 *     placedAt: z.number(),
 *   }),
 *   schemaVersion: 1,
 * });
 * ```
 */
export function createIntegrationEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number = 1,
>(
  config: IntegrationEventSchemaConfig<TEventType, TPayload> & { schemaVersion?: TSchemaVersion }
): TypedIntegrationEventSchema<TEventType, TPayload, TSchemaVersion> {
  const { eventType, payloadSchema, schemaVersion = 1 as TSchemaVersion } = config;

  return EnhancedEventMetadataSchema.extend({
    eventType: z.literal(eventType),
    category: z.literal("integration").default("integration"),
    schemaVersion: z.literal(schemaVersion).default(schemaVersion),
    payload: payloadSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as TypedIntegrationEventSchema<TEventType, TPayload, TSchemaVersion>;
}

/**
 * Return type for createTriggerEventSchema.
 * Trigger events are minimal notifications that reference an entity ID.
 */
export type TypedTriggerEventSchema<
  TEventType extends string,
  TEntityIdField extends string,
  TSchemaVersion extends number,
> = z.ZodObject<
  typeof EnhancedEventMetadataSchema.shape & {
    eventType: z.ZodLiteral<TEventType>;
    category: z.ZodDefault<z.ZodLiteral<"trigger">>;
    schemaVersion: z.ZodDefault<z.ZodLiteral<TSchemaVersion>>;
    payload: z.ZodObject<{ [K in TEntityIdField]: z.ZodString }>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }
>;

/**
 * Configuration for trigger event schema creation.
 */
export interface TriggerEventSchemaConfig<
  TEventType extends string,
  TEntityIdField extends string,
> {
  /** Event type name (e.g., "OrderShipmentStarted") */
  eventType: TEventType;
  /** Name of the entity ID field in payload (e.g., "orderId") */
  entityIdField: TEntityIdField;
  /** Schema version */
  schemaVersion?: number;
}

/**
 * Factory for trigger events (minimal notification pattern).
 *
 * Trigger events contain only an entity ID reference and signal
 * that something happened without carrying detailed data.
 * Consumers must query for current state if needed.
 *
 * Use trigger events when:
 * - The payload is too large to include in every event
 * - Consumers always need the latest state anyway
 * - You want to minimize event store storage
 *
 * @param config - Configuration with eventType and entityIdField
 * @returns A typed Zod schema for the trigger event
 *
 * @example
 * ```typescript
 * const OrderShipmentStartedSchema = createTriggerEventSchema({
 *   eventType: "OrderShipmentStarted",
 *   entityIdField: "orderId",
 *   schemaVersion: 1,
 * });
 *
 * // Payload is minimal: { orderId: string }
 * // Consumer queries current shipment status after receiving notification
 * ```
 */
export function createTriggerEventSchema<
  TEventType extends string,
  TEntityIdField extends string,
  TSchemaVersion extends number = 1,
>(
  config: TriggerEventSchemaConfig<TEventType, TEntityIdField> & { schemaVersion?: TSchemaVersion }
): TypedTriggerEventSchema<TEventType, TEntityIdField, TSchemaVersion> {
  const { eventType, entityIdField, schemaVersion = 1 as TSchemaVersion } = config;

  return EnhancedEventMetadataSchema.extend({
    eventType: z.literal(eventType),
    category: z.literal("trigger").default("trigger"),
    schemaVersion: z.literal(schemaVersion).default(schemaVersion),
    payload: z.object({
      [entityIdField]: z.string(),
    }),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as TypedTriggerEventSchema<TEventType, TEntityIdField, TSchemaVersion>;
}

/**
 * Return type for createFatEventSchema.
 * Fat events contain a full state snapshot.
 */
export type TypedFatEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number,
> = z.ZodObject<
  typeof EnhancedEventMetadataSchema.shape & {
    eventType: z.ZodLiteral<TEventType>;
    category: z.ZodDefault<z.ZodLiteral<"fat">>;
    schemaVersion: z.ZodDefault<z.ZodLiteral<TSchemaVersion>>;
    payload: TPayload;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }
>;

/**
 * Configuration for fat event schema creation.
 */
export interface FatEventSchemaConfig<TEventType extends string, TPayload extends z.ZodTypeAny> {
  /** Event type name (e.g., "OrderSnapshot") */
  eventType: TEventType;
  /** Full payload schema including all state */
  payloadSchema: TPayload;
  /** Schema version */
  schemaVersion?: number;
}

/**
 * Factory for fat events (full state snapshot pattern).
 *
 * Fat events contain the complete current state of an entity,
 * allowing consumers to process without additional queries.
 * Useful for materialized views and external system sync.
 *
 * Use fat events when:
 * - Consumers need complete state without querying
 * - Building materialized views
 * - Syncing to external systems (analytics, search)
 * - Eventual consistency is acceptable
 *
 * Trade-offs:
 * - Larger event payloads
 * - Potential for stale data if entity changed after event
 * - May violate DDD encapsulation
 *
 * @param config - Configuration with eventType and payloadSchema
 * @returns A typed Zod schema for the fat event
 *
 * @example
 * ```typescript
 * const OrderSnapshotSchema = createFatEventSchema({
 *   eventType: "OrderSnapshot",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *     items: z.array(z.object({
 *       productId: z.string(),
 *       quantity: z.number(),
 *       price: z.number(),
 *     })),
 *     totalAmount: z.number(),
 *     status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
 *     createdAt: z.number(),
 *     updatedAt: z.number(),
 *   }),
 *   schemaVersion: 1,
 * });
 * ```
 */
export function createFatEventSchema<
  TEventType extends string,
  TPayload extends z.ZodTypeAny,
  TSchemaVersion extends number = 1,
>(
  config: FatEventSchemaConfig<TEventType, TPayload> & { schemaVersion?: TSchemaVersion }
): TypedFatEventSchema<TEventType, TPayload, TSchemaVersion> {
  const { eventType, payloadSchema, schemaVersion = 1 as TSchemaVersion } = config;

  return EnhancedEventMetadataSchema.extend({
    eventType: z.literal(eventType),
    category: z.literal("fat").default("fat"),
    schemaVersion: z.literal(schemaVersion).default(schemaVersion),
    payload: payloadSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as TypedFatEventSchema<TEventType, TPayload, TSchemaVersion>;
}

/**
 * Schema for event input (before persistence).
 */
export const NewEventInputSchema = z.object({
  eventType: z.string(),
  payload: z.unknown(),
  metadata: z
    .object({
      correlationId: z.string(),
      causationId: z.string().optional(),
      userId: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

/**
 * Schema for append result.
 */
export const AppendResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    eventIds: z.array(z.string()),
    globalPositions: z.array(z.number()),
    newVersion: z.number(),
  }),
  z.object({
    status: z.literal("conflict"),
    currentVersion: z.number(),
  }),
]);

/**
 * Type inference helpers.
 */
export type EventMetadataSchemaType = z.infer<typeof EventMetadataSchema>;
export type DomainEventSchemaType = z.infer<typeof DomainEventSchema>;
export type EnhancedEventMetadataSchemaType = z.infer<typeof EnhancedEventMetadataSchema>;
export type EnhancedDomainEventSchemaType = z.infer<typeof EnhancedDomainEventSchema>;
export type NewEventInputSchemaType = z.infer<typeof NewEventInputSchema>;
export type AppendResultSchemaType = z.infer<typeof AppendResultSchema>;
