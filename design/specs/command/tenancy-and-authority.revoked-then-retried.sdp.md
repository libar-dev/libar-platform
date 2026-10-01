---
id: spec:command.tenancy-and-authority.revoked-then-retried
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  verifies: spec:command.tenancy-and-authority
---
# Authorization is revoked, then a successful command is retried

Sc L1-8 · native tier.

A receipted command succeeded and left a receipt. The caller's grant is then deleted. The caller retries with the same key and input. Authorization runs at step 4, before the receipt lookup of step 5, so the retry receives `forbidden` and the stored outcome is not disclosed.

## Intent

- outcome: Stored outcome not disclosed. (Sc L1-8)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "svc-1"} holds a grant for the command
And the caller's grant is {grant: "revoked after a successful run"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "order-1"}
Then the answer is {answer: "forbidden"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "public"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the thrown error has `data.code` equal to `"forbidden"` and that `data.details` carries no operation ID, affected ref or version.
- The test asserts that the receipt row from the successful run is unchanged, which proves the retry read nothing it could disclose and wrote nothing.
