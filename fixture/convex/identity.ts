import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";
export const caller = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.auth.getUserIdentity(),
});
export const callerSeenByAnnex = query({
  args: {},
  returns: v.any(),
  handler: (ctx): Promise<unknown> =>
    ctx.runQuery(components.annex.identity.caller, {}),
});
