---
id: spec:facts.f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f05-react-client-retries-until-confirmed
  verifies: spec:facts.f05-react-client-retries-until-confirmed
---
# Probe 1: a client closed with a pending mutation

Probe 1 · native tier · fixture composition.

## Intent

- outcome: The backend executes the call once or not at all, never more. (Probe 1, F5)

```gwt
Given a WebSocket client that sends a mutation which inserts one marker row
When the client is closed before the mutation's result arrives, in each of {trials: 20} trials
Then no trial leaves more than {mostMarkerRows: 1} marker row
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test records how many trials left no row and how many left one, which is the measure of what a closed tab can lose.
