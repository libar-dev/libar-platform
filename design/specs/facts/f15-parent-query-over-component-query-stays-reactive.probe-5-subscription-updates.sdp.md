---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a subscription to a parent query follows the component's data

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The subscription updates. (Probe 5, F15)

```gwt
Given a client subscribed to a parent query that reads no table of its own and returns what a component query reads
When a mutation changes the document inside the component
Then the subscription delivers {updates: 1} changed value without the client asking again
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The client is a `ConvexClient` over a WebSocket, and the test fails if no update arrives within a stated wait.
