/**
 * @libar-docs
 * @libar-docs-pattern CMSRepository
 * @libar-docs-status completed
 * @libar-docs-phase 11
 * @libar-docs-uses CMSDualWrite
 * @libar-docs-used-by BoundedContextHandlers
 *
 * ## CMS Repository - Entity Access with Auto-Upcast
 *
 * Factory for typed data access with automatic schema upcasting in dual-write handlers.
 * Eliminates 5-line boilerplate for loading, validating, and upcasting CMS entities.
 *
 * ### When to Use
 *
 * - Loading CMS entities in command handlers (load, tryLoad, loadMany)
 * - Persisting CMS updates with version tracking
 * - Building typed repositories for specific aggregate types
 *
 * ### Problem Solved
 *
 * Before:
 * ```typescript
 * const rawCMS = await ctx.db
 *   .query("orderCMS")
 *   .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
 *   .first();
 * assertOrderExists(rawCMS);
 * const cms = upcastOrderCMS(rawCMS);
 * ```
 *
 * After:
 * ```typescript
 * const { cms, _id } = await orderRepo.load(ctx, orderId);
 * ```
 */
import type { BaseCMS } from "../cms/types.js";
import type { CMSRepositoryConfig, RepositoryLoadResult } from "./types.js";
import { NotFoundError, VersionConflictError } from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Minimal interface for Convex index query builder.
 * Used for type assertions inside the implementation.
 */
interface IndexQueryBuilder {
  eq(field: string, value: unknown): unknown;
}

/**
 * Internal database shape used in the implementation.
 * We cast from the opaque context to this shape.
 */
interface DatabaseReader {
  query(tableName: string): {
    withIndex(
      indexName: string,
      indexRange: (q: IndexQueryBuilder) => unknown
    ): {
      first(): Promise<UnknownRecord | null>;
    };
  };
}

/**
 * Internal database shape with write capabilities.
 */
interface DatabaseWriter extends DatabaseReader {
  insert(tableName: string, document: UnknownRecord): Promise<unknown>;
  patch(id: unknown, updates: UnknownRecord): Promise<void>;
  get(id: unknown): Promise<UnknownRecord | null>;
}

/**
 * Context with database reader access.
 *
 * The `db` property is typed as `unknown` to accept any Convex context type
 * (MutationCtx, QueryCtx, etc.) without structural typing issues. Inside the
 * implementation, we cast to our minimal DatabaseReader interface.
 */
interface ReadContext {
  db: unknown;
}

/**
 * Context with database writer access.
 */
interface WriteContext {
  db: unknown;
}

/**
 * CMS Repository interface providing typed database access.
 *
 * @template TCMS - The CMS type this repository manages
 * @template TId - The type of the entity ID (defaults to string)
 * @template TDocId - The type of the Convex document ID (defaults to unknown)
 *
 * @remarks
 * When using with a specific Convex table, you can provide the Id type:
 * ```typescript
 * type OrderRepository = CMSRepository<OrderCMS, string, Id<"orderCMS">>;
 * ```
 */
export interface CMSRepository<TCMS extends BaseCMS, TId = string, TDocId = unknown> {
  /**
   * Load CMS by entity ID, auto-upcasting if needed.
   * Throws NotFoundError if the entity doesn't exist.
   *
   * @param ctx - Convex mutation/query context with db access
   * @param id - The entity ID to load
   * @returns The CMS with document ID and upcast metadata
   * @throws NotFoundError if not found
   */
  load(ctx: ReadContext, id: TId): Promise<RepositoryLoadResult<TCMS, TDocId>>;

  /**
   * Try to load CMS by entity ID.
   * Returns null if the entity doesn't exist (does not throw).
   *
   * @param ctx - Convex mutation/query context with db access
   * @param id - The entity ID to load
   * @returns The CMS with document ID, or null if not found
   */
  tryLoad(ctx: ReadContext, id: TId): Promise<RepositoryLoadResult<TCMS, TDocId> | null>;

  /**
   * Check if an entity exists by ID.
   * More efficient than tryLoad() when you only need existence check.
   *
   * @param ctx - Convex mutation/query context with db access
   * @param id - The entity ID to check
   * @returns True if the entity exists, false otherwise
   */
  exists(ctx: ReadContext, id: TId): Promise<boolean>;

  /**
   * Load multiple CMS records by IDs in a single query batch.
   * Returns an array in the same order as the input IDs.
   * Missing entities are represented as null in the result array.
   *
   * @param ctx - Convex mutation/query context with db access
   * @param ids - Array of entity IDs to load
   * @returns Array of CMS results (null for missing entities)
   */
  loadMany(ctx: ReadContext, ids: TId[]): Promise<Array<RepositoryLoadResult<TCMS, TDocId> | null>>;

