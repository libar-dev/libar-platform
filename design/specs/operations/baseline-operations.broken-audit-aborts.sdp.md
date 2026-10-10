---
id: spec:operations.baseline-operations.broken-audit-aborts
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  verifies: spec:operations.baseline-operations
---
# Break mandatory audit

Sc ALL-1 · native backend tier · fixture composition · the second of the two enumerated cases; applies to every installed layer.

The fault sits in the fixture composition's `PlaceOrder`, whose declaration sets `audit` and whose `subjectFrom` gives the order ID `auditFaultOrderId` a subject with one field the `auditRecords` validator does not declare. An ordinary client with grants sends the receipted `PlaceOrder` for that order. The depot creates the order and claims its stock, step 10 inserts the receipt, and Convex refuses the audit record's insert, so the plain error ends the mutation and nothing of the command survives. The fault reads no switch and touches no shared library: authorization compares only the subject's three fields, and every other order ID gets the plain subject.

## Intent

- outcome: Diagnostics never abort valid work; an audit failure does. (Sc ALL-1)

```gwt
Given a valid command whose use case emits diagnostics and writes {audit: "a mandatory audit record"}
And the {subsystem: "mandatory audit"} subsystem is broken by fault injection
When the command runs
Then the command {result: "rolls back"}
And the failure is {surfaced: "returned to the caller as a technical failure"}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The verifier is `tests/native/baseline-operations.broken-audit-aborts.test.ts`, whose `specTest` anchor `test:operations.baseline-operations.broken-audit-aborts` verifies this example.
- The first Given step starts `fixtureBackend()`, grants the fixture's `orderPermission` and `permissions.stock` to the human principal `${issuer}|user-1` in the tenants `tenant-all-1` and `sinkFaultTenant` through `grants:grant` with admin access, and, as that caller through an ordinary client carrying the fixture issuer's token for `user-1`, adds 10 units of the product `p-1` in each tenant through `depotCommands:addStock`.
- The subsystem step for mandatory audit selects the tenant `tenant-all-1` and the order ID `auditFaultOrderId`.
- The When step reads the depot's `events` and `streams` and the parent's `receipts` and `auditRecords` with admin access, takes a log mark, calls `orders:placeOrder` through the ordinary client with the selected tenant, the request key `all-1-key` and the input `{ orderId, title: "Order", lines: [{ productId: "p-1", quantity: 1 }] }`, keeps the answer or the error, and reads the completion records after the mark until one has the identifier `orders:placeOrder`.
- The Then step for a command that rolls back asserts that the four tables hold exactly what they held before the call.
- The step for a technical failure asserts that the error is not a `ConvexError`, so `classifyThrown` reads it as technical, that the completion record's `error` contains both `auditRecords` and `auditFault`, so the refusal is the audit record's insert and no other write's, that exactly one of its `logLines` contains `diagnostic {` and that line contains `technical`, `tenant-all-1` and `all-1-key` and does not contain `operationId`, and that none of its `logLines` contains `diagnostic gap`.
- The test then shows on the same deployment that the audit writer runs: `orders:placeOrder` in `tenant-all-1` with the order ID `order-control` and the request key `all-1-control` returns `applied`, and `auditRecords` holds exactly one record, whose `operationId` is the one returned and whose `decision` is `applied`.
