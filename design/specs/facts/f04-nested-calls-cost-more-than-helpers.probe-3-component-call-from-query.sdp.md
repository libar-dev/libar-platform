---
id: spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-query
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f04-nested-calls-cost-more-than-helpers
  verifies: spec:facts.f04-nested-calls-cost-more-than-helpers
---
# Probe 3: the cost of a component call from a query

Probe 3 · native tier · fixture composition.

## Intent

- outcome: One component call costs more than a helper call, by an amount the run records. (Probe 3, F4)

```gwt
Given a parent query that reads the same document {reads: 50} times in a row through one of three paths: a helper function, a nested query, a component query
When a client calls the parent query once for each path, several times over, with arguments that defeat the query cache
Then the median execution time through the component is {componentAgainstHelper: "higher"} than through the helper
And the function log holds {recordsPerCall: 1} completion record for one parent call through the component
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The execution time is the one the backend's function log reports for the parent call, because the clock inside a query does not advance; the run's evidence holds the three medians and the difference per call.
- A cached query also logs a completion record, with `cachedResult` true and a time near zero, so the test gives each call fresh arguments and counts a sample only when its record says the result was not cached.
- The size is recorded and not asserted. It is a local backend's time on one machine, a first reading for OQ1 and not a hosted deployment's cost.
- Function-call quota is not measured, for the reason the mutation example gives.
