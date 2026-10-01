---
id: spec:decisions.d18-everything-else-waits-for-trigger
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d09-rebuild-online-by-default
    - spec:decisions.d13-deferred-work-is-an-obligation
---
# Everything else waits for its trigger

Provenance: carried from v0.1. Feature · Traces: D18, D9, D13, Sc L6-1, Sc L6-2, Sc L6-3, Sc L6-4.

Twelve capabilities each wait for a named trigger. Activating one records the actual consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof. A possible future need is not a trigger. The core rules of the three Layer 6 capabilities are written now, so an activation starts from a rule set, and the list of things that are not standing requirements closes the door on the rejected mechanisms. The decision depends on D9 because the cross-stream online rebuild extends its write pause, and on D13 because the large fan-out dispatcher extends its static fan-out.

## Intent

- problem: A capability installed for a possible future need brings its failure boundary, its registrations and its operator duties before any consumer exists, and a document that names it keeps it alive (D18, Existing systems)
- outcome: Each of the twelve capabilities is installed only when its trigger appears, and activating one records the consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof (D18)
- value: The platform stays at the lowest profile its capabilities need, and every added mechanism has a recorded reason (D18)
- risk: A trigger recognized late costs a design pass under pressure; the core rules for the three Layer 6 capabilities are written now so that pass starts from a rule set (D18)

## Decision

- context: The concern is speculative capability; Convex and its components give what Layers 0 to 5 need, and none of the twelve capabilities below is a standing requirement (D18)
- alternative: Do nothing beyond Convex: install nothing until a trigger appears; this is the option chosen (D18, Decision method rule 2)
- alternative: Install capabilities for a possible future need; rejected, because a possible future need is not a trigger (D18)
- decision: Each capability waits for its trigger: coalesced recomputation of a view, when recomputing a nonessential view per command costs too much and only the latest state matters; an ordered event consumer, when every selected event matters and order changes the result; online rebuild of cross-stream history views, when the write pause is unacceptable for them; explicit scope revision, when a decision must hold against a reviewed multi-entity scope; a global ordered feed, when a real consumer needs one total order across contexts; a snapshot or archive tier, when rebuild cost or journal size exceeds its budget; cryptographic delegation, for independent issuers or trust boundaries; a durable circuit breaker, when a failing provider causes costly repeated attempts; a generic reservation library, when several real domains share reservation semantics; a generic process manager, when several reactions share real correlation state; a large fan-out dispatcher, when static fan-out no longer fits the transaction budget; an external broker or separate deployments, when independent consumers, retention, security or geography require them (D18)
- rationale: Activating one records the actual consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof; a possible future need is not a trigger (D18)
- consequence: Coalesced recomputation, when active, follows these rules: the command marks a scoped view key dirty in its own transaction, and several changes can share one pending recompute; a recompute reads authoritative state, updates the view and clears only the work it covered, with optimistic concurrency keeping a newer mark from being cleared; a computation that must leave the transaction captures every source version and membership it depends on and validates them before publishing; the view shows its staleness, no command decides from it, and it cannot serve a view that needs every event (D18, Sc L6-1)
- consequence: An ordered consumer, when active, follows these rules: order is per tenant, consumer, generation and partition, with the smallest partition the view's meaning allows; the source transaction allocates a contiguous consumer sequence, which differs from the stream version, so a filtered consumer never waits for events it did not subscribe to; a worker applies a bounded contiguous batch and never skips a failed head; a poison event blocks only its partition, and skipping it is an authorized, recorded data-loss decision that the consumer contract says whether it allows (D18, Sc L6-2, Sc L6-3)
- consequence: Online rebuild of cross-stream views, when active, follows these rules: declare the rebuild class first, per entity, bounded current state, or history across streams; a vector of per-stream positions is bookkeeping and does not prove a consistent cut; history across streams needs a dependency protocol or a real consistent source cut, and until that exists these views rebuild under the write pause (D18, D9, Sc L6-4)
- consequence: Not standing requirements: aggregate base classes, asynchronous delivery per event, a command bus for internal calls, a DI lifecycle, runtime declaration registries, signing inside one trusted parent, telemetry that can veto a business write, a central event store with a global position, full-result receipts, a nested mutation per command (D18)
- consequence: The standing cost is none until a trigger fires; each activation then pays its own recorded cost (D18)
