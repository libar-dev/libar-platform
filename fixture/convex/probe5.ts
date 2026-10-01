import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server.js";
import { components } from "./_generated/api.js";
export const page = query({
  args: {
    paginationOpts: paginationOptsValidator,
    maximumRowsRead: v.optional(v.number()),
  },
  returns: v.any(),
  handler: (ctx, a) =>
    ctx.runQuery(components.probe.probe5.page, {
      paginationOpts: {
        ...a.paginationOpts,
        ...(a.maximumRowsRead === undefined
          ? {}
          : { maximumRowsRead: a.maximumRowsRead }),
      },
    }),
});
export const write = mutation({
  args: {
    rows: v.array(v.object({ position: v.number(), value: v.string() })),
  },
  returns: v.null(),
  handler: (ctx, a) => ctx.runMutation(components.probe.probe5.write, a),
});
export const remove = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: (ctx, a) => ctx.runMutation(components.probe.probe5.remove, a),
});
export const change = mutation({
  args: { id: v.string(), value: v.string() },
  returns: v.null(),
  handler: (ctx, a) => ctx.runMutation(components.probe.probe5.change, a),
});
export const first = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.runQuery(components.probe.probe5.first, {}),
});
