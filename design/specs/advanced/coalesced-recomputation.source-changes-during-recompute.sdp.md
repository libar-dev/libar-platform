---
id: spec:advanced.coalesced-recomputation.source-changes-during-recompute
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:advanced.coalesced-recomputation
  verifies: spec:advanced.coalesced-recomputation
---
# Source changes during a coalesced recompute

Sc L6-1 · native backend tier.

## Intent

- outcome: The change stays covered or dirty. (Sc L6-1)

```gwt
Given a view key is dirty with mark version {markBefore: 1} after {changes: 3} commands
And a recompute has read authoritative state for that mark
And a further command dirties the same key with mark version {markAfter: 2} before the recompute publishes
When the recompute publishes and clears the work it covered
Then the key is still dirty at mark version {markAfter: 2} or the published view covers the later change
And the view reports its staleness
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test asserts the recompute's clear conflicts under optimistic concurrency with the later mark or clears only the earlier one, and that a following recompute covers the change (D18, F1).
