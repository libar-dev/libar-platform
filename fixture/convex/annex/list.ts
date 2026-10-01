import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import schema from "./schema.js";
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: (ctx, { paginationOpts }) =>
    paginator(ctx.db, schema)
      .query("rows")
      .withIndex("by_position")
      .paginate(paginationOpts),
});
export const first = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.db.query("rows").withIndex("by_position").first(),
});
export const insert = mutation({
  args: {
    rows: v.array(v.object({ position: v.number(), label: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) await ctx.db.insert("rows", row);
    return null;
  },
});
export const remove = mutation({
  args: { id: v.id("rows") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete("rows", id);
    return null;
  },
});
export const relabel = mutation({
  args: { id: v.id("rows"), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, label }) => {
    await ctx.db.patch("rows", id, { label });
    return null;
  },
});
