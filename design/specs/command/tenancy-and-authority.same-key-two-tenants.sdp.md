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

Sc L1-6 · native tier.

Tenant A has already applied a receipted create with request key `k-1` and local ID `order-1`. Tenant B's caller sends the same key and local ID to tenant B. The receipt key leads with the tenant, so the lookup finds nothing; the local ID is scoped by the tenant in the context's identity index, so the create succeeds; and nothing of tenant A is read or returned.

## Intent

- outcome: No collision, no disclosure. (Sc L1-6)

```gwt
Given a tenant {tenantId: "t-b"} whose caller {principalId: "user-b"} holds a grant for the command
And another tenant {otherTenantId: "t-a"} already applied a receipted command with request key {requestKey: "k-1"} and local ID {localId: "order-1"}
And the caller's grant is {grant: "still valid"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "order-1"}
Then the answer is {answer: "applied"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "public"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that two receipt rows exist, one per tenant, with different operation IDs, and two streams with `streamId` `order-1`, one per tenant.
- The test asserts that tenant B's response carries no affected ref or version from tenant A.
