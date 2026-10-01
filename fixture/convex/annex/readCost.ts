import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
export const seed = mutation({
  args: {},
  returns: v.id("samples"),
  handler: (ctx) => ctx.db.insert("samples", { value: 7 }),
});
export const readOne = query({
  args: { id: v.id("samples"), cacheBuster: v.number() },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    return await ctx.db.get("samples", id);
  },
});
