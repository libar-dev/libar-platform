---
id: spec:kernel.initial-state
kind: decision
altitude: story
readiness: defined
relations:
  refines: spec:kernel.domain-kernel
  dependsOn: spec:decisions.d03-events-only-source-of-next-state
---
# Initial state comes from initial()

Provenance: new; the doc names the gap and offers two options. Story · Traces: D3, D5, Sc L0-2, Sc L2-7, E-1.

The v0.1 interface had no initial state, so a rebuild from the creation event had no defined start. The doc offers two repairs: add `initial()`, or let `evolve` accept an empty state. This decision takes `initial()` provisionally, so that the state type is total, a stream that does not exist yet is represented by a defined value at version 0, and `fold` has a start without a special case in every `evolve`. A stream with a baseline event starts its rebuild from the baseline's state instead, which D5 rules.

## Intent

- outcome: Every rebuild and every command on a new stream has one defined starting state, returned by the decider's `initial()` (D3, E-1)
- value: The state type has no empty case to handle in every `evolve` branch, and a creation command is decided against a real value instead of `undefined` (E-1)
- risk: A decider must write `initial()` even when its natural start is trivial, and a context that migrates from v0.1 must add it (E-1)

### Open questions

- [non-blocking] Extension E-1: the doc offers `initial()` or an `evolve` that accepts an empty state and rules on neither; this Spec takes `initial()` provisionally and the owner confirms or reverses it (D3, E-1)

## Decision

- context: The concern is where a fold starts; the kernel is pure TypeScript and Convex has no opinion, and the v0.1 interface simply had no start, so a rebuild from the creation event was undefined (D3, E-1)
- alternative: Do nothing beyond the v0.1 interface: no initial state, and the adapter passes `undefined` into the first `evolve`; rejected, because a rebuild from the creation event has no defined start, which is the gap the doc names (D3, Decision method rule 2)
- alternative: Let `evolve` accept an empty state, so the state type is `S | undefined` and every branch of `evolve` and `decide` handles the empty case; rejected, because it spreads the empty case through every decider and `fold` still needs a start value (D3, E-1)
- alternative: Add `initial()` to the decider, returning a defined empty state of type `S`; this is the option chosen (D3, E-1)
- decision: The decider declares `initial(): S`; a stream that does not exist is loaded as `initial()` at version 0; a rebuild without a baseline folds `evolve` from `initial()` over every event; a rebuild with a baseline folds from the state the latest baseline holds over the events after it (D3, D5, E-1)
- rationale: A total state type keeps `evolve` and `decide` free of an empty case and makes the creation command an ordinary decision against a real value (E-1)
- rationale: The fold has a start by construction, so the rebuild equality test has a defined left-hand side for every stream, including one with a single creation event (Sc L0-2)
- consequence: The rebuild scenario for a stream with a baseline starts from the baseline's state, not from `initial()`; the two starts are the only two (D5, Sc L2-7)
- consequence: A creation command plans its stream with expected version 0, so the adapter answers an existing subject with the reserved `entityExists` before `decide` runs and the decider always decides a create against `initial()`; that indexed read in the same transaction is the uniqueness check by which a duplicate create with a client-generated ID is refused inside the context (D6, E-21, Sc L1-4)
- consequence: The standing cost is one `initial()` per decider and nothing at runtime (E-1)

## Design

- fnInitial: `initial: () => S` on `Decider<S, C, E, R>`, called by the adapter when the identity index finds no stream row and by `rebuild` when no baseline exists (D3, E-1)
- loadedVersionForNewStream: a stream with no row loads as `{ state: initial(), version: 0, exists: false }` and its first append expects version 0 (D2, E-1)
- createExpectsVersionZero: an operation that creates a subject plans its command with `expectedVersion: 0`; the adapter's expected-version step answers a loaded row with the reserved `entityExists` instead of `staleVersion`, so `decide` never sees a create against an existing state (D6, E-21, Sc L1-4)
- baselineStart: when the stream row carries a `baselineVersion`, rebuild reads the baseline event at that version and folds from the state it holds over the events with a greater version (D5, E-1)

## Verification — reviewed

- A reviewer confirms that every decider declares `initial()` and that the rebuild test covers a stream with exactly one event.
