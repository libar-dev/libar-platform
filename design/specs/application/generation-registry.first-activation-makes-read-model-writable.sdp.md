---
id: spec:application.generation-registry.first-activation-makes-read-model-writable
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.generation-registry
  verifies: spec:application.generation-registry
---
# A read model is installed through its first rebuild

E-8 · native tier · production composition · no acceptance row; the example verifies that a read model's first generation is built like any other and serves the subjects that already exist, an extension under E-8.

## Intent

- outcome: Generation 1 starts as building, covers the subjects that existed before it, and is active only after it is verified and switched. (E-8, D9)

```gwt
Given a read model with {generationRows: 0} generation rows and {orders: 3} subjects that already have history
When an operator starts a generation, its batches finish and the operator switches it
Then generation {generation: 1} of the read model is {state: "active"}
And the read model holds {rows: 3} rows for the subjects that existed before it
And a second start while generation 1 is being built is {second: "refused"}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test places three orders through a command that declares no read model, or writes them before the read model is declared, then runs `internal.rebuild.startGeneration` for the order summary with admin access and a stated operator, and asserts one row in `generations`, generation 1, `building`, with the order summary's latest projection version and the operator as `startedBy`.
- The test runs `startGeneration` again before the first generation is switched and asserts that its error names the read model, generation 1 and its state, and that the table still holds one row.
- The test waits until the row is `verified`, asserts that a query over the read model still fails for want of an active generation, runs `switchGeneration`, and asserts that the row is `active`, that no row is `retired`, and that the list query returns the three orders.
- The test runs the same sequence on a backend with one tenant and no subject and asserts that the progress row's `batchesDone` is 2, one backfill batch and one verify batch, before `verified`.
