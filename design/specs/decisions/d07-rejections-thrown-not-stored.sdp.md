---
id: spec:decisions.d07-rejections-thrown-not-stored
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d04-four-outcomes
  constrainedBy:
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:facts.f14-convex-error-survives-nested-and-component-boundary
---
# Rejections are thrown, not stored, at the public boundary

Provenance: changed by the review. Feature · Traces: D7, Law 6, F3, F4, F14, Probe 2, OQ2, Sc L1-12, Sc L2-1.

A rejected command throws a structured `ConvexError`. The whole mutation rolls back, the caller receives the rejection, and nothing is stored. If the response is lost and the command runs again, that is correct: the caller never saw the first answer, and if the command now succeeds, the intent ran once. v0.1 wrapped every command body in a nested mutation so a rejection receipt could survive the rollback; the nested mutation now stays only where the caller must survive the failure. The decision depends on D4 because rejection is one of its four outcomes.

## Intent

- problem: A rejected command's response is lost and it is retried after state changed; the first context writes and the second rejects; v0.1 answered both with a nested mutation per command so a rejection receipt could survive the rollback, which doubles the functions every command needs (Sc L1-12, Sc L2-1)
- outcome: A rejected command throws a structured `ConvexError`, the whole mutation rolls back, the caller receives the rejection and nothing is stored (D7)
- value: A lost rejection followed by a retry is correct by construction, and the public path carries no nested mutation and no rejection receipt (D7)
- risk: The nested mutation survives in two places, the worker wrapper and a refusal that must stay on record, and each is a `ctx.runMutation` that costs more than a helper (D7, F3, F4)
- assumption: `ctx.runMutation` inside a mutation gives partial rollback and the parent can catch and continue (F3)
- assumption: `ConvexError` data survives a nested mutation and a component boundary (F14)

### Open questions

- [non-blocking] OQ2: whether the product needs a record of refused commands anywhere, for security audit or agent proposals, decides where the nested mutation is required and whether the generic internal dispatcher exists (OQ2, D7)

## Decision

- context: The concern is what a rejection leaves behind and what a lost rejection means on retry; Convex gives a throw that prevents the mutation from committing and carries `ConvexError` data to the caller, and gives `ctx.runMutation` for partial rollback at extra cost (D7, F3, F4)
- alternative: Do nothing beyond Convex: throw a structured `ConvexError`, let the whole mutation roll back, store nothing; this is the option chosen (D7, Decision method rule 2)
- alternative: v0.1's rule, every command body wrapped in a nested mutation so a rejection receipt survives the rollback; rejected as the general rule (D7)
- alternative: A registered body per command for the boundaries that must record a refusal; rejected, because it doubles the functions every command needs; one generic internal dispatcher mutation serves instead if a public boundary needs it (D7)
- decision: A rejected command throws a structured `ConvexError`; the whole mutation rolls back, the caller receives the rejection, and nothing is stored; the nested mutation stays only where the caller must survive the failure (D7)
- rationale: If the response is lost and the command runs again, that is correct: the caller never saw the first answer, and if the command now succeeds, the intent ran once (D7, Sc L1-12)
- rationale: `ctx.runMutation` inside a mutation gives partial rollback and costs more than a helper call, and a catch around an ordinary helper does not undo its writes (D7, F3, F4)
- consequence: The nested mutation is used by a worker wrapper that records the attempt after the body fails (D7, D13)
- consequence: The nested mutation is used for a refusal that must stay on record, such as a denied security-sensitive request or a rejected agent proposal; that record is a business fact written through the normal path (D7)
- consequence: If a public boundary does need a refusal record, one generic internal dispatcher mutation serves every command; a registered body per command is not acceptable (D7, OQ2)
- consequence: A rejected command stores nothing, so its idempotency key stays unused and a retry after state changed runs against current state (D7, D6, Sc L1-12)
- consequence: The standing cost is zero on the public path and one nested mutation per obligation attempt on the worker path (D7, D13)
