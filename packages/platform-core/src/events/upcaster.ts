/**
 * @libar-docs
 * @libar-docs-pattern EventUpcasting
 * @libar-docs-status completed
 * @libar-docs-phase 09
 * @libar-docs-event-sourcing
 *
 * ## Event Upcasting Pipeline - Schema Evolution
 *
 * Transforms events from older schema versions to current version at read time.
 * Enables non-breaking schema evolution via centralized migration pipeline.
 *
 * ### When to Use
 *
 * - Event schemas need to evolve without breaking existing stored events
 * - Migrating events from older versions during projection/replay reads
 * - Centralized schema migration via an upcaster registry
 */

import type { EnhancedDomainEvent } from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Error codes for event upcast failures.
 */
export type EventUpcasterErrorCode =
  | "UNKNOWN_EVENT_TYPE"
  | "MISSING_MIGRATION"
  | "INVALID_EVENT"
  | "FUTURE_VERSION";

/**
 * Error thrown when event upcast fails.
 */
export class EventUpcasterError extends Error {
  readonly code: EventUpcasterErrorCode;
  readonly context: UnknownRecord | undefined;

  constructor(code: EventUpcasterErrorCode, message: string, context?: UnknownRecord) {
    super(message);
    this.name = "EventUpcasterError";
    this.code = code;
    this.context = context;
  }
}

/**
 * Result of event upcasting.
 */
export interface EventUpcastResult<T> {
  /** The upcasted event with current schema */
  event: T;

  /** Whether the event was transformed */
  wasUpcasted: boolean;

  /** Original schema version */
  originalSchemaVersion: number;

  /** Current schema version after upcast */
  currentSchemaVersion: number;
}

/**
 * Migration function from one schema version to the next.
 *
 * @param event - Event at version N
 * @returns Event at version N+1
 */
export type EventMigration<TFrom = unknown, TTo = unknown> = (event: TFrom) => TTo;

/**
 * Configuration for an event type's upcaster.
 */
export interface EventTypeUpcastConfig<TLatest> {
  /** Current (latest) schema version for this event type */
  currentVersion: number;

  /**
   * Migration functions keyed by source version.
   * Each migrates from version N to N+1.
   *
   * For currentVersion = 3, you need migrations for versions 1 and 2:
   * - migrations[1]: v1 -> v2
   * - migrations[2]: v2 -> v3
   */
  migrations: Record<number, EventMigration>;

  /** Optional validator for the final upcasted event */
  validate?: (event: unknown) => event is TLatest;
}

/**
 * Create an upcaster for a specific event type.
 *
 * The upcaster transforms events from any historical schema version to the
 * current version by applying migrations sequentially.
 *
 * @param config - Upcaster configuration with currentVersion and migrations
 * @returns Function that upcasts any version of the event to the latest
 *
 * @example
 * ```typescript
 * interface OrderCreatedV1Payload {
 *   orderId: string;
 *   customerId: string;
 * }
 *
 * interface OrderCreatedV2Payload extends OrderCreatedV1Payload {
 *   createdAt: number;
 * }
 *
 * const upcastOrderCreated = createEventUpcaster<OrderCreatedV2Payload>({
 *   currentVersion: 2,
 *   migrations: {
 *     1: (event) => ({
 *       ...event,
 *       payload: {
 *         ...event.payload,
 *         createdAt: event.timestamp, // Derive from event timestamp
 *       },
 *       schemaVersion: 2,
 *     }),
 *   },
 * });
 *
 * // Usage in projection handler:
 * const { event, wasUpcasted } = upcastOrderCreated(rawEvent);
 * ```
 */
