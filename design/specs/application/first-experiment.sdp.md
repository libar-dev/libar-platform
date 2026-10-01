---
id: spec:application.first-experiment
kind: workflow
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:kernel.domain-kernel
    - spec:context.context-component
    - spec:context.journal
    - spec:context.queries
    - spec:context.batch-shaped-api
    - spec:command.command-pipeline
    - spec:command.idempotency-and-receipts
    - spec:command.command-declaration
    - spec:application.parent-use-cases
    - spec:application.read-models
    - spec:application.rebuild
    - spec:application.restore
  constrainedBy:
    - spec:constraints.one-commit-per-successful-command
    - spec:constraints.zero-core-projection-jobs
    - spec:constraints.one-call-per-context-per-use-case
    - spec:constraints.one-public-execution-per-intent
    - spec:constraints.no-application-wide-counter
    - spec:constraints.no-queue-recovery-for-essential-reads
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f01-serializable-mutations-under-occ
  decidedBy:
    - spec:decisions.d03-events-only-source-of-next-state
    - spec:decisions.d10-contexts-meet-in-parent-use-cases
    - spec:decisions.d08-read-models-in-command
---
# The first experiment

Layer 2 · Detail: full · Traces: First experiment, Acceptance scenarios, D3, D8, D10, F4, F13, Probe 3, OQ1, OQ3, OQ4, Sc L2-3, Sc L2-9, E-46, E-47.

The first experiment builds Layers 0 to 2 in a small, clean application, Orders and Inventory, and measures what the design costs. It passes when every Layer 0, 1 and 2 scenario passes on a native backend. It measures orders of 1 line, 10 lines and the chosen maximum, without and with stock contention, and counts top-level commits, function and component calls, documents read and written, and rows left behind, with healthy-path and retry costs reported separately. Semantics come first and speed second; latency and throughput targets are product decisions made before the benchmark. The results feed the open question on component cost and the Layer 3 decisions.

The six cost targets are the constraint Specs this workflow is constrained by. The example domain's terms are `spec:application.orders-inventory-example`. The owner ruled OQ4 on 2026-10-01: the experiment lives in this repository, beside the design.

## Intent

- actor: The platform maintainers who build and run the experiment, and the owner who reads its measurements before the Layer 3 decisions are written (First experiment, Decision method rule 4)
- problem: Orders of 1 line, 10 lines and the maximum must each be one top-level commit with zero projection jobs, one call per context and budgets that hold; without a built application and a measured run, the cost of a component call and the size of one use case stay assumptions and Layer 3 would be written from guesses (Sc L2-3, Sc L2-9, F4)
- outcome: Layers 0 to 2 exist as a working Orders and Inventory application, every Layer 0, 1 and 2 scenario passes on a native backend with production configuration, and the six cost targets are measured for 1, 10 and the maximum lines with and without contention (First experiment)
- value: The measurements settle OQ1 and Probe 3 with numbers, prove the transactional profile before the durable profile is designed, and give the owner the cost line every mechanism must be compared against (First experiment, OQ1, Decision method rule 2)
- risk: The chosen maximum is provisional until OQ3 is decided, so the measurement at the maximum is a measurement at the placeholder (OQ3)
- risk: Reused deciders may carry the two-authority shape of today's platform; each one is checked against the one-authority rule before it is reused (First experiment, D3)
- assumption: Nested calls cost more than helpers, by an amount Probe 3 and this experiment measure (F4, Probe 3)
- assumption: Transactions have limits, and the maximum is chosen under them (F13)

### Open questions

- [non-blocking] OQ1: whether a trivial context with no invariants of its own may be plain tables behind lint rules is decided after this experiment measures component call cost (OQ1, Probe 3)
- [non-blocking] OQ3: the largest order `PlaceOrder` supports is a product decision; the experiment measures with a provisional maximum of 100 lines and reports the numbers per line so the owner can choose (OQ3)
- [non-blocking] Extension E-46: the doc asks for one more lifecycle command and one essential summary without naming them; the option taken here is `CancelOrder`, which releases the allocation, and the order summary read model, with 100 as the provisional maximum for measurement (E-46, First experiment)
- [non-blocking] Extension E-47: the doc lists what to count but not how; the option taken here is a measurement record per run captured from the disposable backend's function execution log and a fixture counter around component calls, with any count the backend does not expose recorded as a gap (E-47, First experiment)

## Workflow

