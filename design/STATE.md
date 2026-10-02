# State of the design corpus

Written on 2026-10-02 at the close of the unit that took in the platform review, which followed slice S2. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
202 specs · 5 packs · 99 anchors → 306 nodes · 1095 edges (0 errors, 0 warnings)
validate: 0 errors · 0 warnings; readiness divergence: []
open questions: 68 Specs, 144 questions, 10 blocking; extensions registered: 51
stated readiness: {'defined': 192, 'scoped': 10}
ledger: 263 findings, {'fixed': 144, 'open': 100, 'owner': 1, 'partially-fixed': 18}
open findings by slice: {'L3': 31, 'P': 20, 'S3': 1, 'S4': 30, 'S5': 18}
corpus digest: 04faf7d4d793badd
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-5993da7.tgz
```

The default branch is `main`, published at `github.com/libar-dev/libar-platform`. Each unit works on its own branch, named for the unit, so that `main` stays green. The owner gave the session a mandate on 2026-10-01 to merge at this early stage, and said the same day that a pull request per unit was not a good idea while the design is iterated quickly. So from slice S1 on there is no pull request: CI runs on every push, and the session fast-forwards `main` once CI is green on the last commit. Slice S0 was the one unit merged through a pull request. That held until the merge of 2026-10-02.

**Slice S2 and the platform review unit are on `main`.** The owner said on 2026-10-02, after the close of the platform review unit: "Please merge to main and push. This is the last change we will do without formal PRs since things are starting to shape up." The session fast-forwarded `main` to `fix/platform-review`, which holds `slice/s2`, and pushed it. The owner's earlier bar for S2 was "high-confidence changes only", with a revert to `9221da1` kept cheap until the owner had seen the result.

From this merge on, a unit reaches `main` through a pull request: tactical decision 32. The review as it was received is in commit `70c15bc`, with paths of the owner's machine in its links. The files were deleted from the tree at the close, and the owner said the same day that the deleted review may stay in the history.

## Where the work stands

Slices S0, S1 and S2 are built, and one unit after them took in an independent review of the whole.

The platform review unit, in one afternoon on 2026-10-02. An independent read of all 201 Specs, the libraries, both compositions and the harness at `dd3185a`, by `gpt-6-astra` in a Codex thread of its own, said to keep the architecture and the built core, and reported 31 findings. The session ruled on each, and the owner said the report could go once its fixes were applied or recorded. It is gone from the tree. A copy, the session's response and every brief, design and report of the unit are in the folder the project notes name. Every statement of the review that asks for later work is in the ledger or in this file.

What the unit built, about 3,000 lines:

- A receipt conflict and an unsupported-version answer carry a fixed message and no details. Holding a request key gives no authority over the receipt stored under it. The one fact the two codes disclose is whether the stored contract version is the declaration's.
- Every rejection passes one validation at the outer boundary, bare or in the wire shape: the code, the command's name, the details bound. A rejection candidate that does not fit its shape becomes a plain error. `reject` compiles with platform codes only.
- Every text field a caller sets beside the input is bounded in UTF-8 bytes at step 1 (256, and 512 for an actor's ID), a stream ID at the adapter's step 1, and `append` bounds the envelope beside the payload at 4,096 bytes. So a stored event is at most 20,541 bytes, and the fold bound in the Specs moved from 600 to 500 events.
- `rebuild` folds from an explicit `null` start.
- The acceptance check: `npm run acceptance` derives the required scenarios of the first experiment from the graph, one per example of a required row, and reads them against one run's record. A scenario is passed, failed, absent or missing. `npm run test:all` makes the one run of every project that the record needs, and CI fails on a failed or absent scenario and reports the missing ones. The bound step of the production-configuration example now names the path it runs and claims nothing about concurrency.
- Every TypeScript file under `harness/` carries its own code anchor.
- The ledger took 18 new records and notes on 46 existing ones.

What passed at `645130f`, and at which tier, with the same pins as S2:

- Compiled, pure test and `convex-test` tiers: 49 files, 455 tests. Typecheck, lint and format pass.
- Every project in one run on a clean tree, macOS on Apple silicon: 116 files, 540 tests, the native tier among them. The record is `evidence/runs/native-20261002T161135Z-645130f-066930f6-cc9f-48ff-a5da-2fd9e93dc028.json`. It is not copied to `evidence/`. Commits after `645130f` change Spec text, the ledger and this file only.
- `npm run acceptance` on that record: 30 scenarios passed, none failed or absent, 5 missing, exit 3. The missing ones are the examples of Sc L2-5 to L2-8, which have no test yet. Sc L2-9 shows as passed on an example that proves nothing about concurrency: the owner queue has the question.
- CI first ran on these commits at the push of `main`. This file was written before its result.

How the unit was run, for the next one. Tactical decisions 28 to 31 hold the rules, `SESSIONS.md` has the role table that came out of it, and the project notes have the times, the plant results and what to carry forward. Two Fable designers with disjoint subjects took fifteen minutes each and returned Spec patches proven in scratch copies. Then astra wrote 94 test cases and sol wrote the fix, each from the Spec text alone and in its own worktree: 92 of the 94 passed at the first merge, and the two that failed were one wrong sentence in the Spec and one real defect in the fix. Sol drafted the whole ledger intake with an apply script. An Opus agent checked astra's nine findings on unbuilt design against the Spec text before they entered the ledger: all nine held.

Review of the unit. Three lanes on a frozen copy that shared nothing: astra at xhigh on behavior (38 mutations, 19 attacks on the acceptance check, native probes), sol at medium on every line and number Claude models wrote, an Opus agent on every line GPT models wrote. None found a defect on a healthy path in the three corrections. They found one defect on an ordinary failure path, in a path the merge itself had added (a bare rejection with a list as its details left the boundary unvalidated), two ways to make the acceptance check pass when it should not, one uncaught exception on a malformed record, three figures that did not follow from their operands, three stale register rows, and fourteen mutations no test caught. One fold-in in two rounds closed them, code by an Opus agent and Spec text by sol, and each new test was shown to fail under its removal. One read of the fold-in followed, sol on the code and an Opus agent on the Spec text. It found no defect on a healthy path in the code and six Spec sentences that were false or said less than the code does, which were corrected, and the unit stopped on tactical decision 19. Three defects were planted in the frozen copy to calibrate the reviewers: the project notes say who caught which.

Before that unit: S0 gave the repository a native test harness (`harness/`), a fixture Convex app (`fixture/convex/`), four test tiers (`tests/`), a codegen script, a watch mode, CI and evidence records. S1 gave it Layers 0 and 1 of the platform. S2 gave it Layer 2, thin, and a second composition. The root `README.md` says how to run each tier for each composition.

What S2 built, in one night on 2026-10-02, about 12,500 lines on `slice/s2`:

- Two compositions. A composition is a name, a project directory and a functions directory, because the Convex CLI reads `convex.json` and `package.json` from its working directory. The fixture composition is the repository root with `fixture/convex/`. The production composition is `example/` with `example/convex/`, its contexts as the components `orders` and `inventory`, its deciders in `example/domain/`, and `example/package.json` as a symbolic link to the root file. Codegen, the watch mode and the harness take a composition; typecheck, lint and format cover both by directory. An ESLint rule keeps fixture, harness and test code out of `example/`.
- `src/context/queries.ts`: `defineGet`, `defineList`, `boundedPage`. A context list pages with `paginator` of `convex-helpers`, because the built-in `paginate` throws inside a component. `runOperation` bounds its whole return.
- `src/read-model`: `ReadModel`, `Projection`, the generations table, the first activation, `generationsToWrite`, `activeGeneration`, `applyProjection`, the view a caller sees.
- `src/command`: `writes` and `readModels` on the declaration, the ID length bound of step 1, step 9, `authorizeQuery`.
- `example/`: the order and stock item deciders, `PlaceOrder` over Orders and then Inventory in one mutation, `ReceiveStock`, the order summary read model written in the command, the parent query over the Orders `get`, the order summary list by status, the two grant mutations, the first activation.
- The fixture composition gained a second context, `yard`, a command over `depot` and `yard` whose second context throws, and two read models, one with a binding that throws.

What passed at `e76e587`, and at which tier, with the same pins as S1 (backend release `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124, `convex-test` 0.0.60):

