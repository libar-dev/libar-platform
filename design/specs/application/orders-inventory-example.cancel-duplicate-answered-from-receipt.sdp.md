---
id: spec:application.orders-inventory-example.cancel-duplicate-answered-from-receipt
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# A repeated cancel request is answered from its receipt

E-46 · native tier · production composition · no acceptance row; the example verifies that `CancelOrder` is answered from its receipt when its request is repeated.

## Intent

- outcome: The same request under the same key is a duplicate, answered from the first cancel's receipt without running again, and nothing is stored. (E-46, D6)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
And the order {before: "is cancelled under request key k-1"}
When a caller {grant: "holding"} the permission orders.cancel sends CancelOrder for {target: "that order"} under request key {key: "k-1"}
Then the caller receives {response: "the receipt's answer"}
And the stock item's quantity allocated is {allocated: 0}
And the order summary's status is {status: "cancelled"}
And the number of documents the command wrote is {written: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test asserts that the response is `{ kind: "applied", replayed: true, result: null }` with the first cancel's `operationId` and versions, and that the receipts table holds one receipt for `k-1`.
