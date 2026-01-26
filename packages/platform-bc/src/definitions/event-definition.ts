/**
 * Event Definition Interface
 *
 * Formal metadata for events in a bounded context.
 * Complements Zod schemas with documentation and introspection.
 *
 * Events represent facts that have occurred in the domain.
 * They follow the NounVerbed naming convention (e.g., OrderCreated).
 *
 * @example
 * ```typescript
 * const OrderCreatedDef = defineEvent({
 *   eventType: "OrderCreated",
 *   description: "Emitted when a new order is created",
 *   sourceAggregate: "Order",
 *   category: "domain",
 *   schemaVersion: 1,
 *   producedBy: ["CreateOrder"],
 * });
 * ```
 */

/**
 * All valid event category values.
 *
 * - `domain`: Internal facts within a bounded context for event sourcing
 * - `integration`: Cross-context communication (Published Language)
 * - `trigger`: Minimal payload events (ID only, GDPR-compliant)
 * - `fat`: Full state snapshot events for external systems
 */
export const EVENT_CATEGORIES = ["domain", "integration", "trigger", "fat"] as const;

/**
 * Event category type derived from the EVENT_CATEGORIES tuple.
 */
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/**
 * Type guard to check if a value is a valid EventCategory.
 *
 * @param value - Value to check
 * @returns True if value is a valid EventCategory
 *
 * @example
 * ```typescript
 * const category: unknown = "domain";
 * if (isEventCategory(category)) {
 *   // category is now typed as EventCategory
 * }
 * ```
 */
export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Metadata for an event type.
 *
 * This interface captures event documentation without
 * replacing the Zod schema (which remains the validation source).
 *
 * @template TEventType - Literal string type for the event
 */
export interface EventDefinition<TEventType extends string = string> {
  /**
   * Event type name (e.g., "OrderCreated", "OrderSubmitted").
   * Should follow NounVerbed naming convention.
   */
  readonly eventType: TEventType;

  /**
   * Human-readable description of what this event represents.
   */
  readonly description: string;

  /**
   * Source aggregate type that produces this event (e.g., "Order").
   */
  readonly sourceAggregate: string;

  /**
   * Event category for routing and processing decisions.
   */
  readonly category: EventCategory;

  /**
   * Current schema version for this event.
   * Used by event upcasters for schema evolution.
   * Must be a non-negative integer (0, 1, 2, ...).
   */
  readonly schemaVersion: number;

  /**
   * Commands that produce this event.
   */
  readonly producedBy: readonly string[];

  /**
   * Downstream processes triggered by this event.
   * Examples: sagas, process managers, projections.
   */
  readonly triggersProcesses?: readonly string[];
}

/**
 * Helper to define an event with type inference.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving all literal types including eventType, producedBy, and triggersProcesses.
 *
 * @param definition - Event definition
 * @returns The same definition with all literal types preserved
 *
 * @example
 * ```typescript
 * const OrderSubmittedDef = defineEvent({
 *   eventType: "OrderSubmitted",
 *   description: "Emitted when an order is submitted for processing",
 *   sourceAggregate: "Order",
 *   category: "domain",
 *   schemaVersion: 1,
 *   producedBy: ["SubmitOrder"],
 *   triggersProcesses: ["OrderFulfillmentSaga"],
 * });
 *
 * // OrderSubmittedDef.eventType is "OrderSubmitted" (literal), not string
 * // OrderSubmittedDef.producedBy is readonly ["SubmitOrder"] (literal tuple)
 * ```
 */
export function defineEvent<const T extends EventDefinition<string>>(definition: T): T {
  return definition;
}

/**
 * Registry of event definitions for a bounded context.
 *
 * Maps event type strings to their definitions.
 *
 * @template TEventTypes - Tuple of event type strings
 *
 * @example
 * ```typescript
 * const ORDER_EVENTS = ["OrderCreated", "OrderSubmitted"] as const;
 *
 * const OrderEventDefs: EventDefinitionRegistry<typeof ORDER_EVENTS> = {
 *   OrderCreated: defineEvent({ ... }),
 *   OrderSubmitted: defineEvent({ ... }),
 * };
 * ```
 */
export type EventDefinitionRegistry<TEventTypes extends readonly string[]> = {
  readonly [K in TEventTypes[number]]: EventDefinition<K>;
};
