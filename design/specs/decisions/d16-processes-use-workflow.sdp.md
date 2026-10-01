---
id: spec:decisions.d16-processes-use-workflow
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d13-deferred-work-is-an-obligation
    - spec:decisions.d15-one-retry-owner-per-obligation
---
# Processes use the Workflow component

Provenance: carried from v0.1. Feature · Trigger: the operation spans time, external systems or human decisions · Traces: D16, D15, Law 5, Law 7, Law 12, S11, Sc L4-1, Sc L4-2, Sc L4-3.

Workflow is the durable engine. The application keeps a business process record whose meaning does not depend on the engine's step names. Local steps that can commit together are one mutation; only waits and external effects become steps. The definition version is saved at start, and a deploy keeps old runs executable, migrates them, or blocks them with an operator remedy. Approvals bind to the exact proposal. The decision depends on D13 and D15 because a process waits on obligations and never retries their effects itself. Layer 4 stays at trigger, promise, rules and scenarios; the build that triggers it writes the rest.

## Intent

- problem: A process restarts after an external step completed; approval, expiry, revocation and execution race; a deploy lands while an old process is in flight; a hand-rolled process manager over scheduled functions must solve each of these itself (Sc L4-1, Sc L4-2, Sc L4-3)
- outcome: Workflow is the durable engine, the application keeps a business process record independent of the engine's step names, and approvals bind to the exact proposal (D16)
- value: Local steps that can commit together stay one mutation, only waits and external effects become steps, and a definition version saved at start makes deploys explicit (D16)
- risk: The standing cost is the Workflow component, a business process record per process, a definition version per run, and a deploy policy that keeps, migrates or blocks old runs (D16)
- assumption: The Workflow component persists state after each step and resumes from the last successfully completed step, with per-step retry configuration; its determinism, deploy behavior and journal limits are not on its product page and are deferred to the build (S11)

## Decision

- context: The concern is an operation that spans time, external systems or human decisions; Convex gives the Workflow component, which persists state after each step and resumes from the last successful step, with per-step retry configuration (D16, S11)
- alternative: Do nothing beyond Convex: chain scheduled functions by hand and keep the process state in application tables; rejected, because a durable engine exists and the do-nothing option would re-solve resume, cancellation and delay (D16, Decision method rule 2)
- alternative: Let the engine's step names carry the business meaning; rejected, because the business process record's meaning does not depend on the engine's step names (D16)
- alternative: Every local step as a workflow step; rejected, because local steps that can commit together are one mutation (D16)
- alternative: A process for any operation that touches two contexts; rejected, because two contexts taking part in one operation is not a reason for a process (D16, D10)
- alternative: Workflow as the engine with a business process record, steps only for waits and effects, and the definition version saved at start; this is the option chosen (D16)
- decision: Workflow is the durable engine; the application keeps a business process record whose meaning does not depend on the engine's step names; local steps that can commit together are one mutation and only waits and external effects become steps; the definition version is saved at start; a deploy keeps old runs executable, migrates them, or blocks them with an operator remedy (D16)
- rationale: Two contexts taking part in one operation is not a reason for a process (D16, D10)
- rationale: A workflow waits on an obligation's result and never retries the same effect on its own (D16, D15, Law 12)
- consequence: Approvals bind to the exact proposal: operation, input hash, who may approve, expiry, policy version; changing the input voids the approval (D16, Sc L4-2)
- consequence: Two checks stay separate: the approval shows that an authorized person approved this exact proposal, and execution checks again that the operation is still permitted and valid now (D16, Law 5)
- consequence: Rejection, expiry and concurrent execution each have an explicit transition, so no process stays pending after its proposal was refused (D16, Sc L4-2)
- consequence: The worked example is `StartCheckout`, a different contract from atomic `PlaceOrder`: it records an order awaiting payment and a stock reservation with a business expiry, and returns a process ID with an honest awaiting-payment status; the process requests a payment effect, waits for provider evidence, then confirms order and allocation in one local transaction (D16, Law 7)
- consequence: In the example, a definite payment failure releases the reservation; an ambiguous status waits for reconciliation and never triggers a second payment; a payment that lands after the reservation expired needs an explicit policy: reallocate, ask a person, or refund as a separately tracked operation (D16, D14)
- consequence: The standing cost is the Workflow component, one process record per process, a definition version per run and a deploy policy for in-flight runs (D16)
