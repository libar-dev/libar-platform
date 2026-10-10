---
id: spec:command.tenancy-and-authority.client-claims-agent-namespace
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.tenancy-and-authority
  verifies: spec:command.tenancy-and-authority
---
# A client claims an agent namespace

Sc L1-7 · native backend tier · fixture composition · second of two cases.

On the fixture composition, an ordinary client that carries a fixture-issuer token for subject `user-1` and holds a grant in tenant `t-1` calls the internal entry of `CreateDocument` directly, naming the `agent` namespace and an actor of its own. The internal entry is an internal function, so Convex refuses a client's call to it before any handler runs. The other route to the agent namespace, a `namespace` argument to the public entry, fails the public entry's `args` validators and is asserted in the verification bullets. The worker namespace is the first case, `spec:command.tenancy-and-authority.client-claims-system-namespace`.

## Intent

- outcome: Refused. (Sc L1-7)

```gwt
Given a tenant {tenantId: "t-1"} whose caller {principalId: "user-1"} holds a grant for the command
And the caller's grant is {grant: "still valid"}
And a public client claims namespace {claimed: "agent"} by {via: "calling the internal entry directly"}
When the caller sends the receipted command with request key {sentKey: "k-1"} and local ID {sentLocalId: "doc-1"}
Then the answer is {answer: "refused before the handler runs"}
And a stored outcome is disclosed to the caller {disclosed: false}
And the namespace the server assigned is {namespace: "none"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts that the error names the internal entry as a function with no public form, that it is not a `ConvexError` of the outcome boundary, and that no receipt, stream or event row was written.
- The test reads the function log and asserts that the refused call's completion record read no document, and that the same internal entry reached with namespace `agent` through the fixture's non-UI caller action `nonUiCaller:send` applies and stores a receipt whose namespace is `agent`, so the internal entry exists and the refusal came from Convex's visibility rule.
- The test also sends the public entry a `namespace` argument of `agent` from the same client and asserts that the call fails argument validation, that its completion record read no document and that nothing was stored, so both routes to the agent namespace are closed to a client.
