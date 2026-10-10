import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { mutation, query, internalMutation } from "./_generated/server.js";
export const write = mutation({
  args: { label: v.string() },
  returns: v.any(),
  handler: async (ctx, { label }): Promise<unknown> => {
    const first = await ctx.runMutation(components.annex.timestamps.write, {
      label,
    });
    const id = await ctx.db.insert("timestamps", {
      label,
      commitTs: ctx.db.vars.commitTs,
    });
    const second = await ctx.runMutation(
      components.annexClock.timestamps.write,
      { label },
    );
    const row = await ctx.db.get("timestamps", id);
    return {
      first,
      second,
      unresolved: row?.commitTs === ctx.db.vars.commitTs,
    };
  },
});
export const read = query({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<unknown> => ({
    rows: await ctx.db.query("timestamps").withIndex("by_commit").collect(),
    first: await ctx.runQuery(components.annex.timestamps.read, {}),
    second: await ctx.runQuery(components.annexClock.timestamps.read, {}),
    // The runtime implements this internal method; the public declarations omit it.
    upper: (
      ctx.meta as typeof ctx.meta & { getSnapshotTs(): bigint }
    ).getSnapshotTs(),
  }),
});
export const receive = internalMutation({
  args: { value: v.any() },
  returns: v.null(),
  handler: () => null,
});
export const returnPlaceholder = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await ctx.db.insert("timestamps", {
      label: "returned",
      commitTs: ctx.db.vars.commitTs,
    });
    return ctx.db.vars.commitTs;
  },
});
export const schedulePlaceholder = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.insert("timestamps", {
      label: "scheduled",
      commitTs: ctx.db.vars.commitTs,
    });
    await ctx.scheduler.runAfter(60000, internal.timestamps.receive, {
      value: ctx.db.vars.commitTs,
    });
    return null;
  },
});
