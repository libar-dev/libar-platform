---
id: spec:laws.law10-replay-never-runs-commands-or-effects
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Replay never runs commands or repeats effects

Law 10 · Detail: verbatim · Traces: Law 10; detailed by D5, D9.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The fold is the only thing replay does. Facts that matter historically are captured in events so replay never re-fetches them, and a rebuild writes read-model rows only, never events, receipts or obligations. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: Replaying a stream or rebuilding a read model folds recorded events and does nothing else (Law 10)
- value: A rebuild is safe to run online against live commands, and a restore cannot send a second email or charge a card (Law 10, D5, D9)

## Rule

- Replay and rebuild never run original commands or repeat external effects. (Law 10)
