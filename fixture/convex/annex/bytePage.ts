import {
  boundedPage,
  limitListPage,
  limitListBytes,
} from "../../../src/context/queries.js";
import { paginator } from "convex-helpers/server/pagination";
import { getConvexSize, v } from "convex/values";
import { query, mutation } from "./_generated/server.js";
import schema from "./schema.js";
export const read = query({
  args: { maximumBytesRead: v.number() },
  returns: v.any(),
  handler: async (ctx, { maximumBytesRead }) => {
    const before = await ctx.meta.getTransactionMetrics();
    const result = await paginator(ctx.db, schema)
      .query("rows")
      .withIndex("by_position")
      .paginate({ cursor: null, numItems: 10, maximumBytesRead });
    return { result, before, after: await ctx.meta.getTransactionMetrics() };
  },
});

export const bounded = query({
  args: { budgetBytes: v.number() },
  returns: v.any(),
  handler: async (ctx, { budgetBytes }) => {
    const before = await ctx.meta.getTransactionMetrics();
    const options = boundedPage(
      { cursor: null, numItems: 100, endCursor: "[]" },
      { items: limitListPage(budgetBytes), bytes: limitListBytes },
    );
    const result = await paginator(ctx.db, schema)
      .query("rows")
      .withIndex("by_position")
      .paginate(options);
    return {
      count: result.page.length,
      status: result.pageStatus,
      options,
      before,
      after: await ctx.meta.getTransactionMetrics(),
    };
  },
});
export const seed = mutation({
  args: { first: v.number(), count: v.number(), budgetBytes: v.number() },
  returns: v.null(),
  handler: async (ctx, { first, count, budgetBytes }) => {
    for (let position = first; position < first + count; position++) {
      const row = { position, label: "" };
      row.label = "x".repeat(budgetBytes - getConvexSize(row));
      await ctx.db.insert("rows", row);
    }
    return null;
  },
});
