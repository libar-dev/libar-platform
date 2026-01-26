// Types
export type {
  EventMetadata,
  DomainEvent,
  EnhancedEventMetadata,
  EnhancedDomainEvent,
  NewEventInput,
  AppendResult,
  ReadStreamOptions,
  ReadAllOptions,
  ExtractEventPayload,
  ExtractEnhancedEventPayload,
} from "./types.js";

// Category
export type { EventCategory } from "./category.js";

export {
  EVENT_CATEGORIES,
  EventCategorySchema,
  DEFAULT_EVENT_CATEGORY,
  DEFAULT_SCHEMA_VERSION,
  isEventCategory,
  normalizeCategory,
  normalizeSchemaVersion,
  isExternalCategory,
  isCrossContextCategory,
} from "./category.js";

// Schemas
export {
  EventMetadataSchema,
  DomainEventSchema,
  EnhancedEventMetadataSchema,
  EnhancedDomainEventSchema,
  createEventSchema,
  createDomainEventSchema,
  createIntegrationEventSchema,
  createTriggerEventSchema,
  createFatEventSchema,
  NewEventInputSchema,
  AppendResultSchema,
} from "./schemas.js";

export type {
  TypedEventSchema,
  TypedDomainEventSchema,
  TypedIntegrationEventSchema,
  TypedTriggerEventSchema,
  TypedFatEventSchema,
  DomainEventSchemaConfig,
  IntegrationEventSchemaConfig,
  TriggerEventSchemaConfig,
  FatEventSchemaConfig,
  EventMetadataSchemaType,
  DomainEventSchemaType,
  EnhancedEventMetadataSchemaType,
  EnhancedDomainEventSchemaType,
  NewEventInputSchemaType,
  AppendResultSchemaType,
} from "./schemas.js";

// Upcaster
export {
  EventUpcasterError,
  createEventUpcaster,
  createUpcasterRegistry,
  addFieldMigration,
  renameFieldMigration,
} from "./upcaster.js";

export type {
  EventUpcasterErrorCode,
  EventUpcastResult,
  EventMigration,
  EventTypeUpcastConfig,
  EventUpcasterRegistry,
} from "./upcaster.js";

// Builders
export { createEventData, createEventDataWithId } from "./builder.js";
export type { NewEventData, CreateEventDataInput } from "./builder.js";
