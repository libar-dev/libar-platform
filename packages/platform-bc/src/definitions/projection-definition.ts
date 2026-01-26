import type { ProjectionCategory } from "./categories.js";

/**
 * Projection Definition Interface
 *
 * Formal metadata for projections in a bounded context.
 * Defines how events are projected into read models.
 *
 * Projections are the read side of CQRS:
 * - Events are written atomically with CMS (dual-write)
 * - Projections consume events to build read models
 * - Projections CAN be rebuilt from events when schema changes
 *
 * @example
 * ```typescript
 * const orderSummaryProjection = defineProjection({
 *   projectionName: "orderSummary",
 *   description: "Order listing with status, totals, and item counts",
 *   targetTable: "orderSummaries",
 *   partitionKeyField: "orderId",
 *   eventSubscriptions: [
 *     "OrderCreated", "OrderItemAdded", "OrderItemRemoved",
 *     "OrderSubmitted", "OrderConfirmed", "OrderCancelled"
 *   ] as const,
 *   context: "orders",
 *   type: "primary",
 *   category: "view",  // Query routing category
 * });
 * ```
 */

/**
 * All valid projection type values.
 *
 * - `primary`: Direct projection from a single bounded context's events
 * - `secondary`: Depends on other projections or aggregates data
 * - `cross-context`: Combines events from multiple bounded contexts
 */
export const PROJECTION_TYPES = ["primary", "secondary", "cross-context"] as const;

/**
 * Type of projection derived from the PROJECTION_TYPES tuple.
 */
export type ProjectionType = (typeof PROJECTION_TYPES)[number];

/**
 * Type guard to check if a value is a valid ProjectionType.
 *
 * @param value - Value to check
 * @returns True if value is a valid ProjectionType
 *
 * @example
 * ```typescript
 * const type: unknown = "primary";
 * if (isProjectionType(type)) {
 *   // type is now typed as ProjectionType
 * }
 * ```
 */
export function isProjectionType(value: unknown): value is ProjectionType {
  return typeof value === "string" && (PROJECTION_TYPES as readonly string[]).includes(value);
}

/**
 * Metadata for a projection.
 *
 * This interface captures projection documentation and configuration
 * for introspection, rebuild operations, and monitoring.
 *
 * @template TEventTypes - Tuple of event type strings this projection subscribes to
 */
export interface ProjectionDefinition<TEventTypes extends string = string> {
  /**
   * Projection name (e.g., "orderSummary", "productCatalog").
   * Should be unique within the application.
   */
  readonly projectionName: string;

  /**
   * Human-readable description of what this projection provides.
   */
  readonly description: string;

  /**
   * The Convex table this projection maintains.
   */
  readonly targetTable: string;

  /**
   * Field used as partition key for checkpointing.
   * Events are processed in order within each partition.
   */
  readonly partitionKeyField: string;

  /**
   * Event types that trigger this projection.
   * The projection handler must handle all these event types.
   */
  readonly eventSubscriptions: readonly TEventTypes[];

  /**
   * Bounded context this projection belongs to.
   */
  readonly context: string;

  /**
   * Type of projection.
   *
   * - `primary`: Direct projection from command events
   * - `secondary`: Derives from other projections
   * - `cross-context`: Combines multiple contexts
   */
  readonly type: ProjectionType;

  /**
   * Category determines query routing and client exposure.
   *
   * - `logic`: Internal command validation (not client-exposed)
   * - `view`: Client-facing UI queries (reactive subscriptions)
   * - `reporting`: Analytics and aggregations (admin only)
   * - `integration`: Cross-context synchronization (EventBus)
   *
   * @see ProjectionCategory
   */
  readonly category: ProjectionCategory;

  /**
   * Additional tables this projection updates (optional).
   * Used when a projection maintains multiple related tables.
   */
  readonly secondaryTables?: readonly string[];

  /**
   * Source contexts for cross-context projections (optional).
   * Lists which bounded contexts this projection combines.
   */
  readonly sources?: readonly string[];
}

/**
 * Helper to define a projection with type inference.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving all literal types including eventSubscriptions as a tuple.
 *
 * @param definition - Projection definition
 * @returns The same definition with all literal types preserved
 *
 * @example
 * ```typescript
 * const orderSummaryProjection = defineProjection({
 *   projectionName: "orderSummary",
 *   description: "Order listing with status, totals, and item counts",
 *   targetTable: "orderSummaries",
 *   partitionKeyField: "orderId",
 *   eventSubscriptions: [
 *     "OrderCreated", "OrderItemAdded", "OrderItemRemoved",
 *     "OrderSubmitted", "OrderConfirmed", "OrderCancelled"
 *   ] as const,
 *   context: "orders",
 *   type: "primary",
 *   category: "view",  // Required: determines query routing
 * });
 *
 * // orderSummaryProjection.eventSubscriptions is readonly ["OrderCreated", ...]
 * // (literal tuple), not readonly string[]
 * // orderSummaryProjection.category is "view" (literal)
 * ```
 */
export function defineProjection<const T extends ProjectionDefinition<string>>(definition: T): T {
  return definition;
}

/**
 * Registry of projection definitions for an application.
 *
 * Maps projection names to their definitions, preserving the projection name as a literal type.
 *
 * @template TProjectionNames - Tuple of projection name strings
 *
 * @example
 * ```typescript
 * const PROJECTIONS = ["orderSummary", "productCatalog"] as const;
 *
 * const ProjectionDefs: ProjectionDefinitionRegistry<typeof PROJECTIONS> = {
 *   orderSummary: defineProjection({ projectionName: "orderSummary", ... }),
 *   productCatalog: defineProjection({ projectionName: "productCatalog", ... }),
 * };
 *
 * // ProjectionDefs.orderSummary.projectionName is "orderSummary" (literal), not string
 * ```
 */
export type ProjectionDefinitionRegistry<TProjectionNames extends readonly string[]> = {
  readonly [K in TProjectionNames[number]]: ProjectionDefinition & { readonly projectionName: K };
};
