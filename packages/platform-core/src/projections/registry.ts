/**
 * Projection Registry
 *
 * Centralized registry for projection definitions with lookup capabilities.
 * Used for introspection, monitoring, and rebuild operations.
 *
 * @example
 * ```typescript
 * import { createProjectionRegistry } from "@libar-dev/platform-core";
 * import { orderSummaryProjection, productCatalogProjection } from "./projections";
 *
 * const registry = createProjectionRegistry();
 * registry.register(orderSummaryProjection);
 * registry.register(productCatalogProjection);
 *
 * // Lookup projections that handle OrderCreated events
 * const projections = registry.getByEventType("OrderCreated");
 * ```
 */

import type { ProjectionDefinition, ProjectionCategory } from "@libar-dev/platform-bc";

/**
 * Registry for projection definitions.
 *
 * Provides methods to register, lookup, and list projections.
 */
export interface ProjectionRegistry {
  /**
   * Register a projection definition.
   *
   * @param definition - The projection definition to register
   * @throws Error if a projection with the same name is already registered
   */
  register(definition: ProjectionDefinition): void;

  /**
   * Get a projection by name.
   *
   * @param name - The projection name
   * @returns The projection definition or undefined if not found
   */
  get(name: string): ProjectionDefinition | undefined;

  /**
   * Get all projections that subscribe to a specific event type.
   *
   * @param eventType - The event type to look up
   * @returns Array of projection definitions that handle this event
   */
  getByEventType(eventType: string): ProjectionDefinition[];

  /**
   * List all registered projections.
   *
   * @returns Array of all projection definitions
   */
  list(): ProjectionDefinition[];

  /**
   * Check if a projection is registered.
   *
   * @param name - The projection name
   * @returns true if registered, false otherwise
   */
  has(name: string): boolean;

  /**
   * Get the count of registered projections.
   */
  readonly size: number;

  /**
   * Get all unique event types across all registered projections.
   *
   * @returns Array of unique event type strings
   */
  getAllEventTypes(): string[];

  /**
   * Get projections by context.
   *
   * @param context - The bounded context name
   * @returns Array of projection definitions in that context
   */
  getByContext(context: string): ProjectionDefinition[];

  /**
   * Get projections by category.
   *
   * Useful for targeting specific projection types:
   * - "view" projections for reactive subscriptions
   * - "logic" projections for internal validation
   * - "reporting" projections for admin dashboards
   * - "integration" projections for EventBus routing
   *
   * @param category - The projection category
   * @returns Array of projection definitions with that category
   */
  getByCategory(category: ProjectionCategory): ProjectionDefinition[];

  /**
   * Get projections in rebuild order (primary before secondary/cross-context).
   *
   * @returns Array of projection definitions ordered for rebuild
   */
  getRebuildOrder(): ProjectionDefinition[];
}

/**
 * Create a new projection registry.
 *
 * @returns A new ProjectionRegistry instance
 *
 * @example
 * ```typescript
 * const registry = createProjectionRegistry();
 *
 * // Register projections
 * registry.register(orderSummaryProjection);
 * registry.register(productCatalogProjection);
 *
 * // Check registration
 * console.log(registry.has("orderSummary")); // true
 * console.log(registry.size); // 2
 *
 * // Lookup by event type
 * const handlers = registry.getByEventType("OrderCreated");
 * console.log(handlers.map(p => p.projectionName)); // ["orderSummary"]
 *
 * // Get rebuild order
 * const rebuildOrder = registry.getRebuildOrder();
 * // Primary projections first, then secondary, then cross-context
 * ```
 */
export function createProjectionRegistry(): ProjectionRegistry {
  const projections = new Map<string, ProjectionDefinition>();

  // Index for efficient event type lookups
  const eventTypeIndex = new Map<string, Set<string>>();

  // Index for efficient category lookups
  const categoryIndex = new Map<string, Set<string>>();

  const updateEventTypeIndex = (definition: ProjectionDefinition): void => {
    for (const eventType of definition.eventSubscriptions) {
      if (!eventTypeIndex.has(eventType)) {
        eventTypeIndex.set(eventType, new Set());
      }
      eventTypeIndex.get(eventType)!.add(definition.projectionName);
    }
  };

  const updateCategoryIndex = (definition: ProjectionDefinition): void => {
    const category = definition.category;
    if (!categoryIndex.has(category)) {
      categoryIndex.set(category, new Set());
    }
    categoryIndex.get(category)!.add(definition.projectionName);
  };

  return {
    register(definition: ProjectionDefinition): void {
      if (projections.has(definition.projectionName)) {
        throw new Error(`Projection "${definition.projectionName}" is already registered`);
      }
      projections.set(definition.projectionName, definition);
      updateEventTypeIndex(definition);
      updateCategoryIndex(definition);
    },

    get(name: string): ProjectionDefinition | undefined {
      return projections.get(name);
    },

    getByEventType(eventType: string): ProjectionDefinition[] {
      const names = eventTypeIndex.get(eventType);
      if (!names) {
        return [];
      }
      return Array.from(names).map((name) => projections.get(name)!);
    },

    list(): ProjectionDefinition[] {
      return Array.from(projections.values());
    },

    has(name: string): boolean {
      return projections.has(name);
    },

    get size(): number {
      return projections.size;
    },

    getAllEventTypes(): string[] {
      return Array.from(eventTypeIndex.keys()).sort();
    },

    getByContext(context: string): ProjectionDefinition[] {
      return Array.from(projections.values()).filter((p) => p.context === context);
    },

    getByCategory(category: ProjectionCategory): ProjectionDefinition[] {
      const names = categoryIndex.get(category);
      if (!names) {
        return [];
      }
      return Array.from(names).map((name) => projections.get(name)!);
    },

    getRebuildOrder(): ProjectionDefinition[] {
      const all = Array.from(projections.values());

      // Group by type
      const primary = all.filter((p) => p.type === "primary");
      const secondary = all.filter((p) => p.type === "secondary");
      const crossContext = all.filter((p) => p.type === "cross-context");

      // Primary first, then secondary, then cross-context
      return [...primary, ...secondary, ...crossContext];
    },
  };
}
