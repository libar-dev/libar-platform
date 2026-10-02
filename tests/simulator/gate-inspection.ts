import { internalQueryGeneric } from "convex/server";

// Registered only in convex-test's depot module map, to inspect rollback at the journal boundary.
export const stored = internalQueryGeneric({
  args: {},
  handler: async (ctx) => ({
    events: await ctx.db.query("events").collect(),
    streams: await ctx.db.query("streams").collect(),
  }),
});
