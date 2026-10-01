import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const marker = mutation({
  args: { trial: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("markers", args);
    return null;
  },
});
