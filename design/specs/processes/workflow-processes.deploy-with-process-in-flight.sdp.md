---
id: spec:processes.workflow-processes.deploy-with-process-in-flight
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:processes.workflow-processes
  verifies: spec:processes.workflow-processes
---
# Deploy while an old process is in flight

Sc L4-3 · native backend tier · production composition.

## Intent

- outcome: It continues, migrates, or blocks with a remedy. (Sc L4-3)

```gwt
Given a process is in flight under definition version {oldVersion: 1}
And a deploy registers definition version {newVersion: 2} and changes the old definition's steps
When the deploy lands and the old run resumes
Then the old run continues under its saved version or migrates or blocks with a named operator remedy
And the process record shows which of the three happened and never shows completion for a blocked run
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- The test deploys a release that keeps the old definition registered and asserts the old run continues; deploys one that removes it and asserts the process record is blocked with a remedy and the run's determinism violation is recorded, never a silent failure (D16, S11).
- The test asserts a blocked process never reports success and that its payment obligation, if any, keeps its own state (Law 7, D15).
