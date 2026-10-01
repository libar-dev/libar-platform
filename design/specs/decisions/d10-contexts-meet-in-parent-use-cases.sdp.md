---
id: spec:decisions.d10-contexts-meet-in-parent-use-cases
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d01-one-mutation-per-operation
    - spec:decisions.d02-context-owns-state-and-journal
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
---
# Contexts meet only in parent use cases

Provenance: carried from v0.1; batch-shaped APIs are new. Feature · Traces: D10, Law 1, Law 9, F13, Probe 4, OQ3, Sc L2-1, Sc L2-3.

Contexts never read each other's tables and never call each other. A rule linking two contexts lives in a parent use case, in the same transaction, or in an obligation that runs later. No handler inside a transaction issues commands, so every cross-context rule is visible in one place. Context APIs take lists, so a use case makes one call per context rather than one per line. An operation too large for one transaction is rejected, or becomes a separate import command with honest partial progress. The decision depends on D1 for the transaction and on D2 for the boundary it respects.

## Intent

- problem: Orders of 1 line, 10 lines and the maximum must each be one top-level commit with one call per context and hold their budgets; a rule linking two contexts hidden in a handler that issues commands cannot be found or bounded (Sc L2-3, Sc L2-1)
- outcome: Contexts never read each other's tables and never call each other; every cross-context rule lives in a parent use case in one transaction or in an obligation, and a use case makes one list-shaped call per context (D10)
- value: Every cross-context rule is visible in one place, and O(N) business work stays O(1) in component calls (D10)
- risk: The parent grows with each cross-context rule, so use cases are grouped by business flow (D10)
- risk: An operation too large for one transaction is rejected or becomes a separate import command with honest partial progress, and the maximum order size is a product decision still open (D10, F13, OQ3)
- assumption: Transactions have limits (F13)

### Open questions

- [non-blocking] Probe 4 pending: whether transaction limits add up across nested calls and components decides how large one use case may be (Probe 4, F13, D10)
- [non-blocking] OQ3: the largest order the placement command supports is a product decision; until it is made the limit is a placeholder in the first experiment (OQ3, D10)

## Decision

- context: The concern is where a rule that spans two contexts lives and how many calls a use case makes; Convex gives component isolation, where a component cannot read data not explicitly provided to it, and per-transaction limits that bound one use case (D10, F2, F13)
- alternative: Do nothing beyond Convex: let contexts call each other's components and let handlers inside a transaction issue commands; rejected, because contexts never read each other's tables and never call each other, and no handler inside a transaction issues commands (D10, Decision method rule 2)
- alternative: A command bus for internal calls between contexts; rejected as a standing requirement (D10, D18)
- alternative: Placing an order as `CreateOrder`, then `AddOrderItem` per line, then `SubmitOrder`; rejected, because placing an order is one command with one receipt and one outcome (D10)
- alternative: One component call per line; rejected as the default, because O(N) component calls or orchestration is not the default (D10)
- alternative: Silently splitting a too-large operation into several transactions; rejected, because splitting it silently changes its contract (D10)
- alternative: Cross-context rules in the parent use case, in one transaction or in an obligation, with list-shaped context APIs; this is the option chosen (D10)
- decision: Contexts never read each other's tables and never call each other; a rule linking two contexts lives in a parent use case, in the same transaction, or in an obligation that runs later; no handler inside a transaction issues commands; context APIs take lists so a use case makes one call per context; an operation too large for one transaction is rejected or becomes a separate import command with honest partial progress (D10)
- rationale: Every cross-context rule is visible in one place (D10)
- rationale: A context operation called by a use case is not a public command; `PlaceOrder` has one receipt and one outcome, and the context steps inside it get no command lifecycle of their own (D10, D6)
- rationale: O(N) business work is fine; O(N) component calls or orchestration is not the default (D10)
- consequence: The parent grows with each cross-context rule, so use cases are grouped by business flow (D10)
- consequence: A context API takes lists, such as `inventory.allocate({ lines })`, so a use case makes one call per context rather than one per line (D10)
- consequence: The first experiment counts one call per context per use case and measures orders of 1 line, 10 lines and the chosen maximum (D10, First experiment, Sc L2-3)
- consequence: The standing cost is none in mechanism; the cost is the discipline of list-shaped context APIs and of a parent that holds every cross-context rule (D10)
