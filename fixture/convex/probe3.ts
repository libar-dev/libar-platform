import { v } from "convex/values";
import { query, mutation } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { api, components } from "./_generated/api.js";
export const seed = mutation({
  args: {},
  returns: v.id("probe3Docs"),
  handler: (ctx) => ctx.db.insert("probe3Docs", { value: 7 }),
});
async function helper(ctx: QueryCtx, id: Id<"probe3Docs">) {
  return ctx.db.get("probe3Docs", id);
}
export const read = query({
  args: { id: v.id("probe3Docs"), nonce: v.number() },
  returns: v.any(),
  handler: (ctx, { id }) => helper(ctx, id),
});
const args = {
  id: v.id("probe3Docs"),
  componentId: v.string(),
  reads: v.number(),
  nonce: v.number(),
  path: v.union(
    v.literal("helper"),
    v.literal("nested"),
    v.literal("component"),
  ),
};
async function work(
  ctx: QueryCtx,
  a: {
    id: Id<"probe3Docs">;
    componentId: string;
    reads: number;
    nonce: number;
    path: "helper" | "nested" | "component";
  },
): Promise<null> {
  for (let i = 0; i < a.reads; i++) {
    if (a.path === "helper") await helper(ctx, a.id);
    else if (a.path === "nested")
      await ctx.runQuery(api.probe3.read, { id: a.id, nonce: a.nonce + i });
    else
      await ctx.runQuery(components.probe.probe3.read, {
        id: a.componentId,
        nonce: a.nonce + i,
      });
  }
  return null;
}
export const parentQuery = query({ args, returns: v.null(), handler: work });
export const parentMutation = mutation({
  args,
  returns: v.null(),
  handler: work,
});
export const seedComponent = mutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.runMutation(components.probe.probe3.seed, {}),
});
