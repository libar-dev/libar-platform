// Deployed only in the hosted driver's temporary copy of the fixture composition, as the parent's
// module planting, and in the local example that a table's documents survive another
// composition's deploy. No composition ships it.
import {
  internalMutationGeneric as mutation,
  makeFunctionReference,
} from "convex/server";
import type { GenericId } from "convex/values";
import { v } from "convex/values";
const reaction = makeFunctionReference<"mutation">("planting:react");
const terminal = ["success", "failed", "canceled"];
// What each planted schedule runs: it succeeds, or fails when it is told to.
export const react = mutation({
  args: { fail: v.boolean() },
  handler: (_ctx, { fail }) => {
    if (fail) throw new Error("planted to fail");
    return null;
  },
});
// Plants one schedule that succeeds, one that fails and one that is canceled, and writes a
// planting record for each, naming the run that planted it.
export const plant = mutation({
  args: { startedAt: v.string() },
  handler: async (ctx, { startedAt }) => {
    const success = await ctx.scheduler.runAfter(0, reaction, { fail: false });
    const failed = await ctx.scheduler.runAfter(0, reaction, { fail: true });
    const canceled = await ctx.scheduler.runAfter(3600000, reaction, {
      fail: false,
    });
    await ctx.scheduler.cancel(canceled);
    const planted = { success, failed, canceled };
    for (const [kind, scheduledId] of Object.entries(planted))
      await ctx.db.insert("plantedSchedules", {
        scheduledId,
        planted: kind,
        startedAt,
        state: null,
        completedTime: null,
        imports: 0,
      });
    return planted;
  },
});
// Copies into each planting record of a run the state and completedTime its schedule shows once
// the schedule is terminal, so that a later run knows the schedule's age after its row is gone.
// Answers whether every record of the run is settled.
export const settle = mutation({
  args: { startedAt: v.string() },
  handler: async (ctx, { startedAt }) => {
    let settled = true;
    for (const record of await ctx.db.query("plantedSchedules").collect()) {
      if (record.startedAt !== startedAt || record.completedTime !== null)
        continue;
      const scheduled = await ctx.db.system.get(
        record.scheduledId as GenericId<"_scheduled_functions">,
      );
      const kind = scheduled?.state.kind;
      if (
        scheduled === null ||
        scheduled.completedTime === undefined ||
        kind === undefined ||
        !terminal.includes(kind)
      ) {
        settled = false;
        continue;
      }
      await ctx.db.patch("plantedSchedules", record._id, {
        state: kind,
        completedTime: scheduled.completedTime,
      });
    }
    return settled;
  },
});
// Counts one backup archive import in every planting record the import restored.
export const countImport = mutation({
  args: {},
  handler: async (ctx) => {
    for (const record of await ctx.db.query("plantedSchedules").collect())
      await ctx.db.patch("plantedSchedules", record._id, {
        imports: Number(record.imports) + 1,
      });
    return null;
  },
});
