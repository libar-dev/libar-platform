---
id: pack:kernel-and-context
specs:
  - spec:kernel.domain-kernel
  - spec:kernel.domain-kernel.evaluate-twice
  - spec:kernel.domain-kernel.incremental-then-rebuild
  - spec:kernel.decider-contract
  - spec:kernel.outcome-model
  - spec:kernel.initial-state
  - spec:kernel.state-document-mapping
  - spec:context.context-component
  - spec:context.context-component.invalid-transition
  - spec:context.context-component.stale-version-rejected
  - spec:context.context-component.competing-commands
  - spec:context.journal
  - spec:context.journal.rebuild-from-baseline
  - spec:context.event-envelope
  - spec:context.tables
  - spec:context.persistence-adapter
  - spec:context.queries
  - spec:context.batch-shaped-api
modelRefs:
  - spec:platform.vocabulary
---
# Kernel and context

Package B. Layer 0, the pure domain kernel (decide, evolve, initial state, outcomes), and Layer 1's context component (state, journal, stream metadata, tables and indexes, the persistence adapter, queries, batch-shaped APIs), with the Layer 0 and Layer 1 scenarios those components own.

Membership order follows the plan's inventory, each parent directly followed by its examples: the domain kernel with L0-1 and L0-2, the decider contract, the outcome model, the two extension decisions E-1 and E-2, the context component with L1-1, L1-10 and L1-11, the journal with L2-7, the event envelope, the tables, the persistence adapter, the queries and the batch-shaped API rule. Eighteen Specs.
