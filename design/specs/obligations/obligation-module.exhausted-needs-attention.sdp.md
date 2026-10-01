---
id: spec:obligations.obligation-module.exhausted-needs-attention
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  verifies: spec:obligations.obligation-module
---
# Exhaust retries, including failures of recovery itself

Sc L3-4 · native tier.

## Intent

- outcome: Needs attention, with a working operator exit. (Sc L3-4)

```gwt
Given an obligation is pending for a local reaction with attempt number {attempt: 8}
And its dispatch is {dispatch: "healthy"}
And the effect body {body: "fails with a retryable error"}
And the attempt budget allows {attemptsLeft: 0} more attempts
And recovery itself {recovery: "keeps failing"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects: 0} times
And the obligation is {status: "needs attention"}
And the operator exit {exit: "works"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test drives the body to throw a transient error on every attempt until `attemptCount` reaches `maxAttempts`, and asserts the obligation is in needs attention with reason `exhausted`, no event committed, and `lastError` of class `retryable` (D13, F3).
- The test separately drives `recoverOne` to throw on every rearm and asserts that the rearm count still climbs and the obligation reaches needs attention with reason `recoveryFailing` (D13, Sc L3-4).
- The test calls `retry`, `cancel` and `abandon` as an operator and asserts each allowed transition writes a repair and each refused one writes nothing (D13, Law 8).
