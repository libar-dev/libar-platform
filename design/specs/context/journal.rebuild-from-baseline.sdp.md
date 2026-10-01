---
id: spec:context.journal.rebuild-from-baseline
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.journal
  verifies: spec:context.journal
---
# Rebuild a stream that has a baseline event

Sc L2-7 · native tier.

## Intent

- outcome: Equals saved state; earlier events still readable. (Sc L2-7)

```gwt
Given a stream with {before: 5} events recorded under an earlier meaning of its events
And a migration wrote a baseline event holding the migrated state at version {baseline: 6}
And {after: 2} events were recorded after the baseline
When the stream is rebuilt from its journal
Then the rebuilt state {rebuilt: "equals"} the saved state
And the rebuilt stream version is {version: 8}
And the events before the baseline are {earlier: "readable"}
And the number of events applied through evolve is {applied: 2}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend, the five earlier events are written by the old reducer's version of the context, and the new version registers a `BaselineMigration` on the stream type whose `migrate` maps the saved state to the new meaning and raises the registration's `stateSchemaVersion`.
- The test runs the same bound point under both orderings of the migration window. In the sweep-first run a parent test mutation calls `maintenance.writeBaseline` through `ctx.runMutation` with the migration's name before any command; the call returns `written` of 1 and `nextAfterStreamId` of `null`, and the two later commands append versions 7 and 8. In the command-first run a command reaches the stream before the driver: the adapter writes the baseline at 6 on load and the command's event at 7 in one sub-transaction, the second command appends 8, and the driver's batch, run afterwards, returns `written` of 0, `skipped` of 1 and `nextAfterStreamId` of `null`, so the sweep and the live command never race and no second baseline exists.
- In both runs the `rebuild` query reports `fromBaseline` of 6, `eventsApplied` of 2 and `equal` true; the `history` query returns all eight events in version order, the first five with their original payloads and the sixth with `causedBy` of kind `migration`; and before the baseline is written in the command-first run the `rebuild` query answers `refused` with reason `awaitingBaseline`, never `equal` false.