- Compiled, pure test and `convex-test` tiers: 40 files, 307 tests. Typecheck, lint and format pass.
- Native tier, on a clean tree, macOS on Apple silicon: 65 files, 82 tests. The record is `evidence/runs/native-20261002T013308Z-e76e587-74c842b8-1dee-4aa3-a880-29c2f92c70d5.json`. It is not yet copied to `evidence/`.
- CI did not run on the slice's own branch: it was never pushed.
- The doc's Layer 2 rows with a bound test that passes: Sc L2-1 (the second context rejects on the production composition, throws on the fixture composition), Sc L2-2 (the list, and the parent query as a sibling), Sc L2-3 at 1, 10 and 100 lines without contention and without a Measurement record, and Sc L2-9 for the scenarios routed to the production composition that exist, all on the native backend; Sc L2-4 at the compiled tier, as expected-error type tests over the production composition's generated api. Sc L2-5 to L2-8 wait for S4 and S5.
- Measured on the native backend: `PlaceOrder` of N lines read 3N + 5 documents and wrote 2N + 4, at N = 1, 10 and 100. The design expected N + 6 read. S3 finds where the other 2N reads come from.

What S1 built, in one evening on 2026-10-01, about 12,000 lines:

- `src/kernel`: the outcome and decider types, `fold`, `rebuild`, `transition`, `checkInvariants`. A lint rule keeps Convex and Node imports out of it.
- `src/context`: the code that runs inside a context component. The envelope, the `streams` and `events` tables as a schema fragment, `createJournal`, `load`, `append`, the persistence adapter (`planned`, `execute`, `runOperation`), `defineOperation`.
- `src/command`: the parent side. Actor, authorization and the grants table, the outcome boundary, receipts, the declaration types, `publicCommand`, `internalCommand` and `runPipeline`.
- `fixture/domain` and `fixture/convex/depot/`: three fixture deciders (document, stock, reference) and the fixture context component `depot` built on them. `fixture/convex/` holds the fixture commands, the two internal grant mutations and the fixture parts that inject faults.

