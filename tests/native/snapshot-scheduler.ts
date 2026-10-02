import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../../fixture/convex/_generated/api.js";
import { internalMutation } from "../../fixture/convex/_generated/server.js";

// Deployed only in a temporary copy of the fixture composition by the snapshot test.
export const schedule = internalMutation({
  args: {},
  returns: v.array(v.id("_scheduled_functions")),
  handler: async (ctx) => [
    await ctx.scheduler.runAfter(
      3600000,
      makeFunctionReference<"mutation">("markers:insert"),
      { trial: "scheduled-later" },
    ),
    await ctx.scheduler.runAfter(0, internal.notes.addInternal, {}),
    await ctx.scheduler.runAfter(0, internal.failures.throwAfterWrite, {
      kind: "plainError",
      data: "scheduled-failure",
    }),
  ],
});