  /**
   * Insert a new CMS record.
   *
   * @param ctx - Convex mutation context with db access
   * @param cms - The CMS record to insert
   * @returns The document ID of the inserted record
   */
  insert(ctx: WriteContext, cms: TCMS): Promise<TDocId>;

  /**
   * Update a CMS record with optimistic concurrency check.
   *
   * @param ctx - Convex mutation context with db access
   * @param docId - The document ID to update
   * @param updates - Partial updates to apply
   * @param expectedVersion - The expected version for OCC check
   * @throws NotFoundError if the document no longer exists
   * @throws VersionConflictError if version doesn't match
   */
  update(
    ctx: WriteContext,
    docId: TDocId,
    updates: Partial<TCMS>,
    expectedVersion: number
  ): Promise<void>;
}

/**
 * Create a typed CMS repository for a bounded context.
 *
 * The repository provides:
 * - Automatic upcasting on load (schema migrations)
 * - NotFoundError for missing entities
 * - VersionConflictError for OCC failures
 * - Type-safe operations
 *
 * @example
 * ```typescript
 * // Define the repository in your bounded context
 * import { createCMSRepository } from "@libar-dev/platform-core/repository";
 * import { upcastOrderCMS, type OrderCMS, CURRENT_ORDER_CMS_VERSION } from "./domain/order";
 * import { createUpcaster } from "@libar-dev/platform-core/cms";
 *
 * const orderUpcast = createUpcaster<OrderCMS>({
 *   currentVersion: CURRENT_ORDER_CMS_VERSION,
 *   migrations: {},
 * });
 *
 * export const orderRepo = createCMSRepository<OrderCMS>({
 *   table: "orderCMS",
 *   idField: "orderId",
 *   index: "by_orderId",
 *   upcast: orderUpcast,
 * });
 *
 * // Use in handlers
 * export const handleSubmitOrder = mutation({
 *   args: { orderId: v.string(), commandId: v.string(), correlationId: v.string() },
 *   handler: async (ctx, args) => {
 *     const { cms, _id, wasUpcasted } = await orderRepo.load(ctx, args.orderId);
 *
 *     assertOrderIsDraft(cms);
 *     assertOrderHasItems(cms);
 *
 *     const updatedCMS = { ...cms, status: "submitted", updatedAt: Date.now() };
 *     await orderRepo.update(ctx, _id, updatedCMS, cms.version);
 *
 *     return successResult(...);
 *   },
 * });
 * ```
 */
export function createCMSRepository<TCMS extends BaseCMS, TId = string, TDocId = unknown>(
  config: CMSRepositoryConfig<TCMS>
): CMSRepository<TCMS, TId, TDocId> {
  return {
    async load(ctx, id) {
      const db = ctx.db as DatabaseReader;
      const raw = await db
        .query(config.table)
        .withIndex(config.index, (q) => q.eq(config.idField, id))
        .first();

      if (!raw) {
        throw new NotFoundError(config.table, String(id));
      }

      const result = config.upcast(raw);
      return {
        ...result,
        _id: raw["_id"] as TDocId,
      };
    },

    async tryLoad(ctx, id) {
      const db = ctx.db as DatabaseReader;
      const raw = await db
        .query(config.table)
        .withIndex(config.index, (q) => q.eq(config.idField, id))
        .first();

      if (!raw) {
        return null;
      }

      const result = config.upcast(raw);
      return {
        ...result,
        _id: raw["_id"] as TDocId,
      };
    },

    async exists(ctx, id) {
      const db = ctx.db as DatabaseReader;
      const raw = await db
        .query(config.table)
        .withIndex(config.index, (q) => q.eq(config.idField, id))
        .first();

      return raw !== null;
    },

    async loadMany(ctx, ids) {
      const db = ctx.db as DatabaseReader;
      // Load all entities in parallel for efficiency
      const results = await Promise.all(
        ids.map(async (id) => {
          const raw = await db
            .query(config.table)
            .withIndex(config.index, (q) => q.eq(config.idField, id))
            .first();

          if (!raw) {
            return null;
          }

          const upcastResult = config.upcast(raw);
          return {
            ...upcastResult,
            _id: raw["_id"] as TDocId,
          };
        })
      );

      return results;
    },

    async insert(ctx, cms) {
      const db = ctx.db as DatabaseWriter;
      return (await db.insert(config.table, cms as UnknownRecord)) as TDocId;
    },

    async update(ctx, docId, updates, expectedVersion) {
      const db = ctx.db as DatabaseWriter;
      const current = await db.get(docId);

      if (!current) {
        throw new NotFoundError(config.table, String(docId));
      }

      const currentVersion = (current as { version?: number }).version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new VersionConflictError(
          config.table,
          String(docId),
          expectedVersion,
          currentVersion
        );
      }

      await db.patch(docId, updates as UnknownRecord);
    },
  };
}
