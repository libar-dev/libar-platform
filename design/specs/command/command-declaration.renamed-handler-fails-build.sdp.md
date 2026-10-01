---
id: spec:command.command-declaration.renamed-handler-fails-build
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-declaration
  verifies: spec:command.command-declaration
---
# Rename a typed handler or break its argument contract

Sc L2-4 · build tier, the fifth tier `spec:platform.acceptance-contract` adds under E-14.

The export `placeOrder` is renamed to `submitOrder` without touching its callers. Convex regenerates `api` from the module's exports, so `api.commands.placeOrder` no longer exists and every typed caller fails `tsc`. The registration check would also fail, because the declaration `PlaceOrder` no longer has both exports, but `tsc` runs first.

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

- Runs in the build tier: a test project that compiles the fixture app with the rename applied and asserts a non-zero `tsc` exit naming the caller.
- The test also breaks the argument contract by removing a required input field from the declaration and asserts that `tsc` fails at the caller before any deployment.
- The test asserts that the registration check fails when one of the two exports is deleted, so the pair rule has a check of its own.
