---
id: pack:command-pipeline
specs:
  - spec:command.command-pipeline
  - spec:command.command-pipeline.failure-after-state-write
  - spec:command.command-pipeline.failure-after-journal-append
  - spec:command.command-pipeline.failure-before-receipt
  - spec:command.outcome-boundary
  - spec:command.outcome-boundary.rejected-then-retried-after-change
  - spec:command.idempotency-and-receipts
  - spec:command.idempotency-and-receipts.concurrent-non-ui-calls
  - spec:command.idempotency-and-receipts.retry-after-lost-response
  - spec:command.idempotency-and-receipts.ui-double-submit
  - spec:command.idempotency-and-receipts.key-reuse-changed-input
  - spec:command.idempotency-and-receipts.rate-refusal-then-retry
  - spec:command.receipt-table
  - spec:command.tenancy-and-authority
  - spec:command.tenancy-and-authority.same-key-two-tenants
  - spec:command.tenancy-and-authority.client-claims-system-namespace
  - spec:command.tenancy-and-authority.revoked-then-retried
  - spec:command.actor-and-scope
  - spec:command.command-declaration
  - spec:command.command-declaration.renamed-handler-fails-build
modelRefs:
  - spec:platform.vocabulary
---
# Command pipeline

Package C. Layer 1's parent-side path: the one-mutation command pipeline, the outcome and rejection boundary, idempotency receipts and their table, tenancy and authority, the actor and scope contract, and the command declaration, with the Layer 1 scenarios those components own.

Membership order follows the plan's inventory, parents before children: the pipeline and its three L1-2 injection points, the outcome boundary and L1-12, receipts with L1-3 as two cases, L1-4, L1-5 and L1-9, the receipts table, tenancy with L1-6, L1-7 and L1-8, the actor and scope contract, and the declaration with L2-4. Seven Specs and thirteen examples.
