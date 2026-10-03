---
id: spec:operations.baseline-operations.broken-metrics-never-abort
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  verifies: spec:operations.baseline-operations
---
# Break metrics and logging

Sc ALL-1 · native backend tier · fixture composition · the first of the two enumerated cases; applies to every installed layer.

The fault sits in the fixture composition's diagnostic sink: `PlaceOrder` names `fixtureDiagnosticSink`, which throws for every line of the tenant `sinkFaultTenant`. An ordinary client with grants sends the receipted `PlaceOrder` in that tenant. The command commits its events, its receipt and its audit record; at step 11 the sink throws, `emitDiagnostic` swallows the error and writes one gap line in place of the lost record, and the client receives the applied answer.

## Intent

- outcome: Diagnostics never abort valid work; an audit failure does. (Sc ALL-1)

```gwt
Given a valid command whose use case emits diagnostics and writes {audit: "a mandatory audit record"}
And the {subsystem: "metrics and logging"} subsystem is broken by fault injection
When the command runs
Then the command {result: "commits"}
And the failure is {surfaced: "reported as a diagnostic gap without touching the write"}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The verifier is `tests/native/baseline-operations.broken-metrics-never-abort.test.ts`, whose `specTest` anchor `test:operations.baseline-operations.broken-metrics-never-abort` verifies this example.
- The first Given step and the When step are those of `spec:operations.baseline-operations.broken-audit-aborts`.
- The subsystem step for metrics and logging selects the tenant `sinkFaultTenant` and the order ID `order-all-1`.
- The Then step for a command that commits asserts that the answer has `kind` `applied` and `replayed` false; that the depot's `events` hold exactly two events whose `operationId` is the one returned, one on the `document` stream `order-all-1` and one on the `stock` stream `p-1`; that `receipts` holds exactly one receipt, with the request key `all-1-key`, that operation ID and the outcome `applied`; and that `auditRecords` holds exactly one record, with the tenant `tenant-sink-fault`, that operation ID, the request key `all-1-key`, the `commandType` `PlaceOrder`, the `kind` `business`, the `decision` `applied` and the subject `{ contextId: "depot", streamType: "document", streamId: "order-all-1" }`.
- The step for a diagnostic gap asserts that the completion record's `error` is null, that exactly one of its `logLines` contains `diagnostic gap` and that line contains the operation ID returned and `applied`, and that none of its `logLines` contains `diagnostic {`; that one gap line is the count of one swallowed error.
- The test then shows on the same deployment that the sink runs: `orders:placeOrder` in `tenant-all-1` with the order ID `order-control` and the request key `all-1-control` returns `applied`, and its completion record holds exactly one line that contains `diagnostic {`, a line that also contains its operation ID and `applied`, and no line that contains `diagnostic gap`.
