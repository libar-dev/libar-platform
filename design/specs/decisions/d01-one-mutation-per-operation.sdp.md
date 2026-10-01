---
id: spec:decisions.d01-one-mutation-per-operation
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  constrainedBy:
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f02-component-calls-commit-with-caller
---
# One mutation per business operation

Provenance: carried from v0.1. Feature · Traces: D1, Law 1, Law 2, F1, F2, Sc L1-2, Sc L2-1, Sc L2-3.

A business operation runs as one top-level mutation. It may call several context components, update parent read models and record its outcome, and all of it commits or rolls back together. Inside that mutation, failure handling is a throw. Sagas, compensation and outboxes belong only where the next step runs in its own transaction. Convex already covers this with serializable mutations and component calls that commit with their caller, so the decision adds no mechanism; it is the do-nothing option, chosen.

## Intent

- problem: The first context writes and then the second rejects or throws, or a failure is injected after the state write, after the journal append or before the receipt; without one transaction around the whole operation, part of it stays committed (Sc L1-2, Sc L2-1)
- outcome: A business operation commits or rolls back as one top-level mutation, including every context call, read-model update and the outcome record (D1)
- value: No saga, command bus or lock protocol sits between two local contexts, and a maintainer reads one function to see everything one operation does (D1)
- risk: The standing cost is zero mechanism, but every cross-context rule must fit one transaction and its limits; what cannot fit becomes an obligation, never a silent split (D1, D10, F13)
- assumption: Mutations are serializable under optimistic concurrency (F1)
- assumption: Component calls commit or roll back with the calling mutation (F2)

## Decision

- context: The concern is atomicity of a business operation that touches several contexts, parent read models and its own outcome record; Convex already gives serializable mutations and component calls that commit or roll back with the calling mutation (D1, F1, F2)
- alternative: Do nothing beyond Convex: one top-level mutation whose component calls are sub-transactions that commit with it; this is the option chosen (D1, Decision method rule 2)
- alternative: A saga between two local contexts; rejected, because both contexts live in one deployment and one transaction already covers them (D1)
- alternative: A command bus around each internal step; rejected, because it adds a registration and a failure boundary per step where a function call suffices (D1)
- alternative: A lock protocol beside optimistic concurrency; rejected, because serializable mutations already order conflicting writes (D1, F1)
- decision: A business operation runs as one top-level mutation; it may call several context components, update parent read models and record its outcome, and all of it commits or rolls back together; inside that mutation, failure handling is a throw (D1)
- rationale: Convex already covers this with serializable mutations and component calls that commit with their caller, so there is nothing to add (D1, F1, F2)
- rationale: Sagas, compensation and outboxes belong only where the next step runs in its own transaction (D1)
- consequence: The standing cost is none: no extra writes per command, no registered functions, no tables, no lifecycle states and no operator duties beyond the one mutation (D1)
- consequence: A cross-context rule must be expressible inside one transaction and within its limits; an operation too large for one transaction is rejected or becomes a separate import command, and work that must leave the transaction becomes an obligation (D1, D10, D13, F13)
- consequence: The first experiment counts one top-level commit per successful command as a budget (D1, First experiment, Sc L2-3)
