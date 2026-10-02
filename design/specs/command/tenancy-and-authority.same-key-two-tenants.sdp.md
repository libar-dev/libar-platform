---
id: spec:command.tenancy-and-authority.same-key-two-tenants
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  verifies: spec:command.tenancy-and-authority
---
# Two tenants use the same request key and local ID

Sc L1-6 · native tier · fixture composition.

On the fixture composition, tenant A's own caller has already applied the receipted create `CreateDocument` through its public entry with request key `k-1` and document ID `doc-1`. Tenant B's caller, the fixture issuer's subject `user-b`, sends the same command with the same key, document ID and title to tenant B. The receipt key leads with the tenant, so the lookup finds nothing; the document ID is scoped by the tenant in the depot's identity index, so the create succeeds; and nothing of tenant A is read or returned.

## Intent

- outcome: No collision, no disclosure. (Sc L1-6)

```gwt
Given a tenant {tenantId: "t-b"} whose caller {principalId: "user-b"} holds a grant for the command
And another tenant {otherTenantId: "t-a"} already applied a receipted command with request key {requestKey: "k-1"} and local ID {localId: "doc-1"}
And the caller's grant is {grant: "still valid"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "doc-1"}
Then the answer is {answer: "applied"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "public"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that two receipt rows exist, one per tenant, with different operation IDs, and two rows in the depot's streams table with `streamId` `doc-1`, one per tenant.
- The test asserts that tenant B's response carries no operation ID or version from tenant A: its operation ID is the one tenant B's receipt stores, and every version in it names tenant `t-b`; an affected ref names no tenant, so the test asserts it equals the ref tenant B's receipt stores.
