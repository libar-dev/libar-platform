import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const empty = mutation({
  args: { index: v.number() },
  returns: v.number(),
  handler: (_, { index }) => index,
});
export const write = mutation({
  args: { index: v.number() },
  returns: v.number(),
  handler: async (ctx, { index }) => {
    const id = await ctx.db.insert("samples", { value: index });
    const row = await ctx.db.get("samples", id);
    return row!.value;
  },
});
