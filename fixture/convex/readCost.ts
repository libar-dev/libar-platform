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
  args: { id: v.id("samples"), call: v.number() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await readSample(ctx, id);
    return null;
  },
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
  nonce: v.number(),
};
async function readRepeatedly(
  ctx: QueryCtx,
  a: {
    path: "helper" | "nested" | "component";
    reads: number;
    own: Id<"samples">;
    annex: string;
    nonce: number;
  },
): Promise<null> {
  for (let call = 0; call < a.reads; call++) {
    if (a.path === "helper") await readSample(ctx, a.own);
    else if (a.path === "nested")
      await ctx.runQuery(internal.readCost.readOne, {
        id: a.own,
        call: a.nonce + call,
      });
    else
      await ctx.runQuery(components.annex.readCost.readOne, {
        id: a.annex,
        call: a.nonce + call,
      });
  }
  return null;
}
export const viaMutation = mutation({
  args: parentArgs,
  returns: v.null(),
  handler: readRepeatedly,
});
export const viaQuery = query({
  args: parentArgs,
  returns: v.null(),
  handler: readRepeatedly,
});
