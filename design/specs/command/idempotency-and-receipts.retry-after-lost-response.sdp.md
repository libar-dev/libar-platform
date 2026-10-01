---
id: spec:command.idempotency-and-receipts.retry-after-lost-response
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# A non-UI caller sends the same command again after a lost response

Sc L1-3 · native tier · fixture composition · second of two cases.

A worker calls the internal entry of the depot's `AddStock` command through the fixture action `nonUiCaller:send` that an ordinary client calls, the harness's transport loses the response after the backend answered, and the worker retries with the same request key and input; the input f-1 adds 5 units of product p-1. The retry finds the receipt with the same fingerprint and answers as a duplicate without executing.

## Intent

- outcome: One business effect, one stored outcome. (Sc L1-3)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "worker"}
And a receipted command {commandType: "AddStock"} with request key {requestKey: "k-1"} and business input fingerprint {fingerprint: "f-1"}
And a receipt for the same key already exists with {priorReceipt: "no receipt"}
And the admission policy {admission: "admits every call"}
When the caller sends the command {sends: "again after a lost response"}
Then the first answer is {first: "applied"}
And the second answer is {second: "replayed"}
And the business effects committed number {effects: 1}
And the receipts stored for the key number {receipts: 1}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the retry's response has `replayed` true, `result` null, and the same `operationId`, affected IDs and versions as the receipt row, and that it arrived as a return value, which proves the entry's `returns` validator admitted the replayed member rather than throwing on the null result.
- The test asserts that the context operation was not called a second time: the events with the operation ID still number one, and the retry is sent while the fixture's `failBeforeReceipt` switch for `AddStock` is on, which fails the call once the command's executor has made its context call, so a replayed answer shows that neither ran; with the switch still on, the same input under a new request key fails as a technical failure and stores nothing, which shows on the same deployment that the switch fails a call that executes.
