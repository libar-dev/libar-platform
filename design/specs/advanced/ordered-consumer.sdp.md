---
id: spec:advanced.ordered-consumer
kind: behavior
altitude: story
readiness: scoped
relations:
  refines: spec:advanced.trigger-table
  constrainedBy:
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:facts.f01-serializable-mutations-under-occ
---
# Ordered event consumer

Layer 6 · Detail: deferred until every selected event matters and order changes the result · Traces: D18, D2, Law 10, F1, Sc L6-2, Sc L6-3.

Order is per tenant, consumer, generation and partition, with the smallest partition the view's meaning allows. The source transaction allocates a contiguous consumer sequence, which differs from the stream version, so a filtered consumer never waits for events it did not subscribe to. A worker applies a bounded contiguous batch and never skips a failed head. A poison event blocks only its partition, and skipping it is an authorized, recorded data-loss decision. The sequence allocation, the consumer record and the worker are written on the trigger.

## Intent

- actor: A noncommutative consumer that must see every selected event in order; the source transaction that allocates its sequence; the worker that applies batches (D18)
- problem: Duplicate and out-of-order events reach a noncommutative consumer; one ordered partition fails and must not stop the others (Sc L6-2, Sc L6-3)
- outcome: Each selected event is applied once, in partition order, and a failed partition is isolated and inspectable (D18)
- value: Only consumers that need order pay for a per-partition sequence; everything else stays on the reactive path (D18, D8)
- risk: The sequence is allocated in the source transaction, so an activated consumer adds a write to every command that produces a selected event (D18)

### Open questions

- [non-blocking] The sequence allocation, the consumer position record, the worker's batch bound and the skip authorization are deferred to the build on this trigger (D18, Decision method rule 4)

## Behavior

- rule: [deferred] The build writes the sequence allocation in the source transaction, the consumer position record, the worker and the skip authorization after the activation record (D18, Decision method rule 4)
- rule: Order is per tenant, consumer, generation and partition, with the smallest partition the view's meaning allows (D18)
- rule: The source transaction allocates a contiguous consumer sequence, which differs from the stream version, so a filtered consumer never waits for events it did not subscribe to (D18, D2)
- rule: A worker applies a bounded contiguous batch and never skips a failed head (D18)
- rule: A duplicate delivery is applied once because the consumer position advances only past applied sequence numbers (D18, F1)
- rule: A poison event blocks only its partition; skipping it is an authorized, recorded data-loss decision, and the consumer contract says whether it is allowed (D18)
- rule: The consumer never runs commands or external effects while applying events (D18, Law 10)
- rule: No deployment-wide order token exists; a global ordered feed is a separate capability with its own trigger (D18, D2)

## Design

- deferred: the per-partition sequence allocation, the consumer position record, the worker's batch bound and the skip authorization, written by the build after the activation record (D18)
