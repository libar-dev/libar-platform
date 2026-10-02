# Application, read-model and operations review

Reviewed 2026-10-02 at commit `dd3185a`. This is a read-only review. No repository file or git state changed. The review read the source before consulting the consensus ledger. The parent review owns installation, whole-suite execution, the corpus check and the final ruling.

## Steering findings

1. APPL-01, major, known: a changed projection writes the active generation in place despite its recorded version, so version rollout and rollback remain unsafe.
2. APPL-02, major, known: the aggregate algorithm moves a marker to a new group without subtracting its old contribution or adding its full new contribution.
3. APPL-03, major, known: the history cursor lacks a source, and its final-event verifier neither proves all affected rows nor handles an unprojected final event.
4. APPL-04, major, known: a deterministic history fold is not necessarily independent of cross-stream order, and deleting its row deletes its deduplication memory.
5. APPL-05, major, known: history rollback reopens a retired generation without reacquiring its write pause, allowing newer events to hide missed earlier ones.
6. APPL-06, major, known, severity raised: rollback verification can retain a row for a subject whose projection became null while that generation was retired.
7. APPL-07, major, known: each rebuild batch checkpoints on the registry document read by every command maintaining that read model, creating broad conflicts.
8. APPL-08, major, known: purge and receipt-check bounds can exceed the byte budget, and restore stream-check arithmetic omits baseline reads.
9. APPL-09, major, known: restore cannot complete for valid snapshots taken during or after a baseline migration under the current verification and door rules.
10. APPL-10, major, known: restore has no complete runner/checkpoint/compare contract, and rebuild has no defined source for its tenant enumeration.
11. APPL-11, major, new evidence-binding defect: the test step claiming every Layer 0 to 2 scenario runs only a sequential smoke path and does not test its concurrency claim.
12. APPL-12, minor, new: the diagnostic record cannot derive the event-write and read-model-write counts that its metric bullets promise.

No new blocker was found in the implemented order-placement path. Findings about unimplemented mechanisms describe contradictions or missing contracts in the intended design. They do not classify the mere absence of planned code as a defect.

## What the implemented scope supports

`src/read-model/` implements the per-entity live writer, row conventions, first activation, reads of the generation registry, the command's bindings, and query helpers. It does not implement backfill, switching, rollback, aggregate projections, history projections, a pause, or restore. The registry schema anticipates future states; only first activation is implemented as a transition.

The production composition under `example/` implements `ReceiveStock` and `PlaceOrder`, two context components, the order summary, and parent detail/list queries. `CancelOrder`, allocation release, history inspection, online rebuild, paused rebuild, restore, mandatory audit and diagnostic emission are planned work. The example's stock-item state intentionally holds only totals. The missing per-order release behavior belongs with the future lifecycle command; it is not a present allocation defect.

The reviewed live code has useful properties:

- `example/convex/ordering.ts` awaits one Orders call and then one Inventory call, catches neither failure, returns both contexts' stream entries, and leaves read-model writing to the command pipeline. The pure tests count these calls for 1, 10 and 100 lines.
- `example/convex/inventory/operations.ts` groups repeated stock IDs before planning streams and checks invalid quantities before summing them. It prevents the repeated-stock-line case from applying multiple decisions against the same starting state.
- `example/domain/order.ts` and `stockItem.ts` check integer quantities and safe-number totals. The accepted order stores the caller's unit prices as the example Spec explicitly says; this is not an accidental production pricing policy.
- Every public query in the example calls `authorizeQuery` before a context or read-model read. Tenant is explicit in arguments and index prefixes. The example grants and activation functions are internal, with runtime validators.
- `src/read-model/write.ts` refuses a declared read model with no writable generation, even when the returned entries do not match its source. A late failure rolls back the context calls and receipt with the command.
- `applyProjection` writes the active row from the whole DTO, skips a missing building row on a live update, writes a created stream in both generations, and enforces its row byte budget. `readModelView` removes document metadata before return validation.
- `listOrderSummaries` uses the pinned Convex pagination result validator and retains split metadata. It does not hand-write a narrower return shape. The native test sources check ordinary reads, subscription updates, tenant separation, authorization refusal, and bounded first pages.

