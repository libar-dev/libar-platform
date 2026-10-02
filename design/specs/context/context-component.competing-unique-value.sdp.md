---
id: spec:context.context-component.competing-unique-value
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  verifies: spec:context.context-component
---
# Two commands compete for the same unique value

Sc L1-11 · native tier · fixture composition · second of two cases.

The fixture composition binds it. Two ordinary clients send the RegisterDocument command at once, each creating its own document under one reference, the unique value. The depot's registerDocuments operation claims the reference on a reference stream of its own at expected version 0 and then creates the document, both in one sub-transaction. Both calls read the absent reference row; one commits, the engine reruns the other, and the rerun loads the claimed row and is answered by the version check before decide.

## Intent

- outcome: Invariant holds; a logical conflict is told apart from an engine retry. (Sc L1-11)

```gwt
Given a context component mounted by the parent with a stream at version {version: 0} in state {state: "a unique value nobody holds"}
And {callers: 2} callers send the same kind of command at the same time
When the parent calls the context operation {operation: "create a document claiming the unique value"} through the component API
Then the first caller's outcome is {first: "applied"}
And the second caller's outcome is {second: "rejection"}
And the rejection code is {code: "entityExists"}
And the stream version afterwards is {after: 1}
And the number of events appended is {appended: 2}
And decide ran against {evaluated: "nothing"}
And the callers saw {saw: "no engine retry and no version conflict"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend, and two ordinary clients, each holding a fixture-issuer token and a grant an operator gave with admin access, send RegisterDocument through its public entry at once with one reference and two document IDs.
- The first and second callers are the callers in the order their final attempts complete in the function log; the stream of the Given and of the version afterwards is the reference stream, and the events appended are the reference stream's `referenceClaimed` and the winner's document stream's `created`, both at version 1.
- The reference stream's state names the winner's document as holder, and the loser's document has no stream row and no event, so no document exists without its claim.
- The loser's `ConvexError` carries `entityExists` with `details.existing` equal to the reference and `details.current` equal to 1, the answer step 3 gives from the row the rerun loaded before `decide` runs; the reference decider would answer a held reference with `referenceTaken`, and that code is absent.
- The test repeats the race on a fresh reference, at most 20 times, until the function log shows an attempt of the parent mutation that the engine reruns after an OCC conflict, and every round meets the bullets above; neither caller of any round received `staleVersion` or any error other than the one rejection, which is what makes the engine retry invisible.