- rule: The experiment passes when every Layer 0, 1 and 2 scenario passes on a native backend (First experiment)
- rule: It builds Layers 0 to 2 in a small, clean application: Orders and Inventory, complete order placement, one more lifecycle command, one essential summary, journal inspection and rebuild (First experiment)
- rule: It reuses the pure deciders and state machines where they fit, under the one-authority rule of D3, and leaves the current app's infrastructure behind (First experiment, D3)
- rule: It measures orders of 1 line, 10 lines and the chosen maximum, without and with stock contention (First experiment, Sc L2-3)
- rule: It counts top-level commits, function and component calls, documents read and written, and rows left behind, with healthy-path and retry costs reported separately (First experiment)
- rule: Semantics come first, speed second; latency and throughput targets are product decisions made before the benchmark (First experiment)
- rule: The cost targets are one top-level commit per successful command, zero core projection jobs, O(N) business work allowed, one public command execution per business intent, no application-wide counter, and no queue recovery needed for essential reads (First experiment)
- rule: The results feed the open question on component cost and the Layer 3 decisions (First experiment, OQ1, Decision method rule 4)
- rule: Native acceptance runs with production configuration: the same authority, schemas, concurrency and code path as a release (Sc L2-9)
- rule: [extension] The native tier obtains its identities through the local backend's admin key acting as an identity whose issuer and subject are the ones production's `auth.config.ts` names, so the actor mapping, the grants, the namespaces and the entry points are the production ones; the token's source is the one named difference from production and every run's evidence record states it, as `spec:platform.acceptance-contract` rules under E-13 (E-13, S13, Sc L2-9)
- rule: Every run is recorded as acceptance evidence: commit, installed layers, backend and dependency versions, configuration, dataset, command and result, and a run with adjusted configuration states how it differs from production (Acceptance scenarios)
- rule: The kernel's fixture app is separate from the example app, and test-only functions never ship (Acceptance scenarios)
- rule: [extension] The second lifecycle command is `CancelOrder`, the essential summary is the order summary read model, and the provisional maximum is 100 lines (E-46, First experiment)
- rule: [extension] Each measured run produces one measurement record, and retry cost is the difference between a run with contention and the same run without it (E-47, First experiment)
- Build Layer 0: the Orders decider with `PlaceOrder` and `CancelOrder`, the Inventory decider with `allocate` and `release`, each pure, with `initial`, `decide` and `evolve`, and the L0 scenarios green (First experiment, D3)
- Build Layer 1: the Orders and Inventory context components mounted by the parent, the journal, the command pipeline, receipts and tenancy, with the L1 scenarios green on the native backend (First experiment)
- Build Layer 2: the `PlaceOrder` use case calling Orders once and Inventory once, the `CancelOrder` use case releasing the allocation, the order summary read model written in both, and journal inspection queries (First experiment, D10, D8, E-46)
- Build the rebuild of the order summary as a generation, the order allocation history view of `spec:application.orders-inventory-example` with its write-pause rebuild for Sc L2-6 only, and the restore drill on the experiment's dataset (First experiment, D9, D19, Sc L2-6, E-46)
- Run every Layer 0, 1 and 2 scenario on a disposable native backend with production configuration and record each run as evidence (First experiment, Sc L2-9, Acceptance scenarios)
- Measure `PlaceOrder` for 1 line, 10 lines and the provisional maximum without contention, one run each, and record a measurement per run (First experiment, Sc L2-3, E-47)
- Measure the same three sizes with stock contention, 2, 8 and 32 concurrent `PlaceOrder` commands for the same stock item, and record the retry cost separately from the healthy path and the count of commands the engine failed after its bounded optimistic-concurrency retries (First experiment, Sc L1-11, F1, E-47)
- Compare each measurement with the six cost targets and record which hold and which do not, with the per-line numbers (First experiment, Sc L2-3)
- Report the cost of one component call from the measurements to OQ1 and Probe 3, and hand the measurements to the Layer 3 decisions (First experiment, OQ1, Probe 3)

## Design

The experiment is an application, a test suite and a report. The application is the production composition: two context components, the parent with its pipeline, use cases, read models, registry and gate. The suite is the acceptance scenarios of Layers 0 to 2, run against a disposable local backend as the acceptance contract prescribes. The report is a set of measurement records, one per run, compared against the six constraint targets.

