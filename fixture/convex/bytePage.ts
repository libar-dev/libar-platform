import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";
export const read = query({
  args: { maximumBytesRead: v.number() },
  returns: v.any(),
  handler: (ctx, args): Promise<unknown> =>
    ctx.runQuery(components.annex.bytePage.read, args),
});
