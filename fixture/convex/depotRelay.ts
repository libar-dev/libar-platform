// Internal mutations that pass their arguments to a depot operation unchanged. Only a caller with
// admin access reaches them, which a native test uses to show the depot deploys and commits.
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "../../src/command/actor-and-scope.js";
import { operationRefValidator } from "../../src/context/index.js";
import { components } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
type Operation = FunctionReference<
  "mutation",
  "internal",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  unknown
>;
function relay(operation: Operation) {
  return internalMutation({
    args: {
      tenantId: v.string(),
      actor: actorValidator,
      operation: operationRefValidator,
      // The depot validates the input against the operation's own schema.
      input: v.any(),
      facts: v.optional(v.record(v.string(), v.any())),
    },
    returns: v.any(),
    handler: (ctx, args) => ctx.runMutation(operation, args),
  });
}
const { operations } = components.depot;
export const createDocuments = relay(operations.createDocuments);
export const submitDocuments = relay(operations.submitDocuments);
export const shipDocuments = relay(operations.shipDocuments);
export const amendDocuments = relay(operations.amendDocuments);
export const failIfDecided = relay(operations.failIfDecided);
export const addStock = relay(operations.addStock);
export const claimStock = relay(operations.claimStock);
export const registerDocuments = relay(operations.registerDocuments);
export const copyTitles = relay(operations.copyTitles);
