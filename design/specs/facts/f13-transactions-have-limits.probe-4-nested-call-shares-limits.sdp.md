---
id: spec:facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f13-transactions-have-limits
  verifies: spec:facts.f13-transactions-have-limits
---
# Probe 4: a nested call draws on the caller's transaction limits

Probe 4 · native tier · fixture composition.

## Intent

- outcome: The limits are shared across the nested call, not applied per call. (Probe 4, F13)

```gwt
Given documents of {documentSize: "900 KiB"} each, {parentDocuments: 10} that a parent mutation reads and {childDocuments: 10} more that a nested query reads
When a client calls the parent mutation, which reads its documents and then calls the nested query through ctx.runQuery
Then the call {together: "fails on the bytes-read limit"}
And the parent reading alone {parentAlone: "commits"} and the nested query called alone {childAlone: "returns"}
And the same split of bytes written by a parent mutation and a nested mutation {writesTogether: "fails on the bytes-written limit"}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test also reads `ctx.meta.getTransactionMetrics()` in the parent before and after a nested read that stays under the limit and asserts that `bytesRead.used` and `documentsRead.used` grew by what the child read.
- The test also shows that each half of the write commits alone, so the failure is the sum.
- The local backend refuses writes past a rate, with `TooManyWrites` and the text "limited to 4 MiB bytes written per 1 second", so the test paces the transactions that seed and write its documents.
