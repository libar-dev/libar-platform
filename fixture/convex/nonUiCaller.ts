// A non-UI caller for native tests: a fixture action an ordinary client calls, which runs a command's
// internal entry through ctx.runMutation as a worker, a service or an agent runner would. No caller
// under test carries the admin key, so this is how a test reaches an internal entry. The actor's ID is
// the caller's own token identifier, so the grants a test gives that caller apply.
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  actorKindValidator,
  callerNamespaceValidator,
} from "../../src/command/index.js";
import { causedByValidator } from "../../src/context/index.js";
import { internal } from "./_generated/api.js";
import { action } from "./_generated/server.js";
const entries: Record<string, FunctionReference<"mutation", "internal">> = {
  createDocument: internal.depotCommands.createDocumentInternal,
  submitDocument: internal.depotCommands.submitDocumentInternal,
  shipDocument: internal.depotCommands.shipDocumentInternal,
  amendDocument: internal.depotCommands.amendDocumentInternal,
  failIfDecided: internal.depotCommands.failIfDecidedInternal,
  registerDocument: internal.depotCommands.registerDocumentInternal,
  addStock: internal.depotCommands.addStockInternal,
  claimStock: internal.depotCommands.claimStockInternal,
};
export const send = action({
  args: {
    command: v.string(),
    tenantId: v.string(),
    namespace: callerNamespaceValidator,
    actorKind: actorKindValidator,
    requestKey: v.string(),
    correlationId: v.optional(v.string()),
    causedBy: v.optional(causedByValidator),
    // The internal entry validates the input against its command's schema.
    input: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, { command, actorKind, ...call }): Promise<unknown> => {
    const entry = Object.hasOwn(entries, command)
      ? entries[command]
      : undefined;
    if (entry === undefined) throw new Error(`No fixture command ${command}`);
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null)
      throw new Error("The non-UI caller needs an authenticated client");
    return ctx.runMutation(entry, {
      ...call,
      actor: {
        kind: actorKind,
        id: identity.tokenIdentifier,
        issuer: identity.issuer,
      },
    });
  },
});
