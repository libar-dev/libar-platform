---
id: spec:advanced.trigger-table
kind: rule
altitude: feature
readiness: scoped
relations:
  refines: spec:platform.transactional-domain-platform
  decidedBy: spec:decisions.d18-everything-else-waits-for-trigger
---
# Capabilities that wait for their trigger

Layer 6 · Detail: deferred until a named trigger appears · Traces: D18, D9, D13, Existing systems, Sc L6-1, Sc L6-2, Sc L6-3, Sc L6-4.

Twelve capabilities each wait for a named trigger. Activating one records the actual consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof. A possible future need is not a trigger. Three of the twelve have core rules written now, as children of this Spec, so that an activation starts from a rule set. The list of things that are not standing requirements closes the door on the rejected mechanisms.

## Intent

- outcome: Each of the twelve capabilities is installed only when its trigger appears, with an activation record, and none of the rejected mechanisms returns as a standing requirement (D18)

### Open questions

- [non-blocking] No trigger has fired; each capability's design is deferred until its activation record exists (D18, Decision method rule 4)

## Rule

- [deferred] The build writes a capability's design only after its activation record names the consumer, the shortfall of the simpler layer, the new failure boundary and the acceptance proof (D18, Decision method rule 4)
- Coalesced recomputation of a view waits for the trigger that recomputing a nonessential view per command costs too much and only the latest state matters (D18)
- An ordered event consumer waits for the trigger that every selected event matters and order changes the result; sequence is allocated per consumer partition in the source transaction (D18)
- Online rebuild of cross-stream history views waits for the trigger that the write pause is unacceptable for them (D18, D9)
- Explicit scope revision waits for the trigger that a decision must hold against a reviewed multi-entity scope (D18)
- A global ordered feed waits for the trigger that a real consumer needs one total order across contexts (D18, D2)
- A snapshot or archive tier waits for the trigger that rebuild cost or journal size exceeds its budget (D18)
- Cryptographic delegation waits for the trigger of independent issuers or trust boundaries (D18, D11)
- A durable circuit breaker waits for the trigger that a failing provider causes costly repeated attempts (D18, D14)
- A generic reservation library waits for the trigger that several real domains share reservation semantics (D18)
- A generic process manager waits for the trigger that several reactions share real correlation state (D18)
- A large fan-out dispatcher waits for the trigger that static fan-out no longer fits the transaction budget (D18, D13)
- An external broker or separate deployments wait for the trigger that independent consumers, retention, security or geography require them (D18)
- Activating a capability records the actual consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof; a possible future need is not a trigger (D18)
- Not standing requirements: aggregate base classes, asynchronous delivery per event, a command bus for internal calls, a DI lifecycle, runtime declaration registries, signing inside one trusted parent, telemetry that can veto a business write, a central event store with a global position, full-result receipts, a nested mutation per command (D18)
- A mechanism with no retained obligations and no consumer does not survive because a document named it (Existing systems, D18)

## Design

The activation record is the only artifact this layer adds before a trigger. It is a decision Spec in this corpus, not a runtime table.

- activationRecord: a decision Spec that refines the capability's Spec and carries the consumer, the shortfall, the failure boundary and the acceptance proof as its context, decision and consequences (D18)
- deferred: every capability's tables, functions and limits, written by the build after its activation record (D18)
