---
id: spec:application.orders-inventory-example.cancel-without-grant-refused
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.orders-inventory-example
  verifies: spec:application.orders-inventory-example
---
# A caller without the cancel grant is refused

E-46 · native backend tier · production composition · no acceptance row; the example verifies that `CancelOrder` requires its own permission, under Law 5 and D11.

## Intent

- outcome: A caller who holds every grant of the composition except `orders.cancel` is refused before any execution, and nothing is stored. (E-46, D11, Law 5)

```gwt
Given {onHand: 5} units of a stock item received through ReceiveStock
And an order placed for {ordered: 3} of them over two lines
When a caller {grant: "lacking"} the permission orders.cancel sends CancelOrder for {target: "that order"} under request key {key: "k-1"}
Then the caller receives {response: "the rejection"}
And the rejection code is {code: "forbidden"}
And the stock item's quantity allocated is {allocated: 3}
And the order summary's status is {status: "placed"}
And the number of documents the command wrote is {written: 0}
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- The refused caller is a second user of the fixture issuer holding `orders.place`, `inventory.receive`, `orders.read` and `inventory.read` in the tenant; the test asserts that the caller's error is a `ConvexError` whose data is `{ kind: "rejection", code: "forbidden", entry: "CancelOrder", message: "The caller may not run CancelOrder in this tenant", details: { reason: "no_grant" } }`.
- The refused caller then sends `CancelOrder` for `order-2`, an order never placed, and the test asserts the same `forbidden` data, which shows the refusal comes before Orders decides: an execution before the check would answer `orderNotFound`.
