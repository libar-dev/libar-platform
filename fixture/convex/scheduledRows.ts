import { v } from "convex/values";
import { internal, components } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
export const receive = internalMutation({
  args: {},
  returns: v.null(),
  handler: () => null,
});
export const schedule = mutation({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<unknown> => ({
    parent: await ctx.scheduler.runAfter(
      3600000,
      internal.scheduledRows.receive,
      {},
    ),
    component: await ctx.runMutation(
      components.annex.scheduledRows.schedule,
      {},
    ),
  }),
});
