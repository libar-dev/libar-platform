---
id: spec:command.actor-and-scope
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  constrainedBy:
    - spec:laws.law11-tenant-scope-named
    - spec:laws.law04-server-scoped-idempotency-key
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:facts.f13-transactions-have-limits
  decidedBy: spec:decisions.d11-tenant-scope-and-authority
---
# Actor, tenant scope, namespace and grants

Layer 1 · Detail: full · Traces: D11, D2, D6, D13, Law 11, F11, E-6, E-54.

This contract pins the shapes the parent establishes and passes into components: the `Actor` with its kind, identity and delegation reference, the `TenantScope`, the `CallerNamespace` and the `Authority` a worker runs under. It pins the `authorize` helper and the `grants` table. The event envelope's `actor` field, the receipts table's `namespace` field and the obligation record's `authority` field use these validators, so an actor and an authority are each defined once and referenced everywhere.

## Intent

- outcome: Pin `Actor`, `TenantScope`, `CallerNamespace`, `Authority`, the `authorize` signature and the `grants` table, as validators and types (D11, E-6)
- value: One authorization vocabulary covers humans, services, agents, reviewers and operators, and every component receives the same actor shape the envelope stores (D11, D2)
- risk: A finer scope than the tenant, such as a project or an organization inside a tenant, is not designed here; a product that needs one extends `TenantScope` and every index that reads it (Law 11, E-6)

### Open questions

- [non-blocking] Extension E-6: the doc names the actor kinds, the envelope's actor field and the worker's two modes; the field names, the namespace union, the grant fields and the `authorize` signature are the design's, and the grant's `permission` string vocabulary is per product; the worker's two modes are one `Authority` shape, `{ actor, scope, mode }` with the literals `recheckDelegator` and `serviceAuthority`, stored on the obligation record and never restated, where the delegation travels on the actor's own `onBehalfOf` and `delegationRef`; and the doc says a derived command carries a server namespace without naming it, so this design assigns `worker` to every command a reaction issues, which is the namespace Sc L1-7 refuses to a client and the one D6 lists among the receipted callers, and reserves `system` for the platform's own maintenance chains and operator operations that run a receipted command, such as a restore or a migration driver, so a `system` receipt is never a reaction's; the owner confirms both (E-6, E-54, D6, D11, D13, Sc L1-7)

## Contract

- An `Actor` is server-established and carries a kind, an identity and an optional delegation reference; the kinds are human, service, agent, reviewer and operator (D11, D2)
- A `TenantScope` names exactly one tenant; a scope with no tenant does not exist as a value (Law 11)
- A `CallerNamespace` is server-assigned from the closed union `public`, `service`, `worker`, `agent` and `system`; a derived command carries a server namespace and its causation (D6, D11, D13)
- [extension] The server namespace of a derived command is `worker`, assigned by the reaction wrapper's trusted call to the internal entry and refused to any client; `system` is reserved for the platform's own maintenance chains and operator operations that run a receipted command and is never a reaction's namespace, so the receipt key of a derived command is tenant, `worker`, command type and the obligation's effect key, as `spec:obligations.fan-out-and-chains` builds it (E-6, E-54, D6, D13, Law 4, Sc L1-7)
- An `Authority` is what a worker runs under: the server-established actor the attempt runs as, the tenant scope, and the mode that says whether the delegating user's current rights are rechecked before the body runs or an accepted obligation runs under a narrow service authority (D11, D13)
- [extension] The `Authority` shape is pinned once here and stored on the obligation record by `spec:obligations.record-contract`; in `recheckDelegator` mode the actor is the captured delegating user, whose `delegationRef` names the obligation and whose current grants `authorize` reads before every attempt, and in `serviceAuthority` mode the actor is a service actor whose `onBehalfOf` names the actor that made the promise and whose `delegationRef` names the obligation, with no recheck; no Spec defines a second worker shape (E-6, D11, D13, Law 5)
- A grant is a row in the parent's `grants` table naming tenant, principal kind, principal identity, permission and an optional subject; it is read in the transaction and never projected into a read model (D11, Law 9)
- `authorize` reads the grants for the actor in the tenant and answers allowed or denied with a reason; it never executes, discloses or caches (Law 5, D11)
- Components receive `tenantId`, `actor` and `operation`, the `OperationRef` of `spec:context.event-envelope`, as arguments on every call and read no `ctx.auth` (D11, F11)
- The `actorValidator` here is the one the event envelope stores in its `actor` field and the receipts table stores as `actorId`, so an actor is defined once (D2, D6)

## Design

