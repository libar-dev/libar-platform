---
id: spec:constraints.one-call-per-context-per-use-case
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d10-contexts-meet-in-parent-use-cases
---
# One call per context per use case

Cost target · Traces: First experiment, D10, Sc L2-3.

The third cost target, the review's addition to the order-size scenario. Context APIs take lists, so a use case makes one call per context rather than one per line. O(N) business work inside the context is fine; O(N) component calls or orchestration in the parent is not the default. The experiment counts `ctx.runMutation` calls on component references per `PlaceOrder` and expects one for Orders and one for Inventory at every order size.

## Intent

- outcome: Keep a use case at one component call per context, so the cost of composition does not grow with the size of the order (First experiment, D10)
- value: The component call is the unit whose cost Probe 3 measures; holding it at one per context keeps that cost constant per command (D10, Probe 3)

## Constraints

- statement: A use case makes exactly one component call per context it involves, whatever the number of lines or items in its input (First experiment, D10)
- flavor: cost
- target: component-calls.per-context.per-use-case.eq:1
- measurableBy: a pure test that runs `PlaceOrder`'s executor against a ctx whose `runMutation` and `runQuery` count calls by function reference and answer a canned operation outcome, for 1 line, 10 lines and the maximum; the backend's function log holds no record for a component call inside a mutation, so it cannot count them (First experiment, Sc L2-3, E-47)
