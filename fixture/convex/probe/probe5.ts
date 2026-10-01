import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "./_generated/server.js";
import schema from "./schema.js";
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: (ctx, a) =>
    paginator(ctx.db, schema)
      .query("rows")
      .withIndex("by_position")
      .paginate(a.paginationOpts),
});
export const write = mutation({
  args: {
    rows: v.array(v.object({ position: v.number(), value: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    for (const row of a.rows) await ctx.db.insert("rows", row);
    return null;
  },
});
export const remove = mutation({
  args: { id: v.id("rows") },
  returns: v.null(),
  handler: async (ctx, a) => {
    await ctx.db.delete("rows", a.id);
    return null;
  },
});
export const change = mutation({
  args: { id: v.id("rows"), value: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await ctx.db.patch("rows", a.id, { value: a.value });
    return null;
  },
});
export const first = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.db.query("rows").withIndex("by_position").first(),
});