These are source-inspection conclusions supported by the named existing test sources. The parent review supplies the actual `compiled`, pure-test, `convex-test`, and native-backend results. A native test's existence is not a native pass. No extra test suite or native backend was run by this lane.

## Detailed findings

### APPL-01: projection versions are recorded but not obeyed

Severity: major. Existing ledger item `r3-architecture-one-projection-writes-every-generation`, open for S4. The new Spec question honestly records the gap, but does not remove it.

Locations: `src/read-model/projection.ts:62`, `:65`, `:94`; `src/read-model/generations.ts:83`; `design/specs/application/projection-contract.sdp.md:34`, `:59`; `tests/simulator/read-model.test.ts:615`.

`applyProjection` computes the fields once from the declared projection and then destructures only role and generation from each target. It ignores the target's `projectionVersion` and stamps the declaration's version on every row. Changing version 1 to version 2 while generation 1 is active immediately writes version 2 rows into generation 1. Untouched rows remain at version 1. A return validator tightened for version 2 can also fail when it encounters an untouched version 1 row. The retired generation cannot be a version-1 rollback target if resumed live writes also use version 2.

The existing `convex-test` explicitly expects a generation declaring version 7 to receive a version 1 row. This proves that the current behavior is deliberate and tested, not that it satisfies the rollout promise. The first activation and current example remain sound while the single projection stays at version 1.

Recommendation: before the first projection change, resolve a projection implementation by the generation's recorded version and keep the prior version for its rollback period. If that capability is outside the next code change, reject mismatched generations before any write and document the supported deployment procedure. Do not quietly rewrite a recorded generation version.

Fix acceptance: a `convex-test` with active v1 and building v2 must show live creates/updates expressed in each version's own shape. A native-backend rollout must keep queries working during the mixed deployment and show rollback to v1 after intervening writes. A guard-only cut must show a plain error and zero writes on mismatch.

### APPL-02: aggregate group changes miscount

Severity: major. Existing `r3-completeness-aggregate-key-change-miscounts`, open S4; related `r3-sdp-aggregate-entity-key-has-no-source`.

Locations: `design/specs/application/projection-contract.sdp.md:79` through `:81`, with the `orderTotals` example at `:85`.

For an order contributing 100 to `placed`, the marker holds old key `placed` and contribution 100. Cancellation changes its key to `cancelled` and leaves the contribution 100. The prescribed difference is zero. The algorithm writes only the new key, leaving 100 and one entity under `placed`, while `cancelled` gets zero. When its row already exists, its count is not increased because the marker was not new. A missing aggregate row can even be inserted for a null contribution.

Recommendation: read the marker's old key. On a key change, remove the old contribution/count and add the complete new contribution/count to the new row in the same mutation. On deletion, affect the old key without creating a new row. Define an entity identity from the full source stream identity. Recalculate the read/write budget for the second aggregate row.

Fix acceptance: pure tests of the contribution calculation and `convex-test` state transitions for first contribution, same-key update, key change, null contribution, stale DTO, and live/backfill race. A rebuild must equal the live aggregate after each transition. No aggregate runtime currently exists in this tree.

### APPL-03: history enumeration and verification cannot establish coverage

Severity: major. Existing `r3-architecture-history-backfill-cursor-and-verify`, open S4.

Locations: `design/specs/application/generation-registry.sdp.md:62`; `design/specs/application/rebuild.sdp.md:103`, `:116`, `:117`; `design/specs/application/rebuild.write-pause-rebuild-interrupt.sdp.md:36`.

