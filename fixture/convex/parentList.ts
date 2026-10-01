// A list over a table of the parent, read by the built-in paginate with no component call. The
// caller's maximumRowsRead is passed through, because the subject is the built-in call itself.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { ListPage } from "./list.js";
import { mutation, query } from "./_generated/server.js";
export const page = query({
  args: {
    paginationOpts: paginationOptsValidator,
    maximumRowsRead: v.optional(v.number()),
  },
  returns: v.any(),
  handler: (ctx, { paginationOpts, maximumRowsRead }): Promise<ListPage> =>
    ctx.db
      .query("parentRows")
      .withIndex("by_position")
      .paginate({
        ...paginationOpts,
        ...(maximumRowsRead === undefined ? {} : { maximumRowsRead }),
      }),
});
export const insert = mutation({
  args: {
    rows: v.array(v.object({ position: v.number(), label: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) await ctx.db.insert("parentRows", row);
    return null;
  },
});
