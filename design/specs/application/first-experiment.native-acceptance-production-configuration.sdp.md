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

Sc L2-9 · end to end tier.

## Intent

- outcome: Same authority, schemas, concurrency and code path as a release. (Sc L2-9)

```gwt
Given the Orders and Inventory application built through Layer 2 on a native backend
And the backend runs with {configuration: "production configuration"}
When {run: "every Layer 0 to 2 scenario"} runs
Then authority, schemas, concurrency and code path {parity: "match a release"}
```

## Verification — executable

- Runs in the end-to-end tier on the production composition; every test owns its disposable backend.
- The test deploys the release build, not a test build, with the production `auth.config.ts`, grants, namespaces and entry points and the production schema, and runs against it every Layer 0 to 2 scenario that E-15 routes to the production composition; the scenarios it routes to the fixture composition run there with the shared libraries, their own tables and the same authority model.
- The test obtains each identity from a token the harness signs for the fixture issuer that the deployment's environment variables name, carried by an ordinary client, because a production issuer cannot mint tokens for a disposable backend; the evidence record names that issuer as the identity source, the one named difference from production, under E-13.
- A check that needs no backend asserts that no module under `example/` imports from the fixture composition, the harness or the tests, and the native test asserts that the run's record names the production composition as the deployed one and states no configuration difference from production other than the identity source.
