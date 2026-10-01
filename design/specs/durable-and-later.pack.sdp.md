---
id: pack:durable-and-later
specs:
  - spec:obligations.obligation-module
  - spec:obligations.obligation-module.duplicate-worker-lost-callback
  - spec:obligations.obligation-module.dispatch-killed-rearmed
  - spec:obligations.obligation-module.wrapper-failed-rearmed
  - spec:obligations.obligation-module.backlog-left-alone
  - spec:obligations.obligation-module.exhausted-needs-attention
  - spec:obligations.lifecycle-transitions
  - spec:obligations.record-contract
  - spec:obligations.local-reaction-wrapper
  - spec:obligations.sweeper
  - spec:obligations.operator-operations
  - spec:obligations.fan-out-and-chains
  - spec:obligations.retention-and-restore
  - spec:obligations.retention-and-restore.restore-behind-provider
  - spec:obligations.retention-and-restore.retention-keeps-unresolved
  - spec:obligations.do-nothing-check
  - spec:effects.external-effects
  - spec:effects.external-effects.provider-success-reply-lost
  - spec:effects.external-effects.stale-worker-late-evidence
  - spec:effects.external-effects.stale-worker-after-cancellation
  - spec:effects.claim-call-settle
  - spec:effects.retry-ownership
  - spec:processes.workflow-processes
  - spec:processes.workflow-processes.restart-after-external-step
  - spec:processes.workflow-processes.deploy-with-process-in-flight
  - spec:processes.approvals
  - spec:processes.approvals.approval-races
  - spec:processes.start-checkout-example
  - spec:agents.agent-runs
  - spec:agents.agent-runs.unauthorized-proposal-rejected
  - spec:agents.agent-runs.changed-input-voids-approval
  - spec:agents.agent-runs.budget-exceeded-blocks-execution
  - spec:agents.agent-runs.untrusted-input-cannot-widen
  - spec:agents.budget-accounting
  - spec:agents.budget-accounting.timed-out-paid-call-settles-once
  - spec:advanced.trigger-table
  - spec:advanced.coalesced-recomputation
  - spec:advanced.coalesced-recomputation.source-changes-during-recompute
  - spec:advanced.ordered-consumer
  - spec:advanced.ordered-consumer.duplicate-out-of-order-applied-once
  - spec:advanced.ordered-consumer.partition-failure-isolated
  - spec:advanced.cross-stream-online-rebuild
  - spec:advanced.cross-stream-online-rebuild.backfill-races-live-writes
modelRefs:
  - spec:platform.vocabulary
---
# Durable and later layers

Package E. Layer 3 obligations, external effects and retry ownership at the detail decisions 13 to 15 support; Layers 4 to 6 as trigger, promise, rules and scenarios, each marked deferred until its trigger fires.

Membership order follows the plan's inventory with each parent before its examples: the obligation module and its five examples, the seven obligation children, external effects and its three examples, the claim-call-settle contract and the retry ownership rule, the three process Specs with their three examples, the two agent Specs with their five examples, and the four advanced Specs with their four examples. Forty-three Specs: twenty-one design Specs and twenty-two examples. Two examples were added beyond the plan's list because their scenario rows enumerate two cases: `wrapper-failed-rearmed` for the second half of Sc L3-2 and `stale-worker-after-cancellation` for the second half of Sc L3-6.