What passed, and at which tier, with backend release `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124, `convex-test` 0.0.60:

- Compiled, pure test and `convex-test` tiers at `ee9a813`: 26 files, 202 tests. Typecheck, lint and format pass.
- Native tier at `ee9a813`, on a clean tree, macOS on Apple silicon: 42 files, 52 tests. The record is `evidence/native-20261001T222459Z-ee9a813-c1c5ae96-8564-4f9b-ad78-cf1951bd8ce9.json`.
- CI on Linux passed at every push of the slice, the native job included.
- All fourteen rows of the doc's acceptance table for Layers 0 and 1 have a bound test that passes: Sc L0-1 and L0-2 in the pure tier, Sc L1-1 to L1-12 on the native backend through eighteen example Specs. Three of those examples are new siblings for the second case of a row: `competing-unique-value` (L1-11), `capacity-refusal-then-retry` (L1-9) and `client-claims-agent-namespace` (L1-7).

Every Layer 1 scenario runs on the fixture composition. The Layer 2 scenarios run on the production composition, except the one that needs a fault.

What the code has and what it does not have yet, after S2. The Specs pin all of it and say nothing about which part is built: the owner's direction of 2026-10-01 is that a Spec carries no temporal information.

- Pipeline: both entries, steps 1 to 6 with the ID length bound, the mint of the `OperationRef` at step 7, step 8, step 9 with the `writes` check, the row budget and the row count, the receipt insert of step 10 and the return of step 11. Not yet: the gate read of step 7, the audit record, the diagnostic.
- Declaration: `writes` is required and `readModels` is optional. No `audit` or `irreversible` field yet, and `retention.afterExpiry` is `"delete"` only. There is no `commandRegistry` and no registration check: the Specs dropped them, and the compiler over the generated api is the check of Sc L2-4.
- Read models: the per-entity form only, written from the DTOs of a command's stream entries. A binding admits a `ReadModel` and nothing else. The first activation is the one generation transition. Not yet: `applyAggregate`, `applyHistoryProjection`, the backfill mode, `projectionMarkers`, `getGenerations`, start, rebuild, switch, rollback and purge. There is no check of a generation's `projectionVersion` against the declared projection's (correction C1).
- Receipts: the key, the fingerprint, lookup, classification and insert. An expired receipt is treated as absent and deleted in the same mutation. Not yet: tombstones and the sweep.
- Outcome boundary: the wire shapes, `reject`, `refuseTransient`, `normalizeThrown` with the closed code list, `classifyThrown`. Not yet: the conditional dispatcher and `carryOrReject`, which has no caller.
- Context: operations, `get` and `list` with `includeDeleted` for a trusted caller. Not yet: `history`, `rebuild`, `byOperation` and `maintenance.writeBaseline`.
- Queries: a parent query authorizes through `authorizeQuery`, and its refusal is the rejection wire shape with the query's name in `commandType`. A client pages a list by a cursor pair, and no client hook crosses the component boundary.
- Journal and adapter: the single mapping only. Not yet: baselines and migrations (step 3a, `migrateToSchemaVersion`, `defineMaintenance`, the driver), `rebuildStream`, the derived mapping and `streamParts`. A stream row behind the registration's `stateSchemaVersion` is a plain error for now.
- Authority: `establishActor`, `authorize`, the grants table and helpers that insert and delete a grant. The library registers no grant function; each composition registers its own two internal grant mutations.
- The example domain: `CancelOrder`, `release`, `OrderCancelled` and `AllocationReleased` are in the Specs and not in the code. `getOrderWithStock` and the parent queries over Inventory are not built, because no Spec pins their shapes; `inventory.read` is seeded and nothing asks for it yet. `installedLayers` of the production composition is `[]`, because the Spec is silent.

What changed in the Specs during S1, and why:

- The Specs of the three families now say what compiles and what was ruled: signatures widened where the pinned form did not compile, sizes measured with `getConvexSize`, `append` returning its envelopes and writing events only, the code list closed against the declaration's `rejections`, the public entry authenticating before the bound and refinement checks, the unique-value loser answered `entityExists` before `decide`.
- Sentences that stated "a component has no `ctx.auth`" or "cannot read the environment" as Convex facts now state the design's rule: no component function reads either, and a check enforces it. Scout C saw `ctx.auth` readable in a component mutation too, and a component reading a variable it declares.
- The eighteen Layer 1 examples name the fixture composition and bind the depot's own commands.
- Of the twenty findings S1 took, four are `fixed`, nine are `partially-fixed` with the slice that builds the rest, six moved to S2 or S5 because S1 did not build their subject, and one is with the owner.

Review of S1. One review read the whole build at `935711e`: astra at xhigh on behavior, sol at medium on every changed line in two halves. None found a defect in the library on a path a healthy run or an ordinary failure takes. They found five such defects in the fixture composition, one wrong count in an error message, two library behaviors worth fixing, and about twenty mutations that no test caught. One fold-in closed the defects and added a test for each surviving mutation under `src/`. One read of the fold-in followed. It found one more defect on a healthy path, in a path the fold-in itself had added: the bound on a rejection's details held for the parent's rejections and not for a context's. That was fixed, and the slice stopped on tactical decision 19. The rulings and the reports are in the S1 folder the project notes name.

What changed in the Specs during S2, and why:

- Two Fable design reviewers, one for what is stored and written and one for what is read and returned, proposed the Spec text; three Opus writers put it in. A second thread reviewed that commit, `122ee0a`, at the owner's request, and its findings became corrections C1 to C11 of the rulings.
- The queries take one `tenantId` argument and no `scope`. A context registers `get` and `list` one definer each. Lists return through `paginationResultValidator`, and the page bounds were halved so that a full first page does not split.
- The command registry and the registration check are gone from the Specs.
- A read model is `ReadModel { name, table, rowBudgetBytes, projection }`, and the read-model write limit counts rows.
- The order summary has no `allocated` flag, an order line carries `unitPrice` in whole minor units, and stock is created by the Inventory operation `receive` behind `ReceiveStock`.
- Eleven example Specs were added: the four new Probe 5 examples, five on generations and parent queries, the second case of Sc L2-4 and the second case of Sc L2-2.
- Dates and slice names left the Specs the writers touched. What they said: Probes 1, 3, 4 and 5 ran on 2026-10-01, and the owner ruled OQ4 the same day (the experiment lives in this repository).
- Of the eighteen findings S2 took, nine are `fixed` and nine are `partially-fixed` with the slice that builds the rest.

Review of S2. One review read the whole build at `fd8ad02`, in three lanes that shared nothing: astra at xhigh on behavior, sol at medium on the library, the fixture composition and the harness, sol at medium on the production composition, its tests and the later Spec lines. None found a defect on a path a healthy run or an ordinary failure takes. Astra ran sixteen mutations under `src/`: two survived, and each now has a test. One Spec sentence was wrong against the native backend (two concurrent `PlaceOrder` commands both apply when stock covers both) and was corrected. Two fold-ins followed, `9b20134` with `f3d4a77` for the orchestrator's rulings on the build and `705fb32` for the review. One read of the fold-ins followed, sol at medium at `705fb32`. It found one defect on a healthy path, in a path the first fold-in had added and in the fixture composition: the depot relay that reads one document authorized without the document as its subject, so a reader granted that one document was refused. It also found two tests that would not catch a removal and one stale Spec sentence. All four were fixed in `e76e587`, each new test shown to fail under its removal, and the slice stopped on tactical decision 19 with no further read. The rulings and the reports are in the S2 folder the project notes name.

Thirty-three findings are `fixed` and carry `unreviewed: true`, fourteen from S0, four from S1, nine from S2 and six from the platform review unit: no lens has confirmed them in the Spec text.

Review round 3 stands as it was for the rest of the corpus: no lens approved. The design is finished by building it, one slice at a time.

| Slice | Builds | Open findings | Blocker, major, minor |
|---|---|---|---|
| S3 | Measurement: 1, 10 and 100 lines, without and with contention. Repeated after S4 and S5 | 1 | 0, 0, 1 |
| S4 | Generations and rebuild, the history view and the write pause, with the tenant list, operator entry points and gate audit the rebuild uses; Probe 6 | 30 | 0, 15, 15 |
| S5 | Baseline migration, restore, the rest of operators and audit, diagnostics, the receipts sweep, maintenance jobs; the transactional part of Probe 7 | 18 | 0, 8, 10 |
| L3 | Layers 3 to 6, written from what the experiment shows | 31 | 0, 12, 19 |
| P | Polish with no effect on what is built: citations, markers, stale sentences, README | 20 | 0, 0, 20 |

Eighteen more findings are `partially-fixed`, each waiting for its slice. Remove an unsupported generic promise before designing a helper no view needs.

## Next unit

First, look at CI on `main` after the push of 2026-10-02: it is the first run on everything S2 and the platform review unit built, the Linux native job and the acceptance step included. The commits that copy the native run records of `e76e587` and `645130f` into `evidence/` are still not made.

Then `slice` S3 or S4, the owner's choice. S3 measures, and it needs `OD-046` of the register first: the maximum order size and the latency and throughput targets. S4 can open without an owner decision, and its paper decisions are listed below.

How S2 was run, for the next slice. Tactical decisions 25 to 27 hold the rules. Two Fable designers with disjoint subjects took about twenty minutes. One workflow run of thirteen Opus agents then wrote the Specs, built four packages in sequence, bound the scenarios in four worktrees and integrated, in about an hour and a half. The main thread stopped and resumed that run once, at a seam between two packages, to add corrections: finished agents came back from the cache. The scripts, the rulings and the reports are in the S2 folder the project notes name.

What S2 leaves for the next opening:

- The measured read count of `PlaceOrder`, 3N + 5 against the expected N + 6, is S3's first question.
- Sc L2-9's native observation, that the deployed function list equals a pinned list, needs one harness member: admin access cannot read `_system/cli/modules:apiSpec` through the harness, and an admin socket client can. Only the import lint is in place.
- A binding admits only the per-entity read model. The build that takes Sc L2-6 says how a history and an aggregate read model are bound and first activated.
- The first activation claims nothing about source events that already exist, and nothing stops it on a deployment with history.

Decisions each later slice needs on paper before its code:

- S4: how two projection versions are written at once, since a read model holds one projection and S2 built no version check (`projection-contract.sdp.md`, the open question C1 left); order-independent cross-stream folds and whether deletion keeps fold memory (`r3-architecture-history-fold-order-and-deletion`); who owns the tenant list (`r3-architecture-tenant-list-undefined`); operator authority and entry points (`r3-completeness-operator-entry-points-undefined`); refusal or a paused catch-up for history rollback (`r3-architecture-history-generation-rollback-unpaused`).
- S5: history-reading migrations off the command path unless the owner changes D3 (`r3-fidelity-migrate-on-load-replays-history-against-d3`); whether paused migrations are supported (`r3-fidelity-baseline-sweep-and-the-pause-contradict`); reopening authority, failure scope and drill cadence as explicit extensions (`r3-fidelity-restore-policies-cited-to-the-doc`); which diagnostic outcomes are emitted and where a duration comes from.

What the platform review of 2026-10-02 asks of the later units. The ledger owns each finding's counterexample and what its build must show. This is the order and the guidance that fits no single finding.

- S3 attributes the extra reads before changing the command path. Compare stream loading, journal consistency, state replacement, grants, receipts and read-model maintenance under controlled changes. Run a new accepted command, an authorized duplicate, changed-input conflict, business rejection, a second-context failure and native OCC retries; contend on shared stock and also use unrelated stock and tenants. Report attempts and final outcomes separately, documents and bytes read and written, and retained durable rows, with the backend pin and local or hosted environment stated.
- The platform review of 2026-10-02 measured single local uncontended runs at 1, 10 and 100 lines: respectively 8/6, 35/24 and 305/204 documents read/written; 2,943/4,271, 14,454/18,410 and 129,564/159,800 bytes read/written; 51.6, 39.1 and 184.4 ms execution. These are not percentiles or a throughput curve, and the faster 10-line sample forbids fitting latency from three observations. The pins were Convex 1.46.0, convex-helpers 0.1.124, convex-test 0.0.60 and native backend precompiled-2026-09-28-5c7cb5b on Node 24.21.0, macOS on Apple silicon. The 100-line case is a supported test configuration, not the owner's maximum-order ruling.
- S3 removes journal-tail work only after proving the writer invariant and weighing the defect it prevents against measured cost. The one-second query/mutation limit describes user-code execution, not database time. Weigh component overhead for the actual use case under OQ1, and state the local backend's write cap when reporting throughput; hosted quota remains separate from the local measurements. Diagnostic work counters are owned by `pr1-completeness-diagnostic-cost-counters-have-no-source`.
- S4 builds the per-subject online path first: enumerate sources and tenants, keep progress away from rows every command reads, choose the projection by generation version, interrupt and resume, verify presence and absence, switch, then roll back after intervening writes. Probe 6 and the complete lifecycle are the exit, not successful backfill alone. Aggregate and history forms wait for a real view that needs them; narrow an unsupported generic promise instead of installing a general runner before the chosen path needs it. The ledger owns the exact counterexamples and proofs for these subjects, including migrations binding, operator authority and gate audit.
- S5 builds `CancelOrder` and `release`, baselines and migration, then restores snapshots made during migration and interrupts the restore itself. Its exit separates mandatory audit failure from best-effort diagnostic failure, proves completion rather than merely counting batches, and reassesses all Layer 0 to 2 acceptance rows after the new paths are bound. The APPL-09, APPL-10 and APPL-12 ledger items own their specific acceptance cases.
- L3 starts only at its trigger, with Probe 7's do-nothing body and a thin local reaction before an external effect. Before the external profile is claimed, run the whole failure matrix carried by the durable ledger items: retries, cancellations, repair, key expiry, restore, retention and bounded fan-out. Keep agents on the command boundary, distinguish budget money from concurrency slots, preserve atomic local multi-context work and admit asynchronous reads only for a stated need. Workflow, agents and advanced reads remain deferred to their own consumer; their acceptance gaps and owner policies are ledger work, not permission to implement every later layer now.
- Preserve the present transaction and authority arrangement while repairing its boundaries. Do not replace it with a command bus, saga, generic dispatcher, central journal, application-wide counter or mandatory worker process. Public component functions provide parent reachability and are not thereby public client endpoints; filtering already bounded grant results in memory is not an unindexed database query. High-volume grant revocation remains Leads 20's separate repair.
- Keep the example's deliberate policies distinct from missing capability. Caller-supplied unit prices are its stated policy; totals-only stock is not already per-order allocation tracking, and the future release operation does not make that current model defective. Preserve the order of authorization, receipt recognition and admission, ordinary OCC, creation's `entityExists`, and the positive control that a stale reviewed version refuses before `decide`.
- Preserve negative controls for authority, atomic rollback, deduplication, generation switching and recovery. When repairing a reproduced defect, turn its defective-behavior assertion into a regression expectation and show the relevant removal fails; do not require mutations for every helper or prose change. The CORE and APPL-11 ledger detectors own the concrete cases.
- An implementation anchor binds a contract to source, and an example anchor binds a verifier; neither claims a whole planned workflow or a passed run. `Journal.history` remains a configuration surface rather than runtime enforcement of rebuild, and the baseline-rebuild example is not an executable proof until it has a verifier. Keep acceptance coverage explicit by scenario, composition, tier, verifier and saved result under APPL-11; do not raise readiness merely to show progress. Installed-layer observation and native concurrency parity still need the owner queue's evidence.
- Check each ledger fix against the current Spec when its subject is built. Confirm fixed-but-unreviewed records when their subjects are touched, rather than opening another whole-corpus cycle; split mixed work by the unit that builds it and explain any deferred remainder. `check.py` proves corpus agreement, not that a proposed algorithm or test works. Close the next unit on concrete changes and their evidence, not blanket approval of the corpus.
- Keep a public Spec sufficient to build its ruled contract even when dated historical evidence stays private. Dates, versions and run results belong beside evidence, and work status belongs here or in the ledger; the governing doc and readiness remain the owner's rulings. A clean local run is not hosted or CI evidence. The apparent compiler discrepancy was checked: `tsc` came from `@typescript/native` 7.0.2 and the TypeScript package was a parser library, so replacing the compiler is not a repair. Vitest's SIGINT/SIGTERM handles alone did not establish a sustained handle leak.

## Tactical decisions taken on 2026-10-01

The owner accepted the first nine on the session's recommendation. The session took 10 to 19 during S0, 20 to 23 during S1, 25 to 27 during S2 and 28 to 31 during the platform review unit, on 2026-10-02. Decisions 32 and 33 are the owner's words of the same day. Any of them can be reopened.

1. Slices replace the eight fix units of the previous plan.
2. A slice is built on Specs at `defined` with no open blocker inside the slice. The owner states `ready` after the slice passes.
3. Layer 3 and later wait for the experiment. Their 22 findings are not fixed on paper first.
4. ESM only, Node 24, one supported compiler. Dual builds, compatibility matrices and publishing wait for a first release.
5. npm, with one `package.json` at the repository root, as the Convex component template has it.
6. The main thread settles a GPT finding before it enters the ledger. An `unreviewed` flag still waits for its lens.
7. A lens verdict for `sdp`, `convex` and buildability may rest on a GPT read once that reviewer has caught a planted defect in a Spec.
8. Sessions delegate. Since the owner's ruling during S0, Claude models write and GPT models review: `SESSIONS.md` has the role table.
9. Two Protocol idioms. An extension becomes a decision Spec when the owner takes it up, and until then the E-register stays. A probe is an example that verifies its fact, which S0 did for probes 1 to 5.
10. The fixture's component is mounted as `annex`. A fixture context gets its own name when a slice adds it.
11. `moduleSuffixes: [".d", ""]` and `erasableSyntaxOnly` hold for the whole repository, so that Node 24 can run the harness's TypeScript by stripping its types, and so that the compiler reads the declarations of `convex-helpers` and not the source it ships.
12. Evidence records are kept by hand: every native run writes one under `evidence/runs/`, which git ignores, and the record of a run a Spec or a commit cites is copied to `evidence/` in a commit of its own.
13. A design pass designs the key abstractions as proposed Spec entries, with a time bound, and anything it built is handed on as a patch.
14. A GPT job is started with the launcher beside the orchestration guide, on a frozen copy, and its session id is kept. Builders work in one worktree each.
15. `npm run dev` is the watch mode: one disposable backend with `convex dev` bound to it.
16. The day-one order "component codegen before the build" is met by two things together: the generated files are committed, so the `checks` job compiles what the repository holds, and the `native` job runs codegen and fails when the committed files differ.
17. Code built from a Spec carries a `codeAnchor` that `satisfies` it. The harness has one, so the Protocol's drift alarm (recipe 2) lists what is built and does not state `ready`.
18. No pull request per unit. A unit has its branch, CI runs on every push, and the session fast-forwards `main` at the close or at a green seam.
19. A slice stops reviewing its fixes when a review finds no defect on a path a healthy run or an ordinary failure takes. What is left, a hole in the handling of a failed failure path or a test that would not catch a removal, is tracked under Leads and goes to the next slice.
20. A slice is built by one Workflow run of Opus agents from one page of rulings. Agents commit their own package on the unit's branch as unreviewed work. The main thread pushes, rules and merges, and keeps its own context small. Taken during S1 after the owner said that new design and code were a tenth of a thread's work and agreed to a workflow.
21. An agent applies Spec and ledger edits from the main thread's exact rulings, and scenario agents rebind their own example Specs. The main thread approves the lines through the slice's one review.
22. The library lives in `src/kernel`, `src/context` and `src/command`. The fixture context is the component `depot`. A component's code may import shared code outside the functions directory: scout C showed it on the pinned backend.
23. `STATE.md` is the whole required reading at an opening. The guide, the notes, the Specs and earlier reports are opened where a job or a ruling needs them.
24. The owner's direction of 2026-10-01: temporal information, such as a slice's name or what is built so far, is not part of the domain language or of a Spec. It lives here, in the ledger's notes and in the code anchors. `CONTEXT.md` sorts words into domain, design and work words, and the last kind stays out of Specs and code names.
25. One Fable agent decides each thing. The owner's words on 2026-10-02: "one big brain should decide on one thing. if you have two deciding on the same thing, get redy for multi-turn discussion". Fable agents in one run get disjoint subjects, split by subject and not only by file; a need from another's subject is a one-line request to the main thread; no later Fable agent judges again what an earlier one decided. The GPT review lanes are split the same way.
26. A slice's run is mostly producers. The owner's words: "it should be much more updates vs advisory. you can also implement s slie, like the last session did". Two Fable designers, then Opus writers on disjoint Spec directories with a closer that commits, then the builders, the scenario groups and the integrator in the same run. No planner agent and no advisor agent: the main thread cuts the packages and rules on the designers' short lists.
27. A second thread may review a commit while the run goes on. Its findings are advice, the main thread rules on them, and they enter the run at a seam between two packages, by stopping the run and resuming it from an edited script.
28. The two model families are one team. The owner's words on 2026-10-02: GPT agents are "essential and complementary part of the team", not supplemental workers, "with building project-specific knowledge on how to best leverage them". Claude designs, rules and reads for taste. Astra owns the proof, the measurements and the behavior review. Sol builds from exact Spec text, keeps the ledger and the registers, and reads every line and number. `SESSIONS.md` has the table.
29. Proof and fix are written apart. Once a designer's Spec text is ruled, astra writes the tests and a builder writes the code, each from the Spec text alone and in its own worktree, and an integrator merges them and says of each failing test whether the Spec, the test or the fix is wrong.
30. What one family writes or finds, the other reads or checks. A finding on unbuilt design is checked against the Spec text by a model of the other family before it enters the ledger. In a review, sol reads the lines Claude wrote and an Opus agent reads the lines GPT wrote.
31. A review copy carries planted defects, and the project notes record who caught which. Each reviewer that mutates code gets a copy of its own. A plant goes inside the unit's own commits, not on top of them.
32. From the merge of 2026-10-02 on, a unit reaches `main` through a pull request, and decision 18 ends. The owner's words: "This is the last change we will do without formal PRs since things are starting to shape up."
33. Every open decision is a row of the decision register, `design/decisions/register.json`, sorted into one of three classes, and four advisors work on it. The owner's words on 2026-10-02: "I will need help with all owner decisions. We should have a way of trakcing/filtering them. Tactical things and thing where capable agent can make better decision vs. myself, should be made by agent." `design/advisors/` has the sorting rule, the protocol and the lenses, and `SESSIONS.md`, "Who decides", has the rule in short. An advisor is a Fable agent, and a GPT model checks the facts of each lean. The panel works on the register between and beside units. Decision 26, no advisor agent, is about a slice's own run and stands.

## Owner queue

Every open decision is a row of `design/decisions/register.json`, and `python3 design/tools/decisions.py` filters it: `--owner` lists what waits for the owner, forks first, `--owner --before S4` what the owner must decide before S4, `--decided --by advisor --since <date>` what agents decided. The items that used to stand here are rows, each with its source and line; the register at the close:

```
total: 150
status: unsorted=0, sorted=106, waiting=27, decided=2, folded=15
class: tactical=3, delegated=85, owner=47, null=15
advisor: convex=34, domain=43, operator=34, product=39
```

Of the 47 `owner` rows, these block S3, S4 or S5, in the order the units need them. No fork is written yet: an advisor writes one when the owner takes a row up.

- `OD-046`, S3, the product advisor: The maximum order size and the latency and throughput targets, before S3 benchmarks.
- `OD-064`, S3, the convex advisor: OQ3: the largest order `PlaceOrder` supports is a product decision; the experiment measures with a provisional maximum o
- `OD-123`, S3, the domain advisor: OQ3: one document per stream as the default, and the largest order the placement command supports, are product decisions
- `OD-025`, S4, the operator advisor: Who creates a tenant's first grant.
- `OD-068`, S4, the domain advisor: Extension E-8: the doc names a generation registry, a marker and a gate without their shapes, and says to keep the old g
- `OD-069`, S4, the domain advisor: Extension E-8, reach of a generation: the doc says nothing about tenants and rebuild; the option taken here is one gener
- `OD-041`, S5, the domain advisor: D3 and a history-reading migration (`r3-fidelity-migrate-on-load-replays-history-against-d3`).
- `OD-042`, S5, the operator advisor: Restore policy: whether a failed check keeps every writer out with no override, and how often the drill runs (`r3-fideli
- `OD-114`, S5, the operator advisor: Probe 7 pending, the do-nothing check at activation: a plain scheduled mutation plus a scan of `_scheduled_functions` fo

