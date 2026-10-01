---
id: spec:decisions.d11-tenant-scope-and-authority
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  constrainedBy:
    - spec:facts.f11-components-have-no-ctx-auth
---
# Tenant scope and authority from day one

Provenance: carried from v0.1. Feature · Traces: D11, Law 5, Law 9, Law 11, F11, Sc L1-6, Sc L1-7, Sc L1-8.

Every tenant-owned record, and every command and query on tenant data, names its tenant, even in a single-tenant deployment. An absent tenant is never a wildcard. The parent authenticates and authorizes, then passes server-established actor and scope into components, which have no `ctx.auth`. One authorization vocabulary covers humans, services, agents, reviewers and operators. Grants are authoritative data. The trust boundary is one trusted deployment: component privacy and type brands stop unauthorized clients and accidental cross-module access, not a malicious administrator, and no parent-signed token claims to.

## Intent

- problem: Two tenants use the same request key and local ID; a client claims a worker or agent namespace; authorization is revoked and a successful command is retried; without a tenant on every record and an authorization step before execution and disclosure, each of these collides or leaks (Sc L1-6, Sc L1-7, Sc L1-8)
- outcome: Every tenant-owned record, command and query names its tenant; the parent authenticates and authorizes and passes a server-established actor and scope into components; grants are authoritative data; the trust boundary is one trusted deployment (D11)
- value: Tenancy is never retrofitted, one authorization vocabulary covers humans, services, agents, reviewers and operators, and no parent-signed token pretends to stop a malicious administrator (D11)
- risk: The standing cost is a `tenantId` on every record and in every function's arguments and index, a grants table read in every transaction, and captured provenance on every worker (D11, Law 11)
- assumption: Components have no `ctx.auth` (F11)

## Decision

- context: The concern is authority and tenant scope; Convex gives `ctx.auth` in the parent and none in components, which cannot read anything not passed to them, and gives component privacy and type brands against accidental cross-module access (D11, F11)
- alternative: Do nothing beyond Convex: a single-tenant deployment with no tenant field and authorization checked where a developer remembers it; rejected, because retrofitting tenancy costs far more than carrying a constant scope now, and an absent tenant would have to mean a wildcard (D11, Law 11, Decision method rule 2)
- alternative: Grants as a read model updated later; rejected, because grants are authoritative data and no invariant depends on a read model that updates later (D11, Law 9)
- alternative: A parent-signed token or cryptographic delegation inside one deployment; rejected, because the trust boundary is one trusted deployment and no parent-signed token claims to stop a malicious administrator; cryptographic delegation waits for independent issuers or trust boundaries (D11, D18)
- alternative: Tenant on everything, parent-side authentication and authorization, server-established actor and scope passed into components; this is the option chosen (D11)
- decision: Every tenant-owned record, and every command and query on tenant data, names its tenant, even in a single-tenant deployment; an absent tenant is never a wildcard; the parent authenticates and authorizes, then passes server-established actor and scope into components, which have no `ctx.auth`; one authorization vocabulary covers humans, services, agents, reviewers and operators; grants are authoritative data, never a read model that updates later (D11)
- rationale: Retrofitting tenancy costs far more than carrying a constant scope now (D11)
- rationale: Component privacy and type brands stop unauthorized clients and accidental cross-module access; they do not stop a malicious administrator, and no parent-signed token claims to (D11)
- consequence: A worker carries captured provenance and states whether it re-checks the delegating user's current rights or runs an accepted obligation under a narrow service authority (D11, D13)
- consequence: A public caller cannot choose a system namespace; worker and agent namespaces are server-assigned (D11, D6, Sc L1-7)
- consequence: Authorization is checked before execution and again before a stored outcome is disclosed, so a revoked caller's retry discloses nothing (D11, Law 5, Sc L1-8)
- consequence: The standing cost is a tenant field on every record, a tenant argument on every function, a tenant-leading index on every tenant table, and a grants read per command (D11, Law 11)
