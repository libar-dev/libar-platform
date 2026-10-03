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

Probe 1 · native backend tier · fixture composition.

## Intent

- outcome: The client retries until confirmed and the backend executes the call once. (Probe 1, F5)

```gwt
Given a WebSocket client, the ConvexClient of convex/browser, that sends a mutation which inserts one marker row
When the backend process is killed and restarted on the same storage while the client stays open, in each of {trials: 10} trials
Then the mutation's promise resolves after the restart in {resolvedTrials: 10} trials
And every trial leaves exactly {markerRows: 1} marker row
And at least {leastKilledBeforeCommit: 1} trial was killed before its commit and at least {leastKilledAfterCommit: 1} after it
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The client is `ConvexClient` from `convex/browser`, which sends mutations through the same `BaseConvexClient` as the React client; the React client itself is not run.
- The kill is a SIGKILL, sent after a delay that the trials spread from none to a few tens of milliseconds. The test holds the backend's responses back from the client, reads the marker table with admin access after the restart and before the client reconnects, and so tells a kill before the commit from a kill after it.
- A trial killed after its commit is the one that tests the guarantee: the client never saw the result, sends the mutation again when it reconnects, and the backend must not run it twice.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
