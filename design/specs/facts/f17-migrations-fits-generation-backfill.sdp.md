---
id: spec:facts.f17-migrations-fits-generation-backfill
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# The migrations component fits a generation backfill

F17 · Status: probed · Doc status: Assumed · Decisions: D9.

Probe 6 ran on the native backend `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6, on the fixture composition's document summary. What it showed holds for those pins.

The component drives two kinds of batch. A migration made with `define` walks a table of the component in which it is defined, so a parent migration walks parent tables and cannot reach a context's table: named in the parent, the context's table fails to compile in the compiled tier, and forced past the compiler the walk fails with `Uncaught Error: Index streams.by_creation_time not found.` The component's driver, `runOne`, also takes a parent internal mutation written by hand that returns `continueCursor`, `processed` and `isDone`; such a mutation can call the context's `list` once, write the read-model rows and the generation row's cursor, and return the context's cursor, which the component saves in the same transaction. That is how the component drives a batch over a context's enumeration. The README documents `define` and not this form; the result type it relies on, `MigrationResult`, is exported by the package.

The component can also be mounted inside a context component, where a migration walks the context's own table, but it cannot write a parent table: a parent ID passed in is read in the context's table namespace and refused. It reaches the parent only by calling a function handle the parent supplied, one call per source row, so the context calls the parent.

A batch that races a live command on one read-model row is ordered by optimistic concurrency, and the row ends at the source's newest stream version in either commit order. A cancel, in the starting mutation or in a separate one, keeps the committed rows and the saved cursor, and starting the migration again continues from that cursor. A batch that throws rolls back its own writes, and the component catches the error and records `failed` with it. A batch whose whole transaction fails, as one that reads past the 16 MiB limit does, leaves the component's row as it was before the batch; `getStatus` reports `failed` from the scheduled function, without the error. A backend restart on the same storage runs the pending batch. Completion of the component's run does not move the generation: it stays `building`.

So the component does not fit a generation backfill as the platform needs one: it reaches a context's rows only through a parent mutation written by hand against a contract its README does not document and the compiled tier needs a cast for, its status and the generation's state are two vocabularies, and a failure past the read limit leaves no error on its row. The rebuild drives every batch, backfill, verify and purge, with its own self-scheduled internal mutation, uses the component for nothing, and keeps the progress row as the one checkpoint (D9).

## Intent

- outcome: Record the native backend evidence for parent-table batches, context enumeration, interruption and checkpoint ownership, so designs resting on the migrations component distinguish its driver from its table helper. (F17, Probe 6)
- risk: In the compiled tier with these pins and `exactOptionalPropertyTypes`, `runOne` refuses the reference `define` generates, because its `batchSize` admits `undefined`; the fixture casts the reference to reach the native backend. (F17, Probe 6)
- risk: The batch over a context's enumeration rests on a function the package exports types for and its README does not document, so a later release of the component may change it without notice. (F17, Probe 6)

### Open questions

- [non-blocking] Hosted quotas, sustained contention, automatic stall detection, backup replacement, old encrypted cursors, fence advancement, parallel callbacks and a rebuild across changing tenants are not run by these examples; the native backend evidence proves only the named boundaries and does not settle those behaviors. (F17, Probe 6)

## Constraints

- statement: `@convex-dev/migrations` 0.3.6 drives parent-table backfill and a parent internal mutation that pages a context query and returns a migration result; `define` alone does not enumerate another component's table. (F17, Probe 6)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: Six Probe 6 example Specs bind exact steps to native tests on the pinned releases: the row race, interruption and resume, table scope and context enumeration, the parent batch returning a context cursor, operator cancellation in a separate transaction and whole-transaction failure. (F17, D9)

## Design

- raceEvidence: In six trials per run whose batch and command executions overlap, both generations of the row end at stream version 2 with the command's title; each trial records zero or one conflict, on the context's `streams` table or the parent's `documentSummaries` table, and the loser is retried by the engine; the counts are sizes, not asserted limits. (F17, F1, Probe 6)
- interruptionEvidence: With twelve sources and batch size two, cancel leaves two processed rows and a saved cursor; a later batch throwing after a write leaves those two rows and that cursor, with `state: failed`; resume reaches twelve distinct rows and one committed visit each; a pending batch survives a process kill and restart on the same storage. (F17, Probe 6)
- stateOwner: The migrations component's `migrations` table stores `name`, `cursor`, `isDone`, `workerId`, `error`, `processed`, `latestStart` and `latestEnd`; `getStatus` derives its state from that row and its `_scheduled_functions` worker, and returns a null cursor on success while the stored completion cursor is `[]`. (F17, Probe 6)
- checkpointEvidence: A native parent context batch writes the generation cursor and rows in its callback, then the component saves the same cursor in the enclosing mutation; throwing after the generation write rolls both parent writes back, while the component catches the error and saves failure against its unchanged cursor; a successful driver status leaves the generation `building`, since verification and activation are separate. (F17, Probe 6)
- enumerationCost: The native parent context batch and the parent-table-of-pages form each call `list` once per nonempty batch and cross two component boundaries per scheduled batch that enumerates a context page, driver to parent and parent to context; the table-of-pages form has a second cursor and needs migration batch size one to bound its total source rows by one list page; a context-table callback makes one parent call per source row. (F17, Probe 6)
- sourceEvidence: In `node_modules/@convex-dev/migrations/dist/client/index.js`, `define` pages its local database at lines 273 to 298, calls `migrateOne` at lines 310 to 329, and forms the batch result at lines 330 to 334 and returns it at line 369; `runOne` dispatches the supplied function handle at lines 407 to 423; in `dist/component/lib.js`, lines 79 to 86 run the batch, lines 92 to 97 schedule its successor, lines 136 to 155 catch failure, and line 157 saves state. (F17, Probe 6)
- operatorCancelEvidence: A cancel in a separate mutation, made while the next batch is pending, leaves both the parent-table and context-batch drivers canceled; each preserves two rows, commits no more rows during the observed interval, then resumes to twenty-four distinct summaries with one visit per source; the context generation and component cursors agree at cancel and completion. The execution records show each pending successor had begun before the cancel committed, lost the optimistic-concurrency race to it and committed nothing, so a `pending` scheduled function may already be running. (F17, Probe 6)
- transactionFailureEvidence: A scheduled context batch reading eighteen 960 KiB payloads after attempting its rows and checkpoint fails the whole transaction with `Uncaught Error: Too many bytes read in a single function execution (limit: 16777216 bytes). Consider using smaller limits in your queries, paginating your queries, or using indexed queries with a selective index range expressions.`; the component row retains its preceding cursor, processed count two and worker ID without an error field, while the worker is failed and supplies the error; `getStatus` reports failed without an error field, both saved cursors and the two prior rows remain, and resume completes six sources once. Timeout and OCC retry exhaustion are not run. (F17, Probe 6)
