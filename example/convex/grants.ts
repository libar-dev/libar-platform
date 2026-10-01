// The two grant mutations of the production composition, over the command library's plain helpers.
// They are internal: an operator runs them with admin access, which is how a tenant's first grant
// exists.
import { v } from "convex/values";
import {
  actorKindValidator,
  insertGrant,
  revokeGrant,
  subjectRefValidator,
} from "../../src/command/index.js";
import { internalMutation } from "./_generated/server.js";
const principal = {
  tenantId: v.string(),
  principalKind: actorKindValidator,
  principalId: v.string(),
  permission: v.string(),
  subject: v.optional(subjectRefValidator),
};
export const grant = internalMutation({
  args: { ...principal, grantedBy: v.string() },
  returns: v.id("grants"),
  handler: (ctx, args) => insertGrant(ctx, args),
});
// Returns the number of grant rows deleted.
export const revoke = internalMutation({
  args: principal,
  returns: v.number(),
  handler: (ctx, args) => revokeGrant(ctx, args),
});
