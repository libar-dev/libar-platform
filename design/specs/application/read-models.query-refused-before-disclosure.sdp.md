---
id: spec:application.read-models.query-refused-before-disclosure
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.read-models
  verifies: spec:application.read-models
---
# A caller with no identity reads an order through the parent

Law 5 · native backend tier · production composition · no acceptance row; the first of two refusals of a parent query, the caller with no identity.

## Intent

- outcome: The read is refused before anything is disclosed, and nothing is written. (Law 5, D11, D7)

```gwt
Given an order placed in a tenant
And a caller {caller: "with no identity"}
When {action: "the caller reads the order through the parent"}
Then the read throws rejection {code: "unauthenticated"} that names the query
And the number of receipts the read wrote is {receipts: 0}
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- The test calls `getOrder` from an HTTP client with no token and subscribes to it from a client with no token, reads `error.data` from the call and from the subscription's error callback, and asserts for both that `kind` is `rejection`, `code` is `unauthenticated` and `entry` is `getOrder`, and that `classifyThrown` answers `rejection`.
- The test asserts that the receipts table holds no row written by the read.
- The test then calls `getOrder` as a caller granted `orders.read` in the tenant and asserts that it returns the order's DTO.
