---
id: spec:processes.workflow-processes
kind: behavior
altitude: feature
readiness: scoped
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:obligations.obligation-module
    - spec:effects.external-effects
    - spec:effects.retry-ownership
  constrainedBy:
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law12-one-retry-owner
  decidedBy:
    - spec:decisions.d16-processes-use-workflow
    - spec:decisions.d15-one-retry-owner-per-obligation
---
# Workflow processes

Layer 4 · Detail: deferred until the operation spans time, external systems or human decisions · Traces: D16, D15, D10, Law 7, Law 12, S11, Sc L4-1, Sc L4-3.

A process is a business operation that spans time, external systems or human decisions. The Workflow component is its durable engine; the application keeps a business process record whose meaning does not depend on the engine's step names. Local steps that can commit together stay one mutation, only waits and external effects become steps, and a step that reaches an external system is an obligation the workflow waits on. The definition version is saved at start so that a deploy can keep, migrate or block old runs explicitly. The Workflow README was read on 2026-09-30 and the facts it states are recorded as assumptions; the step signatures, the process record's table and the deploy procedure are written by the build that this layer's trigger starts.

## Intent

- actor: A use case that starts a process; the workflow definition that sequences its waits and effects; the operator who resumes, migrates or blocks an old run (D16)
- problem: A process restarts after an external step completed; a deploy lands while an old process is in flight; a hand-rolled chain of scheduled functions would have to solve resume, cancellation, delay and versioning itself (Sc L4-1, Sc L4-3, D16)
- outcome: Workflow is the durable engine, the business process record is independent of the engine's step names, only waits and external effects are steps, and a deploy keeps old runs executable, migrates them, or blocks them with an operator remedy (D16)
- value: A process adds a record and a definition version, not a second retry owner or a second source of business truth (D16, D15)
- risk: The standing cost is the Workflow component, a process record per process, a definition version per run and a deploy policy for in-flight runs (D16)
- assumption: Workflow state is persisted after each step completes and a run resumes from the last successfully completed step; per-step retry is configurable and `retryActionsByDefault` is false by default (S11)
- assumption: The workflow handler must be deterministic; a meaningful change to a definition with active runs fails them with a determinism violation; the journal is limited to 8 MiB and step data to 1 MB per execution; a run can be cancelled, restarted from a step and cleaned up (S11)

### Open questions

- [blocking] The trigger has not fired; the process record's table, the step signatures, the wait mechanism for an obligation's result and the deploy procedure are deferred to the build (D16, Decision method rule 4)
- [non-blocking] Whether an old run is kept, migrated or blocked on a given deploy is a per-release choice the build records; the README's determinism rule means keeping requires the old definition to stay registered under its version (D16, S11)

## Behavior

- rule: [deferred] The build writes the process record's table, the step signatures over the Workflow component, the mechanism by which a step waits on an obligation's result, and the deploy procedure, on the trigger that an operation spans time, external systems or human decisions (D16, Decision method rule 4)
- rule: Workflow is the durable engine; no process is built on a hand-rolled chain of scheduled functions (D16)
- rule: The application keeps a business process record whose meaning does not depend on the engine's step names (D16)
- rule: Local steps that can commit together are one mutation; only waits and external effects become steps (D16, D1)
- rule: An external effect inside a process is an obligation; the workflow waits on its result and never retries the same effect on its own (D16, D15, Law 12)
- rule: A process returns an honest status while it waits, never a completion before the effect is proven (D16, Law 7)
- rule: The definition version is saved at start on the process record (D16)
- rule: A deploy keeps old runs executable, migrates them, or blocks them with an operator remedy; a run that fails with a determinism violation goes to a blocked state on the process record with the remedy named (D16, S11)
- rule: Two contexts taking part in one operation is not a reason for a process; that is a parent use case (D16, D10)
- rule: Step retries are off; ownership of an attempt stays with the obligation module unless passed deliberately (D15, S11)
- rule: A process is started by an ordinary command through the command pipeline, so it has a receipt, an operation ID and an authority like any command (D16, D6, D11)

## Design

The engine and the record are separate. The Workflow component holds the journal of steps and resumes a run; the process record holds the business meaning, the definition version, the operation ID and the current honest status. Approvals are `spec:processes.approvals`; the worked example is `spec:processes.start-checkout-example`.

- transactionBoundary: the starting command is one top-level mutation that writes the process record and starts the run; each local step is one mutation; each external step is an obligation with its own claim, call and settle (D16, D1, D14)
- engineFacts: state persisted after each step; resume from the last completed step; per-step retry configurable with actions not retried by default; cancel, restart from a step, and cleanup exist; a definition change with active runs is a determinism violation (S11)
- deferred: the process record table, the step signatures, the wait on an obligation, the deploy procedure and the operator remedies, written by the build on the trigger (D16)

## Verification — reviewed

- A reviewer confirms that no rule here designs a step signature or a table, and that every fact about the Workflow component is marked as read from its README on 2026-09-30 (S11).
- A reviewer confirms that every external step is an obligation and that no step carries its own retry policy (D15, Law 12).
