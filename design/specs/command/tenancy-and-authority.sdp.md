---
id: spec:command.tenancy-and-authority
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  constrainedBy:
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:facts.f13-transactions-have-limits
  decidedBy:
    - spec:decisions.d11-tenant-scope-and-authority
    - spec:decisions.d06-idempotency-client-and-receipts
---
# Tenancy and authority

Layer 1 · Detail: full · Traces: D11, D6, D2, Law 5, Law 9, Law 11, F11, F13, Sc L1-6, Sc L1-7, Sc L1-8.

Every tenant-owned record, and every command and query on tenant data, names its tenant, even in a single-tenant deployment. The parent authenticates and authorizes, then passes a server-established actor and tenant scope into components, which by this design's rule read no `ctx.auth`. One authorization vocabulary covers humans, services, agents, reviewers and operators. Grants are authoritative data read inside the transaction. The trust boundary is one trusted deployment: component privacy and type brands stop unauthorized clients and accidental cross-module access, not a malicious administrator, and no parent-signed token claims to.

This Spec owns the rules of tenant scope, actor establishment, authorization and namespaces. The types, the `authorize` signature and the `grants` table are pinned in `spec:command.actor-and-scope`. The pipeline runs these rules at its steps 2 to 5.

## Intent

- actor: The parent deployment, on behalf of every caller it authenticates, and the worker, agent and operator code that runs under a captured or narrow authority (D11)
- problem: Two tenants use the same request key and local ID; a client claims a worker or agent namespace; authorization is revoked and a successful command is retried; without a tenant on every record, a server-assigned namespace and an authorization step before execution and disclosure, each of these collides, escalates or leaks (Sc L1-6, Sc L1-7, Sc L1-8)
- outcome: Every record, command and query names its tenant; the parent establishes the actor and namespace and authorizes from grants read in the transaction before execution and before disclosure; components receive actor and scope as arguments (D11, Law 5, Law 11)
- value: Tenancy is never retrofitted, one vocabulary covers every kind of actor, and a reviewer can find every authorization read in one helper (D11)
- risk: The standing cost is a `tenantId` on every record and in every function's arguments and index, a grants read in every command, and captured provenance on every worker (D11, Law 11)
- assumption: Components cannot read data not explicitly provided to them, and the documentation says they have no `ctx.auth`; the design does not rest on the second, because no component function reads `ctx.auth` (F11, D11)

### Open questions

- [non-blocking] Extension E-37: the doc says the parent authenticates and that grants are authoritative data, but not how an identity becomes an actor or how revocation takes effect; here the public entry and a parent query's `authorizeQuery` map `ctx.auth.getUserIdentity()` to a human actor, or a service actor when the issuer is a configured service issuer, grants live in a parent table by default and are revoked by deleting the row, with no cache, so a revoked grant fails the next command (E-37, D11)
- [non-blocking] Extension E-6: the doc names the actor kinds and the worker's two modes but not the types; the actor, scope, namespace, grant and `Authority` shapes are the design's and are pinned once in `spec:command.actor-and-scope`, which also rules that a derived command's namespace is `worker` (E-6, D11)
- [non-blocking] Extension E-37: the design takes grants as written by plain library helpers, `insertGrant` and `revokeGrant`, over which the application registers its own internal mutations, with a tenant's first grant created with admin access through the composition's own internal grant mutation, and later grants the same way or by whatever command the composition registers; the library registers no grant function and promises no recorded bootstrap, first-admin flow or invitation, which are an adopter's to build on the helpers (E-37, D11, Law 5)

## Behavior

