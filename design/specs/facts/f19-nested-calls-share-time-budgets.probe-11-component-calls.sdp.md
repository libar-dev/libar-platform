---
id: spec:facts.f19-nested-calls-share-time-budgets.probe-11-component-calls
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f19-nested-calls-share-time-budgets
  verifies: spec:facts.f19-nested-calls-share-time-budgets
---
# Probe 11: component calls per mutation

Probe 11 · native tier · fixture composition.

## Intent

- outcome: A mutation that repeats empty component calls is refused with the system-operation error after a count the run records, and an empty call reads and writes no document. (Probe 11, F19)

```gwt
Given a parent mutation that calls an empty component mutation repeatedly
When the client increases the call count until the backend refuses the mutation
Then the refused mutation's error is {budget: "Your request timed out performing too many system operations."}
And each empty component call reads {reads: 0} and writes {writes: 0} documents
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend. Times and call counts are recorded, not asserted, and say nothing about a hosted deployment.
- The expectation written before the first run, a refusal distinct from the one-second execution limit, held; the example binds the full error text that run showed. A run that never reaches a refusal fails.
- Successful call counts, the first refused requested count, wall time and top-level completion time are recorded in the run's evidence, marked as taken under load unless `LIBAR_TIMINGS_UNDER_LOAD=0` says the machine was otherwise idle. The failed request cannot return its exact completed-call count.
- A twenty-call control also inserts and reads one document per component call, asserts one read and one write per call, and records transaction metrics and completion usage. The example verifies F19 only; it does not compare against a plain helper for F4.
