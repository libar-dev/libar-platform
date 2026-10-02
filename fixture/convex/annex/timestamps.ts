import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
export const write = mutation({
  args: { label: v.string() },
  returns: v.object({ unresolved: v.boolean(), numericError: v.string() }),
  handler: async (ctx, { label }) => {
    const id = await ctx.db.insert("timestamps", {
      label,
      commitTs: ctx.db.vars.commitTs,
    });
    const row = await ctx.db.get("timestamps", id);
    let numericError = "";
    try {
      Number(row?.commitTs);
    } catch (error) {
      numericError = String(error);
    }
    return { unresolved: row?.commitTs === ctx.db.vars.commitTs, numericError };
  },
});
export const read = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => ({
    rows: await ctx.db.query("timestamps").withIndex("by_commit").collect(),
    // The runtime implements this internal method; the public declarations omit it.
    upper: (
      ctx.meta as typeof ctx.meta & { getSnapshotTs(): bigint }
    ).getSnapshotTs(),
  }),
});
