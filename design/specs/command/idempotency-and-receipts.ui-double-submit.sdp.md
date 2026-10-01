---
id: spec:command.idempotency-and-receipts.ui-double-submit
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# The UI submits the same create twice

Sc L1-4 · native tier.

A Convex client calls the public entry twice, without a request key, with the same client-generated entity ID. No receipt is involved. The create is planned at expected version 0, so the persistence adapter's identity read answers the second call with the reserved rejection `entityExists` naming the first entity, before `decide` runs and inside the context's sub-transaction.

## Intent

- outcome: One entity, through the client-generated ID and uniqueness check. (Sc L1-4)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "public"}
And a create command from the UI with client-generated entity ID {entityId: "order-7f3a"}
And the admission policy {admission: "admits every call"}
When the caller sends the command {sends: "twice from the UI"}
Then the first answer is {first: "applied"}
And the second answer is {second: "entity exists"}
And the business effects committed number {effects: 1}
And the receipts stored for the key number {receipts: 0}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that exactly one stream with `streamId` equal to the entity ID exists in the tenant, that the second call's `error.data.code` is `entityExists`, and that `error.data.details.existing` equals the entity ID.
- The test asserts that the Orders decider's `decide` did not run for the second call, which shows the adapter's expected-version read is the uniqueness check.
- The test asserts that the receipts table stays empty, which proves the UI path wrote no receipt.
- The test repeats the double submit of `PlaceOrder` with stock for one order only, so the first submit takes the last units, and asserts that the second call's code is still `entityExists`, because the use case calls the creating context first as `spec:application.parent-use-cases` rules.
