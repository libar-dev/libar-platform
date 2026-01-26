/**
 * Process Manager Definition Interface
 *
 * Formal metadata for process managers in a bounded context.
 * Defines event-reactive coordinators that emit commands.
 *
 * Process Managers are distinct from Sagas:
 * - **Process Managers**: React to events, emit commands (fire-and-forget)
 * - **Sagas**: Multi-step orchestration with compensation logic
 *
 * Process Managers are also distinct from Projections:
 * - **Projections**: Events → Read Model updates
 * - **Process Managers**: Events → Command emission
 *
 * @example
 * ```typescript
 * const notificationPM = defineProcessManager({
 *   processManagerName: "orderNotification",
 *   description: "Sends notification when order is confirmed",
 *   triggerType: "event",
 *   eventSubscriptions: ["OrderConfirmed"] as const,
 *   emitsCommands: ["SendNotification"],
 *   context: "orders",
 *   correlationStrategy: { correlationProperty: "orderId" },
 * });
 * ```
 *
 * @see ADR-033 for Process Manager vs Saga distinction
 */

/**
 * All valid process manager trigger type values.
 *
 * - `event`: Triggered by domain/integration events
 * - `time`: Triggered by cron schedule (time-based)
 * - `hybrid`: Triggered by events that set timers
 */
export const PROCESS_MANAGER_TRIGGER_TYPES = ["event", "time", "hybrid"] as const;

/**
 * Type of process manager trigger derived from the tuple.
 */
export type ProcessManagerTriggerType = (typeof PROCESS_MANAGER_TRIGGER_TYPES)[number];

/**
 * Type guard to check if a value is a valid ProcessManagerTriggerType.
 *
 * @param value - Value to check
 * @returns True if value is a valid ProcessManagerTriggerType
 *
 * @example
 * ```typescript
 * const type: unknown = "event";
 * if (isProcessManagerTriggerType(type)) {
 *   // type is now typed as ProcessManagerTriggerType
 * }
 * ```
 */
export function isProcessManagerTriggerType(value: unknown): value is ProcessManagerTriggerType {
  return (
    typeof value === "string" &&
    (PROCESS_MANAGER_TRIGGER_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Cron configuration for time-triggered process managers.
 */
export interface ProcessManagerCronConfig {
  /**
   * Cron interval configuration.
   */
  readonly interval: {
    readonly minutes?: number;
    readonly hours?: number;
    readonly days?: number;
  };

  /**
   * Human-readable description of the schedule.
   * @example "Every 5 minutes", "Hourly", "Daily at midnight"
   */
  readonly scheduleDescription: string;
}

/**
 * Correlation strategy for linking events to PM instances.
 */
export interface ProcessManagerCorrelationStrategy {
  /**
   * Event property used to correlate events to PM instances.
   * @example "orderId", "customerId", "reservationId"
   */
  readonly correlationProperty: string;
}

/**
 * Metadata for a process manager.
 *
 * This interface captures process manager documentation and configuration
 * for introspection, monitoring, and type safety.
 *
 * @template TEventTypes - Tuple of event type strings this PM subscribes to
 */
export interface ProcessManagerDefinition<TEventTypes extends string = string> {
  /**
   * Process manager name (e.g., "orderNotification", "reservationExpiration").
   * Should be unique within the application.
   */
  readonly processManagerName: string;

  /**
   * Human-readable description of what this process manager does.
   */
  readonly description: string;

  /**
   * How this process manager is triggered.
   *
   * - `event`: Reacts to domain/integration events
   * - `time`: Runs on a schedule (cron)
   * - `hybrid`: Events set timers that fire later
   */
  readonly triggerType: ProcessManagerTriggerType;

  /**
   * Event types that trigger this process manager.
   * For time-triggered PMs, this may be empty.
   */
  readonly eventSubscriptions: readonly TEventTypes[];

  /**
   * Command types this process manager can emit.
   * Documents the output of this PM for traceability.
   */
  readonly emitsCommands: readonly string[];

  /**
   * Bounded context this process manager belongs to.
   */
  readonly context: string;

  /**
   * How to correlate events to PM instances (optional).
   * Used to route events to the correct PM instance.
   */
  readonly correlationStrategy?: ProcessManagerCorrelationStrategy;

  /**
   * Cron configuration for time-triggered PMs (optional).
   * Required when triggerType is "time" or "hybrid".
   */
  readonly cronConfig?: ProcessManagerCronConfig;

  /**
   * Version of the PM state schema (optional).
   * Used for state schema evolution when customState structure changes.
   * @default 1
   */
  readonly stateVersion?: number;
}

/**
 * Helper to define a process manager with type inference.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving all literal types including eventSubscriptions as a tuple.
 *
 * @param definition - Process manager definition
 * @returns The same definition with all literal types preserved
 * @throws {Error} If triggerType is "time" or "hybrid" but cronConfig is missing
 * @throws {Error} If triggerType is "event" but eventSubscriptions is empty
 *
 * @example
 * ```typescript
 * const notificationPM = defineProcessManager({
 *   processManagerName: "orderNotification",
 *   description: "Sends notification when order is confirmed",
 *   triggerType: "event",
 *   eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
 *   emitsCommands: ["SendNotification", "SendEmail"],
 *   context: "orders",
 * });
 *
 * // notificationPM.eventSubscriptions is readonly ["OrderConfirmed", "OrderShipped"]
 * // (literal tuple), not readonly string[]
 * ```
 */
export function defineProcessManager<const T extends ProcessManagerDefinition<string>>(
  definition: T
): T {
  // Validate time/hybrid PMs require cronConfig
  if (
    (definition.triggerType === "time" || definition.triggerType === "hybrid") &&
    !definition.cronConfig
  ) {
    throw new Error(
      `Process manager "${definition.processManagerName}" requires cronConfig for trigger type "${definition.triggerType}"`
    );
  }

  // Validate event PMs require at least one event subscription
  if (definition.triggerType === "event" && definition.eventSubscriptions.length === 0) {
    throw new Error(
      `Event-triggered process manager "${definition.processManagerName}" requires at least one event subscription`
    );
  }

  return definition;
}

/**
 * Registry of process manager definitions for an application.
 *
 * Maps PM names to their definitions, preserving the name as a literal type.
 *
 * @template TProcessManagerNames - Tuple of PM name strings
 *
 * @example
 * ```typescript
 * const PROCESS_MANAGERS = ["orderNotification", "reservationExpiration"] as const;
 *
 * const PMDefs: ProcessManagerDefinitionRegistry<typeof PROCESS_MANAGERS> = {
 *   orderNotification: defineProcessManager({ processManagerName: "orderNotification", ... }),
 *   reservationExpiration: defineProcessManager({ processManagerName: "reservationExpiration", ... }),
 * };
 *
 * // PMDefs.orderNotification.processManagerName is "orderNotification" (literal), not string
 * ```
 */
export type ProcessManagerDefinitionRegistry<TProcessManagerNames extends readonly string[]> = {
  readonly [K in TProcessManagerNames[number]]: ProcessManagerDefinition & {
    readonly processManagerName: K;
  };
};
