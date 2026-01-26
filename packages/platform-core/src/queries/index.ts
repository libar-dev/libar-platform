/**
 * Query module for read model access.
 *
 * Provides type-safe abstractions for querying read models (projections)
 * with support for pagination and various result types.
 *
 * @example
 * ```typescript
 * import {
 *   createReadModelQuery,
 *   createPaginatedQuery,
 *   normalizePaginationOptions,
 * } from "@libar-dev/platform-core/queries";
 *
 * // Define a paginated query
 * const listOrders = createPaginatedQuery<Order>({
 *   queryName: "listOrders",
 *   description: "Lists orders for a customer",
 *   sourceProjection: "orderSummary",
 *   targetTable: "orderSummaries",
 *   defaultPageSize: 20,
 *   maxPageSize: 100,
 * });
 *
 * // Normalize pagination options
 * const options = normalizePaginationOptions(
 *   { pageSize: 50 },
 *   listOrders.defaults
 * );
 * ```
 */

// Types
export type {
  PagedQueryResult,
  QueryConfig,
  PaginatedQueryConfig,
  PaginationOptions,
  NormalizedPaginationOptions,
  QueryStatus,
  SingleQueryResult,
  ListQueryResult,
  CountQueryResult,
} from "./types.js";

// Pagination helpers
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePaginationOptions,
  createEmptyPage,
  createPagedResult,
  encodeCursor,
  decodeCursor,
  isValidPageSize,
  getEffectivePageSize,
} from "./pagination.js";

// Factory functions
export type {
  ReadModelQueryDescriptor,
  PaginatedQueryDescriptor,
  QueryRegistry,
} from "./factory.js";

export {
  createReadModelQuery,
  createPaginatedQuery,
  createQueryRegistry,
  getPaginationOptions,
} from "./factory.js";
