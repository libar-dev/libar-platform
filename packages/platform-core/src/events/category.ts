import { z } from "zod";

/**
 * Event category taxonomy per DDD/ES patterns.
 *
 * | Category    | Scope                  | Payload            | Use Case                    |
 * |-------------|------------------------|--------------------|-----------------------------|
 * | domain      | Within bounded context | Rich domain data   | Aggregate events, ES        |
 * | integration | Cross-context          | Minimal DTO        | Published Language, Sagas   |
 * | trigger     | External notification  | ID only            | GDPR-compliant webhooks     |
 * | fat         | External sync          | Full state         | Data warehouses, analytics  |
 */
export type EventCategory = "domain" | "integration" | "trigger" | "fat";

/**
 * All valid event categories as a readonly tuple.
 */
export const EVENT_CATEGORIES = ["domain", "integration", "trigger", "fat"] as const;

/**
 * Zod schema for event category validation.
 */
export const EventCategorySchema = z.enum(EVENT_CATEGORIES);

/**
 * Default event category for events without explicit category.
 */
export const DEFAULT_EVENT_CATEGORY: EventCategory = "domain";

/**
 * Default schema version for events without explicit version.
 */
export const DEFAULT_SCHEMA_VERSION = 1;

/**
 * Type guard to check if a value is a valid EventCategory.
 *
 * @param value - Value to check
 * @returns True if value is a valid EventCategory
 *
 * @example
 * ```typescript
 * const category = "domain";
 * if (isEventCategory(category)) {
 *   // category is typed as EventCategory
 * }
 * ```
 */
export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Normalize a category value to EventCategory with default fallback.
 *
 * @param category - Category value (may be undefined)
 * @returns Valid EventCategory
 *
 * @example
 * ```typescript
 * normalizeCategory(undefined) // "domain"
 * normalizeCategory("integration") // "integration"
 * normalizeCategory("invalid") // "domain"
 * ```
 */
export function normalizeCategory(category: unknown): EventCategory {
  if (isEventCategory(category)) {
    return category;
  }
  return DEFAULT_EVENT_CATEGORY;
}

/**
 * Normalize a schema version to a positive integer with default fallback.
 *
 * @param version - Schema version value (may be undefined)
 * @returns Valid schema version (always >= 1)
 *
 * @example
 * ```typescript
 * normalizeSchemaVersion(undefined) // 1
 * normalizeSchemaVersion(2) // 2
 * normalizeSchemaVersion(0) // 1
 * ```
 */
export function normalizeSchemaVersion(version: unknown): number {
  if (typeof version === "number" && Number.isInteger(version) && version >= 1) {
    return version;
  }
  return DEFAULT_SCHEMA_VERSION;
}

/**
 * Check if an event category is for external consumers (trigger or fat).
 *
 * @param category - Event category
 * @returns True if category is external-facing
 */
export function isExternalCategory(category: EventCategory): boolean {
  return category === "trigger" || category === "fat";
}

/**
 * Check if an event category crosses bounded context boundaries.
 *
 * @param category - Event category
 * @returns True if category is for cross-context communication
 */
export function isCrossContextCategory(category: EventCategory): boolean {
  return category === "integration";
}
