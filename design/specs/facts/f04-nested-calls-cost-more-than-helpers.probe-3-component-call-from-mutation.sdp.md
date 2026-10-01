---
id: spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f04-nested-calls-cost-more-than-helpers
  verifies: spec:facts.f04-nested-calls-cost-more-than-helpers
---
# Probe 3: the cost of a component call from a mutation

Probe 3 · native tier · fixture composition.

## Intent

- outcome: One component call costs more than a helper call, by an amount the run records. (Probe 3, F4)

```gwt
Given a parent mutation that reads the same document {reads: 50} times in a row through one of three paths: a helper function, a nested query, a component query
When a client calls the parent mutation once for each path, several times over
Then the median execution time through the component is {componentAgainstHelper: "higher"} than through the helper
And the local function log holds {recordsPerCall: 1} completion record for one parent call through the component, the parent's own
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The execution time is the one the backend's function log reports for the parent call; the run's evidence holds the three medians and the difference per call.
- The test checks that each path read the document the bound number of times before it accepts a sample.
- The size is recorded and not asserted. It is a local backend's time on one machine, a first reading for OQ1 and not a hosted deployment's cost.
- Function-call quota is not measured. A local backend has none, and its function log holds one completion record for the parent call and none for the calls inside it, which does not say how a hosted deployment counts them. That half of Probe 3 needs a hosted deployment and stays open on F4.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
