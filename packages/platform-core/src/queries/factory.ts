/**
 * @libar-docs
 * @libar-docs-pattern QueryAbstraction
 * @libar-docs-status completed
 * @libar-docs-phase 12
 * @libar-docs-cqrs
 *
 * ## Query Abstraction - Read Model Factories
 *
 * Query factory functions for creating type-safe read model queries.
 * Provides builders for different query types with consistent patterns.
 *
 * ### When to Use
 *
 * - Creating type-safe read model query metadata for introspection
 * - Building paginated queries with configurable defaults
 * - Grouping related queries by context/feature with a registry
 */

import type {
  QueryConfig,
  PaginatedQueryConfig,
  PaginationOptions,
  NormalizedPaginationOptions,
} from "./types.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePaginationOptions } from "./pagination.js";

/**
 * Read model query descriptor.
 *
 * Captures query metadata for introspection and documentation.
 *
 * @template TResult - Type of the query result
 */
export interface ReadModelQueryDescriptor<TResult> {
  /** Query configuration */
  config: QueryConfig<TResult>;

  /** Type of result this query returns */
  resultType: "single" | "list" | "count";
}

/**
 * Paginated query descriptor.
 *
 * Captures paginated query metadata for introspection.
 *
 * @template TResult - Type of items in pages
 */
export interface PaginatedQueryDescriptor<TResult> {
  /** Paginated query configuration */
  config: PaginatedQueryConfig<TResult>;

  /** Type of result this query returns */
  resultType: "paginated";

  /** Default pagination options */
  defaults: {
    pageSize: number;
    maxPageSize: number;
  };
}

/**
 * Creates a read model query descriptor.
 *
 * Use this to define metadata for queries that return single items,
 * lists, or counts. The descriptor captures information for
 * introspection, documentation, and type inference.
 *
 * @template TResult - Type of the query result
 * @param config - Query configuration
 * @param resultType - Type of result ("single", "list", or "count")
 * @returns Query descriptor
 *
 * @example
 * ```typescript
 * const getOrderById = createReadModelQuery<Order>(
 *   {
 *     queryName: "getOrderById",
 *     description: "Gets a single order by its ID",
 *     sourceProjection: "orderSummary",
 *     targetTable: "orderSummaries",
 *   },
 *   "single"
 * );
 * ```
 */
export function createReadModelQuery<TResult>(
  config: QueryConfig<TResult>,
  resultType: "single" | "list" | "count"
): ReadModelQueryDescriptor<TResult> {
  return {
    config,
    resultType,
  };
}

/**
 * Creates a paginated query descriptor.
 *
 * Use this to define metadata for queries that return paginated results.
 * The descriptor captures pagination defaults and limits.
 *
 * @template TResult - Type of items in pages
 * @param config - Paginated query configuration
 * @returns Paginated query descriptor
 *
 * @example
 * ```typescript
 * const listOrders = createPaginatedQuery<Order>({
 *   queryName: "listOrders",
 *   description: "Lists orders for a customer with pagination",
 *   sourceProjection: "orderSummary",
 *   targetTable: "orderSummaries",
 *   defaultPageSize: 20,
 *   maxPageSize: 100,
 *   paginationIndex: "by_customer",
 * });
 *
 * // Use the descriptor's defaults
 * const options = { pageSize: listOrders.defaults.pageSize };
 * ```
 */
export function createPaginatedQuery<TResult>(
  config: PaginatedQueryConfig<TResult>
): PaginatedQueryDescriptor<TResult> {
  // Extract defaults once to avoid duplication
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = config.maxPageSize ?? MAX_PAGE_SIZE;

  return {
    config: {
      ...config,
      defaultPageSize,
      maxPageSize,
    },
    resultType: "paginated",
    defaults: {
      pageSize: defaultPageSize,
      maxPageSize,
    },
  };
}

/**
 * Query registry for grouping related queries.
 *
 * Provides a container for organizing queries by context or feature.
 *
 * @template TQueries - Map of query names to descriptors
 */
export interface QueryRegistry<TQueries extends Record<string, unknown>> {
  /** Map of query names to their descriptors */
  queries: TQueries;

  /** Context this registry belongs to */
  context: string;

  /** Source projection for these queries */
  sourceProjection: string;
}

/**
 * Creates a query registry for grouping related queries.
 *
 * @template TQueries - Map of query names to descriptors
 * @param context - Context name
 * @param sourceProjection - Source projection name
 * @param queries - Map of query descriptors
 * @returns Query registry
 *
 * @example
 * ```typescript
 * const orderQueries = createQueryRegistry(
 *   "orders",
 *   "orderSummary",
 *   {
 *     getById: createReadModelQuery<Order>({ ... }, "single"),
 *     list: createPaginatedQuery<Order>({ ... }),
 *     countPending: createReadModelQuery<number>({ ... }, "count"),
 *   }
 * );
 *
 * // Access query metadata
 * orderQueries.queries.list.defaults.pageSize;
 * ```
 */
export function createQueryRegistry<TQueries extends Record<string, unknown>>(
  context: string,
  sourceProjection: string,
  queries: TQueries
): QueryRegistry<TQueries> {
  return {
    queries,
    context,
    sourceProjection,
  };
}

/**
 * Helper to extract effective pagination options.
 *
 * Combines caller options with query defaults and enforces limits.
 *
 * @param descriptor - Paginated query descriptor
 * @param options - Caller-provided options
 * @returns Effective pagination options
 *
 * @example
 * ```typescript
 * const effectiveOptions = getPaginationOptions(
 *   listOrders,
 *   { pageSize: 50, cursor: "abc123" }
 * );
 * ```
 */
export function getPaginationOptions(
  descriptor: PaginatedQueryDescriptor<unknown>,
  options?: PaginationOptions
): NormalizedPaginationOptions {
  return normalizePaginationOptions(options, {
    defaultPageSize: descriptor.defaults.pageSize,
    maxPageSize: descriptor.defaults.maxPageSize,
  });
}
