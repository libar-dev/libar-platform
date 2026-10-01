import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const throwAfterWrite = mutation({
  args: {
    kind: v.union(v.literal("convexError"), v.literal("plainError")),
    data: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, { kind, data }) => {
    await ctx.db.insert("throwerWrites", { by: "thrower" });
    if (kind === "plainError")
      throw Object.assign(new Error("plain failure"), {
        addedProperty: "present",
      });
    throw new ConvexError(data);
  },
});
