---
id: spec:application.orders-inventory-example.cancel-placed-order
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# A placed order is cancelled

E-46 · native tier · production composition · no acceptance row; the example verifies `CancelOrder`, the example domain's second lifecycle command under E-46.

## Intent

- outcome: The order is cancelled, its stock item's totals are back to what they were before it was placed, and its summary row says cancelled, in one commit. (E-46, D10)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
When a caller {grant: "holding"} the permission orders.cancel sends CancelOrder for {target: "that order"} under request key {key: "k-1"}
Then the caller receives {response: "the result"}
And the stock item's quantity allocated is {allocated: 0}
And the order summary's status is {status: "cancelled"}
And the number of documents the command wrote is {written: 6}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The order is `order-1` with two lines on the stock item `sku-1`, of 2 and 1 units; the test asserts that the stock item's state after the cancel equals its state before `PlaceOrder`, `{ onHand: 5, allocated: 0 }`.
- The test asserts the response `{ kind: "applied", replayed: false, result: { orderId: "order-1", released: [{ stockItemId: "sku-1", quantity: 3 }] } }` with versions naming the order at version 2 and the stock item at version 3, Orders first; the order of the two calls, Orders and then Inventory, is shown at the pure tier by the same executor run against a ctx that records each `runMutation` by its function reference, which this native test cannot tell apart.
- The six documents are the receipt, the order's state and its `OrderCancelled` event, the stock item's state and its one `AllocationReleased` event of quantity 3, and the summary row, whose `sourceVersions` name the order at version 2; the parent's `getOrder` answers the order with status `cancelled` and the lines, total and `placedAt` it answered before the cancel, and the summary row keeps that `placedAt`.
- The test reads the function log and asserts that the command ran as one top-level mutation, and that the order summary list for `cancelled` holds the order and the list for `placed` does not.
