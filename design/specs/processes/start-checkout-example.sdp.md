---
id: spec:processes.start-checkout-example
kind: workflow
altitude: story
readiness: scoped
relations:
  refines: spec:processes.workflow-processes
  dependsOn:
    - spec:effects.external-effects
    - spec:application.parent-use-cases
  constrainedBy:
    - spec:laws.law07-deferred-work-never-reported-early
---
# The StartCheckout example

Layer 4 · Detail: deferred until the operation spans time, external systems or human decisions · Traces: D16, D14, D10, Law 7, Sc L4-1.

`StartCheckout` is a different contract from atomic `PlaceOrder`. It records an order awaiting payment and a stock reservation with a business expiry, returns a process ID with an honest awaiting-payment status, requests a payment effect, waits for provider evidence, then confirms order and allocation in one local transaction. The doc's worked example is carried here as flows; the definition, its steps and the process record are written on the trigger.

## Intent

- outcome: A checkout that must wait for a provider is one process with an honest status, one payment obligation, one local confirmation, and an explicit policy for every late or ambiguous payment (D16, Law 7)

### Open questions

- [blocking] The trigger has not fired; the workflow definition, the process record, the reservation's business expiry and the payment obligation's handler are deferred to the build until the operation spans time, external systems or human decisions (D16, Decision method rule 4)
- [non-blocking] Which of the three late-payment policies applies is a product decision the build records per deployment: reallocate, ask a person, or refund as a separately tracked operation (D16)

## Workflow

- rule: [deferred] The build writes the workflow definition, the process record and the payment obligation's handler on the trigger (D16, Decision method rule 4)
- rule: `StartCheckout` never reports the order as placed before the payment effect is proven (D16, Law 7)
- rule: An ambiguous payment status waits for reconciliation and never triggers a second payment (D16, D14)
- The starting command records an order awaiting payment and a stock reservation with a business expiry in one mutation, writes the process record with its definition version, and returns a process ID with status awaiting payment (D16, D1)
- The process requests a payment effect as an obligation with policy reuse provider key, and waits for its result (D16, D14)
- On definite payment success the process confirms the order and the allocation in one local transaction (D16, D10)
- On definite payment failure the process releases the reservation in one local transaction and the order stays unpaid (D16)
- On an ambiguous payment status the process waits for the obligation's reconciliation and never requests a second payment (D16, D14)
- When a payment lands after the reservation expired, the process applies the deployment's late-payment policy: reallocate stock, ask a person through an approval, or refund as a separately tracked operation with its own identity (D16, D14)
- A restart of the process after the payment effect completed resumes from the obligation's evidence and does not repeat the payment (D16, Sc L4-1)

## Design

- deferred: the workflow definition, the process record, the reservation's business expiry and the payment obligation's handler, written by the build on the trigger that the operation spans time, external systems or human decisions (D16, Decision method rule 4)
