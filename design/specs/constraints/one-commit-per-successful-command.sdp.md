---
id: spec:constraints.one-commit-per-successful-command
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d01-one-mutation-per-operation
---
# One top-level commit per successful command

Cost target · Traces: First experiment, D1, Sc L2-3.

The first of the six cost targets the commentary set for the first experiment. A successful command, including a use case that calls two contexts and writes read models, is one top-level mutation and therefore one commit; component sub-transactions commit with it and count as none of their own. The experiment counts top-level mutation executions per successful `PlaceOrder` for 1, 10 and the maximum lines.

## Intent

- outcome: Keep every successful command at exactly one top-level commit, so atomicity follows the business operation and no second transaction exists on the core path (First experiment, D1, Thesis)
- value: A maintainer reasons about one commit per command, and a failure anywhere inside it rolls back everything (D1, Law 2)

## Constraints

- statement: A successful command makes exactly one top-level commit, whatever the number of contexts it calls and read models it writes (First experiment, D1)
- flavor: cost
- target: commits.top-level.per-successful-command.eq:1
- measurableBy: the first experiment's count of successful top-level mutation executions per `PlaceOrder` in the disposable backend's function log, for 1 line, 10 lines and the maximum, with and without contention (First experiment, Sc L2-3, E-47)
