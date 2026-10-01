import type { TransactionMetrics } from "convex/server";
export interface ReadResult {
  before: TransactionMetrics;
  after: TransactionMetrics;
  count: number;
  payloadBytes: number;
}
import { v } from "convex/values";
import { query, mutation } from "./_generated/server.js";
export const seed = mutation({
  args: { group: v.string(), count: v.number(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    for (let i = 0; i < a.count; i++)
      await ctx.db.insert("blobs", {
        group: a.group,
        bytes: new ArrayBuffer(a.size),
      });
    return null;
  },
});
export const read = query({
  args: { group: v.string(), count: v.number() },
  returns: v.any(),
  handler: async (ctx, a): Promise<ReadResult> => {
    const before = await ctx.meta.getTransactionMetrics();
    const docs = await ctx.db
      .query("blobs")
      .withIndex("by_group", (q) => q.eq("group", a.group))
      .take(a.count);
    const after = await ctx.meta.getTransactionMetrics();
    return {
      before,
      after,
      count: docs.length,
      payloadBytes: docs.reduce((n, d) => n + d.bytes.byteLength, 0),
    };
  },
});

export const writtenCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("blobs")
        .withIndex("by_group", (q) => q.eq("group", "written"))
        .take(100)
    ).length,
});
