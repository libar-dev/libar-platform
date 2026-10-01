// The context queries of spec:context.queries: one definer per query a context serves, each
// registering a public query of the component that the parent calls through the component API.
import { paginator } from "convex-helpers/server/pagination";
import {
  defineSchema,
  paginationOptsValidator,
  paginationResultValidator,
  queryGeneric,
  type PaginationOptions,
  type PaginationResult,
  type QueryBuilder,
  type RegisteredQuery,
} from "convex/server";
import { v, type Value } from "convex/values";
import type { DomainEvent } from "../kernel/index.js";
import {
  load,
  metaOf,
  type Journal,
  type StreamRegistration,
} from "./journal.js";
import { contextTables, type ContextDataModel } from "./tables.js";
// A component's generated query builder is queryGeneric typed with the component's data model.
// The library types it with the tables it owns, which every context component's schema holds.
const query: QueryBuilder<ContextDataModel, "public"> = queryGeneric;
// paginator reads index fields from a schema: the same fragment the component's schema spreads.
const contextSchema = defineSchema(contextTables);
const mebibyte = 1024 * 1024;
export const limitListBytes = 8 * mebibyte;
// Items per list page: half of limitListBytes in whole stream budgets, so a page read to its row
// cap of twice the items stays within limitListBytes.
export const limitListPage = (budgetBytes: number): number =>
  Math.max(1, Math.min(100, Math.floor((4 * mebibyte) / budgetBytes)));
export type PageLimit = { items: number; bytes: number };
// The options every list passes to its one paginate call, in a context and in the parent. The row
// cap is twice the item cap, so a full page never comes back SplitRequired on its own. Nothing else
// of the caller's options is relayed: not its own maxima, not the id a client hook sends. A page
// size that is not a number of at least one asks for one item.
export function boundedPage(
  opts: PaginationOptions,
  limit: PageLimit,
): PaginationOptions {
  const asked = Math.floor(opts.numItems);
  return {
    cursor: opts.cursor,
    numItems: asked >= 1 ? Math.min(asked, limit.items) : 1,
    ...(opts.endCursor == null ? {} : { endCursor: opts.endCursor }),
    maximumRowsRead: 2 * limit.items,
    maximumBytesRead: limit.bytes,
  };
}
export type GetArgs = { tenantId: string; streamId: string };
export type ListArgs = { tenantId: string; paginationOpts: PaginationOptions };
// One subject's DTO, or null when its stream does not exist or is deleted.
export function defineGet<S, C, E extends DomainEvent, R>(
  journal: Journal,
  registration: StreamRegistration<S, C, E, R>,
): RegisteredQuery<"public", GetArgs, Promise<Value | null>> {
  return query({
    args: { tenantId: v.string(), streamId: v.string() },
    returns: v.union(registration.dto, v.null()),
    handler: async (ctx, { tenantId, streamId }) => {
      const loaded = await load(ctx, journal, registration, tenantId, streamId);
      if (!loaded.exists || loaded.meta.deletedAt !== undefined) return null;
      return registration.toDto(loaded.state, loaded.meta);
    },
  });
}
// A tenant's subjects of one stream type in streamId order. Deleted subjects are left out after the
// page is read, so a page may hold fewer DTOs than numItems while isDone is false.
export function defineList<S, C, E extends DomainEvent, R>(
  journal: Journal,
  registration: StreamRegistration<S, C, E, R>,
): RegisteredQuery<"public", ListArgs, Promise<PaginationResult<Value>>> {
  const streamType = registration.decider.streamType;
  const limit: PageLimit = {
    items: limitListPage(registration.mapping.budgetBytes),
    bytes: limitListBytes,
  };
  return query({
    args: { tenantId: v.string(), paginationOpts: paginationOptsValidator },
    returns: paginationResultValidator(registration.dto),
    handler: async (ctx, { tenantId, paginationOpts }) => {
      const result = await paginator(ctx.db, contextSchema)
        .query("streams")
        .withIndex("by_identity", (q) =>
          q.eq("tenantId", tenantId).eq("streamType", streamType),
        )
        .paginate(boundedPage(paginationOpts, limit));
      const page: Value[] = [];
      for (const row of result.page) {
        if (row.deletedAt !== undefined) continue;
        page.push(
          registration.toDto(row.state as S, metaOf(registration, row)),
        );
      }
      return { ...result, page };
    },
  });
}
