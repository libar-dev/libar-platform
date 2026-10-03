---
id: spec:command.command-declaration.broken-argument-contract-fails-build
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-declaration
  verifies: spec:command.command-declaration
---
# Break a typed handler's argument contract

Sc L2-4 · compiled tier · the second of the row's two cases.

A typed caller calls `api.ordering.placeOrder` with an input that no longer fits the declaration's `input` validator: a required field is missing, or a field has another type. The generated `api` type carries the argument type of the public entry, which the composition helper builds from the declaration, so the caller fails `tsc` before anything is deployed.

## Intent

- outcome: A build, type or registration check fails before any traffic. (Sc L2-4)

```gwt
Given a module exporting command {commandName: "placeOrder"} through the composition helpers
And a typed caller references it through the generated api
When the change {change: "breaks its argument contract"} is made
Then the check that fails first is {failsAt: "tsc"}
And it fails {when: "before any traffic"}
```

## Verification — executable

- Runs in the compiled tier, the fifth tier `spec:platform.acceptance-contract` adds under E-14, with no backend, as a type test of the production composition's generated `api`.
- The binding is a type test: the compiler is the check, and no step body runs.
- The test asserts that a call of `api.ordering.placeOrder` whose input lacks a required field, and one whose field has another type, each fail `tsc` through the compiler's expected-error directive.