- rule: Every tenant-owned record, and every command and query on tenant data, names its tenant, even in a single-tenant deployment (D11, Law 11)
- rule: An absent tenant is never a wildcard; a function whose `args` lack `tenantId` cannot touch tenant data, and an index on tenant data leads with `tenantId` (D11, Law 11)
- rule: The parent authenticates and authorizes, then passes a server-established actor and scope into components, whose functions read no `ctx.auth`, a rule of this design that a lint check enforces (D11, F11)
- rule: One authorization vocabulary covers humans, services, agents, reviewers and operators (D11)
- rule: Grants are authoritative data, read in the same transaction as the command they authorize, never a read model that updates later (D11, Law 9)
- rule: Authorization comes before execution and before any stored outcome is disclosed; a duplicate is disclosed only after the current call's authorization passed (Law 5, Sc L1-8)
- rule: A grant that authorizes the current call's input gives no authority over a receipt another call stored under the same request key; a call whose key is held by a receipt of other input under the declaration's contract version is answered `idempotencyConflict`, and a call whose key is held by a receipt under another contract version is answered `unsupportedContractVersion` whatever its input; each answer discloses nothing of the stored receipt except the one fact its code cannot hide, whether the receipt's contract version is the declaration's, as `spec:command.idempotency-and-receipts` pins (Law 5, D6, D11)
- rule: A worker carries captured provenance and states whether it re-checks the delegating user's current rights or runs an accepted obligation under a narrow service authority (D11)
- rule: The trust boundary is one trusted deployment; component privacy and type brands stop unauthorized clients and accidental cross-module access, not a malicious administrator, and no parent-signed token claims to (D11)
- rule: Namespaces are server-assigned; the public entry assigns `public`, the internal entry accepts a namespace only from trusted server code, and a public caller cannot choose a system namespace (D6, D11, Sc L1-7)
- rule: Receipt keys and local IDs are scoped by tenant, so two tenants with the same request key and local ID never collide and neither sees the other's outcome (D11, D6, Sc L1-6)
- rule: A reference that crosses a context boundary is `(tenantId, contextId, eventId)` or an application ID, never a private document ID, so no ID leaks a tenant's row (D2)
- rule: [extension] A composition's grant and revoke mutations are writers the maintenance gate holds: the grant helpers read the gate for the whole deployment and the grant's tenant before they write, so a closed tenant, a closed deployment or the restore door refuses them with the transient `writePaused` of `spec:application.write-pause` and nothing is stored, the tenant row of a first grant included (E-37, E-49, E-8, D11)
- rule: [extension] The public entry derives the actor from the authenticated identity's `tokenIdentifier`, `subject` and `issuer`; a revoked grant fails the next command because grants are read fresh in every transaction (E-37)
- flow: The public entry reads `ctx.auth.getUserIdentity()` once; `null` throws rejection `unauthenticated`; an identity becomes an actor of kind `human`, or `service` when its issuer is configured as a service issuer (D11, E-37)
- flow: The internal entry receives `actor` and `namespace` from its trusted caller, an HTTP action, a worker, a workflow step or an agent runner, which established them from its own provenance (D11, D13)
- flow: The pipeline reads the actor's grants for the tenant through `by_principal` and evaluates the declaration's permission policy; a denial throws rejection `forbidden` before any execution and before any receipt is read (Law 5, D11)
- flow: A parent query on tenant data calls `authorizeQuery` before its first read; no identity throws rejection `unauthenticated`, a denial throws rejection `forbidden`, and the query returns nothing and writes nothing before authorization passes (Law 5, D11)
- flow: A worker whose `Authority` is in `recheckDelegator` mode runs as the captured delegating user, whose `delegationRef` names the obligation, so the grants read is the user's current rights; a worker in `serviceAuthority` mode runs as a service actor whose `onBehalfOf` names the actor that made the promise and whose `delegationRef` names the obligation, under the service actor's own grants (D11, D13, E-6)

## Design

Authorization is a helper inside the pipeline's mutation and inside any parent query on tenant data; it is not a registered function. The grants table is in the parent by default, as the doc's ownership table allows; where the product needs an audit journal of grants, a dedicated access context owns them and the parent reads through that context's query inside the same transaction, which changes the helper's read and nothing else.

Nothing here signs anything. The internal entry is unreachable by clients because Convex refuses client calls to internal functions; that visibility rule, not a token, is what keeps a client out of the worker and agent namespaces.

