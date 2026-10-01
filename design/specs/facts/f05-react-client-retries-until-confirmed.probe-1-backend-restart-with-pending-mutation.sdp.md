---
id: spec:facts.f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f05-react-client-retries-until-confirmed
  verifies: spec:facts.f05-react-client-retries-until-confirmed
---
# Probe 1: a backend restart with a mutation in flight

Probe 1 · native tier · fixture composition.

## Intent

- outcome: The client retries until confirmed and the backend executes the call once. (Probe 1, F5)

```gwt
Given a WebSocket client that sends a mutation which inserts one marker row
When the backend process is killed and restarted on the same storage while the client stays open, in each of {trials: 10} trials
Then the mutation's promise resolves after the restart {resolves: true}
And every trial leaves exactly {markerRows: 1} marker row
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The kill is a SIGKILL sent a short random time after the send, so that some trials die before the commit and some after it, and the test records the split.
