---
id: spec:processes.workflow-processes.restart-after-external-step
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:processes.workflow-processes
  verifies: spec:processes.workflow-processes
---
# Restart a process after an external step completed

Sc L4-1 · native tier.

## Intent

- outcome: The step does not repeat; progress is correct. (Sc L4-1)

```gwt
Given a process has requested a payment effect as an obligation and the obligation settled succeeded with provider evidence
And the process run is interrupted before its next step is journaled
When the process is restarted
Then the payment effect is requested {paymentRequests: 1} times in total
And the process continues from the confirmation step with the obligation's evidence
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test interrupts the run after the obligation settled and before the workflow journaled the wait's result, restarts the run, and asserts the provider stub recorded one effect and the obligation has one attempt (D16, D15).
- The test asserts the process record's status moved from awaiting payment to confirmed exactly once (D16, Law 7).
