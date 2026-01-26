/**
 * Query types for read model access.
 *
 * Provides type-safe abstractions for querying read models (projections)
 * with support for pagination and various result types.
 */

import type { UnknownRecord } from "../types.js";

/**
 * Result of a paginated query.
 *
 * Follows Convex's cursor-based pagination pattern.
 *
 * @template T - Type of items in the page
 *
 * @example
 * ```typescript
 * const result: PagedQueryResult<Order> = {
 *   page: [order1, order2, order3],
 *   continueCursor: "eyJwb3NpdGlvbiI6MTB9",
 *   isDone: false,
 * };
 * ```
 */
export interface PagedQueryResult<T> {
  /** Items in the current page (immutable) */
  readonly page: readonly T[];

  /**
   * Cursor for the next page.
   * Null when there are no more results.
   */
  readonly continueCursor: string | null;

  /**
   * True when this is the last page of results.
   * When true, continueCursor is null.
   */
  readonly isDone: boolean;
}

/**
 * Configuration for creating a read model query.
 *
 * Links a query to its source projection and target table.
 * The TResult generic enables type inference in factory functions
 * without requiring a runtime field.
 *
 * @template TResult - Type of the query result (used for type inference only)
 */
export interface QueryConfig<_TResult = UnknownRecord> {
  /** Unique name for this query */
  queryName: string;

  /** Human-readable description */
  description: string;

  /** The projection this query reads from */
  sourceProjection: string;

  /** The Convex table to query */
  targetTable: string;
}

/**
 * Configuration for paginated queries.
 *
 * Extends QueryConfig with pagination-specific settings.
 */
export interface PaginatedQueryConfig<TResult = UnknownRecord> extends QueryConfig<TResult> {
  /** Default page size when not specified by caller */
  defaultPageSize: number;

  /** Maximum allowed page size to prevent unbounded queries */
  maxPageSize: number;

  /** Index to use for pagination (must support ordered scan) */
  paginationIndex?: string;
}

/**
 * Options for executing a paginated query.
 *
 * Provides pagination controls for callers.
 */
export interface PaginationOptions {
  /**
   * Number of items to return per page.
   * Bounded by the query's maxPageSize.
   */
  pageSize?: number;

  /**
   * Cursor from a previous query's continueCursor.
   * Omit for the first page.
   */
  cursor?: string;
}

/**
 * Normalized pagination options with required page size.
 *
 * Result of normalizing PaginationOptions with defaults applied.
 */
export interface NormalizedPaginationOptions {
  /** Page size (required, within bounds) */
  pageSize: number;

  /** Cursor for next page (optional) */
  cursor: string | undefined;
}

/**
 * Status of a query execution.
 */
export type QueryStatus = "success" | "error" | "not_found";

/**
 * Result wrapper for single-item queries.
 *
 * @template T - Type of the result item
 */
export interface SingleQueryResult<T> {
  /** Execution status */
  status: QueryStatus;

  /** The item, if found */
  data?: T;

  /** Error message if status is "error" */
  error?: string;
}

/**
 * Result wrapper for list queries.
 *
 * @template T - Type of items in the list
 */
export interface ListQueryResult<T> {
  /** Execution status */
  status: QueryStatus;

  /** The items */
  data: T[];

  /** Total count if available */
  totalCount?: number;

  /** Error message if status is "error" */
  error?: string;
}

/**
 * Result wrapper for count queries.
 */
export interface CountQueryResult {
  /** Execution status */
  status: QueryStatus;

  /** The count */
  count: number;

  /** Error message if status is "error" */
  error?: string;
}