export function createEventUpcaster<TLatestPayload>(
  config: EventTypeUpcastConfig<EnhancedDomainEvent<TLatestPayload>>
): (event: EnhancedDomainEvent<unknown>) => EventUpcastResult<EnhancedDomainEvent<TLatestPayload>> {
  // Validate migration chain at creation time (fail fast)
  for (let v = 1; v < config.currentVersion; v++) {
    if (!config.migrations[v]) {
      throw new Error(
        `Missing migration for version ${v}. ` +
          `Migrations must form a complete chain from 1 to ${config.currentVersion - 1}.`
      );
    }
  }

  return (
    event: EnhancedDomainEvent<unknown>
  ): EventUpcastResult<EnhancedDomainEvent<TLatestPayload>> => {
    const originalSchemaVersion = event.schemaVersion;

    // Already at current version - no migration needed
    if (originalSchemaVersion === config.currentVersion) {
      return {
        event: event as EnhancedDomainEvent<TLatestPayload>,
        wasUpcasted: false,
        originalSchemaVersion,
        currentSchemaVersion: config.currentVersion,
      };
    }

    // Reject future versions - we can't downcast
    if (originalSchemaVersion > config.currentVersion) {
      throw new EventUpcasterError(
        "FUTURE_VERSION",
        `Event schema version ${originalSchemaVersion} is newer than ` +
          `current version ${config.currentVersion}. Cannot downcast.`,
        { eventType: event.eventType, schemaVersion: originalSchemaVersion }
      );
    }

    // Apply migrations in sequence: v1 -> v2 -> v3 -> ... -> currentVersion
    let currentEvent: unknown = event;
    let currentVersion = originalSchemaVersion;

    while (currentVersion < config.currentVersion) {
      const migration = config.migrations[currentVersion];
      if (!migration) {
        throw new EventUpcasterError(
          "MISSING_MIGRATION",
          `No migration from version ${currentVersion} to ${currentVersion + 1}`,
          { eventType: event.eventType, fromVersion: currentVersion }
        );
      }
      currentEvent = migration(currentEvent);
      currentVersion++;
    }

    // Validate final result if validator provided
    if (config.validate && !config.validate(currentEvent)) {
      throw new EventUpcasterError("INVALID_EVENT", `Upcasted event failed validation`, {
        eventType: event.eventType,
        resultVersion: currentVersion,
      });
    }

    return {
      event: currentEvent as EnhancedDomainEvent<TLatestPayload>,
      wasUpcasted: true,
      originalSchemaVersion,
      currentSchemaVersion: config.currentVersion,
    };
  };
}

/**
 * Registry of event upcasters by event type.
 *
 * Provides centralized upcasting for all event types in a bounded context
 * or application.
 */
export interface EventUpcasterRegistry {
  /**
   * Register an upcaster for an event type.
   *
   * @param eventType - Event type name (e.g., "OrderCreated")
   * @param upcaster - Upcaster function for this event type
   */
  register<T>(
    eventType: string,
    upcaster: (event: EnhancedDomainEvent<unknown>) => EventUpcastResult<EnhancedDomainEvent<T>>
  ): void;

  /**
   * Upcast an event using its registered upcaster.
   *
   * If no upcaster is registered for the event type, the event is
   * returned as-is (already at current version).
   *
   * @param event - Event to upcast
   * @returns Upcast result
   */
  upcast<T>(event: EnhancedDomainEvent<unknown>): EventUpcastResult<EnhancedDomainEvent<T>>;

  /**
   * Check if an upcaster is registered for an event type.
   */
  has(eventType: string): boolean;

  /**
   * Get all registered event types.
   */
  getRegisteredTypes(): string[];
}

/**
 * Create an upcaster registry.
 *
 * The registry provides a centralized location for all event upcasters,
 * making it easy to apply upcasting in projection handlers.
 *
 * @returns EventUpcasterRegistry instance
 *
 * @example
 * ```typescript
 * // Setup - typically in a shared module
 * const registry = createUpcasterRegistry();
 *
 * registry.register("OrderCreated", upcastOrderCreated);
 * registry.register("OrderSubmitted", upcastOrderSubmitted);
 *
 * // Usage in projection handler
 * export const onOrderEvent = internalMutation({
 *   handler: async (ctx, { event }) => {
 *     const { event: upcastedEvent, wasUpcasted } = registry.upcast(event);
 *
 *     if (wasUpcasted) {
 *       console.log(`Upcasted ${event.eventType} from v${event.schemaVersion}`);
 *     }
 *
 *     // Process with current schema
 *     await processEvent(ctx, upcastedEvent);
 *   },
 * });
 * ```
 */
