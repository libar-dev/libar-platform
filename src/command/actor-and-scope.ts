// The shapes of spec:command.actor-and-scope that the parent establishes and passes into a context:
// the actor, the tenant scope, the namespace and a worker's authority. Validators and types only, so
// the context library can import the actor's validator without carrying the parent's helpers; those,
// authorize, establishActor and the grant helpers, are in authority.ts.
import { v } from "convex/values";
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
