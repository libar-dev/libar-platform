---
id: spec:processes.approvals.approval-races
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:processes.approvals
  verifies: spec:processes.approvals
---
# Race approval, expiry, revocation and execution

Sc L4-2 · native tier.

## Intent

- outcome: Only authorized transitions; no process stuck pending. (Sc L4-2)

```gwt
Given a proposal with input hash {hash: "h1"} awaits approval with an expiry
And an approver approves it, the approval expires, the approver's grant is revoked, and execution is attempted, in every interleaving
When each interleaving runs on its own backend
Then at most {executions: 1} execution commits per interleaving and only when the approval was valid and the approver still permitted at execution time
And every proposal ends approved and executed, rejected, or expired, with no process left pending
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test enumerates the interleavings of approve, expire, revoke and execute and asserts each ends in one explicit transition, that an execution after revocation is refused by the current grant check, and that a changed input hash voids the approval (D16, Law 5).
- The test asserts concurrent executions of one approved proposal commit once, because execution consumes the approval (D16, D1).
