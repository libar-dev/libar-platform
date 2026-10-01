---
id: spec:agents.agent-runs.changed-input-voids-approval
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:agents.agent-runs
  verifies: spec:agents.agent-runs
---
# Proposal input changes after approval

Sc L5-2 · native tier · first of two cases: the input changed after the approval was given.

## Intent

- outcome: Approval is void; execution is blocked. (Sc L5-2)

```gwt
Given an approved proposal has input hash {approvedHash: "h1"}
And the run changes the proposal's input so its hash is {currentHash: "h2"}
When execution is attempted
Then execution is blocked because the approval bound to a different proposal
And the approval is void and the process record shows an explicit transition
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts the execution check compares the current input hash to the approval's hash before any context call, and that nothing commits (D17, D16, Law 5).
