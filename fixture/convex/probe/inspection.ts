import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
export const write = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.insert("writes", { marker: "component" });
    return null;
  },
});
export const fail = mutation({
  args: {},
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "fixtureFailure",
      details: { expected: 2, current: 3 },
    });
  },
});
// An observation on one release, not a platform promise about component auth.
export const identity = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.auth.getUserIdentity(),
});