The 85 `delegated` rows carry 32 leans in full, whose facts a `gpt-6.1-sol` check read; `checkedBy` on a row says it held. A checked lean is applied to the Specs as a ruling by a later unit, one Spec family at a time, and the row becomes `decided`. The rest carry a one-line lean or wait for a probe, a measurement or a build (`--waiting`).

## Leads

A session confirms or drops each. None is a finding yet.

1. A blind astra read of fix unit 1's Specs on 2026-10-01 returned 35 findings. About 20 match the ledger. These match nothing in it. The four marked checked were confirmed against the Spec text:
   - An existing stream cannot regain a row in the active generation once its projection went to null.
   - A null aggregate contribution with no marker creates a phantom entity.
   - Aggregate verification and the restore check call a contract aggregates do not implement.
   - The standalone baseline writer changes projection sources without maintaining their read models.
   - Two checkpoint owners for migrations-driven batches.
   - Purging a deployment-wide generation has no tenant iteration and no continuation.
   - `startGeneration` accepts a batch size of zero. Checked.
   - The gate exemption admits an ordinary writer when both generation fields are absent. Checked.
   - Overlapping paused rebuilds have no ownership rule for a shared source scope.
   - `rollbackGeneration` has no rule for which retired generation it picks. Checked.
   - The one-write switch spans two rows. Checked.
   - History queries return stored documents against an envelope-only validator.
   - Two acceptance examples require version equalities their contracts cannot produce.
   - History batch byte estimates leave out baseline events.
   - A fence does not limit how many batches are scheduled.
