---
id: spec:constraints.no-queue-recovery-for-essential-reads
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d08-read-models-in-command
  constrainedBy:
    - spec:laws.law09-no-invariant-on-late-read-model
---
# No queue recovery needed for essential reads

Cost target · Traces: First experiment, D8, Law 9, Sc L2-2.

The sixth cost target. An essential read is an entity's detail, an essential list or summary, or a small cross-context view. Each is served from committed state or from a read model written in the command, so no queue exists whose failure or backlog could make the read stale and no recovery of one is ever needed for correctness. The experiment proves it by breaking nothing and finding no worker to break.

## Intent

- outcome: Keep every essential read independent of any queue, worker or job, so a stale screen is impossible and there is nothing to recover (First experiment, D8)
- value: The first stopping point holds: a two-context application whose core correctness and essential screens need no background job (Thesis, D8)

## Constraints

- statement: No essential read depends on a queue, worker or job; every essential read sees committed state or a read model written in the same transaction as its source (First experiment, D8, Law 9)
- flavor: cost
- target: queue-recovery.required-for-essential-reads.eq:0
- measurableBy: Sc L2-2 run inside the first experiment, asserting committed state visible with no function executed between the command and the query, plus the experiment's inventory of queues and workers in the transactional profile, which must be empty (First experiment, Sc L2-2, E-47)
