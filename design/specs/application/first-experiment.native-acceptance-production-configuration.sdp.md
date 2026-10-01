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
- The test deploys the release build, not a test build, with the production `auth.config.ts`, grants, namespaces and entry points and the production schema, and runs the full Layer 0 to 2 suite against it.
- The test obtains each identity through the local backend's admin key acting as an identity whose `issuer` and `subject` are the production issuer's, because a production issuer cannot mint tokens for a disposable backend; the evidence record names the identity source as the one difference from production, under E-13 of the acceptance contract.
- The test asserts that no test-only function is registered in the deployment and that the evidence record of the run states no configuration difference from production other than the identity source.