2. Five `fix` fields in the ledger are wrong as written: a timestamp-only rebuild cursor skips ties; `floor(4 MiB / 64 KiB)` is 64 and payload size is not row cost; transaction metrics are `{ used, remaining }` behind an async call; Workpool 0.4.7 does not hand `onComplete` the final attempt count; a Node handler needs its own `"use node"` action file.
3. Two Convex facts no Spec covers. Nested calls draw on a system-operation time budget that byte and document bounds do not see: 605 calls used 14.8 s of a transaction that failed at 15.1 s on the earlier platform's native backend, in test mode, on 2026-09-26. And `convex-helpers` checks `maximumBytesRead` after it has read the row.
4. The local backend refuses writes past 4 MiB a second. That bounds what slice S3 can measure on it, and a throughput number from it states the limit.
5. Convex ships `getConvexSize` and `getDocumentSize`. They answer the two byte-bound findings of S1. And `ctx.meta.getTransactionMetrics()` counts documents read and written across nested and component calls, in queries and mutations: S0 used it in two probes, and it is a cheap way for S1 to measure what a command reads.
6. Fifteen places where the design or a proposed fix repeats a shape the earlier platform regretted, each with the Spec line: progress kept on a row every command reads, work repeated per entry or per boundary, a stored maximum version taken as proof of coverage, a closed state with no route out, bookkeeping on the healthy path with no bounded lifetime, nested command calls where a helper would do, a recovery scan blocked by healthy work, registries with no reader.
7. Nine type names used in pinned signatures and declared by no Spec: `Journal`, `GetArgs`, `ListArgs`, `HistoryArgs`, `WriteBaselineArgs`, `WriteBaselineResult`, `DiagnosticSink`, `AuditRecordInput`, `BatchCursor`. Recipe 23 finds where each is used.
8. `dispatchId` on the obligation row is `v.id("_scheduled_functions")`. Nothing shows whether such an ID validates after a restore into another deployment. It belongs in Probe 7.
9. The mention audit (recipe 22) gives 78 unbacked pairs, 50 of them declared from neither side. Each slice checks the ones in its families.
10. Using the Protocol more, from a side thread's read on 2026-10-01. A local query for the build backlog at `defined` (recipe 1 reads stated `ready`, which no Spec here has before its slice passes; the same question at `defined` with a clear floor gave 80 Specs). A Pack per slice, so that "which Specs does S1 build" is a graph read. `check.py` counting open questions through recipe 20 in place of its own expression. The carrier grammar restated in `PLAN.md` 6.2, which can drift from the authoring skill's table.
11. Small things in the harness that no finding carries. The sweep signals by process id after reading the process table, and the Spec says the interval is not closed. A `convex dev` child killed with SIGKILL leaves a temporary directory behind, which a `TMPDIR` inside the watch mode's own home would remove. The scripts' hand-over of the interrupt to executable resolution is tested by reading their source. The admin read's page size of 10 in the shared-limits helper is not needed for the read to succeed. Inside a Codex sandbox `ps` cannot inspect other processes, so the sweep tests fail there and pass outside it.
12. Left by the last review of S0 on purpose. Redaction of a failed child's output scans a character at a time: 901 ms and about 725 MiB at peak for a 16 MiB output, where the version before the overlapping-secret fix took 3 ms. No pure test covers the accepting path of the download's hash check; it needs a real archive as a fixture, and the path runs for real whenever the cache is cold. Four mutations survive with no test: the interrupt not passed to `unzip`, the SQLite-path match dropped from the ownership check, SIGTERM mapped to SIGINT in `scripts/dev.mjs`, and a global teardown that does nothing. The test that both scripts hand their interrupt to executable resolution parses their source, and a shadowed variable or a later spread that overrides the step passes it. A failed amendment of a run record leaves a `.next` file beside the whole record.

