import type { TransactionMetrics } from "convex/server";
import type { ReadResult } from "./probe/probe4.js";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server.js";
import { api, components } from "./_generated/api.js";
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
  handler: async (ctx, a) => {
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
const splitArgs = {
  component: v.boolean(),
  parent: v.number(),
  child: v.number(),
};
export const seedComponent = mutation({
  args: { group: v.string(), count: v.number(), size: v.number() },
  returns: v.null(),
  handler: (ctx, a) => ctx.runMutation(components.probe.probe4.seed, a),
});
export const parentRead = mutation({
  args: splitArgs,
  returns: v.any(),
  handler: async (
    ctx,
    a,
  ): Promise<{
    parentCount: number;
    before: TransactionMetrics;
    after: TransactionMetrics;
    child: ReadResult;
  }> => {
    const parent = await ctx.db
      .query("blobs")
      .withIndex("by_group", (q) => q.eq("group", "parent"))
      .take(a.parent);
    const before = await ctx.meta.getTransactionMetrics();
    const child = await ctx.runQuery(
      a.component ? components.probe.probe4.read : api.probe4.read,
      { group: "child", count: a.child },
    );
    const after = await ctx.meta.getTransactionMetrics();
    return { parentCount: parent.length, before, after, child };
  },
});
export const childAlone = query({
  args: { component: v.boolean(), count: v.number() },
  returns: v.any(),
  handler: (ctx, a): Promise<ReadResult> =>
    ctx.runQuery(a.component ? components.probe.probe4.read : api.probe4.read, {
      group: "child",
      count: a.count,
    }),
});
export const parentWrite = mutation({
  args: { ...splitArgs, size: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    for (let i = 0; i < a.parent; i++)
      await ctx.db.insert("blobs", {
        group: "written",
        bytes: new ArrayBuffer(a.size),
      });
    await ctx.runMutation(
      a.component ? components.probe.probe4.seed : api.probe4.seed,
      { group: "written", count: a.child, size: a.size },
    );
    return null;
  },
});
export const depth = mutation({
  args: { depth: v.number() },
  returns: v.null(),
  handler: async (ctx, { depth }): Promise<null> => {
    if (depth > 1)
      await ctx.runMutation(api.probe4.depth, { depth: depth - 1 });
    await ctx.db.insert("writes", { marker: `depth-${depth}` });
    return null;
  },
});

export const writtenCount = query({
  args: { component: v.boolean() },
  returns: v.number(),
  handler: async (ctx, { component }): Promise<number> => {
    const count = (
      await ctx.db
        .query("blobs")
        .withIndex("by_group", (q) => q.eq("group", "written"))
        .take(100)
    ).length;
    return component
      ? count + (await ctx.runQuery(components.probe.probe4.writtenCount, {}))
      : count;
  },
});
