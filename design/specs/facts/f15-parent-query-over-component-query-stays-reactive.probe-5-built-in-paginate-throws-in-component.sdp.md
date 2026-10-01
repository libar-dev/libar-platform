---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-built-in-paginate-throws-in-component
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: the built-in paginate throws inside a component

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The built-in `.paginate()` cannot serve a list inside a component, so a context list pages through `paginator`. (Probe 5, F15, S4)

```gwt
Given a component query that calls the built-in paginate on its own table
When a client reads it through a parent query
Then the read fails with an error that says paginate is only supported in the app
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the error's message contains `paginate() is only supported in the app`, and that the same parent query over a component query built with `paginator` on the same table returns its page.
