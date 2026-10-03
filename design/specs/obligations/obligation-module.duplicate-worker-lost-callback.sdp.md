---
id: spec:obligations.obligation-module.duplicate-worker-lost-callback
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  verifies: spec:obligations.obligation-module
---
# Duplicate a local worker and lose any completion callback

Sc L3-1 · native backend tier.

## Intent

- outcome: One effect; the obligation's truth does not depend on a callback. (Sc L3-1)

```gwt
Given an obligation is pending for a local reaction with attempt number {attempt: 1}
And its dispatch is {dispatch: "duplicated"}
And the completion callback is {callback: "lost"}
And the effect body {body: "succeeds"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects: 1} times
And the obligation is {status: "succeeded"}
And the truth about completion comes from {truth: "the obligation record"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test invokes `runAttempt` twice with the same obligation ID and attempt ID; the second invocation returns without a write because the fence on `activeAttemptId` refuses it (D13).
- The test drops any completion notification and asserts that `status`, `completionEvidence` and the body's events are consistent by reading the obligation and the journal, never a callback (Law 7).
- The test asserts exactly one event set was appended by the body, by counting events under the obligation's operation ID (D13, D2).
