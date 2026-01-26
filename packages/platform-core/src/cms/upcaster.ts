import type { BaseCMS, CMSLoadResult } from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Error codes for CMS upcast failures.
 */
export type CMSUpcasterErrorCode =
  | "NULL_STATE"
  | "MISSING_MIGRATION"
  | "INVALID_STATE"
  | "FUTURE_VERSION";

/**
 * Migration function from one state version to the next.
 *
 * @param state - CMS at version N
 * @returns CMS at version N+1
 */
export type CMSMigration<TFrom = unknown, TTo = unknown> = (state: TFrom) => TTo;

/**
 * Configuration for a CMS type's upcaster.
 * Aligned with EventTypeUpcastConfig for consistency.
 */
export interface CMSUpcastConfig<TLatest extends BaseCMS> {
  /** Current (latest) state version for this CMS type */
  currentVersion: number;

  /**
   * Migration functions keyed by source version.
   * Each migrates from version N to N+1.
   *
   * For currentVersion = 3, you need migrations for versions 1 and 2:
   * - migrations[1]: v1 -> v2
   * - migrations[2]: v2 -> v3
   */
  migrations: Record<number, CMSMigration>;

  /** Optional validator for the final upcasted CMS */
  validate?: (state: unknown) => state is TLatest;
}

/**
 * Error thrown when CMS upcast fails.
 */
export class CMSUpcasterError extends Error {
  readonly code: CMSUpcasterErrorCode;
  readonly context: UnknownRecord | undefined;

  constructor(code: CMSUpcasterErrorCode, message: string, context?: UnknownRecord) {
    super(message);
    this.name = "CMSUpcasterError";
    this.code = code;
    this.context = context;
  }
}

/**
 * Safely extract stateVersion from unknown CMS state.
 * Returns 0 if stateVersion is not present or not a number.
 */
function getStateVersion(state: unknown): number {
  if (
    state !== null &&
    typeof state === "object" &&
    "stateVersion" in state &&
    typeof (state as { stateVersion: unknown }).stateVersion === "number"
  ) {
    return (state as { stateVersion: number }).stateVersion;
  }
  return 0;
}

/**
 * Create an upcaster chain for CMS schema evolution.
 *
 * This allows defining migrations from one version to the next,
 * and the chain will automatically apply all necessary migrations.
 *
 * @example
 * ```typescript
 * const CURRENT_ORDER_CMS_VERSION = 2;
 *
 * interface OrderCMSv1 {
 *   orderId: string;
 *   status: string;
 *   stateVersion: 1;
 *   version: number;
 * }
 *
 * interface OrderCMSv2 extends OrderCMSv1 {
 *   priority: "standard" | "express";
 *   stateVersion: 2;
 * }
 *
 * const upcastOrderCMS = createUpcaster<OrderCMS>({
 *   currentVersion: CURRENT_ORDER_CMS_VERSION,
 *   migrations: {
 *     1: (v1: OrderCMSv1): OrderCMSv2 => ({
 *       ...v1,
 *       priority: "standard",
 *       stateVersion: 2,
 *     }),
 *   },
 *   validate: isValidOrderCMS, // Optional type guard
 * });
 * ```
 */
export function createUpcaster<T extends BaseCMS>(
  config: CMSUpcastConfig<T>
): (rawState: unknown) => CMSLoadResult<T> {
  // Validate migration chain completeness at creation time
  // This catches configuration errors early rather than at runtime
  for (let v = 1; v < config.currentVersion; v++) {
    if (!config.migrations[v]) {
      throw new Error(
        `Missing migration for version ${v}. Migrations must form a complete chain from 1 to ${config.currentVersion - 1}.`
      );
    }
  }

  return (rawState: unknown): CMSLoadResult<T> => {
    // Handle null/undefined
    if (rawState === null || rawState === undefined) {
      throw new CMSUpcasterError("NULL_STATE", "Cannot upcast null or undefined CMS state");
    }

    // Get current state version safely
    const originalStateVersion = getStateVersion(rawState);

    // If already at current version, validate and return as-is
    if (originalStateVersion === config.currentVersion) {
      if (config.validate && !config.validate(rawState)) {
        throw new CMSUpcasterError(
          "INVALID_STATE",
          `CMS claims version ${config.currentVersion} but fails validation`
        );
      }
      return {
        cms: rawState as T,
        wasUpcasted: false,
        originalStateVersion,
      };
    }

    // Reject "future" state versions - code is older than state
    if (originalStateVersion > config.currentVersion) {
      throw new CMSUpcasterError(
        "FUTURE_VERSION",
        `State version ${originalStateVersion} is newer than current schema version ${config.currentVersion}. Cannot downcast.`,
        { stateVersion: originalStateVersion, currentVersion: config.currentVersion }
      );
    }

    // Apply migrations in order
    let currentState: unknown = rawState;
    let currentVersion = originalStateVersion;

    while (currentVersion < config.currentVersion) {
      const migration = config.migrations[currentVersion];
      if (!migration) {
        throw new CMSUpcasterError(
          "MISSING_MIGRATION",
          `No migration defined from version ${currentVersion} to ${currentVersion + 1}`,
          { fromVersion: currentVersion, toVersion: currentVersion + 1 }
        );
      }

      currentState = migration(currentState);
      currentVersion++;
    }

    // Validate final result if validator provided
    if (config.validate && !config.validate(currentState)) {
      throw new CMSUpcasterError("INVALID_STATE", `Upcasted CMS failed validation`, {
        resultVersion: currentVersion,
      });
    }

    return {
      cms: currentState as T,
      wasUpcasted: true,
      originalStateVersion,
    };
  };
}

