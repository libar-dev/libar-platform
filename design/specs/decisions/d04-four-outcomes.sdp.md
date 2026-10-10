---
id: spec:decisions.d04-four-outcomes
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Four outcomes, not a boolean

Provenance: carried from v0.1. Feature · Traces: D4, Law 6, Sc L1-1, Sc L1-9, Sc L1-12.

A command ends in one of four outcomes, each with a fixed commit behavior. Applied and business failure commit; rejection commits nothing; technical failure rolls everything back and stores nothing as a business outcome. A transient refusal for rate or capacity is a retryable error, never a stored rejection. Keeping a refused request as a fact is a business policy chosen per command, and error handling never makes that choice by accident. The `Outcome` union is defined once in the kernel and mapped to the wire once at the command boundary.

## Intent

- problem: A boolean result cannot tell a declined reservation that belongs in history from a refused request that must not commit, or a transient capacity refusal from a business rejection; the invalid-transition, rate-refusal and rejected-then-retried scenarios each need a different answer (Sc L1-1, Sc L1-9, Sc L1-12)
- outcome: Every command ends in exactly one of applied, business failure, rejection or technical failure, and each has a fixed commit behavior (D4)
- value: Error handling can never turn a transient failure into a stored refusal, and whether a refused request becomes a fact is a per-command business choice that shows in the command's name (D4, Law 6)
- risk: The standing cost is one closed union type and one closed error-code list at the boundary that every command and every client must honor (D4)

## Decision

- context: The concern is classification of what a command did; Convex gives a throw that prevents the mutation from committing and a `ConvexError` that carries data to the caller, and nothing in between (D4, D7)
- alternative: Do nothing beyond Convex: a boolean or a plain return for success and a thrown error for everything else; rejected, because a business failure that belongs in history would not commit, and a transient refusal would be indistinguishable from a rejection (D4, Law 6, Decision method rule 2)
- alternative: Store every refusal as a rejection record; rejected, because keeping a refused request as a fact is a business policy chosen per command, never a side effect of error handling (D4)
- alternative: Four outcomes with fixed commit behavior; this is the option chosen (D4)
- decision: A command ends in one of four outcomes: applied, where events are recorded and state changed; business failure, where something meaningful happened and belongs in history, such as `ReservationDeclined`, and which commits like a success; rejection, where the request is understood and refused and nothing commits; technical failure, an unexpected throw, where everything rolls back and nothing is stored as a business outcome (D4)
- rationale: A transient refusal for rate or capacity is a retryable error, never a stored rejection (D4, Law 6)
- rationale: An order that waits for stock is a different command from one that rejects when stock is short; error handling never makes that choice by accident (D4)
- consequence: The `Outcome` union is defined once in the kernel and mapped to the wire once at the command boundary; no Spec defines a second one (D4)
- consequence: A business failure is an event and a result, so it is journaled and visible to read models exactly like an applied command (D4)
- consequence: A rejection is a thrown `ConvexError` at the public boundary and stores nothing, which D7 rules (D4, D7)
- consequence: The standing cost is one union type, one closed error-code list and a `convex-test` tier that covers the outcome combinations (D4, Acceptance scenarios)
