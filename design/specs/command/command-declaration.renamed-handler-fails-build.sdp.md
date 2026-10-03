---
id: spec:command.command-declaration.renamed-handler-fails-build
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-declaration
  verifies: spec:command.command-declaration
---
# Rename a typed handler

Sc L2-4 · compiled tier · the first of the row's two cases.

The export `placeOrder` is renamed to `submitOrder` without touching its callers. The generated `api` type is built from the module's exports, so `api.ordering.placeOrder` no longer exists and every typed caller fails `tsc`.

## Intent

- outcome: A build, type or registration check fails before any traffic. (Sc L2-4)

```gwt
Given a module exporting command {commandName: "placeOrder"} through the composition helpers
And a typed caller references it through the generated api
When the change {change: "renames the handler export"} is made
Then the check that fails first is {failsAt: "tsc"}
And it fails {when: "before any traffic"}
```

## Verification — executable

- Runs in the compiled tier, the fifth tier `spec:platform.acceptance-contract` adds under E-14, with no backend, as a type test of the production composition's generated `api`.
- The binding is a type test: the compiler is the check, and no step body runs.
- The test asserts that `api.ordering.placeOrder` is a public mutation reference, that a reference to a name the module does not export fails `tsc`, and that a typed call of `placeOrder` through the api built, as the generated `api` is, from the module with that export renamed `submitOrder` fails `tsc`, each through the compiler's expected-error directive, which itself fails the compile when the line stops being an error.
