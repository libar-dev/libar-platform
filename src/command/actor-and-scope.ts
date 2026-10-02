// The shapes of spec:command.actor-and-scope that the parent establishes and passes into a context:
// the actor, the tenant scope, the namespace and a worker's authority, and the operator an operator
// entry states. Validators, types and the operator's check only, so the context library can import the
// actor's validator without carrying the parent's helpers; those, authorize, establishActor and the
// grant helpers, are in authority.ts.
import { v } from "convex/values";
import { limitActorIdLength, utf8Length } from "../context/text.js";
export type ActorKind = "human" | "service" | "agent" | "reviewer" | "operator";
export type ActorRef = { kind: ActorKind; id: string };
// delegationRef names the obligation, approval or agent run the delegation rests on.
export type Actor = {
  kind: ActorKind;
  id: string;
  issuer?: string;
  onBehalfOf?: ActorRef;
  delegationRef?: string;
};
export const actorKindValidator = v.union(
  v.literal("human"),
  v.literal("service"),
  v.literal("agent"),
  v.literal("reviewer"),
  v.literal("operator"),
);
export const actorValidator = v.object({
  kind: actorKindValidator,
  id: v.string(),
  issuer: v.optional(v.string()),
  onBehalfOf: v.optional(
    v.object({ kind: actorKindValidator, id: v.string() }),
  ),
  delegationRef: v.optional(v.string()),
});
// A scope with no tenant does not exist as a value.
export type TenantScope = { tenantId: string };
export const tenantScopeValidator = v.object({ tenantId: v.string() });
export type CallerNamespace =
  "public" | "service" | "worker" | "agent" | "system";
export const callerNamespaceValidator = v.union(
  v.literal("public"),
  v.literal("service"),
  v.literal("worker"),
  v.literal("agent"),
  v.literal("system"),
);
// What a worker runs under. In recheckDelegator mode the actor is the captured delegating user; in
// serviceAuthority mode it is a service actor whose onBehalfOf and delegationRef are set.
export type AuthorityMode = "recheckDelegator" | "serviceAuthority";
export type Authority = {
  actor: Actor;
  scope: TenantScope;
  mode: AuthorityMode;
};
export const authorityValidator = v.object({
  actor: actorValidator,
  scope: tenantScopeValidator,
  mode: v.union(v.literal("recheckDelegator"), v.literal("serviceAuthority")),
});
export type SubjectRef = {
  contextId: string;
  streamType: string;
  streamId: string;
};
export const subjectRefValidator = v.object({
  contextId: v.string(),
  streamType: v.string(),
  streamId: v.string(),
});
export type AuthorizeInput = {
  tenantId: string;
  actor: Actor;
  permission: string;
  subject?: SubjectRef;
};
// The operator an operator entry that changes anything takes, and the type of every field that
// records it. A stated operator is what admin access chose to state and proves no identity.
export const operatorValidator = v.string();
// The bound limitCallText gives an actor's id.
export const limitOperatorBytes = limitActorIdLength;
// An operator entry calls this first, so a refused entry has read and written nothing. The operator is
// trimmed before both checks, so whitespace alone, of any length, is an empty operator; the argument is
// returned and recorded unchanged.
export function assertOperator(operator: string): string {
  const trimmed = operator.trim();
  if (trimmed === "")
    throw new Error("An operator entry needs a stated operator");
  const bytes = utf8Length(trimmed);
  if (bytes > limitOperatorBytes)
    throw new Error(
      `The stated operator is ${bytes} bytes, above the limit of ${limitOperatorBytes}`,
    );
  return operator;
}
