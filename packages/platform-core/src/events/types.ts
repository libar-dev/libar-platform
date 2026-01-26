/**
 * Core domain event types for event sourcing.
 */

import type { EventCategory } from "./category.js";
import type { UnknownRecord } from "../types.js";

/**
 * Metadata attached to every domain event.
 */
export interface EventMetadata {
  /** Unique event identifier (UUID v7 format) */
  eventId: string;

  /** Type of the event (e.g., "OrderCreated", "ItemAdded") */
  eventType: string;

  /** Type of the aggregate/stream (e.g., "Order", "Product") */
  streamType: string;

  /** Unique identifier of the aggregate/stream instance */
  streamId: string;

  /** Version number within the stream (1, 2, 3...) */
  version: number;

  /** Global position across all events (for projections) */
  globalPosition: number;

  /** Timestamp when the event was created */
  timestamp: number;

  /** ID to correlate related commands and events */
  correlationId: string;

  /** ID of the event that caused this event (optional) */
  causationId?: string;

  /** The bounded context this event belongs to */
  boundedContext: string;
}

/**
 * A domain event with typed payload.
 */
export interface DomainEvent<TPayload = unknown> extends EventMetadata {
  /** The event data/payload */
  payload: TPayload;

  /** Optional additional metadata */
  metadata?: UnknownRecord;
}

/**
 * Enhanced event metadata with category and schema versioning.
 *
 * This interface extends EventMetadata with fields required for:
 * - Event taxonomy (domain, integration, trigger, fat)
 * - Schema evolution via upcasting
 *
 * @see EventCategory for category descriptions
 */
export interface EnhancedEventMetadata extends EventMetadata {
  /**
   * Event category for routing and processing decisions.
   * @default "domain"
   */
  category: EventCategory;

  /**
   * Schema version for this event type.
   * Used by upcasting pipeline when reading events.
   * @default 1
   */
  schemaVersion: number;
}

/**
 * An enhanced domain event with category and versioning.
 */
export interface EnhancedDomainEvent<TPayload = unknown> extends EnhancedEventMetadata {
  /** The event data/payload */
  payload: TPayload;

  /** Optional additional metadata */
  metadata?: UnknownRecord;
}

/**
 * Input for creating a new domain event (before persistence).
 */
export interface NewEventInput<TPayload = unknown> {
  /** Type of the event */
  eventType: string;

  /** The event payload */
  payload: TPayload;

  /** Optional metadata */
  metadata?: {
    correlationId: string;
    causationId?: string;
    userId?: string;
    [key: string]: unknown;
  };
}

/**
 * Result of appending events to a stream.
 */
export interface AppendResult {
  /** Status of the append operation */
  status: "success" | "conflict";

  /** The event IDs that were created (if success) */
  eventIds?: string[];

  /** The global positions assigned (if success) */
  globalPositions?: number[];

  /** The new stream version (if success) */
  newVersion?: number;

  /** The current version if there was a conflict */
  currentVersion?: number;
}

/**
 * Options for reading events from a stream.
 */
export interface ReadStreamOptions {
  /** Start reading from this version (inclusive) */
  fromVersion?: number;

  /** Maximum number of events to return */
  limit?: number;
}

/**
 * Options for reading all events globally.
 */
export interface ReadAllOptions {
  /** Start reading from this global position (exclusive) */
  fromPosition?: number;

  /** Maximum number of events to return */
  limit?: number;

  /** Filter by event types */
  eventTypes?: string[];

  /** Filter by bounded context */
  boundedContext?: string;
}

/**
 * Utility type to extract the payload type from a DomainEvent.
 *
 * @example
 * ```typescript
 * type OrderCreatedEvent = DomainEvent<{ orderId: string; customerId: string }>;
 * type Payload = ExtractEventPayload<OrderCreatedEvent>;
 * // Payload is { orderId: string; customerId: string }
 * ```
 */
export type ExtractEventPayload<T> = T extends DomainEvent<infer P> ? P : never;

/**
 * Utility type to extract the payload type from an EnhancedDomainEvent.
 *
 * @example
 * ```typescript
 * type OrderCreatedEvent = EnhancedDomainEvent<{ orderId: string }>;
 * type Payload = ExtractEnhancedEventPayload<OrderCreatedEvent>;
 * // Payload is { orderId: string }
 * ```
 */
export type ExtractEnhancedEventPayload<T> = T extends EnhancedDomainEvent<infer P> ? P : never;
