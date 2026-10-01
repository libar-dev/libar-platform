---
id: spec:constraints.no-application-wide-counter
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d02-context-owns-state-and-journal
---
# No application-wide counter in the write path

Cost target · Traces: First experiment, D2, D18.

The fifth cost target. No deployment-wide counter sits in every write's path: order exists only within a stream, no global position is allocated, and the registry and gate documents the parent reads are read, never incremented, by a command. A counter that every command increments would serialize every command of the deployment under optimistic concurrency. The experiment inspects the write set of each measured command.

## Intent

- outcome: Keep every command's write set free of any document that every other command also writes (First experiment, D2)
- value: Commands on different streams do not conflict, so throughput grows with the number of streams and not with the width of one counter (D2, F1)

## Constraints

- statement: No application-wide counter, sequence or position document is written in the path of a command; order exists only within a stream (First experiment, D2)
- flavor: cost
- target: application-wide-counters.in-write-path.eq:0
- measurableBy: a review of every table written by the command path, and the first experiment's write set per `PlaceOrder`, which must contain no document written by commands on other streams other than the command's own receipt, rows and audit (First experiment, D2, E-47)