The cursor records tenant, page, stream and event cursor but not which context/stream-type binding owns them. The order-allocation history has at least Orders/order and Inventory/stockItem as sources. Its next batch cannot resolve a saved stream cursor unambiguously.

The verifier checks only a stream's final event's row. A stock stream that allocated to order A at v2 and order B at v3 can pass by finding B at v3 while A is missing. A final `StockReceived` or baseline event may map to no row at all. Treating that as a miss loops forever; treating it as a skip verifies nothing. The example's claim that every row records each source stream's current version is also too strong: A's highest relevant stock event is v2, while the same stock's current version is v3 because of B.

Recommendation: persist tenant, source binding, stream and page position; verify the events relevant to every key, with a defined treatment of null keys. A second complete history pass with zero new folds is one possible coverage check under the pause, provided its watermark semantics are sound.

Fix acceptance: `convex-test` with two contexts, equal local stream IDs, one stock item contributing to two orders, an unallocated stock item, a trailing receipt of stock, and a trailing baseline. Interrupt at every cursor dimension. Corrupt the earlier order's row and prove verification detects it. Native-backend test then proves interruption/resume under the pause.

### APPL-04: history folds need stronger rules than determinism

Severity: major. Existing `r3-architecture-history-fold-order-and-deletion`, open S4.

Locations: `design/specs/application/projection-contract.sdp.md:55` through `:58`, `:69` through `:72`; `design/specs/application/rebuild.sdp.md:116`.

Live writes fold in command order and context-call order. Backfill folds one complete source stream at a time. A deterministic function can give different answers for these two interleavings. For example, creating the order row on `OrderPlaced` and updating only an existing row on `StockAllocated` loses allocations when stock history is enumerated first. There is no global event order to rescue that design. Returning null also deletes the row's source-version watermarks, so later input can recreate it or repeat a contribution.

Recommendation: require and test independence from cross-stream interleaving, or exclude projections requiring cross-stream ordering from this form. Preserve deduplication metadata when a visible row ends, or forbid destructive row deletion for this form. State how baseline events are interpreted or skipped.

Fix acceptance: pure tests must compare at least two legal interleavings and multiple page boundaries for the same events, including stock events before order events. `convex-test` must show delete/late-event behavior and repeated pages without duplicate contributions.

### APPL-05: history rollback does not reacquire the pause

Severity: major. Existing `r3-architecture-history-generation-rollback-unpaused`, open S4.

Locations: `design/specs/application/rebuild.sdp.md:84`, `:108`; `design/specs/application/write-pause.sdp.md:76`; `design/specs/application/projection-contract.sdp.md:56`.

A retired history generation stops receiving events. Rollback reopens it as verifying, and live commands immediately write it again. Unlike `startGeneration`, rollback closes no source scopes. A live event v10 can therefore advance its watermark from v6 to v10 before repair sees v7-v9. Repair drops those older events and the last-event verifier passes the incomplete row. This is the failure the paused history form is intended to prevent.

Recommendation: either refuse rollback of a history generation and rebuild the old projection version under a new pause, or acquire the same source scopes atomically with reopening the retired generation. Reopen writes only after verified switch or abort.

Fix acceptance: a `convex-test` must retire at v6, commit v7-v9, initiate rollback and race v10. The reopened generation must contain all relevant effects, or v10 must be refused while paused. Repeat the race on a native backend.

### APPL-06: rollback verification leaves deleted rows behind

Severity: major for returned-data correctness. Existing `r3-architecture-rollback-keeps-rows-of-deleted-subjects` is recorded as minor; this review recommends raising it when S4 is built.

Location: `design/specs/application/rebuild.sdp.md:81`, `:84`.

A retired generation keeps an entity row. The active generation later deletes that row because its DTO projects to null. Rollback's verify rule only says a null projection needs no row, so it does not remove the retired copy. The rollback becomes active and discloses a subject that should no longer appear in the read model.

Recommendation: verify absence as well as presence. A null projected DTO must delete an existing target row and count that repair as a miss. Keep source enumeration with deleted subjects enabled.

