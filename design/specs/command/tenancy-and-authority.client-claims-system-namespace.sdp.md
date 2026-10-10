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

Sc L1-7 · native backend tier · fixture composition · first of two cases.

On the fixture composition, an ordinary client that carries a fixture-issuer token for subject `user-1` and holds a grant in tenant `t-1` sends the public entry of `CreateDocument` a `namespace` argument of `worker`. The public entry's `args` validators do not declare that field, so the call fails argument validation before the handler runs. The other route to the worker namespace, a client calling the internal entry directly, is refused by Convex's visibility rule and is asserted in the verification bullets. The agent namespace is the second case, `spec:command.tenancy-and-authority.client-claims-agent-namespace`.

## Intent

- outcome: Refused. (Sc L1-7)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "user-1"} holds a grant for the command
And the caller's grant is {grant: "still valid"}
And a public client claims namespace {claimed: "worker"} by {via: "passing a namespace argument to the public entry"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "doc-1"}
Then the answer is {answer: "refused before the handler runs"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "none"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts that no receipt, stream or event row was written and that the error is not a `ConvexError` of the outcome boundary.
- The test reads the function log and asserts that the refused call's completion record carries the argument validation error and read no document, and that the same call without the `namespace` field, sent afterwards by the same client, applies with namespace `public` and its completion record read the caller's grant, so the public entry exists and the refusal came before its handler.
- The test also calls the internal entry from the same ordinary client, which holds no admin key, with namespace `worker` and asserts that Convex refuses the call, that its completion record read no document and that nothing was stored, then reaches the same internal entry with namespace `worker` through the fixture's non-UI caller action `nonUiCaller:send`, which applies, so the internal entry exists and both routes to the worker namespace are closed to a client.