- typeActorKind: `type ActorKind = "human" | "service" | "agent" | "reviewer" | "operator"` (D11)
- typeActorRef: `type ActorRef = { kind: ActorKind; id: string }` (D11, E-6)
- typeActor: `type Actor = { kind: ActorKind; id: string; issuer?: string; onBehalfOf?: ActorRef; delegationRef?: string }` where `delegationRef` names the obligation, approval or agent run the delegation rests on (D11, D2, E-6)
- validatorActorKind: `actorKindValidator = v.union(v.literal("human"), v.literal("service"), v.literal("agent"), v.literal("reviewer"), v.literal("operator"))` (D11)
- validatorActor: `actorValidator = v.object({ kind: actorKindValidator, id: v.string(), issuer: v.optional(v.string()), onBehalfOf: v.optional(v.object({ kind: actorKindValidator, id: v.string() })), delegationRef: v.optional(v.string()) })` (D11, D2, E-6)
- typeTenantScope: `type TenantScope = { tenantId: string }` (Law 11)
- validatorTenantScope: `tenantScopeValidator = v.object({ tenantId: v.string() })` (Law 11)
- typeCallerNamespace: `type CallerNamespace = "public" | "service" | "worker" | "agent" | "system"` (D6, D11, D13, E-6)
- validatorCallerNamespace: `callerNamespaceValidator = v.union(v.literal("public"), v.literal("service"), v.literal("worker"), v.literal("agent"), v.literal("system"))` (D6, E-6)
- typeAuthorityMode: `type AuthorityMode = "recheckDelegator" | "serviceAuthority"` (D11, D13, E-6)
- typeAuthority: `type Authority = { actor: Actor; scope: TenantScope; mode: AuthorityMode }` where `actor` is stored on every event the attempt writes and is the delegating user in `recheckDelegator` mode and a service actor with `onBehalfOf` and `delegationRef` set in `serviceAuthority` mode (D11, D13, E-6)
- validatorAuthority: `const authorityValidator = v.object({ actor: actorValidator, scope: tenantScopeValidator, mode: v.union(v.literal("recheckDelegator"), v.literal("serviceAuthority")) })` the one validator the obligation record's `authority` field uses (D11, D13, E-6)
- typeAuthorizeInput: `type AuthorizeInput = { tenantId: string; actor: Actor; permission: string; subject?: SubjectRef }` where `SubjectRef = { contextId: string; streamType: string; streamId: string }` (D11, E-6)
- typeAuthorizeDecision: `type AuthorizeDecision = { allowed: true; grantIds: Id<"grants">[] } | { allowed: false; reason: "no_grant" | "subject_mismatch" }` (D11, Law 5, E-6)
- fnAuthorize: `authorize(ctx: QueryCtx | MutationCtx, input: AuthorizeInput): Promise<AuthorizeDecision>` reads `by_principal` and matches `permission` and, when the grant names a subject, the subject (D11, Law 5)
- fnEstablishActor: `establishActor(ctx: MutationCtx | QueryCtx, serviceIssuers: ReadonlySet<string>): Promise<Actor | null>` returns `null` when `ctx.auth.getUserIdentity()` is `null`, a `service` actor when the identity's issuer is in `serviceIssuers`, and a `human` actor otherwise, with `id` from `tokenIdentifier` (D11, E-37)
- tableGrants: `grants: defineTable({ tenantId: v.string(), principalKind: actorKindValidator, principalId: v.string(), permission: v.string(), subject: v.optional(v.object({ contextId: v.string(), streamType: v.string(), streamId: v.string() })), grantedBy: v.string(), grantedAt: v.number() }).index("by_principal", ["tenantId", "principalKind", "principalId"]).index("by_permission", ["tenantId", "permission"])` (D11, Law 11, E-6)
- indexGrantsByPrincipal: `.index("by_principal", ["tenantId", "principalKind", "principalId"])` (D11)
- indexGrantsByPrincipalUse: the authorization read of every command and disclosing query, three equalities and `.take(limit + 1)` against the bound of `limitGrantsRead` (D11, Law 5)
- indexGrantsByPermission: `.index("by_permission", ["tenantId", "permission"])` (E-6)
- indexGrantsByPermissionUse: operator inspection of who holds a permission in a tenant; never on the command path (D19, E-6)
- accessContextOption: when grants need an audit journal, a dedicated access context owns them and `authorize` reads `ctx.runQuery(components.access.grants.forPrincipal, input)` inside the same transaction; the decision type is unchanged (D2, D11)
- limitGrantsRead: at most 500 grants per authorization read; the read takes 501 rows and throws a plain `Error`, a technical failure, when 501 come back, because `.take(n)` alone returns at most `n` rows and never shows whether more exist, so a 501st grant is surfaced and never silently truncated (F13, E-37)

## Verification — reviewed

- A reviewer confirms that `actorValidator` is the validator the event envelope and the receipts table reference, and that no other actor shape exists in the corpus.
- A reviewer confirms that `authorize` is the only code that reads `grants` on a command or disclosing path and that it caches nothing across transactions.
- A reviewer confirms that `authorityValidator` is the validator the obligation record's `authority` field references, that the wrapper, the claim and the fan-out rules read `authority.mode` with the two literals pinned here, and that no other worker or provenance shape exists in the corpus.
- A reviewer confirms that every receipt whose `namespace` is `worker` has a request key equal to an obligation's effect key, and that no reaction issues a command under `system`.
