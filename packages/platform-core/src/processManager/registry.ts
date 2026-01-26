/**
 * Process Manager Registry
 *
 * Centralized registry for process manager definitions with lookup capabilities.
 * Used for introspection, monitoring, and event routing.
 *
 * @example
 * ```typescript
 * import { createProcessManagerRegistry } from "@libar-dev/platform-core/processManager";
 * import { orderNotificationPM, reservationExpirationPM } from "./processManagers";
 *
 * const registry = createProcessManagerRegistry();
 * registry.register(orderNotificationPM);
 * registry.register(reservationExpirationPM);
 *
 * // Lookup PMs that handle OrderConfirmed events
 * const handlers = registry.getByTriggerEvent("OrderConfirmed");
 * ```
 */

import type { ProcessManagerDefinition } from "@libar-dev/platform-bc";

/**
 * Registry for process manager definitions.
 *
 * Provides methods to register, lookup, and list process managers.
 */
export interface ProcessManagerRegistry {
  /**
   * Register a process manager definition.
   *
   * @param definition - The PM definition to register
   * @throws Error if a PM with the same name is already registered
   */
  register(definition: ProcessManagerDefinition): void;

  /**
   * Get a process manager by name.
   *
   * @param name - The PM name
   * @returns The PM definition or undefined if not found
   */
  get(name: string): ProcessManagerDefinition | undefined;

  /**
   * Get all process managers that subscribe to a specific trigger event.
   *
   * @param eventType - The event type to look up
   * @returns Array of PM definitions that handle this event
   */
  getByTriggerEvent(eventType: string): ProcessManagerDefinition[];

  /**
   * List all registered process managers.
   *
   * @returns Array of all PM definitions
   */
  list(): ProcessManagerDefinition[];

  /**
   * Check if a process manager is registered.
   *
   * @param name - The PM name
   * @returns true if registered, false otherwise
   */
  has(name: string): boolean;

  /**
   * Get the count of registered process managers.
   */
  readonly size: number;

  /**
   * Get all unique trigger event types across all registered PMs.
   *
   * @returns Array of unique event type strings
   */
  getAllTriggerEvents(): string[];

  /**
   * Get all unique command types emitted by all registered PMs.
   *
   * @returns Array of unique command type strings
   */
  getAllEmittedCommands(): string[];

  /**
   * Get process managers by context.
   *
   * @param context - The bounded context name
   * @returns Array of PM definitions in that context
   */
  getByContext(context: string): ProcessManagerDefinition[];

  /**
   * Get process managers by trigger type.
   *
   * @param triggerType - The trigger type ("event", "time", or "hybrid")
   * @returns Array of PM definitions with that trigger type
   */
  getByTriggerType(triggerType: "event" | "time" | "hybrid"): ProcessManagerDefinition[];

  /**
   * Get time-triggered process managers (for cron scheduling).
   *
   * @returns Array of PM definitions that are time or hybrid triggered
   */
  getTimeTriggeredPMs(): ProcessManagerDefinition[];
}

/**
 * Create a new process manager registry.
 *
 * @returns A new ProcessManagerRegistry instance
 *
 * @example
 * ```typescript
 * const registry = createProcessManagerRegistry();
 *
 * // Register process managers
 * registry.register(orderNotificationPM);
 * registry.register(reservationExpirationPM);
 *
 * // Check registration
 * console.log(registry.has("orderNotification")); // true
 * console.log(registry.size); // 2
 *
 * // Lookup by trigger event
 * const handlers = registry.getByTriggerEvent("OrderConfirmed");
 * console.log(handlers.map(pm => pm.processManagerName)); // ["orderNotification"]
 *
 * // Get time-triggered PMs for cron setup
 * const timePMs = registry.getTimeTriggeredPMs();
 * timePMs.forEach(pm => {
 *   console.log(pm.cronConfig?.scheduleDescription);
 * });
 * ```
 */
export function createProcessManagerRegistry(): ProcessManagerRegistry {
  const processManagers = new Map<string, ProcessManagerDefinition>();

  // Index for efficient event type lookups
  const eventTypeIndex = new Map<string, Set<string>>();

  // Index for efficient command type lookups
  const commandTypeIndex = new Map<string, Set<string>>();

  const updateEventTypeIndex = (definition: ProcessManagerDefinition): void => {
    for (const eventType of definition.eventSubscriptions) {
      let eventSet = eventTypeIndex.get(eventType);
      if (!eventSet) {
        eventSet = new Set();
        eventTypeIndex.set(eventType, eventSet);
      }
      eventSet.add(definition.processManagerName);
    }
  };

  const updateCommandTypeIndex = (definition: ProcessManagerDefinition): void => {
    for (const commandType of definition.emitsCommands) {
      let commandSet = commandTypeIndex.get(commandType);
      if (!commandSet) {
        commandSet = new Set();
        commandTypeIndex.set(commandType, commandSet);
      }
      commandSet.add(definition.processManagerName);
    }
  };

  return {
    register(definition: ProcessManagerDefinition): void {
      if (processManagers.has(definition.processManagerName)) {
        throw new Error(`Process manager "${definition.processManagerName}" is already registered`);
      }
      processManagers.set(definition.processManagerName, definition);
      updateEventTypeIndex(definition);
      updateCommandTypeIndex(definition);
    },

    get(name: string): ProcessManagerDefinition | undefined {
      return processManagers.get(name);
    },

    getByTriggerEvent(eventType: string): ProcessManagerDefinition[] {
      const names = eventTypeIndex.get(eventType);
      if (!names) {
        return [];
      }
      // Filter out undefined in case of index/map inconsistency (defensive)
      return Array.from(names)
        .map((name) => processManagers.get(name))
        .filter((pm): pm is ProcessManagerDefinition => pm !== undefined);
    },

    list(): ProcessManagerDefinition[] {
      return Array.from(processManagers.values());
    },

    has(name: string): boolean {
      return processManagers.has(name);
    },

    get size(): number {
      return processManagers.size;
    },

    getAllTriggerEvents(): string[] {
      return Array.from(eventTypeIndex.keys()).sort();
    },

    getAllEmittedCommands(): string[] {
      return Array.from(commandTypeIndex.keys()).sort();
    },

    getByContext(context: string): ProcessManagerDefinition[] {
      return Array.from(processManagers.values()).filter((pm) => pm.context === context);
    },

    getByTriggerType(triggerType: "event" | "time" | "hybrid"): ProcessManagerDefinition[] {
      return Array.from(processManagers.values()).filter((pm) => pm.triggerType === triggerType);
    },

    getTimeTriggeredPMs(): ProcessManagerDefinition[] {
      return Array.from(processManagers.values()).filter(
        (pm) => pm.triggerType === "time" || pm.triggerType === "hybrid"
      );
    },
  };
}
