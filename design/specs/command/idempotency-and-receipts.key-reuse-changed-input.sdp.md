---
id: spec:command.idempotency-and-receipts.key-reuse-changed-input
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  verifies: spec:command.idempotency-and-receipts
---
# Reuse a key with changed business input

Sc L1-5 · native tier.

A receipt for the key already exists with the fingerprint of the original input. The caller sends the same key with different business input. The lookup finds a different fingerprint and throws `idempotencyConflict` before any execution.

## Intent

- outcome: Explicit conflict; original outcome and state unchanged. (Sc L1-5)

```gwt
Given a tenant {tenantId: "t-1"} and a caller in namespace {namespace: "service"}
And a receipted command {commandType: "PlaceOrder"} with request key {requestKey: "k-1"} and business input fingerprint {fingerprint: "f-2"}
And a receipt for the same key already exists with {priorReceipt: "a different fingerprint"}
And the admission policy {admission: "admits every call"}
When the caller sends the command {sends: "once"}
Then the first answer is {first: "conflict"}
And the second answer is {second: "none"}
And the business effects committed number {effects: 0}
And the receipts stored for the key number {receipts: 1}
And the original outcome and state are unchanged {unchanged: true}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the thrown error has `data.kind` equal to `"rejection"`, `data.code` equal to `"idempotencyConflict"`, and `data.details.operationId` equal to the original receipt's operation ID.
- The test asserts that the receipt row is byte-identical before and after, and that the stream version the original touched is unchanged.
