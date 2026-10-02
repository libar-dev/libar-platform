// One mutation that writes and reads known numbers of documents in the parent and through the annex,
// so a test can compare its completion record's usageStats with what it did.
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
export const throughAnnex = mutation({
  args: {
    parentWrites: v.number(),
    annexWrites: v.number(),
    annexReads: v.number(),
    // A document of the annex's samples table, from readCost:seed.
    annexSample: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a): Promise<null> => {
    for (let i = 0; i < a.parentWrites; i++)
      await ctx.db.insert("parentRows", { position: i, label: "parent" });
    if (a.annexWrites > 0)
      await ctx.runMutation(components.annex.list.insert, {
        rows: Array.from({ length: a.annexWrites }, (_, i) => ({
          position: i,
          label: "annex",
        })),
      });
    for (let i = 0; i < a.annexReads; i++) {
      const sample = await ctx.runQuery(components.annex.readCost.readOne, {
        id: a.annexSample,
        cacheBuster: i,
      });
      if (sample === null) throw new Error("The annex sample is missing");
    }
    return null;
  },
});
