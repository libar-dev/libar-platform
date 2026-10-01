import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const insert = mutation({
  args: { trial: v.string() },
  returns: v.null(),
  handler: async (ctx, { trial }) => {
    await ctx.db.insert("markers", { trial });
    return null;
  },
});
