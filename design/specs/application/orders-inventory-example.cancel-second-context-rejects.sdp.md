---
id: spec:application.orders-inventory-example.cancel-second-context-rejects
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# Orders cancels, then Inventory refuses the release

E-46 · native tier · production composition · no acceptance row; the example verifies that a release Inventory refuses rolls back the cancel Orders recorded, which is Sc L2-1's rule on the second lifecycle command.

## Intent

- outcome: Everything rolls back; the caller gets Inventory's rejection; the order stays placed and nothing is stored. (E-46, D1, D7, Sc L2-1)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
And the order {before: "has its units released by Inventory alone"}
When a caller {grant: "holding"} the permission orders.cancel sends CancelOrder for {target: "that order"} under request key {key: "k-1"}
Then the caller receives {response: "the rejection"}
And the rejection code is {code: "insufficientAllocation"}
And the stock item's quantity allocated is {allocated: 0}
And the order summary's status is {status: "placed"}
And the number of documents the command wrote is {written: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- No public command releases stock without cancelling its order, so the setup calls the Inventory context's release operation for the order's 3 units directly, with admin access, as a sanctioned operation of that context; the stock item's state stays the fold of its events, and the two contexts now disagree about the order.
- The test asserts that the caller's error is a `ConvexError` whose data is `{ kind: "rejection", code: "insufficientAllocation", commandType: "CancelOrder", message: "Cannot release 3 when 0 are allocated", details: { requested: 3, allocated: 0 } }`; that the release's quantities come from the lines the Orders call returned, and that Orders is called first, is shown at the pure tier by the same executor run against a ctx that records each `runMutation` by its function reference.
- The test reads the function log and asserts that the request ran one top-level mutation, recorded as failed with no document written, and that the order's stream stays at version 1 with status `placed` and one event.
