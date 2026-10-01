import type { TransactionMetrics } from "convex/server";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api.js";
import { internalQuery, mutation, query } from "./_generated/server.js";
export interface BlobRead {
  documents: number;
  payloadBytes: number;
  before: TransactionMetrics;
  after: TransactionMetrics;
}
export interface ReadThenCall {
  parentDocuments: number;
  before: TransactionMetrics;
  after: TransactionMetrics;
  child: BlobRead;
}
const boundary = v.union(v.literal("nested"), v.literal("annex"));
const blobs = { group: v.string(), count: v.number(), size: v.number() };
export const insertBlobs = mutation({
  args: blobs,
  returns: v.null(),
  handler: async (ctx, { group, count, size }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("blobs", {
        group,
        bytes: new ArrayBuffer(size),
      });
    }
    return null;
  },
});
export const insertAnnexBlobs = mutation({
  args: blobs,
  returns: v.null(),
  handler: (ctx, a): Promise<null> =>
    ctx.runMutation(components.annex.limits.insertBlobs, a),
});
export const readBlobs = internalQuery({
  args: { group: v.string(), count: v.number() },
  returns: v.any(),
  handler: async (ctx, { group, count }): Promise<BlobRead> => {
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
export const childAlone = query({
  args: { through: boundary, count: v.number() },
  returns: v.any(),
  handler: (ctx, { through, count }): Promise<BlobRead> =>
    ctx.runQuery(
      through === "nested"
        ? internal.limits.readBlobs
        : components.annex.limits.readBlobs,
      { group: "child", count },
    ),
});
export const readThenCall = mutation({
  args: { through: boundary, parentCount: v.number(), childCount: v.number() },
  returns: v.any(),
  handler: async (ctx, a): Promise<ReadThenCall> => {
    const own = await ctx.db
      .query("blobs")
      .withIndex("by_group", (q) => q.eq("group", "parent"))
      .take(a.parentCount);
    const before = await ctx.meta.getTransactionMetrics();
    const child: BlobRead = await ctx.runQuery(
      a.through === "nested"
        ? internal.limits.readBlobs
        : components.annex.limits.readBlobs,
      { group: "child", count: a.childCount },
    );
    const after = await ctx.meta.getTransactionMetrics();
    return { parentDocuments: own.length, before, after, child };
  },
});
export const writeThenCall = mutation({
  args: {
    through: boundary,
    group: v.string(),
    parentCount: v.number(),
    childCount: v.number(),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a): Promise<null> => {
    for (let i = 0; i < a.parentCount; i++) {
      await ctx.db.insert("blobs", {
        group: a.group,
        bytes: new ArrayBuffer(a.size),
      });
    }
    await ctx.runMutation(
      a.through === "nested"
        ? api.limits.insertBlobs
        : components.annex.limits.insertBlobs,
      { group: a.group, count: a.childCount, size: a.size },
    );
    return null;
  },
});
export const recurse = mutation({
  args: { label: v.string(), stack: v.number() },
  returns: v.number(),
  handler: async (ctx, { label, stack }): Promise<number> => {
    await ctx.db.insert("depthRows", { trial: label });
    return stack <= 1
      ? 1
      : 1 +
          (await ctx.runMutation(api.limits.recurse, {
            label,
            stack: stack - 1,
          }));
  },
});
