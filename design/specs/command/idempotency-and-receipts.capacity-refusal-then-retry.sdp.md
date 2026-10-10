---
id: spec:command.idempotency-and-receipts.capacity-refusal-then-retry
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# Capacity refusal, then a retry of the same intent

Sc L1-9 · native backend tier · fixture composition · second of two cases.

A worker sends the depot's `AddStock` command through the fixture action `nonUiCaller:send` that an ordinary client calls; the input f-1 adds 5 units of product p-1. The command's admission policy, the fixture's `switchedAdmission`, refuses the first call as a transient `capacity` while the command's `capacity` switch is on. The refusal throws, so nothing is stored and no receipt exists. The switch is turned off with admin access, the caller retries with the same key and input, admission now admits, and the command executes as new intent.

## Intent

- outcome: Nothing stored; the retry can succeed. (Sc L1-9)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "worker"}
And a receipted command {commandType: "AddStock"} with request key {requestKey: "k-1"} and business input fingerprint {fingerprint: "f-1"}
And a receipt for the same key already exists with {priorReceipt: "no receipt"}
And the admission policy {admission: "refuses the first call for capacity and then admits"}
When the caller sends the command {sends: "again after the transient refusal"}
Then the first answer is {first: "transient refusal"}
And the second answer is {second: "applied"}
And the business effects committed number {effects: 1}
And the receipts stored for the key number {receipts: 1}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the first error has `data.kind` equal to `"transient"`, `data.code` equal to `"capacity"` and no `data.retryAfterMs`, and that the receipts table and the depot's tables are empty after it.
- The test asserts that the retry's response has `replayed` false, which proves the refusal left no receipt to replay.
- The test also asserts the ordering rule: with a receipt already present for the key, a refusing admission policy is never consulted and the duplicate is replayed; the switch is turned on again, the same call is replayed and stores nothing, and a call under a new request key is refused, which shows on the same deployment that the policy refuses whenever it is consulted.
