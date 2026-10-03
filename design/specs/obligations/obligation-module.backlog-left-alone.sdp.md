---
id: spec:obligations.obligation-module.backlog-left-alone
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  verifies: spec:obligations.obligation-module
---
# Legitimate backlog builds up

Sc L3-3 · native backend tier.

## Intent

- outcome: Queued work is not replaced for not having started. (Sc L3-3)

```gwt
Given an obligation is pending for a local reaction with attempt number {attempt: 1}
And its dispatch is {dispatch: "queued behind a backlog"}
And the effect body {body: "succeeds"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects: 0} times
And the obligation is {status: "pending"}
And a bounded rearm {rearm: "does not follow"}
And the queued dispatch is {queued: "left alone"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test creates enough scheduled work ahead of the dispatch that its `_scheduled_functions` row stays Pending past the grace, then runs `sweep` (F16).
- The test asserts that the obligation's `activeAttemptId`, `dispatchId` and `rearmCount` are unchanged after the sweep, and that the sweep's counts show it as left alone (D13, Sc L3-3).
- The test asserts that once the backlog drains the original dispatch runs and the obligation succeeds with one effect (D13).
