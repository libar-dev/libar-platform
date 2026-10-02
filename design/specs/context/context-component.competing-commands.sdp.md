---
id: spec:context.context-component.competing-commands
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  verifies: spec:context.context-component
---
# Two commands compete for the same stock

Sc L1-11 · native tier · fixture composition · first of two cases.

The fixture composition binds it. An ordinary client stocks one unit of a product in the depot context. Two other ordinary clients then send the ClaimStock command for that unit through its public entry at once, and the depot's claimStock operation plans a claim on the product's stock stream with no expected version. Both calls load version 1; one commits, the engine reruns the other, and the rerun decides against the stock the winner left. The unique-value case is the second.

## Intent

- outcome: Invariant holds; a logical conflict is told apart from an engine retry. (Sc L1-11)

```gwt
Given a context component mounted by the parent with a stream at version {version: 1} in state {state: "stock of 1"}
And {callers: 2} callers send the same kind of command at the same time
When the parent calls the context operation {operation: "claim one unit"} through the component API
Then the first caller's outcome is {first: "applied"}
And the second caller's outcome is {second: "rejection"}
And the rejection code is {code: "insufficientStock"}
And the stream version afterwards is {after: 2}
And the number of events appended is {appended: 1}
And decide ran against {evaluated: "the fresh state"}
And the callers saw {saw: "no engine retry and no version conflict"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend, and the two parent mutations are issued at once from two ordinary clients, each holding a fixture-issuer token and a grant an operator gave with admin access, so that the backend runs them concurrently.
- The first and second callers are the callers in the order their final attempts complete in the function log.
- Exactly one `claimed` event exists at version 2 and the stock reads 0; the loser's `ConvexError` carries the context's `insufficientStock` code with `details.onHand` of 0, the stock the winner left, and not `staleVersion`; neither caller received any error other than that rejection, which is what makes the engine retry invisible.
- The test repeats the race on a fresh product, at most 20 times, until the function log shows an attempt of the parent mutation that the engine reruns after an OCC conflict, and every round meets the bullets above.
