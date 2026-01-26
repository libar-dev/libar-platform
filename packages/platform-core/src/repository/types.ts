/**
 * CMS Repository Types
 *
 * Types for the CMS Repository pattern that eliminates boilerplate
 * in dual-write command handlers.
 */
import type { BaseCMS, CMSLoadResult } from "../cms/types.js";

/**
 * Configuration for creating a CMS repository.
 *
 * @template TCMS - The CMS type this repository manages
 */
export interface CMSRepositoryConfig<TCMS extends BaseCMS> {
  /**
   * The table name where CMS records are stored.
   */
  table: string;

  /**
   * The field name used as the entity ID (e.g., "orderId", "productId").
   */
  idField: string;

  /**
   * The index name for looking up by entity ID (e.g., "by_orderId").
   */
  index: string;

  /**
   * The upcast function to apply lazy schema migrations.
   * Should return CMSLoadResult to track if upcast occurred.
   */
  upcast: (raw: unknown) => CMSLoadResult<TCMS>;
}

/**
 * Error thrown when an entity is not found.
 */
export class NotFoundError extends Error {
  public readonly table: string;
  public readonly id: string;

  constructor(table: string, id: string) {
    super(`${table} not found: ${id}`);
    this.name = "NotFoundError";
    this.table = table;
    this.id = id;
  }

  /**
   * Type guard to check if an error is a NotFoundError.
   */
  static isNotFoundError(error: unknown): error is NotFoundError {
    return error instanceof NotFoundError;
  }
}

/**
 * Error thrown when optimistic concurrency check fails.
 */
export class VersionConflictError extends Error {
  public readonly table: string;
  public readonly id: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(table: string, id: string, expectedVersion: number, actualVersion: number) {
    super(`Version conflict for ${table} ${id}: expected ${expectedVersion}, got ${actualVersion}`);
    this.name = "VersionConflictError";
    this.table = table;
    this.id = id;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }

  /**
   * Type guard to check if an error is a VersionConflictError.
   */
  static isVersionConflictError(error: unknown): error is VersionConflictError {
    return error instanceof VersionConflictError;
  }
}

/**
 * Result of loading CMS with repository, extending CMSLoadResult with document ID.
 *
 * @template TCMS - The CMS type this repository manages
 * @template TDocId - The document ID type (defaults to unknown for flexibility)
 *
 * @remarks
 * When using with a specific Convex table, you can provide the Id type:
 * ```typescript
 * type OrderRepoResult = RepositoryLoadResult<OrderCMS, Id<"orderCMS">>;
 * ```
 */
export interface RepositoryLoadResult<
  TCMS extends BaseCMS,
  TDocId = unknown,
> extends CMSLoadResult<TCMS> {
  /**
   * The Convex document ID for this record.
   * Used for subsequent updates with `ctx.db.patch()`.
   *
   * @remarks
   * When TDocId is unknown (default), cast when using with ctx.db.patch():
   * ```typescript
   * await ctx.db.patch(result._id as Id<"orderCMS">, updates);
   * ```
   *
   * When TDocId is typed (e.g., Id<"orderCMS">), no cast needed:
   * ```typescript
   * await ctx.db.patch(result._id, updates);
   * ```
   */
  _id: TDocId;
}
