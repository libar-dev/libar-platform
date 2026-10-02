---
id: spec:facts.f19-nested-calls-share-time-budgets.probe-11-component-calls
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f19-nested-calls-share-time-budgets
  verifies: spec:facts.f19-nested-calls-share-time-budgets
---
# Component calls per mutation

Native backend tier · Fixture composition · Backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124.

## Intent

- outcome: Establish the observed behavior on the pinned local backend.

```gwt
Given a parent mutation that calls an empty component mutation repeatedly
When the client increases the call count until the backend refuses the mutation
Then the error names {budget: "Your request timed out performing too many system operations."} time
And each empty component call reads {reads: 0} and writes {writes: 0} documents
```

## Verification — executable

- Every test owns a disposable native backend. Timings and call counts are recorded, not asserted, and say nothing about a hosted deployment.
- The first native run confirmed the expected distinction between system-operation time and execution time. The example binds the full observed error text. A run that never reaches a refusal fails.
- Successful call counts, the first refused requested count, wall time and top-level completion time are recorded under the stated load. The failed request cannot return its exact completed-call count.
- A twenty-call control also inserts and reads one document per component call, asserts one read and one write per call, and records transaction metrics and completion usage. The example verifies F19 only; it does not compare against a plain helper for F4.
