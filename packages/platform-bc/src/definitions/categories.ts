import { z } from "zod";

/**
 * ## Projection Categories - Query Routing Taxonomy
 *
 * Categorizes projections by purpose: Logic, View, Reporting, Integration.
 *
 * This pattern introduces a taxonomy for projection types, enabling:
 * - Category-based routing (e.g., reactive updates only for View projections)
 * - Query optimization based on projection purpose
 * - Clear separation between internal logic and external-facing views
 * - Integration-specific projection handling
 *
 * ### When to Use
 *
 * - When you need to optimize projection update strategies by purpose
 * - When implementing reactive projections (target View category only)
 * - When distinguishing between internal logic and external integration needs
 * - When building projection registration and discovery mechanisms
 *
 * ### Categories
 *
 * | Category | Purpose | Query Pattern | Client Exposed |
 * |----------|---------|---------------|----------------|
 * | logic | Minimal data for command validation | Internal only | No |
 * | view | Denormalized for UI queries | Client queries | Yes (reactive) |
 * | reporting | Analytics and aggregations | Async/batch | Admin only |
 * | integration | Cross-context synchronization | EventBus | No |
 */

/**
 * All valid projection categories as a readonly tuple.
 *
 * Used for iteration, validation, and type derivation.
 */
export const PROJECTION_CATEGORIES = ["logic", "view", "reporting", "integration"] as const;

/**
 * Projection category taxonomy for query routing and optimization.
 *
 * @example
 * ```typescript
 * const orderSummary: ProjectionCategory = 'view'; // Client-facing
 * const inventoryAudit: ProjectionCategory = 'reporting'; // Analytics
 * const orderFulfillmentLogic: ProjectionCategory = 'logic'; // Internal
 * const orderIntegrationFeed: ProjectionCategory = 'integration'; // Cross-BC
 * ```
 */
export type ProjectionCategory = (typeof PROJECTION_CATEGORIES)[number];

/**
 * Zod schema for projection category validation.
 *
 * Use for runtime validation of category values.
 *
 * @example
 * ```typescript
 * const result = ProjectionCategorySchema.safeParse("view");
 * if (result.success) {
 *   // result.data is typed as ProjectionCategory
 * }
 * ```
 */
export const ProjectionCategorySchema = z.enum(PROJECTION_CATEGORIES);

/**
 * Type guard to check if a value is a valid ProjectionCategory.
 *
 * @param value - Value to check
 * @returns True if value is a valid ProjectionCategory
 *
 * @example
 * ```typescript
 * const category: unknown = "view";
 * if (isProjectionCategory(category)) {
 *   // category is now typed as ProjectionCategory
 * }
 * ```
 */
export function isProjectionCategory(value: unknown): value is ProjectionCategory {
  return typeof value === "string" && (PROJECTION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Check if a category is for logic projections (internal command validation).
 *
 * Logic projections have minimal fields, are always current, and are not client-exposed.
 *
 * @param category - Projection category
 * @returns True if category is "logic"
 */
export function isLogicProjection(category: ProjectionCategory): boolean {
  return category === "logic";
}

/**
 * Check if a category is for view projections (client-facing UI).
 *
 * View projections are denormalized, near real-time, and client-exposed.
 * These are the only projections that support reactive subscriptions.
 *
 * @param category - Projection category
 * @returns True if category is "view"
 */
export function isViewProjection(category: ProjectionCategory): boolean {
  return category === "view";
}

/**
 * Check if a category is for reporting projections (analytics).
 *
 * Reporting projections are aggregated, eventually consistent, and admin-only.
 *
 * @param category - Projection category
 * @returns True if category is "reporting"
 */
export function isReportingProjection(category: ProjectionCategory): boolean {
  return category === "reporting";
}

/**
 * Check if a category is for integration projections (cross-context).
 *
 * Integration projections have contract-defined schemas, event-driven updates,
 * and are not client-exposed (use EventBus instead).
 *
 * @param category - Projection category
 * @returns True if category is "integration"
 */
export function isIntegrationProjection(category: ProjectionCategory): boolean {
  return category === "integration";
}

/**
 * Check if a projection category is client-exposed.
 *
 * Only "view" projections are directly accessible from client code.
 * "reporting" projections may be exposed to admin roles only (future).
 *
 * Currently equivalent to isViewProjection(), but kept separate for:
 * - Semantic clarity at call sites (checking exposure vs checking category)
 * - Future extensibility (reporting may become admin-exposed)
 *
 * @param category - Projection category
 * @returns True if the category allows client access
 */
export function isClientExposed(category: ProjectionCategory): boolean {
  return category === "view";
}