13. From the review of S0's fifth fold-in, ruled at the opening of S1 with nothing folded in. Each needs a failed cleanup, a setup the repository does not have, or is a test gap. In a Vitest watch session the global setup runs once, so a failed final sweep marks the last rerun's record failed and not the record of the rerun that left a backend behind; a record that is cited therefore comes from one `vitest run`. A second Vitest project that adopts the native global setup would take the first project's record slot, so the slot becomes one per project before a slice adds such a project. A reporter that throws before it writes its record lets the next sweep amend an earlier run's record. Three more mutations survive: production setup's `openRunRecord()` replaced by an empty object, the reporter's default directory changed, and the `ESRCH` guard removed from the second inspection's existence probe. A finished setup keeps its exit listener until the process ends, and eleven setups in one process draw Node's listener warning.

14. Left by the review of S1 on purpose. Tests of fixture code that would not catch a removal: the evaluate-twice test compares its two outputs only after the second evaluation, states that `evolve` produces are never frozen, the reference stream has no purity or rebuild example, and the submitted event's schema stamp is pinned by no test. `tests/native/depot-operation-commits.test.ts` sends its calls with admin access, and the pure guard that forbids it looks only for the token `adminKey`. The rule for repeated document items in one call (identical items merge, items that differ are `invalidInput`) is the fixture's and no Spec states a general one.
15. The native tests of S1 read function-log fields no Convex page promises: `willRetry` and `occInfo`, the absence of a record for a component sub-call, `usageStats.databaseReadDocuments`. They are `observed` entries of the native harness Spec and are read again when the backend pin moves. The two race tests rerun on a fresh key until the log shows an engine retry, up to twenty rounds.
16. About ten older Spec sentences still name a slice or a date, such as "slice S2 decides" in `spec:context.queries` and "ran on 2026-10-01" in open questions. The owner's direction is against them; a unit that touches those Specs moves them out, and a sweep waits for the owner's word.
17. The kernel's code anchor lives in `tests/pure/kernel.test.ts`, because the kernel may not import the Protocol package, so the graph cannot say what a change under `src/kernel` reaches. `npx sdp build` writes `*.test.generated.ts` files beside a suite that binds an example whose parent has an example space; they are ignored by git, Prettier and ESLint. Both are in `docs/sdp-feedback.md`.
18. `append` refuses a stream row whose version has no event in the journal. A later audit-only context that imports rows with incomplete history would trip it.
19. The root `README.md` says `npm run dev` rewrites all three `_generated` directories; nobody ran it to see. `scripts/dev.mjs` names only `annex/_generated` in a comment.

