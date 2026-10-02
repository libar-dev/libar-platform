---
id: spec:command.tenancy-and-authority.shared-key-two-subjects
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  verifies: spec:command.tenancy-and-authority
---
# A request key taken for another subject is reused with other input

Law 5 · native tier · fixture composition.

On the fixture composition, two ordinary clients carry fixture-issuer tokens for the subjects `user-1` and `user-2`. Each holds one grant for the permission of `CreateDocument`, and each grant names one document as its subject: `doc-1` for `user-1` and `doc-2` for `user-2`. The client of `user-2` sends the receipted `CreateDocument` for `doc-2` through its public entry with request key `k-1`, which succeeds and leaves a receipt. The client of `user-1` then sends `CreateDocument` for `doc-1` with the same key. Authorization passes at step 4, because the grant covers `doc-1`. The lookup of step 5 finds the receipt of the other call with a different fingerprint and throws `idempotencyConflict` with no details, so the caller learns that the key is taken and nothing of the receipt recorded for `doc-2`.

## Intent

- outcome: The conflict answer says that the key is taken and discloses nothing of the receipt stored for the other subject. (Law 5, D6)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "user-1"} holds a grant for the command
And the caller's grant names the subject with local ID {grantedLocalId: "doc-1"} and no other
And another caller {otherPrincipalId: "user-2"} of the tenant already applied the receipted command with request key {takenKey: "k-1"} and local ID {takenLocalId: "doc-2"}
And the caller's grant is {grant: "still valid"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "doc-1"}
Then the answer is {answer: "conflict"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "public"}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the thrown error has `data.kind` equal to `"rejection"`, `data.code` equal to `"idempotencyConflict"`, `data.commandType` equal to `"CreateDocument"` and no `details`, and that the operation ID of the stored receipt appears nowhere in the error's data.
- The test asserts that the caller, sending `CreateDocument` for `doc-2` with a request key no call has used, is answered `forbidden`, so the stored receipt's subject is one the caller holds no grant for.
- The test asserts that the receipt row is unchanged, that the receipts stored for the key number one, and that no stream exists for `doc-1`.
