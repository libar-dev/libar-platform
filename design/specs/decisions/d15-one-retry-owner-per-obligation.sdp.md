---
id: spec:decisions.d15-one-retry-owner-per-obligation
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d13-deferred-work-is-an-obligation
    - spec:decisions.d14-external-effects-declare-safe-repetition
  constrainedBy:
    - spec:laws.law12-one-retry-owner
    - spec:facts.f01-serializable-mutations-under-occ
---
# One retry owner per obligation

Provenance: carried from v0.1. Feature · Traces: D15, Law 12, F1, S11, S12, Sc L3-4, Sc L4-1.

The obligation module owns retry policy. When concurrency or provider limits call for Workpool, it runs with its own retries off, or ownership passes to it deliberately and its attempts show the same way. A workflow waits on an obligation's result and never retries the same effect on its own. Convex's internal transaction retries are not business attempts. The decision depends on D13 for the record that counts attempts and on D14 for the effects whose repetition it governs.

## Intent

- problem: Retries are exhausted, including failures of recovery itself, and a process restarts after an external step completed; if the transport, a Workpool and a workflow each retry the same effect, the attempt count lies and a paid call repeats (Sc L3-4, Sc L4-1)
- outcome: One module owns the retry policy of each obligation, and pool, workflow and engine retries never multiply it (D15, Law 12)
- value: An attempt is one thing counted in one place, and exhaustion has one owner to escalate to (D15)
- risk: Workpool's own retries must be off, or ownership passed deliberately with its attempts shown the same way; forgetting either brings multiplied retries back (D15)
- assumption: Convex's internal transaction retries under optimistic concurrency are invisible to the caller and are not business attempts (F1)

## Decision

- context: The concern is that several layers can each retry the same work; Convex gives internal transaction retries under optimistic concurrency and, through Workpool and Workflow, per-job and per-step retry policies of their own (D15, F1, S11, S12)
- alternative: Do nothing beyond Convex: let the client, Workpool, Workflow and the engine each retry on their own policy; rejected, because each retried piece of work has one retry owner and transport and workflow retries never multiply it (D15, Law 12, Decision method rule 2)
- alternative: The obligation module owns retry policy, with Workpool retries off or ownership passed deliberately and workflows waiting rather than retrying; this is the option chosen (D15)
- decision: The obligation module owns retry policy; when concurrency or provider limits call for Workpool, it runs with its own retries off, or ownership passes to it deliberately and its attempts show the same way; a workflow waits on an obligation's result and never retries the same effect on its own (D15)
- rationale: Convex's internal transaction retries are not business attempts (D15, F1)
- consequence: Every attempt, whoever runs it, is shown as an attempt on the obligation with the same number and fence (D15, D13)
- consequence: A workflow step that reaches an external system is an obligation the workflow waits on, never a step with its own retry policy (D15, D16)
- consequence: The standing cost is a configuration duty: pool and workflow retries off, or ownership recorded on the obligation (D15)
