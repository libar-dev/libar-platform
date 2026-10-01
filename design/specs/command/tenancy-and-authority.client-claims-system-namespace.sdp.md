---
id: spec:command.tenancy-and-authority.client-claims-system-namespace
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  verifies: spec:command.tenancy-and-authority
---
# A client claims a worker or agent namespace

Sc L1-7 · native tier.

A Convex client sends the public entry a `namespace` argument of `worker`. The public entry's `args` validators do not declare that field, so the call fails argument validation before the handler runs. The sibling case, a client calling the internal entry directly, is refused by Convex's visibility rule and is asserted in the verification bullets.

## Intent

- outcome: Refused. (Sc L1-7)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "user-1"} holds a grant for the command
And the caller's grant is {grant: "still valid"}
And a public client claims namespace {claimed: "worker"} by {via: "passing a namespace argument to the public entry"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "order-1"}
Then the answer is {answer: "refused before the handler runs"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "none"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that no receipt, event or read-model row was written and that the error is not a `ConvexError` of the outcome boundary.
- The test also calls the internal entry from the client with namespace `agent` and asserts that Convex refuses the call, so both routes to a system namespace are closed.