20. Left by the read of S1's fold-in. Revocation reads every grant of a principal, so a principal with more than 500 grants whose fields are very large passes the transaction's read limit and cannot be revoked: a bounded, resumable revocation and a bound on a grant's field sizes would close it. Seven tests would not catch a removal: tenant routing in the revocation tests, the service-issuer test that never calls a public entry, the stock-overflow code in a declaration's list, grouping inside `placeOrders`, acceptance at exactly 8 MiB of measured writes, both receipt arrays filled at once, and the `invalidInput` path from a context through the closed code list.

21. Left by the review of S2 on purpose. `scripts/codegen.mjs` loses its first error when disposal also fails. Tests that would not catch a removal: one case in `tests/simulator/example.test.ts`; the Probe 5 test of a full first page passes even if the row cap never reaches `paginator`; nothing checks that the order DTO's `placedAt` equals the summary row's; a mutation that drops the composition in `scripts/codegen.mjs` is caught only by CI's codegen diff, and `scripts/dev.mjs` has no test. The production isolation rule checks relative imports and not bare specifiers. A total above the largest safe integer has no rejection code, and stream IDs inside a receipt's `affected` and `versions` have no length bound. The "no job" assertions of Sc L2-2 and L2-3 close a function-log window with an ordinary read, so a job scheduled with a delay past the window is not seen: the harness cannot read `_scheduled_functions`. A failed top-level mutation's completion record shows no written documents, so the function log cannot show rolled-back writes, and the first context's writes in Sc L2-1 are shown at the pure tier and by the retry.
22. Temporal sentences still in Specs no S2 writer touched, beyond lead 16: `facts/probe-plan.sdp.md:38-40,74`, `decisions/d06` and `d08`, `facts/f11`, the first-run bullets of the Probe 1 to 5 examples, and "today's" in `platform/transactional-domain-platform.sdp.md`, `vocabulary.sdp.md`, `existing-systems.sdp.md` and `layers-and-profiles.sdp.md`.

