---
id: spec:constraints.zero-core-projection-jobs
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d08-read-models-in-command
---
# Zero core projection jobs

Cost target · Traces: First experiment, D8, Sc L2-2, Sc L2-3.

The second cost target. Read models update inside the command, so no scheduled function, cron, action or component maintains a read model on the core path. The only batch writer of read models is a rebuild, which is an operator operation and not the core path. The experiment counts every function execution that is not the top-level mutation or a component sub-transaction inside it.

## Intent

- outcome: Keep the core path free of projection jobs, so essential screens need no worker and no queue recovery (First experiment, D8)
- value: After a successful command an authorized query sees committed state without any worker, and there is nothing to recover when a worker would have died (D8, Sc L2-2)

## Constraints

- statement: The core path runs zero projection jobs; every read model is written inside the command that changes its sources (First experiment, D8)
- flavor: cost
- target: projection-jobs.core-path.eq:0
- measurableBy: the first experiment's count of scheduled functions, crons and actions executed during and after each measured `PlaceOrder`, from the disposable backend's function log, which must be zero (First experiment, Sc L2-3, E-47)
