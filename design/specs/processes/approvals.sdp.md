---
id: spec:processes.approvals
kind: rule
altitude: story
readiness: scoped
relations:
  refines: spec:processes.workflow-processes
  constrainedBy: spec:laws.law05-authorization-before-execution-and-disclosure
---
# Approvals bind to the exact proposal

Layer 4 · Detail: deferred until a process needs a human decision · Traces: D16, D17, Law 5, Sc L4-2.

An approval is a record that an authorized person approved one exact proposal: operation, input hash, who may approve, expiry and policy version. Changing the input voids it. The approval and the execution check stay separate, because an approval says what was approved and execution must still be permitted and valid now. Rejection, expiry and concurrent execution each have an explicit transition, so no process stays pending after its proposal was refused. Agents reuse the same approvals for their proposals.

## Intent

- outcome: An approval proves that an authorized person approved this exact proposal, execution checks again that the operation is still permitted and valid now, and every race between approval, expiry, revocation and execution ends in an explicit transition (D16, Law 5)

### Open questions

- [non-blocking] The approvals table, its indexes and the approval command's declaration are deferred to the build on the process trigger; the rules here are the promise the build must keep (D16, Decision method rule 4)

## Rule

- [deferred] The build writes the approvals table, the approve and reject commands, and the expiry sweep, on the trigger that a process needs a human decision (D16, Decision method rule 4)
- An approval binds to the exact proposal: operation, input hash, who may approve, expiry, policy version (D16)
- Changing the input voids the approval; a proposal with a different input hash is a different proposal (D16, Sc L4-2)
- Two checks stay separate: the approval shows that an authorized person approved this exact proposal, and execution checks again that the operation is still permitted and valid now (D16, Law 5)
- Rejection, expiry and concurrent execution each have an explicit transition, so no process stays pending after its proposal was refused (D16, Sc L4-2)
- Only one execution of an approved proposal can commit, because execution consumes the approval in the same transaction as the operation (D16, D1)
- A revoked approver's approval does not execute; the execution check reads current grants, not the approval's snapshot (D16, Law 5)
- Approvals are specialized records because they carry distinct business evidence (D13)
- An agent's proposal uses the same approval, and an agent cannot create approvals (D17)

## Design

- deferred: the approvals table and its indexes, the approve and reject commands with their declarations, and the expiry sweep, written by the build on the trigger that a process needs a human decision (D16, Decision method rule 4)
