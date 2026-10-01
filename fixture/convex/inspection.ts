import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
export const identity = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.auth.getUserIdentity(),
});
export const componentIdentity = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.runQuery(components.probe.inspection.identity, {}),
});
export const writeInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.insert("writes", { marker: "internal" });
    return null;
  },
});
export const failInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "fixtureFailure",
      details: { expected: 2, current: 3 },
    });
  },
});
export const catchFailure = mutation({
  args: { boundary: v.union(v.literal("nested"), v.literal("component")) },
  returns: v.any(),
  handler: async (ctx, { boundary }) => {
    try {
      await ctx.runMutation(
        boundary === "nested"
          ? internal.inspection.failInternal
          : components.probe.inspection.fail,
        {},
      );
    } catch (error) {
      return {
        isConvexError: error instanceof ConvexError,
        data: error instanceof ConvexError ? error.data : null,
        message: String(error),
      };
    }
    return null;
  },
});
