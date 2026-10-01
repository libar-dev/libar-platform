// The actor and namespace shapes of spec:command.actor-and-scope that the parent passes into a context.
// The rest of that Spec, the tenant scope, the authority, authorize and the grants, is added by the
// command family's own build.
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
export type CallerNamespace =
  "public" | "service" | "worker" | "agent" | "system";
export const callerNamespaceValidator = v.union(
  v.literal("public"),
  v.literal("service"),
  v.literal("worker"),
  v.literal("agent"),
  v.literal("system"),
);
