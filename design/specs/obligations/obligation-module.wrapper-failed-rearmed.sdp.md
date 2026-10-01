---
id: spec:obligations.obligation-module.wrapper-failed-rearmed
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  verifies: spec:obligations.obligation-module
---
# Fail the scheduled wrapper

Sc L3-2 · native tier · second of two cases: the wrapper itself throws outside the body's catch.

## Intent

- outcome: The obligation remains; a bounded rearm follows. (Sc L3-2)

```gwt
Given an obligation is pending for a local reaction with attempt number {attempt: 1}
And its dispatch is {dispatch: "failing in the wrapper"}
And the effect body {body: "succeeds"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects: 0} times
And the obligation is {status: "pending"}
And a bounded rearm {rearm: "follows"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test injects a developer error into the wrapper after the body returned and before the settle patch, so the whole scheduled mutation rolls back and its `_scheduled_functions` row is Failed (F9, F3).
- The test asserts that no event of the body and no patch of the obligation survived, that the obligation is still pending on the old attempt ID, and that `sweep` rearms it once the grace has passed (D13, Sc L3-2).
- The test asserts the rearm is bounded: after the rearm bound is reached the obligation is in needs attention with reason `recoveryFailing` and `retry` works from there (D13, Law 8).
