import { v } from "convex/values";
import { query, mutation } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
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
