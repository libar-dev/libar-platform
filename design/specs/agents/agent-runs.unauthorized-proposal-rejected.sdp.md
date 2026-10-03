---
id: spec:agents.agent-runs.unauthorized-proposal-rejected
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:agents.agent-runs
  verifies: spec:agents.agent-runs
---
# An agent proposes a valid-looking unauthorized command

Sc L5-1 · native backend tier.

## Intent

- outcome: Ordinary policy rejects it; no bypass path exists. (Sc L5-1)

```gwt
Given an agent run holds grants for {grantedCommands: 1} command type
And the run proposes a well-formed command of a type it is not granted
When the proposal is checked by policy and submitted to the command boundary
Then the proposal is rejected by the ordinary authorization check and nothing is stored
And no function exists that executes a proposal outside the command pipeline
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts the rejection is the same `ConvexError` code an unauthorized human would receive, and that no journal, state or receipt row was written (D17, Law 5, D7).
- The test inspects the deployment's registered functions and asserts none takes a proposal and writes business state (D17, Law 1).