/**
 * Simple upcast helper for when you only need to handle
 * migrating from a single old version.
 *
 * @param rawState - The raw state from the database
 * @param currentVersion - The current expected version
 * @param migrateOld - Migration function from old version to new
 * @param validate - Optional type guard to validate state when versions match
 */
export function upcastIfNeeded<TOld, TNew extends BaseCMS>(
  rawState: unknown,
  currentVersion: number,
  migrateOld: (old: TOld) => TNew,
  validate?: (state: unknown) => state is TNew
): CMSLoadResult<TNew> {
  const originalStateVersion = getStateVersion(rawState);

  if (originalStateVersion === currentVersion) {
    if (validate && !validate(rawState)) {
      throw new CMSUpcasterError(
        "INVALID_STATE",
        `State claims version ${currentVersion} but fails validation`
      );
    }
    return {
      cms: rawState as TNew,
      wasUpcasted: false,
      originalStateVersion,
    };
  }

  // Reject "future" state versions
  if (originalStateVersion > currentVersion) {
    throw new CMSUpcasterError(
      "FUTURE_VERSION",
      `State version ${originalStateVersion} is newer than expected version ${currentVersion}. Cannot downcast.`,
      { stateVersion: originalStateVersion, expectedVersion: currentVersion }
    );
  }

  return {
    cms: migrateOld(rawState as TOld),
    wasUpcasted: true,
    originalStateVersion,
  };
}

/**
 * Helper to create a simple migration that adds a field with a default value.
 *
 * @param fieldName - Name of the field to add
 * @param defaultValue - Default value or function to compute it from the state
 * @param nextVersion - Version after migration
 * @returns Migration function
 *
 * @example
 * ```typescript
 * const migrations = {
 *   1: addCMSFieldMigration("priority", "standard", 2),
 *   2: addCMSFieldMigration("createdAt", (state) => Date.now(), 3),
 * };
 * ```
 */
export function addCMSFieldMigration<T>(
  fieldName: string,
  defaultValue: T | ((state: BaseCMS) => T),
  nextVersion: number
): CMSMigration<BaseCMS, BaseCMS> {
  return (state: BaseCMS) => {
    const value =
      typeof defaultValue === "function"
        ? (defaultValue as (state: BaseCMS) => T)(state)
        : defaultValue;

    return {
      ...state,
      [fieldName]: value,
      stateVersion: nextVersion,
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
 *   1: renameCMSFieldMigration("userId", "customerId", 2),
 * };
 * ```
 */
export function renameCMSFieldMigration(
  oldName: string,
  newName: string,
  nextVersion: number
): CMSMigration<BaseCMS, BaseCMS> {
  return (state: BaseCMS) => {
    const stateRecord = state as unknown as UnknownRecord;
    const { [oldName]: value, ...rest } = stateRecord;

    return {
      ...rest,
      [newName]: value,
      stateVersion: nextVersion,
    } as unknown as BaseCMS;
  };
}

/**
 * Helper to create a migration that removes a field.
 *
 * @param fieldName - Name of the field to remove
 * @param nextVersion - Version after migration
 * @returns Migration function
 *
 * @example
 * ```typescript
 * const migrations = {
 *   1: removeCMSFieldMigration("deprecatedField", 2),
 * };
 * ```
 */
export function removeCMSFieldMigration(
  fieldName: string,
  nextVersion: number
): CMSMigration<BaseCMS, BaseCMS> {
  return (state: BaseCMS) => {
    const stateRecord = state as unknown as UnknownRecord;
    const { [fieldName]: _removed, ...rest } = stateRecord;

    return {
      ...rest,
      stateVersion: nextVersion,
    } as unknown as BaseCMS;
  };
}
