---
id: spec:decisions.d08-read-models-in-command
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d02-context-owns-state-and-journal
  constrainedBy:
    - spec:facts.f07-queries-reactive-not-durable-delivery
    - spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Read models update inside the command

Provenance: carried from v0.1; departs from today's platform rule. Feature · Traces: D8, Law 9, Law 10, F7, F15, Probe 5, Sc L2-2, Sc L2-3.

The core path runs zero projection jobs and the simplest read that works wins. One entity's detail is an authorized component query returning a DTO; an essential list or summary is an indexed query or a read model updated in the command; a small cross-context view is a parent query over bounded component reads or a read model updated in the command; broad reporting is outside the baseline. Today's rule, never query CMS directly and use projections for all reads, is replaced: CQRS means separate contracts for commands and queries, not a second copy of every field. The decision depends on D2 because a context query returns the DTO the context chooses.

## Intent

- problem: A successful command followed by a query or subscription must show committed state without any worker; a projection job between the write and the read makes essential screens depend on queue recovery, and an invariant that reads such a view decides on stale data (Sc L2-2, Law 9)
- outcome: The core path runs zero projection jobs; the simplest read that works wins, and after a successful command an authorized query sees the committed state or a later one (D8)
- value: No event-to-WebSocket layer, no queue recovery for essential reads and no second copy of every field; reactive queries carry the freshness (D8, F7)
- risk: Every parent read of context data is a component call; Probe 3 gave its cost a first reading on a local backend, and its hosted cost is still open (D8, F4, F15)
- assumption: Queries are reactive; subscriptions synchronize state and are not durable event delivery (F7)
- assumption: A parent query calling a component query stays reactive (F15)

### Open questions

- [non-blocking] Probe 5 ran on 2026-10-01: a parent query over component queries stays reactive, and pagination crosses the boundary with pages pinned by their end cursors; the client hook lost rows after a capped page split, which slice S2 settles before it builds a list (Probe 5, F15, D8)

## Decision

- context: The concern is read freshness and where read models live; Convex gives reactive queries whose subscriptions synchronize state, and components whose queries return what the component chooses to expose (D8, F7, F2)
- alternative: Do nothing beyond Convex: an authorized component query returning a DTO, or an indexed query, for every read; this is the first default of the read-need table and the option chosen wherever it serves (D8, Decision method rule 2)
- alternative: Today's platform rule, never query CMS directly and use projections for all reads; rejected, because CQRS means separate contracts for commands and queries, not a second copy of every field (D8)
- alternative: Projection jobs on the core path that update read models after the command; rejected, because the core path runs zero projection jobs and no invariant may depend on a read model that updates later (D8, Law 9)
- alternative: An event-to-WebSocket layer that pushes events to clients; rejected, because reactive queries replace it (D8, F7)
- alternative: A read model updated inside the command where an indexed query does not serve; chosen as the second default (D8)
- decision: The core path runs zero projection jobs and the simplest read that works wins: one entity's detail is an authorized component query returning a DTO; an essential list or summary is an indexed query or a read model updated in the command; a small cross-context view is a parent query over bounded component reads or a read model updated in the command; broad reporting is outside the baseline (D8)
- rationale: After a successful command, an authorized query sees the committed state or a later one, and command results carry affected stream versions so a client can compare (D8, Sc L2-2)
- rationale: A context query returns a deliberate DTO and its private schema stays private, which is all CQRS requires (D8)
- consequence: A projection is named, versioned and deterministic; it never issues commands or causes effects, and live update and rebuild share its logic (D8, Law 10)
- consequence: Command results carry affected stream versions (D8)
- consequence: Reactive queries replace any event-to-WebSocket layer (D8, F7)
- consequence: A read model moved into the command transaction in an existing system needs one correct rebuild (D8, Existing systems)
- consequence: The standing cost is one read-model write inside each command that maintains one, counted against the command's budget, with no projection job, queue or recovery duty (D8, First experiment, Sc L2-3)
