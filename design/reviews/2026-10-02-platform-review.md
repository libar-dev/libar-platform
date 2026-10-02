# Platform design and implementation review

Reviewed on 2026-10-02 at `dd3185a6b1c6b2bb570865a8fddb88163f91c08e`, on `slice/s2`.

Keep the transactional architecture and the implemented core. Before expanding it, close the receipt-disclosure gap, resolve the error-boundary contradiction, bound the history being created, and make the acceptance claims match their tests. Then measure the current composition and build one complete rebuild path. The generation, migration and restore contracts need several decisions before they are safe implementation instructions.

The review covered all 201 SDP Specs and five Packs, the implemented libraries, both compositions, the harness, scripts, CI configuration, and the tests needed to assess their promises. The source-first reviews were compared with the existing ledger afterward. This report distinguishes new findings, known unresolved issues, planned missing implementation, and unconfirmed leads. The [coverage inventory](2026-10-02-platform-review/inventory.md) lists every Spec.

This is an independent steering report. It does not state `ready`, approve a formal review lens, settle owner questions, or change the governing doc. No planted-defect calibration was performed, so it should not be treated as the calibrated lens approval required by `SESSIONS.md`. Existing round-3 records and the consensus ledger retain their text.

## What the fresh checks establish

The corpus and current tests pass. That is a useful starting point, but it does not establish that all Layer 2 behavior exists or that every intended failure case is covered.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm ci` | Passed | The pinned dependencies installed |
| `python3 design/tools/check.py` | `OK`, zero errors and warnings | Specs, index and ledger agree under the structural check |
| SDP recipes 5, 7, 8, 10 and 20, plus scoped Spec queries | Resolved; readiness divergence empty | Pack membership, graph structure, declared verification and open questions were inspected |
| `npm run typecheck` | Passed | Compiled tier, both compositions and shared code |
| `npm run lint` | Passed | The repository's static rules pass |
| `npm run format:check` | Passed | Existing checked source formatting passes |
| `npm test` | 40 files, 307 tests passed | Compiled, pure test and `convex-test` tiers |
| `npm run test:native` | 65 files, 83 tests passed | Native backend tier, the cases actually run by this suite |
| Four targeted review reproductions | 4 passed | Two pure checks and two `convex-test` checks reproduce the new core findings |

The native run used Convex 1.46.0, convex-helpers 0.1.124, convex-test 0.0.60 and backend release `precompiled-2026-09-28-5c7cb5b`, on macOS Apple silicon with Node 24.21.0. Its [saved record](2026-10-02-platform-review/native-run.json) records `clean: true`, all 83 tests passed and no unhandled errors. The first native attempt could not open localhost listeners inside the sandbox; the permitted local run then passed. No hosted deployment was tested. No CI run, hosted quota measurement or production acceptance is implied.

At this snapshot, the checker reports 201 Specs, five Packs, 83 anchors, 289 graph nodes and 1,069 edges. There are 191 Specs at `defined`, ten at `scoped`, and none at `ready`. Sixty-eight Specs carry 140 open questions, ten blocking. The ledger holds 245 findings: 138 fixed, 88 open, 18 partially fixed and one with the owner. Thus 107 records still require some resolution. These totals include later work and polish; they are not 107 defects in the implemented command path.

## What should be preserved

The platform's central decisions fit the evidence from this implementation. A command performs its context calls, read-model writes and receipt insertion inside one parent mutation. The kernel computes current state by folding events. Rejections propagate as throws. These choices avoid compensating local work that Convex can already commit atomically.

The tests have meaningful controls. Rollback tests write before throwing and inspect the resulting state. Authority tests distinguish ordinary signed clients from administrative calls. Pagination probes retain split metadata and record a helper limitation rather than hiding it. The native harness checks executable hashes, isolates deployment targeting, tracks process ownership and makes failed cleanup fail the evidence record. Those are worth keeping.

The code also avoids several tempting early abstractions. There is no command bus, global event counter, central journal component, mandatory projection worker or generic process engine on order placement. The findings in this report can be addressed at existing boundaries. I found no reason to replace that architecture.

The explicit implementation limits are mostly honest. The current read model is per subject, with first activation and live updates. Backfill, aggregate and history projections, cutover, rollback, baselines, restore, receipt sweeping, audit and diagnostics are not all implemented. Their absence is planned work. The concern is whether their Specs compose into a behavior an engineer can implement without silently making product decisions.

## Fix or rule on these before expanding the current command path

### 1. A conflicting request key can disclose another subject's operation ID

`CORE-01`, major, new. Reproduced at the `convex-test` tier.

The pipeline authorizes the subject in the newly supplied input, then looks up a receipt whose key contains tenant, namespace, command type and request key. On a fingerprint conflict it returns the stored operation ID. Those are different authorization subjects when the key belongs to another command input.

The reproduction gives Alice a grant for document A and Bob a grant for document B. Bob creates B with a shared request key. Alice cannot create B, but submitting A with that key reveals Bob's operation ID. This is a same-tenant metadata disclosure, not a cross-tenant read or a disclosure of the original result.

Keep the required receipt key. The smallest correction is to omit stored-operation metadata from conflict and unsupported-version errors unless the actor is authorized to see the existing receipt. Do not treat possession of a request key as authority. Add a two-actor, two-subject regression at `convex-test`, then prove the public wire result on the native backend.

Evidence: [pipeline.ts:135](/Users/darkomijic/dev-libar/application-platform/src/command/pipeline.ts:135), [pipeline.ts:183](/Users/darkomijic/dev-libar/application-platform/src/command/pipeline.ts:183). Full trigger, contract references and acceptance checks are in [CORE-01](2026-10-02-platform-review/core.md#core-01-changed-input-receipt-conflict-discloses-another-subjects-operation).

### 2. The outer error boundary does not enforce its closed code promise

`CORE-02`, major contract inconsistency, new. Reproduced by a pure test.

A bare context rejection is checked against the platform codes and the command's declared rejections. An error already carrying `kind: "rejection"` bypasses that check. The exported `reject` helper permits an arbitrary string code, and normalization preserves both the undeclared code and a different command name. Direct construction of a tagged error also bypasses the details-size check.

No current production command was found misusing this path. The risk is that the next integration can compile and violate the advertised error contract. Rollback still occurs; this is a classification and API-contract problem.

Rule on one behavior. Prefer validating bare and tagged rejections at the outer boundary, including code, command identity and bounded details. Otherwise narrow the Spec promise and make the trusted construction boundary enforceable. Add table-driven pure cases and one registered-command case. [Outcome boundary implementation](/Users/darkomijic/dev-libar/application-platform/src/command/outcome-boundary.ts:94), [CORE-02 detail](2026-10-02-platform-review/core.md#core-02-tagged-errors-bypass-the-closed-rejection-code-contract).

### 3. Bound complete event envelopes before more history accumulates

`CORE-03`, major, new residual defect in earlier budget arithmetic. Accepted input reproduced with `convex-test`; the future read-budget consequence is arithmetic, not a native failure observed in this review.

The public command accepts a 32 KiB correlation ID and copies it onto each event. The event payload cap does not cap that metadata. Yet the future journal fold, query and migration bounds assume an ordinary event costs at most about 17 KiB, including roughly 1 KiB of envelope. Six hundred events containing those correlation IDs alone exceed 18.75 MiB.

A later size restriction cannot shrink history already stored. Define a whole-event budget, or bound every envelope field and derive the full maximum. Update the fold and migration arithmetic to match. Preserve a resumable or explicit refusal path for valid historical data outside a later limit.

Prove exact boundary values and multibyte metadata in pure or `convex-test` cases, then exercise maximum-sized history on the native backend before claiming rebuild bounds. [Event insertion](/Users/darkomijic/dev-libar/application-platform/src/context/journal.ts:181), [CORE-03 detail](2026-10-02-platform-review/core.md#core-03-envelope-size-is-unbounded-where-fold-arithmetic-assumes-a-small-envelope).

### 4. An explicit null rebuild start is discarded

`CORE-04`, minor, new. Reproduced by a pure test.

`rebuild` uses `start ?? decider.initial()`. Its generic state type allows null, but an explicit null baseline becomes the initial state. The Spec repeats the expression. Current example states are objects, so this is a small generic-contract defect, not an observed order-placement failure.

Distinguish an omitted start from an explicit null and correct the Spec through the normal ruling process. An undefined check is enough if undefined is not a valid persisted state. Test omitted, null, zero and ordinary object starts. [Kernel helper](/Users/darkomijic/dev-libar/application-platform/src/kernel/decider.ts:59), [CORE-04 detail](2026-10-02-platform-review/core.md#core-04-null-cannot-be-used-as-an-explicit-baseline-start).

### 5. One green acceptance example claims more than its test runs

`APPL-11`, major evidence defect, new. Established by inspecting the binding; the native test passes in the fresh run.

The production-configuration example binds the words "every Layer 0 to 2 scenario" to a short sequential path. Its assertions exercise authority, schemas, placement, rejection, reads and visibility, but no concurrent command. Rebuild and restore do not exist yet. Failing an unrelated required scenario would not fail this bound example.

The surrounding prose acknowledges the narrower scope, but the executable statement still overclaims. Rename the bound step to the path it tests. Give the full experiment a separate acceptance check that consumes the required scenario results and fails on absent or failing cases. Keep compiled contract checks and native behavior checks distinct. This can be a small manifest or report, not a new framework.

The test for that gate should deliberately omit or fail one required scenario and show that experiment acceptance fails. Add an actual native contention case before claiming concurrency parity. [Acceptance test binding](/Users/darkomijic/dev-libar/application-platform/tests/native/first-experiment.native-acceptance-production-configuration.test.ts:275), [APPL-11 detail](2026-10-02-platform-review/application.md#appl-11-the-bound-native-acceptance-example-claims-more-than-it-runs).

## Decisions needed before building rebuild and migration

Most findings in this group already appear in the ledger or owner queue. The value of this review is to connect them into a build order. Fixing isolated sentences will not prove the combined behavior.

| Subject | Why the current intended behavior is incomplete or unsafe | Recommended next decision | Detail |
| --- | --- | --- | --- |
| Projection version rollout | The live writer uses one projection for every target generation and ignores the generation's version. Deploying v2 can mix v1 and v2 rows inside the active generation. | Resolve the projection by generation version, or reject mismatch until that lifecycle exists. Decide before the first projection change. | APPL-01 |
| First activation over existing history | The helper checks for an empty generation registry, not empty source history. Old subjects are absent from a newly activated read model. | Keep activation restricted to empty sources, with an explicit preflight, or install the read model through rebuild. | Application scoped risks |
| Aggregate group changes | A marker moving from placed to cancelled changes key but the pinned difference can be zero. Old totals remain and new totals are wrong. | Remove the old contribution and add the full new one atomically; define null contribution and source identity. | APPL-02 |
| History fold order | Live command order and source-by-source rebuild order differ. Determinism alone does not make them equivalent. | Require independence from legal cross-stream interleavings, or exclude that projection from this form. | APPL-04 |
| History coverage | The cursor lacks the source binding; checking only a stream's last event misses earlier rows and unprojected final events. | Pin the complete cursor and a coverage proof for every relevant row. | APPL-03 |
| History rollback | Reopening a retired history generation without a pause lets a new watermark hide missed events. | Refuse this rollback form, or reacquire the same source pause and catch up before reopening. | APPL-05 |
| Deletion on rollback | A null projection is treated as requiring no row, but does not remove an old row retained by the retired generation. | Verify absence as well as presence. | APPL-06 |
| Rebuild progress and contention | Every command reads the building registry row, while each batch writes its progress there. Unrelated subjects and tenants can conflict. | Separate selection and fences from progress checkpoints; prove the effect under native contention. | APPL-07 |
| Tenant enumeration | There is no authoritative tenant list or rule for tenant creation while a deployment-wide pass runs. | Name the owner of tenant enumeration and its cut/continuation semantics. | APPL-10 |
| Baseline migration | Queries can map old states with new DTO code; the migration pause rules disagree; source changes do not necessarily maintain read models. | Specify query compatibility, allowed migration writers, read-model updates and completion together. | CORE-05 and CORE-06 |
| Maintenance budgets | Purge, receipt checking and operation history can exceed byte limits despite row-count bounds. One migration operation can span many batches. | Derive row, byte and event bounds together; make large reads resumable. | CORE-07 and APPL-08 |
| Restore completion | Valid mid-migration snapshots can be rejected while the restore gate prevents the repair. Cursor and runner contracts are incomplete. | Distinguish corrupt data from resumable work, pin structured checkpoints, and refuse finish unless every required check passed. | APPL-09 and APPL-10 |

The [application review](2026-10-02-platform-review/application.md) contains exact lines, ledger IDs, concrete counterexamples and tier-specific proof obligations for each row. The [core review](2026-10-02-platform-review/core.md) covers migration and receipt retention in more detail.

Build the per-subject online path first. It exercises generation creation, live writes, bounded enumeration, interruption, verification, cutover and rollback with the fewest extra semantics. Introduce an aggregate or history view only for an actual read need. The existing direction to remove an unsupported generic promise before building a helper no view needs is sound.

Two leads deserve explicit acceptance cases but are not established defects: pagination with two retained pages across a generation switch, and two paused rebuilds sharing a source scope. The first needs a cursor continuity/reset policy. The second needs pause ownership so one rebuild cannot reopen a source the other still needs closed.

## Measurement should decide the next optimization

The fresh native record reproduces the cost concern already in STATE.

| Order lines | Documents read | Documents written | Read bytes | Written bytes | Execution time in this run |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 6 | 2,943 | 4,271 | 51.6 ms |
| 10 | 35 | 24 | 14,454 | 18,410 | 39.1 ms |
| 100 | 305 | 204 | 129,564 | 159,800 | 184.4 ms |

These are individual local, uncontended test observations. They are not latency percentiles or throughput benchmarks. The smaller ten-line time is itself a reason not to infer a latency curve from three samples. The counts fit `3N + 5` reads and `2N + 4` writes; the design estimated `N + 6` reads. See the `placeOrder` measurements in the [native record](2026-10-02-platform-review/native-run.json).

Before S3 is judged, the owner should set the maximum order size and latency/throughput targets. The current maximum of 100 is a supported test/configuration value, not a substituted product decision.

The measurement should explain the extra reads before changing the design. Attribute them to stream load, journal consistency checks, state replacement, grants, receipts and read-model maintenance with small controlled comparisons. Then measure separate cases for a new accepted command, an authorized duplicate, a changed-input conflict, a business rejection, a failed second context and native OCC retries. Use both shared-stock contention and unrelated stock or tenants. Report retry attempts, final outcomes, document and byte work, and durable rows retained.

If a journal-tail check is redundant under a proven writer invariant, weigh its cost against the defect it detects. Do not remove it solely to match a paper count. If a component call dominates, answer the existing OQ1 using the measured use case. A local backend's throughput cap and missing hosted quota data must remain explicit.

The intended diagnostic record cannot currently supply all its promised cost metrics. Absolute final stream versions do not reveal how many events a command appended, and the record has no read-model write count. `APPL-12` recommends explicit counters from the existing producer values, or a named backend metric source. This is planned diagnostics work, not a current telemetry failure.

## Later layers should wait, with these corrections queued

All 43 durable-and-later Specs were read. They have no implementation bindings. Their triggers remain useful, and this review does not recommend activating obligations, workflows, agents or advanced reads early.

The later-layer pass found eight additional design issues. Their severity is relative to the promised capability when it is built, not to today's `PlaceOrder` path.

| ID | Severity | Concrete problem | Required direction before that capability ships |
| --- | --- | --- | --- |
| DUR-01 | Blocker for durable restore | A restored pending obligation may already have caused its effect after the backup, but rebuild schedules a call without reconciliation. Restoring before first claim can also reset the assumed provider-key validity start. | Treat the gap as uncertain and prove every applicable policy with backups before claim and during execution. |
| DUR-02 | Major | `tenantId + ":" + effectKey` collides for distinct valid tuples such as `a:b,c` and `a,b:c`. | Use canonical tuple encoding or a stable hash, scoped to the real provider key namespace. |
| DUR-03 | Major | Negative reconciliation under `reconcileFirst` schedules another reconciliation instead of the now-safe call. Expired reuse can require a reconciliation handler that the type allows to be absent. | Pin mode transitions and the meaning of provider-confirmed absence. |
| DUR-04 | Major | Late evidence on a terminal obligation sets a reconciliation flag, while every operator reconciliation is refused; restore waits for all such flags to clear. | Add a recorded resolution of late evidence without stale status overwrite. |
| DUR-05 | Major | Deadline checks occur after failure, not before a delayed first attempt or external claim. | Define deadline semantics and enforce them at the actual admission points. |
| DUR-06 | Major | Retention uses current provider policy and a 30-day minimum, with no representation of longer accepted replay/redelivery horizons. | Preserve the relevant accepted horizon or a compact deduplication identity. |
| DUR-07 | Major | Turning dispatch off blocks new claims but not provider actions already scheduled by earlier claims. | Define quiescence and treatment of queued/in-flight calls before restore. |
| DUR-08 | Major | The one helper throws at the seventeenth obligation, while a fan-out body is specified to create 500. | Keep large fan-out deferred; when needed, define distinct explicit budgets and bounded continuation. |

The [durable review](2026-10-02-platform-review/durable.md) provides timelines, exact sources, proposed acceptance tests and a table of existing related ledger findings. None of these eight was claimed as a running-code reproduction.

Before a future Layer 3 implementation, also resolve the known registry shape disagreement, authority recheck without a permission, late-evidence schema mismatch, lease cleanup, chain-bound classification, sweeper starvation, restore cursor and product completion query. Use one thin local reaction to test whether the obligation module earns its cost under Probe 7. Then add one external effect and exercise its complete failure matrix.

For Layers 4 to 6, keep only the trigger, promise and scenarios until there is a consumer. Approval revocation and agent policy contain unmarked product choices that need owner rulings. The advanced history example should distinguish its initial source cut from final catch-up coverage. These are reasons to sharpen acceptance text, not to design more tables now.

Current Convex documents commit timestamps and a matching snapshot bound. That is a native option worth probing before adding an ordered-consumer counter, as an existing ledger finding already notes. It does not by itself solve gap detection, historical-state reconstruction or the business order between events in different contexts. Any change to D2 remains the owner's. [Convex commit timestamps](https://docs.convex.dev/database/advanced/commit-timestamp).

## Improve how the design guides the next build

### Keep binding, passing and acceptance separate

A Spec with an implementation anchor can still contain planned workflows. A test anchor says where a verifier exists, not whether it passed. A passing native smoke path does not stand for every required scenario. Keep an explicit, generated mapping from required scenario to composition, tier, verifier and saved run result. Do not force formal readiness upward to express implementation progress.

Preserve the negative controls already used by the harness. For new boundary tests, prove that the assertion would catch the corresponding removal or incorrect branch. Spend that effort on authority, rollback, deduplication, generation lifecycle and recovery. Do not demand mutation testing for every reversible helper or prose edit.

### Make unknown graph coverage an explicit review input

`FOUND-01` reproduces a graph gap: recipe 4 on `harness/backend.ts` and `harness/admin.ts` returns no impacted Spec and lists both files under unknown coverage. The sole anchor in `harness/native.ts` does not cover the whole directory. A related kernel limitation is already in STATE.

Add anchors where the Protocol supports them, or document a deliberate fallback from unknown files to their owning contracts. Do not interpret an empty impact set as no review needed. The [foundation report](2026-10-02-platform-review/foundation.md) and [query output](2026-10-02-platform-review/foundation-impact.json) preserve the evidence.

### Reconcile the vocabulary once

AGENTS.md makes `CONTEXT.md` the language authority. Pack model references lead to `platform.vocabulary`, which still defines command as input to one context and decider as code of a context. CONTEXT distinguishes a parent command from a stream command and gives a stream type its decider. These are different concepts, not harmless synonyms.

Use the already queued owner ruling to name one authority and align the model Spec. Do not let the next build choose names by whichever file its author opened first. Query rejection, parent/context reads and first activation also remain language gaps already in STATE.

### Treat ledger fixes as proposals until verified against current text

A clean checker cannot show that a prose finding still exists or that its suggested fix is correct. One concrete stale item remains open for a handwritten operator page validator even though the Spec now uses `paginationResultValidator`. The item DTO is still unpinned, but the old page-shape fix is no longer the right work.

Several older fix proposals already have corrections in STATE, including cursor ties and byte arithmetic. Resolve the live issue, not the old fix text. Split mixed findings when parts belong to different builds, and record why a remaining part is deferred. The 27 fixed findings still marked unreviewed should be confirmed where the upcoming work touches them; a new whole-corpus review cycle is not necessary to do that.

### Keep work status in reports and STATE

Foundation Specs still contain statements such as nothing having run or the whole of Probe 3 being pending. The dated native evidence says otherwise; only some hosted measurement remains open. Remove those temporal statements when reconciling their owning Specs. Keep dates and version pins with evidence. Only the owner edits the governing doc, including its stale Convex assumptions.

The formal workflow is written around a Claude main thread and external machine-local notes. This report is portable within the repository, including its complete coverage inventory and reproductions. Preserve that portability for decisions needed by the next builder. Private historical evidence can stay private; the public Spec should still carry enough of the ruled contract to be implementable.

## Recommended work order and exit conditions

1. Close the present boundary issues. Rule on CORE-01 to CORE-04 and APPL-11, implement the narrow corrections, and add the targeted checks described above. Preserve current rollback behavior. Success means no subject metadata disclosure, one enforced rejection contract, credible whole-event bounds, correct null starts, and honest acceptance labels.
2. Record the minimum owner decisions for measurement and rollout. Set maximum order size and performance targets; settle vocabulary authority, initial activation policy and the supported projection-version transition. These decisions unblock concrete tests. The rest of the 140 questions need not be answered at once.
3. Measure the current thin composition. Explain the `3N + 5` reads, separate retry cost, and exercise shared and unrelated contention. Keep local and hosted claims separate. Optimize only a demonstrated cost that misses an agreed target.
4. Build one per-subject online rebuild through completion. Include source enumeration, independent progress checkpoints, versioned projection selection, interruption/resume, absence checks, cutover, rollback and paginated readers. Run Probe 6 against the pinned backend. Do not call the lifecycle complete after backfill alone.
5. Finish the transactional experiment's lifecycle command and recovery proof. Add the specified cancellation/release behavior, history inspection, baseline migration and restore as coherent procedures. Include snapshots mid-migration and interrupted restore. Mandatory audit failure and diagnostic failure need their distinct outcomes. This is the point to reassess all Layer 0 to 2 acceptance rows.
6. Activate Layer 3 only on its trigger. Run the relevant Probe 7 work and the do-nothing comparison. Resolve DUR-01 to DUR-08 and the existing durable contracts during that build. Keep Workflow, agents and advanced reads deferred until their own consumer exists.

This order leaves the tested transaction path available while reducing the chance that a new lifecycle mechanism changes the meaning of stored data without a recoverable transition. The next approval should concern a concrete change with its evidence, rather than a blanket approval of the whole corpus.

## Report contents and reproducibility

- [Core review](2026-10-02-platform-review/core.md): 42 Specs, implemented kernel/context/command findings, migration and receipt contracts.
- [Application review](2026-10-02-platform-review/application.md): 37 Specs, read models, generations, rebuild, restore, example composition and operational metrics.
- [Foundation review](2026-10-02-platform-review/foundation.md): 79 Specs, harness, probes, CI, evidence and graph coverage.
- [Durable review](2026-10-02-platform-review/durable.md): 43 Specs, obligations, effects, processes, agents and advanced reads.
- [Inventory](2026-10-02-platform-review/inventory.md) and [machine-readable inventory](2026-10-02-platform-review/inventory.json): all 201 Specs.
- [Native run record](2026-10-02-platform-review/native-run.json): clean snapshot, versions, per-test outcomes, backend facts and measurements.
- [Review reproductions](2026-10-02-platform-review/core-repros.test.ts) and [configuration](2026-10-02-platform-review/core-repros.config.mts): run `npx vitest run --config design/reviews/2026-10-02-platform-review/core-repros.config.mts` from the repository root. These assertions confirm the defective behavior at this snapshot. When the fixes land, invert them into regression expectations; do not preserve the defects to keep this review suite green.

No implementation, Spec, readiness value, consensus-ledger status or historical review record was changed by this task. Only this report and its supporting artifacts were added. The recommended changes remain proposed work for the owner and the next implementation session.
