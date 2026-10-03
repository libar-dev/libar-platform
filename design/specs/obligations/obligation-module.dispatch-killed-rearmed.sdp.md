---
id: spec:obligations.obligation-module.dispatch-killed-rearmed
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  verifies: spec:obligations.obligation-module
---
# Kill a dispatch before work

Sc L3-2 · native backend tier · first of two cases: the dispatch is cancelled before the wrapper runs.

## Intent

- outcome: The obligation remains; a bounded rearm follows. (Sc L3-2)

```gwt
Given an obligation is pending for a local reaction with attempt number {attempt: 1}
And its dispatch is {dispatch: "killed before work"}
And the effect body {body: "succeeds"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects: 0} times
And the obligation is {status: "pending"}
And a bounded rearm {rearm: "follows"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test cancels the first dispatch with `ctx.scheduler.cancel` before it starts, so its `_scheduled_functions` row is Canceled, then advances past the grace and runs `sweep` (F16, S6).
- The test asserts, before the rearmed dispatch executes, that the obligation is pending with `rearmCount` 1, a new `activeAttemptId`, the same `attemptNumber`, and a `dispatchId` whose row is Pending (D13).
- The test then lets the rearmed dispatch run and asserts the obligation succeeded with one effect, and that a sixth kill in a row moves it to needs attention with reason `recoveryFailing` (D13, Sc L3-4).
