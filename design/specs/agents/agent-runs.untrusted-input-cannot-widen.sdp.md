---
id: spec:agents.agent-runs.untrusted-input-cannot-widen
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:agents.agent-runs
  verifies: spec:agents.agent-runs
---
# A retrieved document or prompt tries to widen the agent's rights

Sc L5-4 · native tier.

## Intent

- outcome: Server-side capabilities unchanged. (Sc L5-4)

```gwt
Given an agent run is granted {grantedCommands: 1} command type in the {namespace: "agent"} namespace
And a retrieved document instructs the agent to act as an operator and to use the worker namespace
When the run proposes commands that follow the document's instructions
Then every proposal outside the run's grants is rejected and the namespace on every executed command is the server-assigned agent namespace
And the run's grants after the run equal the grants before it
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts the grants table is unchanged, that no approval was created by the run, and that the caller namespace on every receipt is `agent` (D17, D11, Law 5).
