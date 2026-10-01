---
id: spec:application.read-models.committed-state-visible
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.read-models
  verifies: spec:application.read-models
---
# A successful command, then a query or subscription

Sc L2-2 · native tier.

## Intent

- outcome: Committed state visible without any worker. (Sc L2-2)

```gwt
Given a read model maintained by the {useCase: "PlaceOrder"} use case
And a client subscribed to the read model's query with the tenant scope
When the use case commits {commands: 1} successful command
Then the subscription shows the committed state with source versions {versionMatch: "equal to the command's returned versions"}
And the number of workers, jobs or queues that ran is {workers: 0}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test subscribes to the order summary query, runs `PlaceOrder`, and asserts that the next subscription value's page carries the order's summary row whose `sourceVersions` equal the `versions` the command returned.
- The test asserts that the backend ran no scheduled function, cron or action between the command and the subscription update, by reading the disposable backend's function log.
- The test also calls the Orders component's `order.get` query through the parent and asserts that the DTO matches the committed state.