Fix acceptance: `convex-test` and then native-backend rollback after a subject is deleted while the old generation is retired. The subject must be absent in the restored generation and list subscription after the switch. This is a future lifecycle defect, not a present `PlaceOrder` defect.

### APPL-07: rebuild checkpoints conflict with every writer of the read model

Severity: major. Existing `r3-convex-generation-checkpoint-on-the-row-commands-read`, open S4.

Locations: `src/read-model/generations.ts:59` through `:83`; `design/specs/application/generation-registry.sdp.md:48`; `design/specs/application/rebuild.sdp.md:115`.

Each command reads the active/building registry rows to decide where to write. Each rebuild batch writes cursor/count progress onto the same building row. That creates a conflict between the batch and every in-flight command maintaining that read model, even if they touch unrelated tenants and streams. The cost grows during the very operation described as an online rebuild. Row-level conflict semantics do not exclude cursor fields from the read dependency.

Recommendation: keep selection/state/fence on the registry and checkpoint progress on a separate generation-progress row read only by batches and operators. Do not introduce a per-command registry write.

Fix acceptance: source-level verification of disjoint read/write sets and a native-backend benchmark with unrelated-stream commands while backfill runs. Record retries/exhaustions beside the no-rebuild control. `convex-test` does not prove native OCC throughput. The pinned Convex transaction contract is in `node_modules/convex/src/server/registration.ts:47`, `:121`, and `:147`; the parent native probes remain the evidence for backend conflict behavior.

### APPL-08: several maintenance bounds still count rows without enough bytes

Severity: major. Existing `r3-convex-remaining-batches-bounded-in-documents-only`; related `r3-convex-restore-check-omits-baseline-reads` and `r3-sdp-index-does-not-carry-the-stated-query`.

Locations: `design/specs/application/rebuild.sdp.md:110`, `:124`; `design/specs/application/restore.sdp.md:100`, `:106`; `design/specs/constraints/bulk-operations-bounded.sdp.md:27`.

Deleting 500 read-model rows at the 64 KiB row ceiling requires roughly 31.25 MiB of row reads before any other work. The purge's claimed one index range also omits the leading tenant dimension. The receipt check reads 25 receipts and then every operation's events per context; there is no cumulative event/byte bound comparable to the stream check. A valid set of large operations can exceed the shared transaction budget at the same saved cursor repeatedly.

The stream-check arithmetic is improved, but still omits one baseline event per folded stream. With the stated 600 events of up to about 17 KiB plus three 2 MiB allowances for list rows, reread state rows and baselines, the total is approximately 15.96 MiB before the run record and remaining overhead. This is not the claimed comfortable 14 MiB ceiling margin.

Recommendation: derive purge from row bytes and tenant iteration; checkpoint its tenant and position. Give receipt verification a bounded event/key query or a cumulative remaining byte/event budget. Include baseline reads and run-record overhead in the stream-check bound.

Fix acceptance: native-backend batches using rows and event payloads near their declared budgets, with enough tenants to cross a tenant boundary. Verify progress, zero limit failures and restart from the exact checkpoint. Tiny order fixtures cannot establish these bounds.

### APPL-09: restore and baseline migration form an acceptance deadlock

Severity: major. Existing `r3-architecture-restore-and-baseline-migration-disagree`, open S5.

Locations: `design/specs/application/restore.sdp.md:69`, `:75`, `:77`, `:83`; `design/specs/application/write-pause.sdp.md:61` through `:63`; dependent context rebuild contracts belong to the context review.

A snapshot taken during a meaning migration includes streams awaiting a baseline. The context contract classifies this as a journal finding, and restore refuses to reopen on findings. The baseline driver cannot clear those streams because the restore door refuses it. Restore says to restart the chain after acceptance, which cannot be reached. After a completed baseline sweep, the baseline advances source versions without necessarily rewriting read models, so exact source-version equality can also fail on a valid cold row.

