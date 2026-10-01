import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
export const seed = mutation({
  args: {},
  returns: v.id("samples"),
  handler: (ctx) => ctx.db.insert("samples", { value: 7 }),
});
export const readOne = query({
  args: { id: v.id("samples"), call: v.number() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.get("samples", id);
    return null;
  },
});
