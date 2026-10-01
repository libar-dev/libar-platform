---
id: spec:application.generation-registry.command-without-generation-fails
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.generation-registry
  verifies: spec:application.generation-registry
---
# A command whose read model has no generation fails

E-8 · native tier · production composition · no acceptance row; the example verifies that a command never commits without its read model, an extension under E-8.

## Intent

- outcome: The command fails as a technical failure and nothing of it is stored. (E-8, D8, Law 6)

```gwt
Given a read model with {generationRows: 0} generation rows
When a command that declares the read model runs
Then the caller sees {outcome: "a technical failure"}
And the number of stored receipts, events and state changes is {stored: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test creates stock through `ReceiveStock`, which declares no read model, and sends `PlaceOrder` before any first activation of the order summary.
- The test asserts that the caller's error is not a `ConvexError` of the outcome boundary, that the function log's record of the failure names the order summary, and that no receipt, no order stream, no order event and no change to the stock exists for the operation.
- The test then runs the first activation, re-sends the same command with the same request key and asserts that it is applied.
