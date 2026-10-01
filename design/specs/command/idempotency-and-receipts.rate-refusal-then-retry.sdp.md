---
id: spec:command.idempotency-and-receipts.rate-refusal-then-retry
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# Rate or capacity refusal, then a retry of the same intent

Sc L1-9 · native tier.

The command's admission policy refuses the first call as a transient `rateLimited`. The refusal throws, so nothing is stored and no receipt exists. The caller retries with the same key and input, admission now admits, and the command executes as new intent.

## Intent

- outcome: Nothing stored; the retry can succeed. (Sc L1-9)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "worker"}
And a receipted command {commandType: "PlaceOrder"} with request key {requestKey: "k-1"} and business input fingerprint {fingerprint: "f-1"}
And a receipt for the same key already exists with {priorReceipt: "no receipt"}
And the admission policy {admission: "refuses the first call as transient and then admits"}
When the caller sends the command {sends: "again after the transient refusal"}
Then the first answer is {first: "transient refusal"}
And the second answer is {second: "applied"}
And the business effects committed number {effects: 1}
And the receipts stored for the key number {receipts: 1}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the first error has `data.kind` equal to `"transient"` and that the receipts table is empty after it.
- The test asserts that the retry's response has `replayed` false, which proves the refusal left no receipt to replay.
- The test also asserts the ordering rule: with a receipt already present for the key, a refusing admission policy is never consulted and the duplicate is replayed.
