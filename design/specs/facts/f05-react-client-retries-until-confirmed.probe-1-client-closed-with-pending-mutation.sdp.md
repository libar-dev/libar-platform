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
Given a WebSocket client, the ConvexClient of convex/browser, that sends a mutation which inserts one marker row
When the client is closed before the mutation's result reaches it, in each of {trials: 20} trials
Then no trial leaves more than {mostMarkerRows: 1} marker row
And at least {leastCommittedUnconfirmed: 1} trial leaves its row although its client never received the result
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The client is `ConvexClient` from `convex/browser`, which sends mutations through the same `BaseConvexClient` as the React client; the React client itself is not run.
- The test holds the backend's responses back from the client, so every close happens with the mutation pending, and varies the time between the send and the close.
- The test records how many trials left no row and how many left one, which is the measure of what a closed tab can lose.
