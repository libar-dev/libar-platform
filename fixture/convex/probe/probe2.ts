import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const fail = mutation({
  args: { data: v.any(), ordinary: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { data, ordinary }) => {
    await ctx.db.insert("probe2Writes", { marker: "child" });
    if (ordinary) {
      const error = Object.assign(new Error("ordinary probe error"), {
        probeProperty: "present",
      });
      throw error;
    }
    throw new ConvexError(data);
  },
});
