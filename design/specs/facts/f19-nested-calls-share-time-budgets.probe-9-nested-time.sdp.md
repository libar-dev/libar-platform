---
id: spec:facts.f19-nested-calls-share-time-budgets.probe-9-nested-time
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f19-nested-calls-share-time-budgets
  verifies: spec:facts.f19-nested-calls-share-time-budgets
---
# Probe 9: nested calls reach a time boundary

Probe 9 · native tier · fixture composition.

## Intent

- outcome: A mutation that repeats empty nested calls is refused with the system-operation error, and a loop of computation is refused with the one-second execution error. (Probe 9, F19)

```gwt
Given a parent mutation that calls an empty nested mutation repeatedly
When the client increases the call count until the backend refuses the mutation
Then the refused mutation's error is {budget: "Your request timed out performing too many system operations."}
And a loop of computation in one mutation fails with {cpu: "Function execution timed out (maximum duration: 1s)"}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend. Times and call counts are recorded, not asserted, and say nothing about a hosted deployment.
- The expectation written before the first run, a refusal distinct from the one-second execution limit, held; the example binds the full error text that run showed. A run that never reaches a refusal fails.
- Successful call counts, the first refused requested count, wall time and top-level completion time are recorded in the run's evidence, marked as taken under load unless `LIBAR_TIMINGS_UNDER_LOAD=0` says the machine was otherwise idle. The failed request cannot return its exact completed-call count.
