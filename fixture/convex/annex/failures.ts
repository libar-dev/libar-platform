import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
export const throwAfterWrite = mutation({
  args: {
    kind: v.union(v.literal("convexError"), v.literal("plainError")),
    data: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, { kind, data }) => {
    const before = await ctx.meta.getTransactionMetrics();
    await ctx.db.insert("throwerWrites", { by: "thrower" });
    const after = await ctx.meta.getTransactionMetrics();
    const rows = await ctx.db
      .query("throwerWrites")
      .withIndex("by_by", (q) => q.eq("by", "thrower"))
      .take(2);
    // This guard runs inside the transaction, before the throw rolls the row back.
    if (after.documentsWritten.used - before.documentsWritten.used !== 1 || rows.length !== 1)
      throw new Error("The thrower did not write exactly one row before throwing");
    if (kind === "plainError")
      throw Object.assign(new Error(`plain failure: ${String(data)}`), {
        addedProperty: "present",
      });
    throw new ConvexError(data);
  },
});