- typeMeasurement: `[extension] interface Measurement { commit: string; backendVersion: string; convexVersion: string; configuration: "production" | "adjusted"; adjustments?: string; identitySource: "issuer" | "admin-acting-as"; dataset: string; command: "PlaceOrder" | "CancelOrder"; lines: number; contention: number; path: "healthy" | "retry"; topLevelCommits: number; functionCalls: number; componentCalls: number; documentsRead: number; documentsWritten: number; bytesRead: number; bytesWritten: number; rowsLeftBehind: number; occRetries: number | "not exposed"; occExhaustions: number; latencyMs: number }` where `contention` is the number of concurrent callers and `occExhaustions` counts commands the engine failed with its documents-changed error (E-47, E-13, First experiment)
- captureCommits: top-level commits are the successful top-level mutation executions in the backend's function log for the run (E-47, First experiment)
- captureCalls: function calls are every function execution the log shows; component calls are counted by a fixture wrapper around `ctx.runMutation` and `ctx.runQuery` on component references, and the two are reconciled (E-47, F4)
- captureDocuments: documents and bytes read and written per function come from the backend's execution records where the local backend exposes them; where it does not, the record says `not exposed` and the dashboard's insights on a cloud run stand in (E-47, First experiment)
- captureRowsLeftBehind: rows left behind are the documents a run created that are not state, events, receipts or read-model rows: markers, registry rows, gate and audit records, counted by table (E-47, First experiment, D19)
- captureRetries: optimistic-concurrency retries are not observable from inside a mutation; the contention run reports them from the backend's log where exposed, else the retry path is measured as the difference between the contention run and the healthy run (E-47, F1)
- datasetSizes: 1 line, 10 lines and 100 lines as the provisional maximum, each against a fresh disposable backend seeded with the stock items the order needs (E-46, Sc L2-3, OQ3)
- contentionShape: N `PlaceOrder` commands for the same stock item sent concurrently, at N of 2, 8 and 32, with the stock set so that the first is applied and the rest are rejected for short stock, which is Sc L1-11's shape widened into the contention run; the run reports bytes read per call beside documents, the engine's retries where the backend exposes them, and how many commands the engine failed after its bounded retries, which the outcome boundary classifies as technical failures the caller may retry (First experiment, Sc L1-11, F1, E-5, E-47)
- limitOrderLines: the maximum number of lines per `PlaceOrder` is a product decision, open under OQ3; the experiment measures at 100 and reports documents read and written per line, so the owner can set it under the 1 second timeout and the F13 ceilings (OQ3, F13)
- limitExpectedDocuments: the design expects one `PlaceOrder` of N lines to read about N + 6 documents and write about 2N + 5 documents: one stock item state and one event per line, the order state, the order event, the receipt, the summary row, the registry read, the gate read and the audit record; the measurement confirms or corrects it (E-47, F13, D10)
- streamBudgets: the stock item stream declares `budgetBytes` of 16 KiB and the order stream keeps the default 256 KiB, as `spec:application.orders-inventory-example` pins, so the allocation call's byte bound, 8 MiB over the planned streams' budgets, admits 512 stock streams and the adapter's count bound of `min(maxStreams, 256)` admits the 100 of the maximum order with room, while the single order stream costs at most 256 KiB; at the default budget on both stream types the byte bound would admit only 32 stock streams and the maximum run would be rejected `operationTooLarge`, which is why the budget is pinned here and the run at the maximum measures it (E-2, E-22, E-46, F13, Sc L2-3)
- productDecisions: latency and throughput targets are set by the owner before the benchmark and recorded with the run; the experiment reports latency but does not set a target (First experiment)
- deliverables: the application in this repository, beside the design, as the owner ruled under OQ4 on 2026-10-01, the evidence records of every scenario run, and the measurement report with the six targets marked held or not held (First experiment, OQ4, Acceptance scenarios)

## Example space

```gwt-vocabulary
Given the Orders and Inventory application built through Layer 2 on a native backend
And an order of {size:"1 line"|"10 lines"|"the maximum"} with stock contention {contention:"absent"|"present"}
And the backend runs with {configuration:"production configuration"|"test configuration"}
When {run:"the PlaceOrder use case"|"every Layer 0 to 2 scenario"} runs
Then each successful command makes {commits:number} top-level commit
And the core path runs {projectionJobs:number} projection jobs
And the use case makes {callsPerContext:number} call per context
And the budgets {budgets:"hold"|"are exceeded"}
And authority, schemas, concurrency and code path {parity:"match a release"|"differ from a release"}
```

## Verification — reviewed

- A reviewer confirms that every Layer 0, 1 and 2 example in the corpus is in the experiment's suite and that no scenario is marked passing without a recorded run.
- A reviewer confirms that each of the six constraint targets is compared against a measurement field and that the comparison is in the report.
- A reviewer confirms that the reused deciders return events and a result only, never a state patch.