23. Left by the platform review unit on purpose. Each is a hole in the handling of malformed input, a test gap, or a Spec line about what is not built.
    - The acceptance check: a run record whose backend entry is `{}` or names an unknown composition can still pass; three checks of a record's entries have no test of their own; an error that cannot be turned into text escapes the catch; `scripts/acceptance.mjs` imports the harness outside any `try`, so an import failure exits 1; an opening line with a full stop inside it is refused; deleting a test together with its anchor turns a passed scenario into a missing one and CI stays green.
    - The boundary: data with an own `code` and an inherited `kind` becomes a plain error. No Spec says which producer may send which cause variant, and nothing built checks it. "Validates as Convex validates a value" claims more than `validate` of `convex-helpers` with a plain-object check does.
    - Not built, and the Specs pin them: the tombstone member of `ReceiptClass` and the tombstone flow; the baseline payload allowance (`append` holds a `baseline` event to 16,384 bytes like any other); `maxFoldEvents`; the receipts sweep; the largest-payload and fold-time measurements of the first experiment.
    - Restore's check batch: a batch that folds several streams reads one stored baseline for each, and at four streams of 512 KiB that is above the 16 MiB ceiling. The Spec states the total for one stream and carries the open question; `r3-convex-restore-check-omits-baseline-reads` owns the batch shape.
    - Spec marks: numeric bullets that cite an E-number without the `[extension]` mark remain in the Specs the unit touched (`journal:94` and `:117`, `idempotency:101`, `queries:89-92`, `rebuild:124`, `restore:109-110`, `tenancy:78`, `persistence-adapter:106-107`), and four newly marked bullets have no matching open question in their own Spec. `check.py` tests neither.
    - Tests of S2 that sol's read showed would not catch a removal: the first-experiment order tests never offer an oversized row, the ten-line test counts writes and not their contents, the production-configuration lint assertion passes if the rule is removed from the configuration, and `codePathHolds` does not require one completion per call. In `tests/pure/evidence.test.ts` the test named for simultaneous writes writes one after the other.
    - A native run over history of the maximum event size waits for the unit that builds rebuild. One attempt hit the fixture stream's own state budget first.
24. A Claude agent in this harness may not write a file it calls a report. It may write a design file, a patch and a spike. The main thread saves a hand-back by extracting it from the agent's transcript with a script.
25. From the platform review, not findings:
    - Pagination across a generation switch. Keep two subscribed pages pinned with both cursor endpoints, switch the active generation between reads, and run the native case for both ordinary and split pages. Rule and prove either continuity with no missing or duplicate subject or an explicit reset that makes the caller restart the page sequence; a cursor must not silently change its generation meaning.
    - Sharpen Leads 1's overlapping paused rebuilds. Two paused rebuilds share one source scope, and the first resumes or aborts while the second still needs the pause. The native case must show either refusal of the second owner before it changes anything or independent ownership whose release cannot reopen the other rebuild's writers; a bare scope-wide Boolean is not proof of ownership.
    - Scheduled argument size. The current scheduling documentation says 8 MB for aggregate arguments while the limits page says 16 MiB. When the scheduling probe activates, resolve the discrepancy against the pinned backend with boundary cases and record which limit and accounting unit it actually enforces; do not turn either page into a confirmed defect now.

The reports behind leads 1 to 3 and 6 are outside the repository, because they quote a private repository. The project notes file named in `AGENTS.md` lists them, with the reports, briefs and rulings of S0.

## Inputs

The doc is `docs/convex-transactional-domain-platform-decisions.md`, unchanged since `abfa444`.

`docs/modern-ts.md` is the owner's research on building and shipping the TypeScript library. Where it differs from the doc, the doc wins. Its sources were rechecked on 2026-10-01.

- Day one: ESM, a strict `tsconfig` with `NodeNext`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; a `tsc` build as the Convex component template has it, with component codegen before the build and one dependency graph for the library and the example; the kernel free of any Convex runtime import and of Node built-ins; static declarations with no registry, decorators or reflection; Vitest for domain, replay and type tests; `convex-test`; a disposable native backend run by a script; a fixture composition apart from the production path; the measurement list, which matches the first experiment's; typed deployment environment variables for the maintenance switches.
- First release: dual ESM and CJS, `publint` and the type-resolution check, packed-consumer fixtures, the Node and TypeScript matrix, changesets, trusted publishing, the compatibility policy for error codes, handler versions and event schema versions.
- Not taken: its repository blueprint, which puts journal, receipts and obligations in one component against D2; the Node 18 floor and the TypeScript 5 promise, which came from its prompt; its sample types and error codes, which differ from what the corpus pins; test functions shipped behind a runtime guard; its sample CI, which builds before component codegen.

`docs/sdp-development-from-application-platform.md` is the first report to the Protocol's maintainers. `docs/sdp-feedback.md` is the running file that follows it; the `adopt` unit and each slice add to it.

## Leftovers

- The tarball under `vendor/` goes when the Protocol installs with its CLI from a commit hash or a registry.
- `.claude/agents/fable-xhigh.md` is the agent definition the round-3 reviewers ran as.
- `.claude/agents/advisor-convex.md`, `advisor-domain.md`, `advisor-operator.md` and `advisor-product.md` are the definitions of the four advisors. Each holds three paths and nothing else.
- `design/generated/` is ignored and regenerated by `npx sdp view design`.
