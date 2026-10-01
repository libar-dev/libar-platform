---
id: spec:command.idempotency-and-receipts.concurrent-non-ui-calls
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# A non-UI caller sends the same command concurrently

Sc L1-3 · native tier · first of two cases.

A worker calls the internal entry twice at once with the same request key and input. Both mutations read the empty key range; one commits its insert, the other's read set is invalidated, the engine retries it, and the retry finds the receipt and answers as a duplicate.

## Intent

- outcome: One business effect, one stored outcome. (Sc L1-3)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "worker"}
And a receipted command {commandType: "PlaceOrder"} with request key {requestKey: "k-1"} and business input fingerprint {fingerprint: "f-1"}
And a receipt for the same key already exists with {priorReceipt: "no receipt"}
And the admission policy {admission: "admits every call"}
When the caller sends the command {sends: "twice concurrently"}
Then the first answer is {first: "applied"}
And the second answer is {second: "replayed"}
And the business effects committed number {effects: 1}
And the receipts stored for the key number {receipts: 1}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that both responses carry the same `operationId` and that the journal holds exactly one event set with that operation ID.
- The test asserts that which call is answered as the duplicate is not fixed; it checks the pair, not the order.
