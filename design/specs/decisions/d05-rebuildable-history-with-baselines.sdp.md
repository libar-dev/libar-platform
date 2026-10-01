---
id: spec:decisions.d05-rebuildable-history-with-baselines
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d03-events-only-source-of-next-state
---
# Rebuildable history by default, with baseline events

Provenance: carried from v0.1; baseline events widened from legacy import to a general tool. Feature · Traces: D5, Law 3, Law 10, Sc L2-7, Existing systems.

Domain streams are rebuildable from their events by default. Non-domain state uses ordinary authorized Convex mutations. A context may choose audit-only history explicitly, and then never advertises rebuild from events. The lasting cost of rebuildable history is evolution, and the tool that pays it is the baseline event: when a change in meaning leaves old events unable to reproduce current state, the migration writes a baseline event holding the migrated state and rebuild starts from the latest baseline. The decision depends on D3 because rebuild is the fold.

## Intent

- problem: Every change to `evolve` must still turn old events into the state saved today; when a change in meaning leaves old events unable to reproduce current state, a rebuild silently diverges from saved state (D5, Sc L2-7)
- outcome: Domain streams are rebuildable from their events by default, and a change in meaning is absorbed by a baseline event that rebuild starts from, with earlier events kept as readable history (D5)
- value: The rebuild promise survives evolution without keeping every old reducer version forever and without rewriting old events (D5)
- risk: Rebuildable history is a lasting cost in evolution: each `evolve` change is checked against old events, and a meaning change costs a migration that writes a baseline (D5)
- risk: A context that chooses audit-only history gives up rebuild and must say so; it never advertises rebuild from events (D5)

## Decision

- context: The concern is rebuild and its evolution over time; Convex gives schema migrations for a change of representation and nothing for a change of meaning (D5)
- alternative: Do nothing beyond Convex: audit-only history everywhere, with current state as the only truth and no rebuild promise; rejected as the default and kept as an explicit per-context choice (D5, Decision method rule 2)
- alternative: Keep every old reducer version forever so any event can always be folded; rejected, because old reducer versions are not kept forever (D5)
- alternative: Rewrite old events into the new meaning; rejected, because old events are never rewritten (D5)
- alternative: v0.1's rule, a new baseline only when importing legacy data; narrowed by the review into the general tool chosen here (D5)
- alternative: Rebuildable by default, with baseline events for changes of meaning; this is the option chosen (D5)
- decision: Domain streams are rebuildable from their events by default; non-domain state such as preferences, presence, caches and admin tables uses ordinary authorized Convex mutations; a context may choose audit-only history explicitly and then never advertises rebuild from events; when a change in meaning leaves old events unable to reproduce current state, the migration writes a baseline event holding the migrated state and rebuild starts from the latest baseline (D5)
- rationale: The lasting cost of rebuildable history is evolution, and the baseline event pays it without rewriting history or keeping every reducer (D5)
- consequence: Earlier events stay as readable history; old events are never rewritten; old reducer versions are not kept forever (D5, Sc L2-7)
- consequence: A change of representation without a change of meaning is a schema migration, not an event, and a `schemaVersion` field alone is not schema evolution (D5)
- consequence: Incomplete history in an existing system stays audit-only or gets a baseline event that starts a rebuildable epoch; past business events are never invented (D5, Existing systems, Law 3)
- consequence: The standing cost is one baseline event type per context, the migration that writes it, and the rebuild test that checks equality from the latest baseline (D5)
