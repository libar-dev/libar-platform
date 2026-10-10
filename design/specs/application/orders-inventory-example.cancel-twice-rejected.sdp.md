---
id: spec:application.orders-inventory-example.cancel-twice-rejected
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# A second cancel of one order is rejected

E-46 · native backend tier · production composition · no acceptance row; the example verifies that the order's own state refuses a second cancel.

## Intent

- outcome: The second cancel, under a new request key, is rejected by the order's state before Inventory decides, and nothing is stored. (E-46, D4, D7)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
And the order {before: "is cancelled under request key k-1"}
When a caller {grant: "holding"} the permission orders.cancel sends CancelOrder for {target: "that order"} under request key {key: "k-2"}
Then the caller receives {response: "the rejection"}
And the rejection code is {code: "orderAlreadyCancelled"}
And the stock item's quantity allocated is {allocated: 0}
And the order summary's status is {status: "cancelled"}
And the number of documents the command wrote is {written: 0}
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- The test asserts that the caller's error is a `ConvexError` whose data is `{ kind: "rejection", code: "orderAlreadyCancelled", entry: "CancelOrder", message: "The order is already cancelled" }`, and that no receipt exists for `k-2`.
- The stock item's state stays `{ onHand: 5, allocated: 0 }`; had the second cancel reached Inventory, its release of 3 would have been refused `insufficientAllocation`, so the code `orderAlreadyCancelled` shows that Orders refused it first.
