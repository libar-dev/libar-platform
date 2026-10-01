import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { internalQuery, mutation, query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
function readSample(ctx: QueryCtx, id: Id<"samples">) {
  return ctx.db.get("samples", id);
}
export const seed = mutation({
  args: {},
  returns: v.object({ own: v.id("samples"), annex: v.string() }),
  handler: async (ctx): Promise<{ own: Id<"samples">; annex: string }> => ({
    own: await ctx.db.insert("samples", { value: 7 }),
    annex: await ctx.runMutation(components.annex.readCost.seed, {}),
  }),
});
export const readOne = internalQuery({
  args: { id: v.id("samples"), cacheBuster: v.number() },
  returns: v.any(),
  handler: (ctx, { id }) => readSample(ctx, id),
});
const parentArgs = {
  path: v.union(
    v.literal("helper"),
    v.literal("nested"),
    v.literal("component"),
  ),
  reads: v.number(),
  own: v.id("samples"),
  annex: v.string(),
  cacheBuster: v.number(),
};
// The count of reads comes from the transaction's own metrics, not from the loop. The backend
// counts every document read by this function and by the queries it calls, in the app or in the
// component, so a path that skipped a read would report fewer.
async function documentsRead(ctx: QueryCtx): Promise<number> {
  return (await ctx.meta.getTransactionMetrics()).documentsRead.used;
}
async function readRepeatedly(
  ctx: QueryCtx,
  a: {
    path: "helper" | "nested" | "component";
    reads: number;
    own: Id<"samples">;
    annex: string;
    cacheBuster: number;
  },
): Promise<{ documentsRead: number; id: string }> {
  const id = a.path === "component" ? a.annex : a.own;
  const before = await documentsRead(ctx);
  for (let call = 0; call < a.reads; call++) {
    let document: { _id: string; value: number } | null;
    if (a.path === "helper") document = await readSample(ctx, a.own);
    else if (a.path === "nested")
      document = await ctx.runQuery(internal.readCost.readOne, {
        id: a.own,
        cacheBuster: a.cacheBuster + call,
      });
    else
      document = await ctx.runQuery(components.annex.readCost.readOne, {
        id: a.annex,
        cacheBuster: a.cacheBuster + call,
      });
    if (document === null || document._id !== id || document.value !== 7)
      throw new Error("The read path did not return the seeded document");
  }
  return { documentsRead: (await documentsRead(ctx)) - before, id };
}
const readResult = v.object({ documentsRead: v.number(), id: v.string() });
export const viaMutation = mutation({
  args: parentArgs,
  returns: readResult,
  handler: readRepeatedly,
});
export const viaQuery = query({
  args: parentArgs,
  returns: readResult,
  handler: readRepeatedly,
});
