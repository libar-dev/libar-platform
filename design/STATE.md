# State of the design corpus

Written on 2026-10-02 at the close of slice S1. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
190 specs · 5 packs · 56 anchors → 251 nodes · 1002 edges (0 errors, 0 warnings)
validate: 0 errors · 0 warnings; readiness divergence: []
open questions: 67 Specs, 126 questions, 10 blocking; extensions registered: 50
stated readiness: {'defined': 180, 'scoped': 10}
ledger: 245 findings, {'fixed': 129, 'open': 100, 'owner': 1, 'partially-fixed': 15}
open findings by slice: {'L3': 22, 'P': 18, 'S2': 12, 'S3': 1, 'S4': 30, 'S5': 17}
corpus digest: dfd98edc5c2eee36
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-5993da7.tgz
```

The default branch is `main`, published at `github.com/libar-dev/libar-platform`. Each unit works on its own branch, named for the unit, so that `main` stays green. The owner gave the session a mandate on 2026-10-01 to merge at this early stage, and said the same day that a pull request per unit was not a good idea while the design is iterated quickly. So from slice S1 on there is no pull request: CI runs on every push, and the session fast-forwards `main` once CI is green on the last commit. Slice S0 was the one unit merged through a pull request. The mandate has no stated end: ask when a release or an outside user appears.

## Where the work stands

Slices S0 and S1 are built. S0 gave the repository a native test harness (`harness/`), a fixture Convex app (`fixture/convex/`), four test tiers (`tests/`), a codegen script, a watch mode, CI and evidence records. S1 gave it Layers 0 and 1 of the platform. The root `README.md` says how to run each tier.

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

Every Layer 1 scenario runs on the fixture composition. The production composition, Orders and Inventory, does not exist yet.

What the code has and what it does not have yet. The Specs pin all of it and say nothing about which part is built: the owner's direction of 2026-10-01 is that a Spec carries no temporal information.

- Pipeline: both entries, steps 1 to 6, the mint of the `OperationRef` at step 7, step 8, the receipt insert of step 10 and the return of step 11. Not yet: the gate read of step 7, step 9 with the `writes` check, the audit record, the diagnostic.
- Declaration: no `readModels`, `writes`, `audit` or `irreversible` field yet, and `retention.afterExpiry` is `"delete"` only. No `commandRegistry`, no registration check, no generation.
- Receipts: the key, the fingerprint, lookup, classification and insert. An expired receipt is treated as absent and deleted in the same mutation. Not yet: tombstones and the sweep.
- Outcome boundary: the wire shapes, `reject`, `refuseTransient`, `normalizeThrown` with the closed code list, `classifyThrown`. Not yet: the conditional dispatcher.
- Context: operations only. Not yet: the queries (`get`, `list`, `history`, `rebuild`, `byOperation`) and `maintenance.writeBaseline`.
- Journal and adapter: the single mapping only. Not yet: baselines and migrations (step 3a, `migrateToSchemaVersion`, `defineMaintenance`, the driver), `rebuildStream`, the derived mapping and `streamParts`. A stream row behind the registration's `stateSchemaVersion` is a plain error for now.
- Authority: `establishActor`, `authorize`, the grants table and helpers that insert and delete a grant. The library registers no grant function.

What changed in the Specs during S1, and why:

- The Specs of the three families now say what compiles and what was ruled: signatures widened where the pinned form did not compile, sizes measured with `getConvexSize`, `append` returning its envelopes and writing events only, the code list closed against the declaration's `rejections`, the public entry authenticating before the bound and refinement checks, the unique-value loser answered `entityExists` before `decide`.
- Sentences that stated "a component has no `ctx.auth`" or "cannot read the environment" as Convex facts now state the design's rule: no component function reads either, and a check enforces it. Scout C saw `ctx.auth` readable in a component mutation too, and a component reading a variable it declares.
- The eighteen Layer 1 examples name the fixture composition and bind the depot's own commands.
- Of the twenty findings S1 took, four are `fixed`, nine are `partially-fixed` with the slice that builds the rest, six moved to S2 or S5 because S1 did not build their subject, and one is with the owner.

Review of S1. One review read the whole build at `935711e`: astra at xhigh on behavior, sol at medium on every changed line in two halves. None found a defect in the library on a path a healthy run or an ordinary failure takes. They found five such defects in the fixture composition, one wrong count in an error message, two library behaviors worth fixing, and about twenty mutations that no test caught. One fold-in closed the defects and added a test for each surviving mutation under `src/`. One read of the fold-in followed. It found one more defect on a healthy path, in a path the fold-in itself had added: the bound on a rejection's details held for the parent's rejections and not for a context's. That was fixed, and the slice stopped on tactical decision 19. The rulings and the reports are in the S1 folder the project notes name.

Eighteen findings are `fixed` and carry `unreviewed: true`, fourteen from S0 and four from S1: no lens has confirmed them in the Spec text.

Review round 3 stands as it was for the rest of the corpus: no lens approved. The design is finished by building it, one slice at a time.

| Slice | Builds | Open findings | Blocker, major, minor |
|---|---|---|---|
| S2 | Layer 2, thin: `PlaceOrder` over Orders and Inventory, a legal way to create stock, the summary written in the command with its first active generation, queries and lists, the command registry question | 12 | 1, 5, 6 |
| S3 | Measurement: 1, 10 and 100 lines, without and with contention. Repeated after S4 and S5 | 1 | 0, 0, 1 |
| S4 | Generations and rebuild, the history view and the write pause, with the tenant list, operator entry points and gate audit the rebuild uses; Probe 6 | 30 | 0, 14, 16 |
| S5 | Baseline migration, restore, the rest of operators and audit, diagnostics, the receipts sweep, maintenance jobs; the transactional part of Probe 7 | 17 | 0, 7, 10 |
| L3 | Layers 3 to 6, written from what the experiment shows | 22 | 0, 5, 17 |
| P | Polish with no effect on what is built: citations, markers, stale sentences, README | 18 | 0, 0, 18 |

Fifteen more findings are `partially-fixed`, each waiting for its slice. Remove an unsupported generic promise before designing a helper no view needs.

## Next unit

`slice` S2, run as `SESSIONS.md` now describes a slice: one page of rulings, a workflow, one review, one fold-in. Unlike S1, S2 has design to do before its code (the first eight decisions below), so its workflow starts with the design stages: a Fable design review, Spec updates, an implementation plan, then the build, with a handful of Fable agents as advisors and reviewers and no more.

Decisions S2 needs in its rulings file before its code. The first three were already listed for S2; the rest moved from S1 with their subjects:

- Stock created through a domain operation (`r3-architecture-example-domain-cannot-create-stock`, the slice's one blocker).
- The transition that makes the first summary writable (`r3-completeness-first-generation-has-no-bootstrap`).
- What a list uses in place of the helper hook that loses rows after a capped split (`s0-helper-hook-loses-rows-after-a-capped-split`), and whether a full page should always come back `SplitRequired` (`r3-convex-full-page-always-split-required`). Scout C measured the helper: its report is in the S1 folder.
- Where the production composition lives. `convex.json` names one functions directory, `fixture/convex/`. Scout C's report, section 3, has what a second composition needs and what the Convex component template does.
- A parent query's actor comes from `establishActor`, and its refusal needs a wire shape (`r3-sdp-parent-query-builds-actor-by-hand`, `r3-sdp-query-refusal-shape-unpinned`). Whether a context query takes a `scope` beside `tenantId` (`r3-sdp-tenant-scope-passed-two-ways`): S1 ruled one `tenantId` argument for operations.
- Whether `commandRegistry` exists (`r3-fidelity-command-registry-standing-without-a-reader`): its one reader today is the conditional dispatcher, and the build-tier check of Sc L2-4 decides whether a registration check needs it.
- How the experiment seeds its grants (`r3-completeness-grants-have-no-writer`): S1's helpers and an internal mutation run with admin access are the provisional answer.
- Step 9, `readModels` and `writes` on the declaration, and the row budget check for read models (`r3-completeness-budgets-declared-never-measured`).

What S1 leaves for S2's opening:

- The fixture commands in `fixture/convex/orders.ts` include a fixture `PlaceOrder` over the depot. S2's `PlaceOrder` is the example application's, over two contexts.
- The pipeline's steps for Layer 2 are absent, not stubbed: adding step 9 and the gate read is S2's and S4's work in `src/command/pipeline.ts`.
- Two design questions the review raised and S1 left: bound the whole return of an operation, DTOs and `combine` result included; enforce an ID length or a measured ceiling on a receipt row.
- `npm run dev` keeps `_generated` current while agents write functions. S1's builders ran `npm run codegen` themselves and did not need it.

Decisions each later slice needs on paper before its code:

- S4: order-independent cross-stream folds and whether deletion keeps fold memory (`r3-architecture-history-fold-order-and-deletion`); who owns the tenant list (`r3-architecture-tenant-list-undefined`); operator authority and entry points (`r3-completeness-operator-entry-points-undefined`); refusal or a paused catch-up for history rollback (`r3-architecture-history-generation-rollback-unpaused`).
- S5: history-reading migrations off the command path unless the owner changes D3 (`r3-fidelity-migrate-on-load-replays-history-against-d3`); whether paused migrations are supported (`r3-fidelity-baseline-sweep-and-the-pause-contradict`); reopening authority, failure scope and drill cadence as explicit extensions (`r3-fidelity-restore-policies-cited-to-the-doc`); which diagnostic outcomes are emitted and where a duration comes from.

## Tactical decisions taken on 2026-10-01

The owner accepted the first nine on the session's recommendation. The session took 10 to 19 during S0 and 20 to 23 during S1. Any of them can be reopened.

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

## Owner queue

Platform decisions. None blocks S2's opening.

0. From S1, each a provisional reading that the code now rests on:
    - `ready` on the Specs S1 built and passed. Recipe 2 lists them as built and not `ready`.
    - Who creates a tenant's first grant. Taken: the library registers no grant function; an operator runs an internal mutation with admin access.
    - The tenant scope as the one `tenantId` argument, with no separate `scope`.
    - `ctx.auth` and the environment in a component as the design's rule and not a Convex fact (F11). D10 and D11 still carry the doc's sentence.
    - The request key stays optional on the public entry, so a caller of `ConvexHttpClient` that retries must supply one.
    - The language. `CONTEXT.md` at the repository root is its first version, written on 2026-10-02, and `AGENTS.md` points every reader at it. Six terms wait for a ruling, each with the reading the file took: operation against context operation, command against stream command, subject against entity, actor against principal, receipt and generation (which the code now names), duplicate against replay. And whether `CONTEXT.md` or `spec:platform.vocabulary` leads. Nothing in the code or the Specs is renamed yet.
    - `fixture/convex/nonUiCaller.ts`, a fixture action that stands for trusted server code and lets an ordinary client reach an internal entry. It must never leave the fixture composition.

1. `ready` on `spec:platform.native-harness`. It is built, its tests pass, and recipe 2 lists it as waiting.
2. E-13, both halves: the fixture issuer for tests, and what it means for production's `auth.config.ts`, which must then be a `customJwt` provider whose trust root the deployment's environment names.
3. E-15: the harness rules, the reading of Sc L2-9 as the scenarios routed to the production composition, and evidence records kept in the repository.
4. E-16: how a probe states its expectation and records a different result.
5. F11: documented as unavailable in a component, observed as available. And D6 after Probe 1: whether a caller of `ConvexHttpClient` must supply a request key.
6. The doc disagrees with what the probes showed in eleven places. The list is in the S0 reports the project notes name (the facts-pass scout, section 3). Only the owner edits the doc.
7. Probe 3's quota half needs a hosted deployment. OQ1 has its first number: a component call costs 1.5 to 2.4 ms more than a helper call on a local backend, across three runs on one machine.
8. The 122 open questions (recipe 20), the twelve ambiguities of `PLAN.md` 11 and three product decisions listed in `README.md`.
9. Probes 6 and 7 have not run. They sit in S4 and S5.
10. Rulings the round-3 findings ask for:
    - D6 and the local wrapper: whether a derived command issued inside the reaction wrapper needs a receipt (`r3-fidelity-derived-command-receipt-question-not-on-a-spec`).
    - D3 and a history-reading migration (`r3-fidelity-migrate-on-load-replays-history-against-d3`).
    - Restore policy: whether a failed check keeps every writer out with no override, and how often the drill runs (`r3-fidelity-restore-policies-cited-to-the-doc`).
    - The `[extension]` marker: `PLAN.md` 6.5 asks for it on every extension bullet and about a fifth carry it (`r3-fidelity-extension-marker-applied-to-a-fifth-of-citations`).
    - D2's premise: Convex documents a commit timestamp that increases in commit order (`r3-convex-commit-timestamp-not-weighed`).
11. What code cannot choose, each at its slice: the grant bootstrap trust model, deployment-wide operator authority, tenant creation during a scan, the acceptable length of a write pause, history-deletion semantics, the restore override policy.
12. The maximum order size and the latency and throughput targets, before S3 benchmarks.
13. `AGENTS.md` names two files by their path on the owner's machine, in a public repository. A reviewer flagged it. The section is the owner's.
14. A license. The repository is public and has no license file.
15. Four proposals on how sessions are run, in the orchestration guide under "Proposals not yet ruled".

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
- `design/generated/` is ignored and regenerated by `npx sdp view design`.
