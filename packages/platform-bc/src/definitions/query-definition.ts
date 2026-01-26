/**
 * Query Definition Interface
 *
 * Formal metadata for read model queries in a bounded context.
 * Defines how projections are exposed as queryable read models.
 *
 * Queries are the read interface of CQRS:
 * - Projections maintain read model tables
 * - Queries expose type-safe access to those tables
 * - Queries support pagination for large result sets
 *
 * @example
 * ```typescript
 * const orderListQuery = defineQuery({
 *   queryName: "listOrders",
 *   description: "Paginated list of orders for a customer",
 *   sourceProjection: "orderSummary",
 *   targetTable: "orderSummaries",
 *   resultType: "paginated",
 *   context: "orders",
 *   indexUsed: "by_customer",
 *   supportsPagination: true,
 *   defaultPageSize: 20,
 *   maxPageSize: 100,
 * });
 * ```
 */

/**
 * All valid query result type values.
 *
 * - `single`: Returns exactly one result or null
 * - `list`: Returns an array of results (bounded)
 * - `paginated`: Returns paginated results with cursor
 * - `count`: Returns a count (number)
 */
export const QUERY_RESULT_TYPES = ["single", "list", "paginated", "count"] as const;

/**
 * Type of query result derived from the QUERY_RESULT_TYPES tuple.
 */
export type QueryResultType = (typeof QUERY_RESULT_TYPES)[number];

/**
 * Type guard to check if a value is a valid QueryResultType.
 *
 * @param value - Value to check
 * @returns True if value is a valid QueryResultType
 *
 * @example
 * ```typescript
 * const type: unknown = "paginated";
 * if (isQueryResultType(type)) {
 *   // type is now typed as QueryResultType
 * }
 * ```
 */
export function isQueryResultType(value: unknown): value is QueryResultType {
  return typeof value === "string" && (QUERY_RESULT_TYPES as readonly string[]).includes(value);
}

/**
 * Metadata for a read model query.
 *
 * This interface captures query documentation and configuration
 * for introspection, documentation generation, and type safety.
 *
 * @template TResultType - The result type of this query
 */
export interface QueryDefinition<TResultType extends QueryResultType = QueryResultType> {
  /**
   * Query name (e.g., "listOrders", "getOrderById").
   * Should be unique within the application and describe the query action.
   */
  readonly queryName: string;

  /**
   * Human-readable description of what this query returns.
   */
  readonly description: string;

  /**
   * The projection this query reads from.
   * Links query to its data source for documentation.
   */
  readonly sourceProjection: string;

  /**
   * The Convex table this query reads from.
   */
  readonly targetTable: string;

  /**
   * Type of result this query returns.
   *
   * - `single`: Returns one item or null
   * - `list`: Returns an array (bounded)
   * - `paginated`: Returns a page with cursor
   * - `count`: Returns a number
   */
  readonly resultType: TResultType;

  /**
   * Bounded context this query belongs to.
   */
  readonly context: string;

  /**
   * Index used by this query (optional).
   * Documents which index the query leverages for performance.
   */
  readonly indexUsed?: string;

  /**
   * Whether this query supports pagination (optional).
   * True for queries that can return large result sets.
   */
  readonly supportsPagination?: boolean;

  /**
   * Default page size for paginated queries (optional).
   * Used when no page size is specified by caller.
   */
  readonly defaultPageSize?: number;

  /**
   * Maximum allowed page size (optional).
   * Prevents unbounded result sets.
   */
  readonly maxPageSize?: number;
}

/**
 * Helper to define a query with type inference.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving all literal types including resultType.
 *
 * @param definition - Query definition
 * @returns The same definition with all literal types preserved
 *
 * @example
 * ```typescript
 * const orderListQuery = defineQuery({
 *   queryName: "listOrders",
 *   description: "Paginated list of orders for a customer",
 *   sourceProjection: "orderSummary",
 *   targetTable: "orderSummaries",
 *   resultType: "paginated",
 *   context: "orders",
 *   supportsPagination: true,
 *   defaultPageSize: 20,
 *   maxPageSize: 100,
 * });
 *
 * // orderListQuery.resultType is "paginated" (literal), not QueryResultType
 * ```
 */
export function defineQuery<const T extends QueryDefinition<QueryResultType>>(definition: T): T {
  return definition;
}

/**
 * Registry of query definitions for an application.
 *
 * Maps query names to their definitions, preserving the query name as a literal type.
 *
 * @template TQueryNames - Tuple of query name strings
 *
 * @example
 * ```typescript
 * const QUERIES = ["listOrders", "getOrderById", "countPendingOrders"] as const;
 *
 * const QueryDefs: QueryDefinitionRegistry<typeof QUERIES> = {
 *   listOrders: defineQuery({ queryName: "listOrders", ... }),
 *   getOrderById: defineQuery({ queryName: "getOrderById", ... }),
 *   countPendingOrders: defineQuery({ queryName: "countPendingOrders", ... }),
 * };
 *
 * // QueryDefs.listOrders.queryName is "listOrders" (literal), not string
 * ```
 */
export type QueryDefinitionRegistry<TQueryNames extends readonly string[]> = {
  readonly [K in TQueryNames[number]]: QueryDefinition & { readonly queryName: K };
};
