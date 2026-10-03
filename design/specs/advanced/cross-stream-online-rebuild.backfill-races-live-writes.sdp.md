---
id: spec:advanced.cross-stream-online-rebuild.backfill-races-live-writes
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:advanced.cross-stream-online-rebuild
  verifies: spec:advanced.cross-stream-online-rebuild
---
# A cross-stream backfill races live writes and new subjects, then cuts over

Sc L6-4 · native backend tier.

## Intent

- outcome: No overwrite, no missing subject, no side-effect replay. (Sc L6-4)

```gwt
Given a cross-stream history view is being rebuilt online into generation {generation: 2} under a consistent source cut
And live commands write {liveWrites: 10} events and create {newSubjects: 2} subjects during the backfill
When the backfill completes and the active generation is switched
Then no row of generation {generation: 2} is older than its source versions and every subject including the {newSubjects: 2} new ones is present
And no command was run and no external effect was repeated by the rebuild
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts the switched generation equals a fold of every stream at the cut, that the old generation is kept for rollback, and that the obligation and provider stubs recorded nothing during the rebuild (D18, D9, Law 10).