Recommendation: distinguish invariant failures from resumable migration work, and rule on a controlled repair/acceptance sequence. Define whether baseline-only version lag with equal projected data is acceptable or whether baseline migration must maintain the read model. Do not silently weaken general version equality.

Fix acceptance: `convex-test` fixtures for a snapshot mid-migration, after migration with cold rows, and with a genuinely corrupt row. The first two must recover and the third must remain closed. The restore drill must then establish this on the native backend, including component data.

### APPL-10: rebuild and restore lack complete enumeration and completion contracts

Severity: major. Existing `r3-completeness-restore-checks-have-no-runner-or-usable-cursor`, `r3-sdp-restore-run-checkpoint-does-not-fit-the-batches`, `r3-architecture-tenant-list-undefined`; related `r3-sdp-restore-compare-mode-undefined`.

Locations: `design/specs/application/rebuild.sdp.md:103`; `design/specs/application/restore.sdp.md:92`, `:98` through `:103`.

There is no defined authoritative tenant list for an all-tenant generation. Restore stores a single string cursor per check but takes context, stream type, read model and tenant scope as independent batch arguments. On a partially consumed page, `budgetExhausted` requires a cursor at a stream even though the list API returns only the end-of-page cursor. No complete runner is named to repeat all batches. The restore calls rebuild verification in a compare mode that the rebuild contract does not define and that must avoid repair writes under the restore door.

The finish contract should also explicitly require every required check to be passed. Its current bullets require no findings and a finished inventory; a pending check has no finding yet. The workflow ordering helps a careful operator but is not a pinned completion guard.

Recommendation: specify one authoritative tenant enumerator and a structured checkpoint including source/tenant/page/within-page position. Name the runner and make completion a persisted state-machine guard, with separate compare and repair modes. Keep failures resumable at the actual work position.

Fix acceptance: `convex-test` over at least two tenants, two contexts, two stream types/read models, a fold budget ending in the middle of a page, and process interruption between every check. Attempt finish with a pending check and assert refusal. Native-backend restore then runs without manual cursor reconstruction.

### APPL-11: the bound native acceptance example claims more than it runs

Severity: major as verification truth, not as a native runtime defect. New finding; the concurrency uncertainty is already an open question in the Spec, but there is no ledger finding for the overbroad executable When binding.

Locations: `tests/native/first-experiment.native-acceptance-production-configuration.test.ts:275` through `:288`; `design/specs/application/first-experiment.native-acceptance-production-configuration.sdp.md:23` through `:26`; its explanatory verification text starts at `:29`.

The bound step accepts only the literal "every Layer 0 to 2 scenario" and calls `endToEndPath`. That function sends a short, sequential set of receipt, placement, rejection, read and visibility checks. The Then step runs `authorityHolds`, `schemasHold`, and `codePathHolds`; no concurrent commands run. Changing every other Layer 0 to 2 scenario to a failure would not make this example fail. Rebuild, restore and the second lifecycle command do not yet exist.

The prose is candid that this is a small end-to-end path and that concurrency parity is not observed. The GWT and executable binding still present the broader statement as verified. A reader of the graph or green scenario result can mistake this local test for the experiment's all-scenarios gate.

Recommendation: make this example's wording match its deployment smoke-path assertion. Put the complete experiment pass condition in a separate aggregate check that consumes enabled scenario results and fails if required cases are absent or failing. Scope any parity claim to what the native backend and configuration evidence actually establish. Preserve the explicit fixture-issuer difference.

Fix acceptance: a pure test of the aggregate gate must fail when one required scenario is missing or failed. Add a native contention example if concurrency behavior is part of this scenario's promised result. The sequential smoke test should still pass on its own merits.

### APPL-12: diagnostic metrics cannot be recovered from their declared fields

