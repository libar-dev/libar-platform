// The four operator entries of spec:application.write-pause, registered here and re-exported by a
// composition's gate module, so they are reached as internal.gate.closeGate and so on. Each follows the
// operator entry contract of spec:command.actor-and-scope: an internal function, so only admin access
// reaches it, that reads no grant and no ctx.auth; the two that change the gate check the stated
// operator first and record it. An operator entry closes and resumes only "all" or a tenant scope; a
// source scope is closed and reopened by the rebuild alone. Every refusal is a plain Error.
import {
  internalMutationGeneric,
  internalQueryGeneric,
  paginationOptsValidator,
  paginationResultValidator,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import { v } from "convex/values";
import { operatorAuditDoc } from "../audit/tables.js";
import {
  assertOperator,
  operatorValidator,
} from "../command/actor-and-scope.js";
import { limitIdLength, utf8Length } from "../context/text.js";
import {
  closeScope,
  limitGateReasonBytes,
  resumeScope,
  restoreDoorClosed,
} from "./gate.js";
import { closedEntryValidator, type GateChangeDataModel } from "./tables.js";
// The builders a composition's generated server exports are these, typed with its data model. The
// library types them with the tables it owns, which the composition's schema holds.
const internalMutation: MutationBuilder<GateChangeDataModel, "internal"> =
  internalMutationGeneric;
const internalQuery: QueryBuilder<GateChangeDataModel, "internal"> =
  internalQueryGeneric;
// At most 100 audit records a page.
export const limitOperatorQuery = 100;
// "all", or "tenant:" followed by a tenant ID of 1 to limitIdLength bytes. The tenant list is not read,
// so a tenant may be closed before its first grant.
function assertOperatorScope(entry: string, scopeKey: string) {
  const tenant = scopeKey.startsWith("tenant:")
    ? utf8Length(scopeKey.slice("tenant:".length))
    : 0;
  if (scopeKey !== "all" && (tenant < 1 || tenant > limitIdLength))
    throw new Error(
      `${entry} takes the scope all or a tenant scope, and ${scopeKey} is neither`,
    );
}
export const closeGate = internalMutation({
  args: {
    scopeKey: v.string(),
    reason: v.string(),
    operator: operatorValidator,
  },
  returns: v.null(),
  handler: async (ctx, { scopeKey, reason, operator }) => {
    assertOperator(operator);
    assertOperatorScope("closeGate", scopeKey);
    const bytes = utf8Length(reason);
    if (bytes < 1 || bytes > limitGateReasonBytes)
      throw new Error(
        `The reason must be between 1 and ${limitGateReasonBytes} bytes`,
      );
    await closeScope(ctx, scopeKey, reason, operator);
    return null;
  },
});
export const resumeGate = internalMutation({
  args: { scopeKey: v.string(), operator: operatorValidator },
  returns: v.null(),
  handler: async (ctx, { scopeKey, operator }) => {
    assertOperator(operator);
    assertOperatorScope("resumeGate", scopeKey);
    await resumeScope(ctx, scopeKey, operator);
    return null;
  },
});
// Reads only, so it takes no operator.
export const getGate = internalQuery({
  args: {},
  returns: v.object({
    restore: v.boolean(),
    closed: v.array(closedEntryValidator),
  }),
  handler: async (ctx) => {
    const gate = await ctx.db
      .query("maintenanceGates")
      .withIndex("by_key", (q) => q.eq("key", "gates"))
      .unique();
    return { restore: restoreDoorClosed(), closed: gate?.closed ?? [] };
  },
});
// Who closed and who reopened one scope, newest first; a page asking for more than 100 gets 100.
export const getGateAudit = internalQuery({
  args: { scopeKey: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(operatorAuditDoc),
  handler: async (ctx, { scopeKey, paginationOpts }) =>
    ctx.db
      .query("operatorAudit")
      .withIndex("by_scope", (q) => q.eq("scopeKey", scopeKey))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, limitOperatorQuery),
      }),
});
