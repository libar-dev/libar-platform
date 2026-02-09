/**
 * Schema Versioning - Fat event schema evolution support
 *
 * @libar-docs
 * @libar-docs-implements EcstFatEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * Provides schema versioning and migration capabilities for fat events.
 * Enables backward-compatible evolution of event structures over time.
 */

import type { FatEvent, FatEventSchema } from "./types.js";

/**
 * Parses a semver version string into numeric parts.
 *
 * @param version - Version string in "X.Y.Z" format
 * @returns Tuple of [major, minor, patch] numbers
 * @throws Error if version format is invalid
 *
 * @internal
 */
function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid semver format: "${version}". Expected "X.Y.Z" format (e.g., "1.0.0", "2.1.3").`
    );
  }

  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || !Number.isInteger(n))) {
    throw new Error(
      `Invalid semver format: "${version}". Version parts must be non-negative integers (e.g., "1.0.0").`
    );
  }

  return nums as [number, number, number];
}

/**
 * Migrates a fat event to a target schema version.
 *
 * If the event's schema version matches the target, returns unchanged.
 * Otherwise, applies the schema's migration function to upgrade the payload.
 *
 * @param event - The fat event to migrate
 * @param targetSchema - The schema to migrate to
 * @returns A new fat event with migrated payload and updated version
 * @throws Error if no migration path exists for the source version
 *
 * @example
 * ```typescript
 * // V1 event with old structure
 * const eventV1: FatEvent<V1Payload> = {
 *   type: "OrderSubmitted",
 *   payload: { orderId: "ord_123", amount: 100 },
 *   metadata: { timestamp: Date.now(), schemaVersion: "1.0.0" },
 * };
 *
 * // V2 schema with migration
 * const schemaV2: FatEventSchema<V2Payload> = {
 *   version: "2.0.0",
 *   validate: (p): p is V2Payload => { ... },
 *   migrate: (p, from) => {
 *     if (from === "1.0.0") {
 *       const v1 = p as V1Payload;
 *       return { orderId: v1.orderId, totalAmount: v1.amount, currency: "USD" };
 *     }
 *     throw new Error(`No migration path from ${from}`);
 *   },
 * };
 *
 * const eventV2 = migrateEvent(eventV1, schemaV2);
 * // eventV2.payload = { orderId: "ord_123", totalAmount: 100, currency: "USD" }
 * // eventV2.metadata.schemaVersion = "2.0.0"
 * ```
 */
export function migrateEvent<T>(event: FatEvent, targetSchema: FatEventSchema<T>): FatEvent<T> {
  const currentVersion = event.metadata.schemaVersion;
  const targetVersion = targetSchema.version;

  // No migration needed if versions match
  if (currentVersion === targetVersion) {
    // Validate the payload matches the schema
    if (!targetSchema.validate(event.payload)) {
      throw new Error(
        `Schema validation failed for event type "${event.type}" ` + `(version ${currentVersion})`
      );
    }
    return event as FatEvent<T>;
  }

  // Migration required but no migration function provided
  if (!targetSchema.migrate) {
    throw new Error(`No migration path from ${currentVersion}`);
  }

  // Apply migration
  const migratedPayload = targetSchema.migrate(event.payload, currentVersion);

  // Validate migrated payload
  if (!targetSchema.validate(migratedPayload)) {
    throw new Error(
      `Schema validation failed after migration for event type "${event.type}" ` +
        `(migrated from ${currentVersion} to ${targetVersion})`
    );
  }

  return {
    type: event.type,
    payload: migratedPayload,
    metadata: {
      ...event.metadata,
      schemaVersion: targetVersion,
    },
  };
}

/**
 * Compares two semver version strings.
 *
 * @param a - First version string (e.g., "1.0.0")
 * @param b - Second version string (e.g., "2.0.0")
 * @returns Negative if a < b, zero if equal, positive if a > b
 *
 * @example
 * ```typescript
 * compareVersions("1.0.0", "2.0.0"); // -1
 * compareVersions("2.0.0", "1.0.0"); // 1
 * compareVersions("1.0.0", "1.0.0"); // 0
 * ```
 */
export function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i]!;
    const numB = partsB[i]!;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Checks if an event needs migration to reach a target version.
 *
 * @param event - The fat event to check
 * @param targetVersion - The target schema version
 * @returns True if the event's version is older than target
 */
export function needsMigration(event: FatEvent, targetVersion: string): boolean {
  return compareVersions(event.metadata.schemaVersion, targetVersion) < 0;
}