Severity: minor. New narrow finding; related but not identical to `r3-completeness-diagnostic-record-outcomes-never-emitted` and `r3-convex-diagnostic-counter-and-duration`.

Locations: `design/specs/operations/baseline-operations.sdp.md:84`, `:94`, `:95`.

`metricEventWrites` derives events appended per command from the diagnostic record's `StreamVersion[]`. A final stream version of 100 can represent one appended event or several and contains no prior version. `metricReadModelCost` cites the same diagnostic record for rows written per command, but it has no inserted/updated/deleted-row count. Absolute source versions are not cost measurements. The pipeline already has the context entries' `appended` values, so the missing input is available before the record is built.

Recommendation: add explicit bounded counters at their producer, or name backend metrics as the actual source and stop attributing these measurements to the diagnostic record. Keep the diagnostic size bound and truncate detail without removing the counters needed for the promised metrics.

Fix acceptance: pure tests with an old stream at version 100, commands appending one and two events, and projections producing zero/one/two generation writes. The recorded metrics must equal the actual work rather than final versions. This is planned diagnostics work, not a current metric regression.

## Scoped risks and follow-ups

First activation is an empty-source precondition supplied by the operator. `src/read-model/generations.ts:13` through `:48` checks only that the read-model registry has no row. It deliberately reads no source. If a read model is newly added to an existing deployment, activating it produces an empty active generation; the next new command populates only its own row. The Spec explicitly assigns existing-history installation to rebuild. This is a known support boundary, not a claim that current `PlaceOrder` can create old source history without its summary. Before using activation as a rollout operation, provide the rebuild path or an explicit source-empty preflight. Acceptance should cover a new read model added after old source events already exist.

Pagination across a generation switch needs a native test. `example/convex/readModels.ts:73` changes the indexed generation internally while callers retain opaque cursors and `readModelView` hides generation. The existing pagination tests stay within generation 1. The ledger's cutover tests assert subscription refresh, but they should include at least two pinned pages and both cursor endpoints. I did not run a native switch because no switch implementation exists, so this remains a lead, not a confirmed pagination defect.

Overlapping paused rebuilds need a rule. The gate has one `generationId` per scope, while two read models can share the same source. `closeScope` says to add the scope, with no stated behavior when it is already closed for another generation. Reject the second owner or define explicit multi-owner closure and release. An implementation must not let the first rebuild's resume reopen a source still required by the second. This is a design question requiring a concrete two-rebuild acceptance case, not an observed code failure.

`getOrder` intentionally asks for the tenant-wide `orders.read` permission without a subject policy. The helper test for subject-scoped read authorization calls `authorizeQuery` directly, not this public query. Do not read that test as evidence that the example endpoint accepts per-order grants. If that is intended product behavior, wire the order subject into the detail query and test the public endpoint; the present behavior fails closed.

Other revalidated design gaps should travel with the existing ledger rather than duplicate findings: the migrations binding has no installed package or complete per-run binding contract; purge needs a tenant-aware cursor; cross-context current-state projections have no complete write form; the audit input cannot represent all promised gate changes; operator entry/identity contracts need completion. The implementation avoids these unbuilt paths. The report does not suggest installing migrations or expanding the code before the owner rules.

## Evidence and limits

Read `AGENTS.md`, `CONTEXT.md`, `design/SESSIONS.md`, the relevant decision-document rows, and PLAN section 7. Applied the `convex-reviewer` and `unslop` skills. No Spec text was edited, so the authoring skill was not needed.

Ran graph recipe 5 for `pack:application` and recipe 3 for read-models, projection-contract, rebuild, restore, first-experiment and baseline-operations. The pack reports 37 members, all `defined`, no unresolved member, five implementation bindings, and 20 verifier gaps. An implementation binding is only a source anchor. A `Verification executable` section without an enabled test anchor is a promised test, not a passed test. The full baseline result is intentionally left to the parent review.