export function createUpcasterRegistry(): EventUpcasterRegistry {
  const upcasters = new Map<
    string,
    (event: EnhancedDomainEvent<unknown>) => EventUpcastResult<EnhancedDomainEvent<unknown>>
  >();

  // Define upcast with concrete return type, then cast to generic signature.
  // The upcast<T> method's generic is a "trust me" type - callers specify
  // the expected type, but runtime can't verify it. We separate the implementation
  // (which uses unknown) from the interface signature (which uses T) via type assertion.
  const upcastImpl = (
    event: EnhancedDomainEvent<unknown>
  ): EventUpcastResult<EnhancedDomainEvent<unknown>> => {
    const upcaster = upcasters.get(event.eventType);

    if (!upcaster) {
      // No upcaster registered - return event as-is
      return {
        event,
        wasUpcasted: false,
        originalSchemaVersion: event.schemaVersion,
        currentSchemaVersion: event.schemaVersion,
      };
    }

    return upcaster(event);
  };

  return {
    register(eventType, upcaster) {
      upcasters.set(eventType, upcaster);
    },

    // Cast concrete implementation to generic signature - type safety
    // is maintained at the API level (callers provide expected type T)
    upcast: upcastImpl as <T>(
      event: EnhancedDomainEvent<unknown>
    ) => EventUpcastResult<EnhancedDomainEvent<T>>,

    has(eventType) {
      return upcasters.has(eventType);
    },

    getRegisteredTypes() {
      return Array.from(upcasters.keys());
    },
  };
}

/**
 * Helper to create a simple migration that adds a field with a default value.
 *
 * @param fieldName - Name of the field to add
 * @param defaultValue - Default value or function to compute it from the event
 * @param nextVersion - Version after migration
 * @returns Migration function
 *
 * @example
 * ```typescript
 * const migrations = {
 *   1: addFieldMigration("createdAt", (e) => e.timestamp, 2),
 *   2: addFieldMigration("priority", "normal", 3),
 * };
 * ```
 */
export function addFieldMigration<T>(
  fieldName: string,
  defaultValue: T | ((event: EnhancedDomainEvent<unknown>) => T),
  nextVersion: number
): EventMigration<EnhancedDomainEvent<unknown>, EnhancedDomainEvent<unknown>> {
  return (event: EnhancedDomainEvent<unknown>) => {
    const value =
      typeof defaultValue === "function"
        ? (defaultValue as (event: EnhancedDomainEvent<unknown>) => T)(event)
        : defaultValue;

    return {
      ...event,
      payload: {
        ...(event.payload as UnknownRecord),
        [fieldName]: value,
      },
      schemaVersion: nextVersion,
    };
  };
}

/**
 * Helper to create a migration that renames a field.
 *
 * @param oldName - Current field name
 * @param newName - New field name
 * @param nextVersion - Version after migration
 * @returns Migration function
 *
 * @example
 * ```typescript
 * const migrations = {
 *   1: renameFieldMigration("userId", "customerId", 2),
 * };
 * ```
 */
export function renameFieldMigration(
  oldName: string,
  newName: string,
  nextVersion: number
): EventMigration<EnhancedDomainEvent<unknown>, EnhancedDomainEvent<unknown>> {
  return (event: EnhancedDomainEvent<unknown>) => {
    const payload = event.payload as UnknownRecord;
    const { [oldName]: value, ...rest } = payload;

    return {
      ...event,
      payload: {
        ...rest,
        [newName]: value,
      },
      schemaVersion: nextVersion,
    };
  };
}
