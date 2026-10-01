import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const add = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.insert("notes", { source: "annex" });
    return null;
  },
});
