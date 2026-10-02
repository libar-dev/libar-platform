---
id: spec:application.read-models.committed-state-read-through-query
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.read-models
  verifies: spec:application.read-models
---
# A successful command, then a query

Sc L2-2 · native tier · production composition · the query case, the doc's first enumerated case of the row.

## Intent

- outcome: Committed state visible without any worker. (Sc L2-2)

```gwt
Given a read model maintained by the {useCase: "PlaceOrder"} use case
When {action: "the use case commits one successful command"}
Then a read of the parent query over the context's get shows the committed state with stream version {versionMatch: "equal to the command's returned versions"}
And the number of workers, jobs or queues that ran is {workers: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- After grants, the first activation and `ReceiveStock` as setup, the test runs `PlaceOrder` and then, from the same client, calls the parent query `getOrder`, which relays the Orders context's `get`, and asserts that the DTO it returns holds the order's committed state and that its `version` equals the command's returned `versions` entry for the order's stream.
- The test reads `_scheduled_functions` through admin access after the command in the parent and both mounted components, Orders and Inventory, and asserts that all three tables are empty, including any function scheduled with a delay.