Read the current live read-model library and all handwritten example source, including schemas, registrations, validators, grant entries, auth configuration and context configuration. Inspected their pure and simulator tests and the Layer 2 native examples and shared step helpers. Generated API files were used as dependencies; generated text was not treated as independent design evidence.

Pinned versions checked from local packages: Convex 1.46.0, convex-helpers 0.1.124, convex-test 0.0.60. Used local `convex/src/server/registration.ts`, `database.ts` and `convex-helpers/server/stream.ts` for the transaction and pagination contracts. No current remote documentation or a different package version was substituted. The old ledger's remote-source claims are reported as known items, not as a new remote verification by this lane.

## Complete scoped Spec inventory

Every member below was read. The application pack itself was also read at `design/specs/application.pack.sdp.md`.

application

- `design/specs/application/first-experiment.native-acceptance-production-configuration.sdp.md`
- `design/specs/application/first-experiment.order-of-1-line.sdp.md`
- `design/specs/application/first-experiment.order-of-10-lines.sdp.md`
- `design/specs/application/first-experiment.order-of-max-lines.sdp.md`
- `design/specs/application/first-experiment.sdp.md`
- `design/specs/application/generation-registry.command-without-generation-fails.sdp.md`
- `design/specs/application/generation-registry.first-activation-makes-read-model-writable.sdp.md`
- `design/specs/application/generation-registry.sdp.md`
- `design/specs/application/orders-inventory-example.sdp.md`
- `design/specs/application/parent-use-cases.sdp.md`
- `design/specs/application/parent-use-cases.second-context-rejects.sdp.md`
- `design/specs/application/parent-use-cases.second-context-throws.sdp.md`
- `design/specs/application/projection-contract.sdp.md`
- `design/specs/application/read-models.committed-state-read-through-query.sdp.md`
- `design/specs/application/read-models.committed-state-visible.sdp.md`
- `design/specs/application/read-models.list-pages-by-cursor.sdp.md`
- `design/specs/application/read-models.query-refused-before-disclosure.sdp.md`
- `design/specs/application/read-models.query-refused-without-grant.sdp.md`
- `design/specs/application/read-models.sdp.md`
- `design/specs/application/rebuild.online-rebuild-interrupt-resume.sdp.md`
- `design/specs/application/rebuild.sdp.md`
- `design/specs/application/rebuild.write-pause-rebuild-abort.sdp.md`
- `design/specs/application/rebuild.write-pause-rebuild-interrupt.sdp.md`
- `design/specs/application/restore.restore-representative-dataset.sdp.md`
- `design/specs/application/restore.sdp.md`
- `design/specs/application/write-pause.sdp.md`

operations

- `design/specs/operations/baseline-operations.broken-audit-aborts.sdp.md`
- `design/specs/operations/baseline-operations.broken-metrics-never-abort.sdp.md`
- `design/specs/operations/baseline-operations.sdp.md`

constraints

- `design/specs/constraints/bulk-operations-bounded.sdp.md`
- `design/specs/constraints/events-stay-small.sdp.md`
- `design/specs/constraints/no-application-wide-counter.sdp.md`
- `design/specs/constraints/no-queue-recovery-for-essential-reads.sdp.md`
- `design/specs/constraints/one-call-per-context-per-use-case.sdp.md`
- `design/specs/constraints/one-commit-per-successful-command.sdp.md`
- `design/specs/constraints/one-public-execution-per-intent.sdp.md`
- `design/specs/constraints/zero-core-projection-jobs.sdp.md`

Parent verification update, received after the report was written: the complete native-backend run passed 65 files and 83 tests at clean commit `dd3185a`. The record is `evidence/runs/native-20261002T071055Z-dd3185a-383e6fb9-1580-4109-8371-955a1b0a45d2.json`. This establishes the behavior of the implemented native suite. It does not establish unbound rebuild/restore scenarios or repair the APPL-11 mismatch between the broad bound sentence and that test's narrower assertions.
