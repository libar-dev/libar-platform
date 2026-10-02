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
- After grants, the first rebuild of the order summary through to its switch and `ReceiveStock` as setup, the test subscribes to `listOrderSummaries` with the tenant, the status a placed order has and `{ cursor: null, numItems: 10 }`, runs `PlaceOrder`, and asserts that the next subscription value's page carries the order's summary whose `sourceVersions` equal the command's returned `versions` entry for the order's stream, the one stream the summary is projected from.
- The test asserts that the backend ran no scheduled function, cron or action between the command and the subscription update, by reading the disposable backend's function log from before the command until it holds the command's mutation and the subscription's query, a window an ordinary read after the command closes, and finding no record that a client did not cause; and it asserts that `_scheduled_functions` of the parent and of both contexts, Orders and Inventory, read through admin access after the command, is empty, so no job is scheduled for later either.
