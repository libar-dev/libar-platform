/**
 * ## Reservation Schema Helpers
 *
 * Schema documentation and validator helpers for applications implementing
 * the reservation pattern.
 *
 * **Important:** platform-core is a library package and cannot define Convex
 * schemas directly. Applications must define their own `reservations` table
 * using the schema shape documented here.
 *
 * @module reservations/schema
 * @since Phase 20
 */

import type { ReservationStatus } from "./types.js";

// =============================================================================
// Schema Documentation
// =============================================================================

/**
 * Required fields for the reservations table.
 *
 * Applications should define a table with this shape:
 *
 * ```typescript
 * // In your convex/schema.ts
 * import { defineSchema, defineTable } from "convex/server";
 * import { v } from "convex/values";
 *
 * export default defineSchema({
 *   reservations: defineTable({
 *     reservationId: v.string(),
 *     key: v.string(),
 *     type: v.string(),
 *     value: v.string(),
 *     status: v.union(
 *       v.literal("reserved"),
 *       v.literal("confirmed"),
 *       v.literal("released"),
 *       v.literal("expired")
 *     ),
 *     expiresAt: v.union(v.number(), v.null()),
 *     entityId: v.union(v.string(), v.null()),
 *     confirmedAt: v.union(v.number(), v.null()),
 *     releasedAt: v.union(v.number(), v.null()),
 *     correlationId: v.union(v.string(), v.null()),
 *     version: v.number(),
 *     createdAt: v.number(),
 *     updatedAt: v.number(),
 *   })
 *     .index("by_reservationId", ["reservationId"])
 *     .index("by_key", ["key"])
 *     .index("by_type_value", ["type", "value"])
 *     .index("by_status_expiresAt", ["status", "expiresAt"])
 *     .index("by_entityId", ["entityId"]),
 * });
 * ```
 */
export const RESERVATION_SCHEMA_DOCS = {
  tableName: "reservations",
  fields: {
    reservationId: "Unique reservation ID (deterministic hash)",
    key: "Reservation key: type:value format",
    type: "Reservation type (e.g., 'email', 'username')",
    value: "Reserved value",
    status: "Current status: reserved | confirmed | released | expired",
    expiresAt: "Expiration timestamp (ms since epoch); null when confirmed",
    entityId: "Entity ID linked on confirmation (null until confirmed)",
    confirmedAt: "Confirmation timestamp (null until confirmed)",
    releasedAt: "Release timestamp (null until released)",
    correlationId: "Correlation ID for tracing (optional)",
    version: "Version for OCC",
    createdAt: "Creation timestamp",
    updatedAt: "Last update timestamp",
  },
  indexes: {
    by_reservationId: "Primary lookup by ID",
    by_key: "Efficient key lookups (uniqueness enforced by application logic)",
    by_type_value: "Alternative lookup by type and value",
    by_status_expiresAt: "For TTL expiration queries",
    by_entityId: "Find reservation for an entity",
  },
} as const;

// =============================================================================
// Validator Helpers
// =============================================================================

/**
 * Valid status values as an array (for Convex union validators).
 */
export const RESERVATION_STATUS_VALUES: readonly ReservationStatus[] = [
  "reserved",
  "confirmed",
  "released",
  "expired",
] as const;

/**
 * Check if a value is a valid reservation status.
 *
 * @param value - Value to check
 * @returns true if valid status
 */
export function isValidReservationStatus(value: unknown): value is ReservationStatus {
  return (
    typeof value === "string" && RESERVATION_STATUS_VALUES.includes(value as ReservationStatus)
  );
}

/**
 * Assert that a value is a valid reservation status.
 *
 * @param value - Value to validate
 * @throws Error if invalid
 */
export function assertValidReservationStatus(value: unknown): asserts value is ReservationStatus {
  if (!isValidReservationStatus(value)) {
    throw new Error(
      `Invalid reservation status: ${value}. Must be one of: ${RESERVATION_STATUS_VALUES.join(", ")}`
    );
  }
}

// =============================================================================
// Index Query Helpers
// =============================================================================

/**
 * Index names for the reservations table.
 */
export const RESERVATION_INDEXES = {
  /** Primary lookup by reservation ID */
  BY_RESERVATION_ID: "by_reservationId",
  /** Efficient key lookups (uniqueness enforced by application logic via OCC) */
  BY_KEY: "by_key",
  /** Alternative lookup by type and value */
  BY_TYPE_VALUE: "by_type_value",
  /** For TTL expiration queries */
  BY_STATUS_EXPIRES_AT: "by_status_expiresAt",
  /** Find reservation for an entity */
  BY_ENTITY_ID: "by_entityId",
} as const;

// =============================================================================
// Cron Configuration
// =============================================================================

/**
 * Recommended cron configuration for TTL expiration.
 *
 * Applications should add a cron job to expire reservations:
 *
 * ```typescript
 * // In your convex/crons.ts
 * import { cronJobs } from "convex/server";
 * import { internal } from "./_generated/api";
 *
 * const crons = cronJobs();
 *
 * crons.interval(
 *   "expire-reservations",
 *   { minutes: 5 },
 *   internal.reservations.expireExpiredReservations
 * );
 *
 * export default crons;
 * ```
 */
export const EXPIRATION_CRON_CONFIG = {
  /** Recommended interval in minutes */
  intervalMinutes: 5,
  /** Name for the cron job */
  cronName: "expire-reservations",
  /** Batch size for expiration processing */
  defaultBatchSize: 100,
} as const;

// =============================================================================
// Schema Snippet Generator
// =============================================================================

/**
 * Generate a TypeScript schema snippet for copy/paste.
 *
 * @returns Schema code as a string
 *
 * @example
 * ```typescript
 * console.log(generateSchemaSnippet());
 * // Outputs the full Convex schema definition for reservations table
 * ```
 */
export function generateSchemaSnippet(): string {
  return `
// Reservation Pattern Schema
// Add to your convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... your other tables

  reservations: defineTable({
    reservationId: v.string(),
    key: v.string(),
    type: v.string(),
    value: v.string(),
    status: v.union(
      v.literal("reserved"),
      v.literal("confirmed"),
      v.literal("released"),
      v.literal("expired")
    ),
    expiresAt: v.union(v.number(), v.null()),
    entityId: v.union(v.string(), v.null()),
    confirmedAt: v.union(v.number(), v.null()),
    releasedAt: v.union(v.number(), v.null()),
    correlationId: v.union(v.string(), v.null()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reservationId", ["reservationId"])
    .index("by_key", ["key"])
    .index("by_type_value", ["type", "value"])
    .index("by_status_expiresAt", ["status", "expiresAt"])
    .index("by_entityId", ["entityId"]),
});
`.trim();
}

/**
 * Generate a cron configuration snippet for copy/paste.
 *
 * @returns Cron code as a string
 */
export function generateCronSnippet(): string {
  return `
// Reservation TTL Expiration Cron
// Add to your convex/crons.ts

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire-reservations",
  { minutes: 5 },
  internal.reservations.expireExpiredReservations
);

export default crons;
`.trim();
}