- transactionBoundary: grants are read inside the command's mutation or the query that discloses tenant data; no separate authorization transaction (D11, Law 9)
- convexSurface: the `grants` table and the helpers `establishActor`, `authorize`, `authorizeQuery`, `insertGrant` and `revokeGrant`; no registered function of its own (D11, E-37)
- ctxAuthUse: `ctx.auth.getUserIdentity()` is read in `establishActor` only, which the public entry and `authorizeQuery` call; its `tokenIdentifier` is the actor's `id`, its `issuer` the actor's `issuer`, and a service issuer makes a `service` actor on a query as on a command (D11, F11, E-37)
- grantsRead: `ctx.db.query("grants").withIndex("by_principal", (q) => q.eq("tenantId", tenantId).eq("principalKind", actor.kind).eq("principalId", actor.id)).take(limitGrantsPerPrincipal + 1)`, followed by a length check that throws a plain `Error` when the result exceeds `limitGrantsPerPrincipal` (D11, Law 11, E-37)
- revocation: deleting the grant row; the next command's read finds no grant and throws `forbidden`, and a duplicate's stored outcome is not disclosed (D11, Law 5, E-37)
- namespaceAssignment: the public entry sets `namespace: "public"` in code; the internal entry's `namespace` argument is filled by trusted server code from its own provenance, and the set of namespaces is the closed union in `spec:command.actor-and-scope` (D6, D11)
- clientClaimRefused: a `namespace` or `actor` field sent to the public entry fails its `args` validator, and a client call to the internal entry is refused by Convex before any handler runs (D11, Sc L1-7)
- workerModes: the two modes of the one `Authority` shape pinned in `spec:command.actor-and-scope`, never restated here: `recheckDelegator` re-reads the delegating user's grants at execution through `authorize` with the captured actor and scope, and `serviceAuthority` runs under the service actor's own grants with no recheck; both carry the obligation on the actor's `delegationRef` (D11, D13, E-6)
- trustBoundary: one trusted deployment; component privacy and type brands, never a signed token, and no claim against a malicious administrator (D11)
- nativeTierIdentity: on the native tier the identity `ctx.auth.getUserIdentity()` returns comes from a token the harness signs for the fixture issuer that the deployment's environment variables name, carried by an ordinary client, so `establishActor`, the grants read, the namespaces and Convex's visibility check run unchanged; the issuer is the identity source of a native run and its one named difference from production (E-13, S13, Sc L2-9)
- limitGrantsPerPrincipal: at most 500 grants read per principal per tenant per command; the read takes 501 and a 501st row throws a plain `Error`, a technical failure, never a silent truncation, because `.take(500)` alone cannot show that a 501st exists; a principal with more is a product problem the failure surfaces (F13, E-37)

## Example space

```gwt-vocabulary
Given a tenant {tenantId:string} whose caller {principalId:string} holds a grant for the command
And another tenant {otherTenantId:string} already applied a receipted command with request key {requestKey:string} and local ID {localId:string}
And the caller's grant names the subject with local ID {grantedLocalId:string} and no other
And another caller {otherPrincipalId:string} of the tenant already applied the receipted command with request key {takenKey:string} and local ID {takenLocalId:string}
And the caller's grant is {grant:"still valid"|"revoked after a successful run"}
And a public client claims namespace {claimed:"worker"|"agent"} by {via:"passing a namespace argument to the public entry"|"calling the internal entry directly"}
When the caller sends the receipted command with request key {sentKey:string} and local ID {sentLocalId:string}
Then the answer is {answer:"applied"|"replayed"|"forbidden"|"conflict"|"refused before the handler runs"}
And a stored outcome is disclosed to the caller {disclosed:boolean}
And the namespace the server assigned is {namespace:"public"|"worker"|"agent"|"none"}
```

## Verification — reviewed

- A reviewer confirms that every registered function on tenant data has `tenantId` in its `args` and that every index on a tenant table leads with `tenantId`.
- A reviewer confirms that `ctx.auth` is read only through `establishActor`, which the public entry and `authorizeQuery` call, and that no component function reads it or an environment variable.
- A reviewer confirms that the grants read happens inside the command's transaction and that no read model stands in for it.
