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

On the fixture composition, an ordinary client that carries a fixture-issuer token for subject `user-1` sends the receipted `CreateDocument` through its public entry, which succeeds and leaves a receipt. An operator then deletes the caller's grant with the fixture's internal mutation `grants:revoke`, which the test runs with admin access. The caller retries with the same key and input. Authorization runs at step 4, before the receipt lookup of step 5, so the retry receives `forbidden` and the stored outcome is not disclosed. The fixture configures no service issuer, so the public entry makes the caller a human actor.

## Intent

- outcome: Stored outcome not disclosed. (Sc L1-8)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "user-1"} holds a grant for the command
And the caller's grant is {grant: "revoked after a successful run"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "doc-1"}
Then the answer is {answer: "forbidden"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "public"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the thrown error has `data.code` equal to `"forbidden"` and that `data.details` carries no operation ID, affected ref or version.
- The test asserts that the receipt row from the successful run is unchanged, which proves the retry wrote nothing, and that the retry's completion record in the function log read no document, which proves the retry never read the receipt it could disclose.
- After the test grants the caller again with admin access, the same retry is a replay that names the stored operation ID, so the receipt was there to disclose and the `forbidden` answer came from authorization.
