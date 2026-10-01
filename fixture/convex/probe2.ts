import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { api, components } from "./_generated/api.js";
export const fail = mutation({
  args: { data: v.any(), ordinary: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { data, ordinary }) => {
    await ctx.db.insert("probe2Writes", { marker: "child" });
    if (ordinary) {
      const error = Object.assign(new Error("ordinary probe error"), {
        probeProperty: "present",
      });
      throw error;
    }
    throw new ConvexError(data);
  },
});
const parentArgs = {
  data: v.any(),
  ordinary: v.boolean(),
  component: v.boolean(),
};
export const catching = mutation({
  args: parentArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    let caught = null;
    try {
      await ctx.runMutation(
        args.component ? components.probe.probe2.fail : api.probe2.fail,
        { data: args.data, ordinary: args.ordinary },
      );
    } catch (error) {
      caught = {
        isConvexError: error instanceof ConvexError,
        data: error instanceof ConvexError ? error.data : null,
        message: String(error),
        property: (error as { probeProperty?: string }).probeProperty ?? null,
      };
    }
    await ctx.db.insert("probe2Writes", { marker: "parent" });
    return caught;
  },
});
export const passing = mutation({
  args: parentArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(
      args.component ? components.probe.probe2.fail : api.probe2.fail,
      { data: args.data, ordinary: args.ordinary },
    ),
});
