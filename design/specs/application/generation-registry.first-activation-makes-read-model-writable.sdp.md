---
id: spec:application.generation-registry.first-activation-makes-read-model-writable
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.generation-registry
  verifies: spec:application.generation-registry
---
# The first activation makes a read model writable

E-8 · native tier · production composition · no acceptance row; the example verifies the first activation, an extension under E-8.

## Intent

- outcome: A read model with no generation gets generation 1 as active through one explicit transition, which a second call refuses. (E-8, D9)

```gwt
Given a read model with {generationRows: 0} generation rows
When an operator runs the first activation with admin access
Then generation {generation: 1} of the read model is {state: "active"}
And a second first activation is {second: "refused"}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test runs the production composition's first activation for the order summary with admin access, then reads the `generations` table with admin access and asserts one row for the read model, generation 1, `active`, with the order summary projection's version.
- The test runs the first activation a second time and asserts that its error names the read model, generation 1 and the state `active`, and that the table still holds one row.
- The test then creates stock through `ReceiveStock`, sends `PlaceOrder`, and asserts that the order's summary row exists in generation 1.
