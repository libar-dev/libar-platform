---
id: spec:platform.native-harness.hosted-deployment-accepts-production-composition
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.native-harness
  verifies: spec:platform.native-harness
---
# A hosted deployment accepts the production composition and answers an ordinary client

E-59 · native backend tier · production composition · hosted deployment.

## Intent

- outcome: The production composition deploys to the hosted deployment with the deploy key, the fixture issuer's key set is taken from the deployment's environment variables, and an ordinary client carrying a fixture token is answered, which no run on the local backend shows. (E-59, E-13)

```gwt
Given the hosted deployment named by the run's deployment URL and deploy key, with the fixture issuer's variables set on it
When the run deploys the production composition, grants a subject with admin access, and an ordinary client carrying that subject's token places an order of {lines: 1} line
Then the deploy completes {deployed: true}
And the command's outcome is {outcome: "applied"}
And the function log read with the deploy key holds the command's completion record {records: 1}
```

## Verification — executable

- Runs third in the hosted driver, after F12's replacement in place and before Probe 3; it starts no local backend.
- The run's record names the deployment, the deploy key by its name, the stated plan, the CLI version, the backend version the deployment reports or `null`, the usage readings before and after, and the deploy's wall time.
- Convex documents a data URI as a `customJwt` key set; the example shows whether this composition with that key set is accepted on this deployment, on its plan and its date.
- The function log is read as the run goes and what it saw is recorded; the local backend's log of its last 1000 entries is not taken as the hosted deployment's bound, which is not published.
- A passed test result claims no parity with a release and passes no scenario row.
