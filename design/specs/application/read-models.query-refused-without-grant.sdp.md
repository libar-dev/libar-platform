---
id: spec:application.read-models.query-refused-without-grant
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.read-models
  verifies: spec:application.read-models
---
# A caller with no grant in the tenant reads an order through the parent

Law 5 · native tier · production composition · no acceptance row; the second of two refusals of a parent query, the caller with an identity and no grant.

## Intent

- outcome: The read is refused before anything is disclosed, and nothing is written. (Law 5, D11, D7)

```gwt
Given an order placed in a tenant
And a caller {caller: "with an identity and no grant in the tenant"}
When {action: "the caller reads the order through the parent"}
Then the read throws rejection {code: "forbidden"} that names the query
And the number of receipts the read wrote is {receipts: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test calls `getOrder` as a caller whose token is valid and who holds no grant in the order's tenant, and asserts that `error.data` has `kind` `rejection`, `code` `forbidden`, `commandType` `getOrder` and `details.reason` `no_grant`, and that `classifyThrown` answers `rejection`.
- The test asserts that the receipts table holds no row written by the read.
- The test then grants the same caller `orders.read` in the tenant with admin access, calls `getOrder` again and asserts that it returns the order's DTO.
