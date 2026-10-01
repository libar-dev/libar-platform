import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";
export const addInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.insert("notes", { source: "internal" });
    return null;
  },
});
