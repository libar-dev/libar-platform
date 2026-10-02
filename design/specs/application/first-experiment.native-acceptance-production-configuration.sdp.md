---
id: spec:application.first-experiment.native-acceptance-production-configuration
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# Run native acceptance with production configuration

Sc L2-9 · end to end tier · production composition.

## Intent

- outcome: Same authority, schemas, concurrency and code path as a release. (Sc L2-9)

### Open questions

- [non-blocking] No native observation shows that the disposable backend's concurrency matches a release's: the test shows that the deployment's environment holds only the three variables its `auth.config.ts` reads, and the concurrency the Then step claims rests on that reading, which the owner has not confirmed (Sc L2-9, E-15)

```gwt
Given the Orders and Inventory application built through Layer 2 on a native backend
And the backend runs with {configuration: "production configuration"}
When {run: "every Layer 0 to 2 scenario"} runs
Then authority, schemas, concurrency and code path {parity: "match a release"}
```

## Verification — executable

- Runs in the end-to-end tier on the production composition; every test owns its disposable backend.
- Each scenario that E-15 routes to the production composition runs in its own test against its own deployment of `example/`, made by `convex deploy` with no test build, with the production `auth.config.ts`, grants, namespaces and entry points and the production schema; the scenarios it routes to the fixture composition run there with the shared libraries, their own tables and the same authority model. This test makes one such deployment and runs on it, through ordinary clients, a small end-to-end path: `ReceiveStock` and `PlaceOrder` applied, a `PlaceOrder` rejected `insufficientStock`, a `PlaceOrder` and a `getOrder` refused `forbidden` to a caller with no grant, a `getOrder` refused `unauthenticated` to a caller with no identity, `getOrder`, `listOrders` and `listOrderSummaries` answered to a granted caller, and each internal function of the composition, named directly, refused as not public.
- The test asserts that the function log, from a mark before the path to its last call, holds one top-level query or mutation record for each call of the path and no record of any other function, that each refused internal function read no document, and that the applied order's receipt, its order and stock item stream rows and its order summary row are stored and the refused calls stored nothing.
- The test obtains each identity from a token the harness signs for the fixture issuer that the deployment's environment variables name, carried by an ordinary client, because a production issuer cannot mint tokens for a disposable backend; the evidence record names that issuer as the identity source, the one named difference from production, under E-13.
- A check that needs no backend lints every module under `example/` and asserts that the rule keeping the fixture composition, the harness and the tests out of it reports nothing; the native test asserts that the backend's facts in the run's record name the production composition as the deployed one, and that the deployment's environment holds only the three variables its `auth.config.ts` reads, whose issuer is the fixture issuer the record names as the identity source, so the run states no configuration difference from production other than the identity source.
