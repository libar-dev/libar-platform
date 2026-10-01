import { v } from "convex/values";
import { query } from "./_generated/server.js";
export const caller = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => ctx.auth.getUserIdentity(),
});
