---
id: pack:application
specs:
  - spec:application.parent-use-cases
  - spec:application.parent-use-cases.second-context-rejects
  - spec:application.parent-use-cases.second-context-throws
  - spec:application.read-models
  - spec:application.read-models.committed-state-visible
  - spec:application.read-models.committed-state-read-through-query
  - spec:application.read-models.query-refused-before-disclosure
  - spec:application.read-models.query-refused-without-grant
  - spec:application.read-models.list-pages-by-cursor
  - spec:application.projection-contract
  - spec:application.rebuild
  - spec:application.rebuild.online-rebuild-interrupt-resume
  - spec:application.rebuild.write-pause-rebuild-interrupt
  - spec:application.rebuild.write-pause-rebuild-abort
  - spec:application.generation-registry
  - spec:application.generation-registry.first-activation-makes-read-model-writable
  - spec:application.generation-registry.command-without-generation-fails
  - spec:application.write-pause
  - spec:application.restore
  - spec:application.restore.restore-representative-dataset
  - spec:application.first-experiment
  - spec:application.first-experiment.order-of-1-line
  - spec:application.first-experiment.order-of-10-lines
  - spec:application.first-experiment.order-of-max-lines
  - spec:application.first-experiment.native-acceptance-production-configuration
  - spec:application.first-experiment.native-contention
  - spec:application.orders-inventory-example
  - spec:application.orders-inventory-example.cancel-placed-order
  - spec:application.orders-inventory-example.cancel-twice-rejected
  - spec:application.orders-inventory-example.cancel-duplicate-answered-from-receipt
  - spec:application.orders-inventory-example.cancel-unknown-order-rejected
  - spec:application.orders-inventory-example.cancel-second-context-rejects
  - spec:application.orders-inventory-example.cancel-without-grant-refused
  - spec:operations.baseline-operations
  - spec:operations.baseline-operations.broken-metrics-never-abort
  - spec:operations.baseline-operations.broken-audit-aborts
  - spec:constraints.one-commit-per-successful-command
  - spec:constraints.zero-core-projection-jobs
  - spec:constraints.one-call-per-context-per-use-case
  - spec:constraints.one-public-execution-per-intent
  - spec:constraints.no-application-wide-counter
  - spec:constraints.no-queue-recovery-for-essential-reads
  - spec:constraints.events-stay-small
  - spec:constraints.bulk-operations-bounded
modelRefs:
  - spec:platform.vocabulary
  - spec:application.orders-inventory-example
---
# Application

Package D. Layer 2: parent use cases, read models and the projection contract, online rebuild with the generation registry and the write pause, restore, baseline operations, the cost-target constraints and the first experiment, with the Layer 2 scenarios and the all-layers audit scenario.

Membership order follows the plan's inventory with each parent's examples directly after it: parent use cases, read models, the projection contract, rebuild with its registry and gate, restore, the first experiment with the example domain, baseline operations, then the eight constraints. Forty-four Specs: nine application Specs, one operations Spec, eight constraints and twenty-six examples. Three examples are siblings the plan's table did not list, `second-context-throws`, `committed-state-read-through-query` and `write-pause-rebuild-abort`, added because each doc row enumerates two cases. Five examples verify no doc row: `first-activation-makes-read-model-writable` and `command-without-generation-fails` verify the generation registry's first rebuild and the failure of a command before it under E-8, `query-refused-before-disclosure` and `query-refused-without-grant` verify Law 5 for a parent query, and `list-pages-by-cursor` verifies a parent list under E-24. Six more verify no doc row: the `cancel-` examples of the example domain verify `CancelOrder` under E-46, the second lifecycle command, its rejections, its receipt and its grant.
