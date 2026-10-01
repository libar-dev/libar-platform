// defineOperation of spec:context.context-component: one registered public mutation per sanctioned
// operation, whose args every operation shares and whose return is the operation outcome.
import {
  mutationGeneric,
  type MutationBuilder,
  type RegisteredMutation,
} from "convex/server";
import { v, type PropertyValidators } from "convex/values";
import { actorValidator } from "../command/actor-and-scope.js";
import {
  runOperation,
  type OperationArgs,
  type OperationDeclaration,
  type OperationOutcome,
} from "./adapter.js";
import { operationRefValidator } from "./envelope.js";
import type { Journal } from "./journal.js";
import { operationOutcomeValidator } from "./outcome.js";
import type { ContextDataModel } from "./tables.js";
export const operationArgsValidators = <Input extends PropertyValidators>(
  input: Input,
) => ({
  tenantId: v.string(),
  actor: actorValidator,
  operation: operationRefValidator,
  input: v.object(input),
  facts: v.optional(v.record(v.string(), v.any())),
});
// A component's generated mutation builder is mutationGeneric typed with the component's data model.
// The library types it with the tables it owns, which every context component's schema holds.
const mutation: MutationBuilder<ContextDataModel, "public"> = mutationGeneric;
export function defineOperation<I, O>(
  journal: Journal,
  declaration: OperationDeclaration<I, O>,
): RegisteredMutation<"public", OperationArgs<I>, OperationOutcome<O>> {
  return mutation({
    args: operationArgsValidators(declaration.input),
    returns: operationOutcomeValidator(declaration.returns),
    handler: (ctx, args) =>
      runOperation(ctx, journal, declaration, args as OperationArgs<I>),
  });
}
