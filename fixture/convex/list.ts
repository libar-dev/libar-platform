import { paginationOptsValidator } from "convex/server";
import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";
export interface ListRow {
  _id: string;
  _creationTime: number;
  position: number;
  label: string;
}
export type ListPage = PaginationResult<ListRow>;
const row = v.object({ position: v.number(), label: v.string() });
export const page = query({
  args: {
    paginationOpts: paginationOptsValidator,
    maximumRowsRead: v.optional(v.number()),
  },
  returns: v.any(),
  handler: (ctx, { paginationOpts, maximumRowsRead }): Promise<ListPage> =>
    ctx.runQuery(components.annex.list.page, {
      paginationOpts: {
        ...paginationOpts,
        ...(maximumRowsRead === undefined ? {} : { maximumRowsRead }),
      },
    }),
});
export const first = query({
  args: {},
  returns: v.any(),
  handler: (ctx): Promise<ListRow | null> =>
    ctx.runQuery(components.annex.list.first, {}),
});
export const insert = mutation({
  args: { rows: v.array(row) },
  returns: v.null(),
  handler: (ctx, a): Promise<null> =>
    ctx.runMutation(components.annex.list.insert, a),
});
export const remove = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: (ctx, a): Promise<null> =>
    ctx.runMutation(components.annex.list.remove, a),
});
export const relabel = mutation({
  args: { id: v.string(), label: v.string() },
  returns: v.null(),
  handler: (ctx, a): Promise<null> =>
    ctx.runMutation(components.annex.list.relabel, a),
});
