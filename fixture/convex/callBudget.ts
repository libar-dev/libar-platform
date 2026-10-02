import type { TransactionMetrics } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
export const empty = internalMutation({
  args: { index: v.number() },
  returns: v.number(),
  handler: (_, { index }) => index,
});
export const repeat = mutation({
  args: {
    path: v.union(v.literal("nested"), v.literal("component")),
    count: v.number(),
    write: v.boolean(),
  },
  returns: v.any(),
  handler: async (
    ctx,
    { path, count, write },
  ): Promise<{
    completed: number;
    before: TransactionMetrics;
    after: TransactionMetrics;
  }> => {
    const before = await ctx.meta.getTransactionMetrics();
    let completed = 0;
    try {
      for (let index = 0; index < count; index++) {
        const answer: number = await ctx.runMutation(
          path === "nested"
            ? internal.callBudget.empty
            : write
              ? components.annex.callBudget.write
              : components.annex.callBudget.empty,
          { index },
        );
        if (answer !== index) throw new Error("Call returned another index");
        completed++;
      }
    } catch (error) {
      throw new Error(`Completed ${completed} calls: ${String(error)}`);
    }
    return { completed, before, after: await ctx.meta.getTransactionMetrics() };
  },
});
export const compute = mutation({
  args: {},
  returns: v.number(),
  handler: () => {
    let sum = 0;
    for (let index = 0; index < 1e12; index++) sum += Math.sqrt(index);
    return sum;
  },
});
