import type { Id } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
export const receive = internalMutation({
  args: {},
  returns: v.null(),
  handler: () => null,
});
export const schedule = mutation({
  args: {},
  returns: v.id("_scheduled_functions"),
  handler: (ctx): Promise<Id<"_scheduled_functions">> =>
    ctx.scheduler.runAfter(3600000, internal.scheduledRows.receive, {}),
});
