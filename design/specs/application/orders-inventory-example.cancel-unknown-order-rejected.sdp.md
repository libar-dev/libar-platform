---
id: spec:application.orders-inventory-example.cancel-unknown-order-rejected
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# A cancel of an order never placed is rejected

E-46 · native tier · production composition · no acceptance row; the example verifies that the order decider refuses a cancel of an order with no event.

## Intent

- outcome: A cancel of an order ID that has no stream is rejected by the order decider, no stream is created for it, and nothing is stored. (E-46, D4, D7)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
When a caller {grant: "holding"} the permission orders.cancel sends CancelOrder for {target: "an order never placed"} under request key {key: "k-1"}
Then the caller receives {response: "the rejection"}
And the rejection code is {code: "orderNotFound"}
And the stock item's quantity allocated is {allocated: 3}
And the order summary's status is {status: "placed"}
And the number of documents the command wrote is {written: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The order never placed is `order-2`; the test asserts that the caller's error is a `ConvexError` whose data is `{ kind: "rejection", code: "orderNotFound", commandType: "CancelOrder", message: "The order does not exist" }`, that the Orders context holds no stream row and no event for `order-2`, and that the parent's `getOrder` answers null for it.
- The order summary's status is that of the placed order `order-1`, the one row the table holds.
