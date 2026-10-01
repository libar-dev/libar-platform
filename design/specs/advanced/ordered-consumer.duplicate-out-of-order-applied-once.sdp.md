---
id: spec:advanced.ordered-consumer.duplicate-out-of-order-applied-once
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:advanced.ordered-consumer
  verifies: spec:advanced.ordered-consumer
---
# Duplicate and out-of-order events reach a noncommutative consumer

Sc L6-2 · native tier.

## Intent

- outcome: Each applied once, in partition order. (Sc L6-2)

```gwt
Given a consumer partition has sequence numbers {first: 1} to {last: 5} allocated in the source transactions
And the worker receives the events out of order and sequence number {duplicated: 3} twice
When the worker applies bounded contiguous batches
Then each sequence number is applied {timesApplied: 1} times in ascending order
And the consumer position ends at sequence number {last: 5}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts the noncommutative view equals the result of applying the five events in order once, and that the worker waited for the missing head rather than applying a later event (D18).
