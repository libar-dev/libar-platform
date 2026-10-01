import type { TransactionMetrics } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
export const insertBlobs = mutation({
  args: { group: v.string(), count: v.number(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, { group, count, size }) => {
    for (let i = 0; i < count; i++) {
      const blob = await ctx.db.insert("blobs", {
        group,
        bytes: new ArrayBuffer(size),
      });
      await ctx.db.insert("blobCounts", { group, blob });
    }
    return null;
  },
});
export const readBlobs = query({
  args: { group: v.string(), count: v.number() },
  returns: v.any(),
  handler: async (
    ctx,
    { group, count },
  ): Promise<{
    documents: number;
    payloadBytes: number;
    before: TransactionMetrics;
    after: TransactionMetrics;
  }> => {
    const before = await ctx.meta.getTransactionMetrics();
    const documents = await ctx.db
      .query("blobs")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(count);
    const after = await ctx.meta.getTransactionMetrics();
    return {
      documents: documents.length,
      payloadBytes: documents.reduce((sum, d) => sum + d.bytes.byteLength, 0),
      before,
      after,
    };
  },
});
export const countBlobs = query({
  args: { group: v.string() },
  returns: v.number(),
  handler: async (ctx, { group }) => {
    let count = 0;
    for await (const row of ctx.db
      .query("blobCounts")
      .withIndex("by_group", (q) => q.eq("group", group))) {
      void row;
      count++;
    }
    return count;
  },
});
