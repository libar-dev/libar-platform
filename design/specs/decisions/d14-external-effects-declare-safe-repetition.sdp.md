---
id: spec:decisions.d14-external-effects-declare-safe-repetition
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d13-deferred-work-is-an-obligation
  constrainedBy:
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f10-action-mutation-calls-are-separate-transactions
---
# External effects declare how repetition is safe

Provenance: carried from v0.1. Feature · Trigger: an obligation reaches an external system · Traces: D14, Law 7, Law 12, F9, F10, Sc L3-5, Sc L3-6.

Claim the attempt in one transaction, call the provider in an action, settle in a second transaction. Each effect picks one policy that makes a repeated attempt safe. With no safe policy, an ambiguous outcome goes to needs attention. A fresh random provider key is not a retry. A stale worker cannot overwrite a newer decision, but its late provider evidence is kept and reconciled. Fencing database writes does not stop a network call already sent. Compensation is a new business operation with its own identity. The decision depends on D13 because the claim and the settle are attempts on an obligation.

## Intent

- problem: The provider succeeds but the reply is lost; an old worker reports after a new attempt or a cancellation; a retry that sends a fresh random key charges twice, and fencing database writes cannot recall a call already sent (Sc L3-5, Sc L3-6)
- outcome: Every external effect is claimed in one transaction, called in an action and settled in a second transaction, and declares one policy that makes a repeated attempt safe (D14)
- value: A second irreversible effect is prevented by the provider's key or by reconciliation, and an ambiguous outcome is parked for a person rather than retried blind (D14, Law 7)
- risk: Each effect must pick and keep a policy, and a stale worker's late evidence must be kept and reconciled rather than dropped (D14)
- assumption: Scheduled actions are not retried by Convex (F9)
- assumption: An action's mutation calls are separate transactions (F10)

## Decision

- context: The concern is external I/O whose outcome may be unknown; Convex gives actions that are not retried and whose mutation calls are separate transactions, so nothing between the claim and the settle is atomic (D14, F9, F10)
- alternative: Do nothing beyond Convex: call the provider in an action, write the result, and rerun the action on failure; rejected, because a lost reply followed by a rerun with a fresh random key is not a retry and can repeat an irreversible effect (D14, Sc L3-5, Decision method rule 2)
- alternative: Fence database writes and treat the fence as the protection; rejected as sufficient, because fencing database writes does not stop a network call already sent (D14)
- alternative: Claim, call, settle with one declared repetition policy per effect; this is the option chosen (D14)
- decision: Claim the attempt in one transaction, call the provider in an action, settle in a second transaction; each effect picks one policy: reuse the provider's idempotency key within its validity period, reconcile with the provider before any new irreversible attempt, or declare duplicates acceptable as a business property, still with bounded retries (D14)
- rationale: With no safe policy, an ambiguous outcome goes to needs attention (D14, Law 7)
- rationale: A fresh random provider key is not a retry (D14)
- consequence: A stale worker cannot overwrite a newer decision, but its late provider evidence is kept and reconciled (D14, Sc L3-6)
- consequence: Fencing database writes does not stop a network call already sent, so the claim records the provider key before the call is made (D14)
- consequence: Compensation is a new business operation with its own identity (D14)
- consequence: Every retry of the action belongs to the obligation module, because Convex will not retry a scheduled action (D14, D15, F9)
- consequence: The standing cost is two transactions and one action per attempt, a declared policy per effect, and reconciliation as an operator duty (D14, D13)
