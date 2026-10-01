---
id: spec:decisions.d03-events-only-source-of-next-state
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d02-context-owns-state-and-journal
---
# Events are the only source of the next state

Provenance: carried from v0.1; the two gaps at the end are new. Feature · Traces: D3, Law 2, Law 3, Law 10, Sc L0-1, Sc L0-2, E-1, E-2, OQ3.

`decide(state, command, context)` returns events and a result, or a rejection. The persistence adapter computes the next state as `fold(evolve, state, newEvents)` and saves it. The decider never returns a separate state patch. Commands load current state and apply only the new events; they never replay history. Today's platform has two authorities and nothing keeps them in step; one authority makes state and history agree by construction. The decision depends on D2 because the fold and the save happen inside the context that owns the state. The two gaps the doc names, initial state and state across several documents, are ruled provisionally by Package B as extensions E-1 and E-2.

## Intent

- problem: Today's decider returns a `stateUpdate` the handler saves while a separate `evolve` sits beside it, so saved state and folded history can disagree, and a rebuild from the creation event has no defined start (D3, Sc L0-2)
- outcome: The next state is `fold(evolve, state, newEvents)` and nothing else, so rebuilding a stream from its events gives the saved business state (D3, Law 3)
- value: State and history agree by construction; the equality is a test, and pure domain code needs no database, network, scheduler, environment or ambient auth (D3)
- risk: Every change to `evolve` must still turn old events into the state saved today; the tool for that is the baseline event, and its cost is D5's (D3, D5)
- risk: When a stream's state spans several documents, the mapping from folded state to documents must live in one place per context or a second source of state creeps back (D3, E-2)

### Open questions

- [non-blocking] Gap, initial state: the v0.1 interface has none; add `initial()` or let `evolve` accept an empty state so a rebuild from the creation event has a defined start; ruled provisionally as E-1 in the kernel's initial-state decision (D3, E-1)
- [non-blocking] Gap, state across several documents: prefer one document per stream while it fits the size budget, and where it cannot, derive the document writes from the folded state in one place per context; ruled provisionally as E-2 in the kernel's state-document mapping decision, with the size budget open under OQ3 (D3, E-2, OQ3)

## Decision

- context: The concern is that state and history stay one truth; Convex gives a serializable mutation to save both in, and no opinion on how the next state is computed, so the authority question belongs to the domain kernel alone (D3, F1)
- alternative: Do nothing beyond Convex: the decider returns a state patch that the handler saves, and `evolve` exists beside it for rebuild; rejected, because nothing keeps the two in step, which is today's platform (D3, Decision method rule 2)
- alternative: Replay the whole history on every command instead of loading current state; rejected, because commands load current state and apply only the new events (D3)
- alternative: One authority, where `decide` returns events, the adapter folds them with `evolve` and saves the result; this is the option chosen (D3)
- decision: `decide(state, command, context)` returns events and a result, or a rejection; the persistence adapter computes the next state as `fold(evolve, state, newEvents)` and saves it; the decider never returns a separate state patch; commands load current state and apply only the new events and never replay history (D3)
- rationale: Today's platform has two authorities, at `libar-platform/packages/platform-core/src/orchestration/deciderHandler.ts:247` and `libar-platform/packages/platform-decider/src/types.ts:82` and `:224` in convex-event-sourcing at `538314e8a`, and nothing keeps them in step (D3)
- rationale: One authority makes state and history agree by construction (D3, Law 3)
- consequence: Rebuilding a stream from its events must give the saved business state, and that equality is a test (D3, Sc L0-2)
- consequence: Pure domain code reads no database, network, scheduler, environment or ambient auth; time and outside facts enter as inputs (D3, Sc L0-1)
- consequence: Facts that matter historically, such as accepted price, currency or policy version, are captured in events and never re-fetched during replay (D3, Law 10)
- consequence: The initial-state gap: add `initial()` or let `evolve` accept an empty state, so a rebuild from the creation event has a defined start (D3, E-1)
- consequence: The multi-document gap: prefer one document per stream while it fits the size budget; where it cannot, derive the document writes from the folded state in one place per context, never by hand per command (D3, E-2, OQ3)
- consequence: The standing cost is one `evolve` per context that must keep old events readable, paid through baseline events when meaning changes (D3, D5)
