---
id: spec:advanced.ordered-consumer.partition-failure-isolated
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:advanced.ordered-consumer
  verifies: spec:advanced.ordered-consumer
---
# One ordered partition fails

Sc L6-3 · native backend tier.

## Intent

- outcome: Other partitions progress; the failed one is inspectable. (Sc L6-3)

```gwt
Given a consumer has {partitions: 3} partitions with pending events
And the head event of partition {failing: 2} is a poison event
When the worker runs on every partition
Then partitions other than {failing: 2} reach their last sequence number
And partition {failing: 2} stays blocked at its head with the failure inspectable and no skip without an authorized, recorded decision
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts the failed partition's position did not advance, that an unauthorized skip is refused, and that an authorized skip writes a recorded data-loss decision before the position advances (D18).
