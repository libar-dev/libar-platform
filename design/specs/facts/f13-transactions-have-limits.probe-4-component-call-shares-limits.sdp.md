---
id: spec:facts.f13-transactions-have-limits.probe-4-component-call-shares-limits
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f13-transactions-have-limits
  verifies: spec:facts.f13-transactions-have-limits
---
# Probe 4: a component call draws on the caller's transaction limits

Probe 4 · native backend tier · fixture composition.

## Intent

- outcome: The limits are shared across the component boundary, not applied per call. (Probe 4, F13)

```gwt
Given documents of {documentSize: "900 KiB"} each, {parentDocuments: 10} that a parent mutation reads and {childDocuments: 10} more that a component query reads
When a client calls the parent mutation, which reads its documents and then calls the component query
Then the call {together: "fails on the bytes-read limit"}
And the parent reading alone {parentAlone: "commits"} and the component query called alone {childAlone: "returns"}
And the same split of bytes written by a parent mutation and a component mutation {writesTogether: "fails on the bytes-written limit"}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The test also reads `ctx.meta.getTransactionMetrics()` in the parent before and after a component read that stays under the limit and asserts that `bytesRead.used` and `documentsRead.used` grew by what the component read.
- The test also shows that each half of the write commits alone, so the failure is the sum.
- The local backend refuses writes past a rate, with `TooManyWrites` and the text "limited to 4 MiB bytes written per 1 second", so the test paces the transactions that seed and write its documents.
- Each document holds an ASCII string, whose length is its size in bytes. Bytes would spend most of a mutation's 1 second of execution under load, because `convex/values` converts them to base64 in JavaScript, and the run would show the time limit instead of the bytes-written limit.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
