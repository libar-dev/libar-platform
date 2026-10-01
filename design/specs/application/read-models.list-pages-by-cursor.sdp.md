---
id: spec:application.read-models.list-pages-by-cursor
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.read-models
  verifies: spec:application.read-models
---
# A client reads a tenant's order list in pages by cursor

E-24 · native tier · production composition · no acceptance row; the example verifies paging by an explicit cursor pair and the row cap of twice the item cap, an extension under E-24.

## Intent

- outcome: Every order of the tenant is read once and in order, no order of another tenant is read, and no full page is split on its own. (E-24, Law 11, D8)

```gwt
Given {orders: 25} orders placed in one tenant and {others: 3} in another
When {action: "a client reads the tenant's order list in pages by cursor"}
Then pages of {pageSize: 10} together hold {ordersHeld: 25} orders, each once and in order of order ID, and none of the other tenant's
And the number of pages that carry pageStatus SplitRequired is {splitPages: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- After grants, the first activation and `ReceiveStock` as setup, the test places the orders through `PlaceOrder`, then reads `listOrders` for the first tenant as a caller granted `orders.read`, each page with `cursor` and `numItems` and then subscribed with `endCursor` set to the `continueCursor` that read returned, the next page starting at the previous page's `endCursor`, until a read answers `isDone`.
- The test asserts three pages of 10, 10 and 5 orders, that no page carries `pageStatus` `SplitRequired`, and that every order ID of the first tenant appears once.
