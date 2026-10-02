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

Sc L2-2 · native tier · production composition.

## Intent

- outcome: Committed state visible without any worker. (Sc L2-2)

```gwt
Given a read model maintained by the {useCase: "PlaceOrder"} use case
And a client subscribed to the first page of the read model's list for the tenant
When {action: "the use case commits one successful command"}
Then the subscription shows the committed state with source versions {versionMatch: "equal to the command's returned versions"}
And the number of workers, jobs or queues that ran is {workers: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- After grants, the first activation and `ReceiveStock` as setup, the test subscribes to `listOrderSummaries` with the tenant, the status a placed order has and `{ cursor: null, numItems: 10 }`, runs `PlaceOrder`, and asserts that the next subscription value's page carries the order's summary whose `sourceVersions` equal the command's returned `versions` entry for the order's stream, the one stream the summary is projected from.
- The test reads `_scheduled_functions` through admin access after the command in the parent and both mounted components, Orders and Inventory, and asserts that all three tables are empty, including any function scheduled with a delay.
