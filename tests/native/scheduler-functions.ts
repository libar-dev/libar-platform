import {
  internalMutationGeneric as mutation,
  internalQueryGeneric as query,
  internalActionGeneric as action,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
const mutationRef = (name: string) =>
  makeFunctionReference<"mutation">(`scheduling:${name}`);
export const reaction = mutation({
  args: { label: v.string(), fail: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.fail) throw new Error(`reaction refused: ${args.label}`);
    const data = await ctx.db.query("schedulerData").first();
    await ctx.db.insert("schedulerEffects", {
      label: args.label,
      value: data?.value ?? "absent",
    });
  },
});
export const held = action({
  args: { label: v.string() },
  handler: async (ctx) => {
    while (
      await ctx.runQuery(
        makeFunctionReference<"query">("scheduling:isHeld"),
        {},
      )
    )
      await new Promise((resolve) => setTimeout(resolve, 200));
    return null;
  },
});
export const isHeld = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("schedulerData").first())?.held === true,
});
export const states = mutation({
  args: { label: v.string(), due: v.number() },
  handler: async (ctx, { label, due }) => {
    const pending = await ctx.scheduler.runAt(due, mutationRef("reaction"), {
      label,
    });
    await ctx.db.insert("schedulerReferences", { dispatchId: pending, label });
    await ctx.scheduler.runAfter(0, mutationRef("reaction"), {
      label: `${label}-success`,
    });
    await ctx.scheduler.runAfter(0, mutationRef("reaction"), {
      label: `${label}-failed`,
      fail: true,
    });
    const canceled = await ctx.scheduler.runAfter(
      3600000,
      mutationRef("reaction"),
      { label: `${label}-canceled` },
    );
    await ctx.scheduler.cancel(canceled);
    await ctx.scheduler.runAfter(
      0,
      makeFunctionReference<"action">("scheduling:held"),
      { label },
    );
    return pending;
  },
});
export const reference = mutation({
  args: { id: v.id("_scheduled_functions"), cancel: v.boolean() },
  handler: async (ctx, { id, cancel }) => {
    await ctx.db.insert("schedulerReferences", {
      dispatchId: id,
      label: "copied",
    });
    const row = await ctx.db.system.get(id);
    if (cancel) await ctx.scheduler.cancel(id);
    return row;
  },
});
// A scheduled run of a function other than reaction that fails, which the failed-reaction scans leave out.
export const refused = mutation({
  args: {},
  handler: () => {
    throw new Error("refused: a function other than reaction");
  },
});
export const scheduleRefused = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, mutationRef("refused"), {});
  },
});
export const consume = mutation({
  args: { payload: v.any() },
  handler: () => null,
});
export const argumentsLimit = mutation({
  args: {
    size: v.number(),
    count: v.number(),
    character: v.string(),
    parts: v.number(),
    trim: v.optional(v.number()),
  },
  handler: async (ctx, { size, count, character, parts, trim = 0 }) => {
    const value = character.repeat(size);
    const payload =
      parts === 1
        ? value
        : Array.from({ length: parts }, (_, i) =>
            i === parts - 1 ? value.slice(0, value.length - trim) : value,
          );
    let returned = 0;
    try {
      for (; returned < count; returned++)
        await ctx.scheduler.runAfter(3600000, mutationRef("consume"), {
          payload,
        });
      return {
        returned,
        error: null,
        metrics: await ctx.meta.getTransactionMetrics(),
      };
    } catch (error) {
      return {
        returned,
        error: String(error),
        metrics: await ctx.meta.getTransactionMetrics(),
      };
    }
  },
});
export const populate = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++)
      await ctx.scheduler.runAfter(
        3600000,
        mutationRef(i % 2 ? "consume" : "reaction"),
        i % 2 ? { payload: "unrelated" } : { label: "unrelated" },
      );
  },
});
export const scan = query({
  args: {},
  handler: async (ctx) => {
    const before = await ctx.meta.getTransactionMetrics();
    const rows = await ctx.db.system
      .query("_scheduled_functions")
      .filter((q) =>
        q.and(
          q.eq(q.field("name"), "scheduling.js:reaction"),
          q.eq(q.field("state.kind"), "failed"),
        ),
      )
      .collect();
    return { rows, before, after: await ctx.meta.getTransactionMetrics() };
  },
});

export const scanPlain = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db.system
      .query("_scheduled_functions")
      .filter((q) =>
        q.and(
          q.eq(q.field("name"), "scheduling.js:reaction"),
          q.eq(q.field("state.kind"), "failed"),
        ),
      )
      .collect(),
});
