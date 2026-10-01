# State of the design corpus

Written on 2026-10-01 at the close of slice S0. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
187 specs · 5 packs · 22 anchors → 214 nodes · 959 edges (0 errors, 0 warnings)
validate: 0 errors · 0 warnings; readiness divergence: []
open questions: 67 Specs, 122 questions, 10 blocking; extensions registered: 50
stated readiness: {'defined': 177, 'scoped': 10}
ledger: 245 findings, {'fixed': 125, 'open': 111, 'owner': 1, 'partially-fixed': 8}
open findings by slice: {'L3': 22, 'P': 18, 'S1': 17, 'S2': 8, 'S3': 1, 'S4': 30, 'S5': 15}
corpus digest: 4a84dfa83427d329
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-5993da7.tgz
```

The default branch is `main`, published at `github.com/libar-dev/libar-platform`. Each unit works on its own branch, named for the unit, so that `main` stays green. The owner gave the session a mandate on 2026-10-01 to merge at this early stage, and said the same day that a pull request per unit was not a good idea while the design is iterated quickly. So from slice S1 on there is no pull request: CI runs on every push, and the session fast-forwards `main` once CI is green on the last commit. Slice S0 was the one unit merged through a pull request. The mandate has no stated end: ask when a release or an outside user appears.

## Where the work stands

Slice S0 is built. The repository now holds code beside the design: a native test harness (`harness/`), a fixture Convex app with one component (`fixture/convex/`), four test tiers (`tests/`), a codegen script and a watch mode (`scripts/`), CI, and evidence records (`evidence/`). The root `README.md` says how to run each.

What passed, and at which tier, on 2026-10-01 with backend release `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124, `convex-test` 0.0.60:

- Compiled, pure test and `convex-test` tiers at `61c3879`: 14 files, 80 tests. Typecheck, lint and format pass.
- Native tier at `61c3879`, on a clean tree, macOS on Apple silicon: 21 files, 31 tests. The record is `evidence/native-20261001T195108Z-61c3879-e2da54b9-e845-4fa6-bc1d-2449482970dc.json`.
- CI on Linux at `bf80ec4`, which is `61c3879` plus that record: both jobs pass, the native one included. CI also passed at each of the three fold-ins before it.
- Thirty-seven native mutations proposed by reviewers were run across three review rounds. Twelve left their test green when first run. The three of the first round were ruled and fixed in the first fold-in. The six of the second round and two of the third were rerun after their fixes and turn their tests red. The last one is no finding: a page size no example binds.

What each probe showed on the native tier. The fact Specs hold the details and the measured sizes.

- Probe 1 (F5). Across a backend kill and restart on the same storage every mutation's promise stayed pending through the kill, resolved after the restart and left one row, whether the kill came before the commit or after it. A closed client left its row once or not at all. `ConvexHttpClient` sent one request per call, and a caller's retry left two rows.
- Probe 2 (F14, now `probed`). `ConvexError` data reached the parent's catch and the client unchanged through a nested mutation and through a component boundary. The child's write rolled back and the parent committed. An ordinary `Error`'s added property did not arrive.
- Probe 3 (F4). Fifty reads took about 3 ms through a helper, about 50 ms nested and about 80 ms through a component, with a factor of two between runs. The backend's own `documentsRead` metric counted one document per read on all three paths, in a query and in a mutation. Local time only: the quota half needs a hosted deployment.
- Probe 4 (F13). 16 MiB read and 16 MiB written are each one budget across a nested call and a component call. A stack of 9 functions commits and 10 fails with "Cross component call depth limit exceeded".
- Probe 5 (F15, now `probed`). A parent query over a component query stays reactive. Pinned pages stay contiguous. A capped page comes back as `SplitRequired` and both halves hold every row. The `usePaginatedQuery` hook of `convex-helpers/react` shows 40 of 45 rows after a capped split.
- Not a probe: `ctx.auth.getUserIdentity()` inside a component returned the caller's identity, against the documentation. `convex-test` 0.0.60 returns null.

What changed in the Specs during S0, and why:

- `spec:platform.native-harness` is new. It took extensions E-13 and E-15 out of the acceptance contract, because the doc says what native tests prove and not how a test gets an identity, what the fixture holds, how a fault enters or what a test controls. Its Design holds the harness's interface as stubs.
- The first reading of E-13, the admin key acting as an identity, was dropped: such a caller passes Convex's visibility check for internal functions. A fixture issuer replaced it. One example shows why.
- `spec:facts.probe-plan` carries extension E-16: how a probe states its expectation, what a later different run is, and that a size is recorded and not asserted.
- Eighteen examples are new or rewritten, four for the harness and fourteen for probes 1 to 5, each bound to a native test. Review rounds reworded several of them, each time because a review or a mutation showed the test proved less than the text said.
- F14 and F15 state `defined` and are `probed`. F13, F5 and F4 carry what their probes showed. F11 carries an open question for the owner.
- Fourteen findings entered the ledger with `round: "S0"`. The slice has no `open` finding of its own.

Review of S0. The foundation and the first fold-in each had three lanes (sol mechanical, astra behavior, Opus taste). The second fold-in was read by astra at xhigh over the whole branch, the watch mode by sol, and the third and fourth fold-ins by astra and sol again. Every review of a fold-in found defects, and each time some were ones the fold-in itself had introduced, in a cleanup or failure path the fix had added: eight findings on the second fold-in, eleven on the third, eight on the fourth. The probes were confirmed closed at the third. What the fourth review found was in the handling of failed cleanup, and the fifth fold-in closed it. The slice then stopped on tactical decision 19. A review of the fifth fold-in was started as the slice closed. The thread that opened S1 ruled on it: it found no defect on a path a healthy run or an ordinary failure takes, nothing was folded in, and its six findings are lead 13.

Fourteen findings of slice S0 are `fixed` and carry `unreviewed: true`: no lens has confirmed them in the Spec text. They stay flagged until a `review` unit reads them.

Review round 3 stands as it was for the rest of the corpus: no lens approved, and its open findings are sorted by slice and by the cheapest thing that would catch each. A final design cannot be reached by design work alone, so the design is finished by building it, one slice at a time.

| Slice | Builds | Open findings | Blocker, major, minor |
|---|---|---|---|
| S1 | Layers 0 and 1, thin: deciders, kernel types, one context component, journal and adapter, command pipeline, receipts, actor and tenancy, the minimal grant bootstrap | 17 | 0, 4, 13 |
| S2 | Layer 2, thin: `PlaceOrder` over Orders and Inventory, a legal way to create stock, the summary written in the command with its first active generation, queries and lists | 8 | 1, 4, 3 |
| S3 | Measurement: 1, 10 and 100 lines, without and with contention. Repeated after S4 and S5 | 1 | 0, 0, 1 |
| S4 | Generations and rebuild, the history view and the write pause, with the tenant list, operator entry points and gate audit the rebuild uses; Probe 6 | 30 | 0, 14, 16 |
| S5 | Baseline migration, restore, the rest of operators and audit, maintenance jobs; the transactional part of Probe 7 | 15 | 0, 7, 8 |
| L3 | Layers 3 to 6, written from what the experiment shows | 22 | 0, 5, 17 |
| P | Polish with no effect on what is built: citations, markers, stale sentences, README | 18 | 0, 0, 18 |

Eight more findings are `partially-fixed`, each carried by a later finding or waiting for its slice. Aggregate and cross-context projections sit in S4 and are not part of the pinned experiment. Remove an unsupported generic promise before designing a helper no view needs.

## Next unit

`slice` S1, opened on 2026-10-01 on the branch `slice/s1`. The review of S0's fifth fold-in is ruled (lead 13).

Decisions S1 needs on paper before its code:

- Who creates the first grant and changes grants (`r3-completeness-grants-have-no-writer`).
- One source for tenant scope (`r3-sdp-tenant-scope-passed-two-ways`).
- Drop the standing command registry unless a reader needs it (`r3-fidelity-command-registry-standing-without-a-reader`).
- Whether a Spec may say `ctx.auth` is unavailable in a component, given what S0 observed (`s0-f11-documented-unavailable-observed-available`, status `owner`).
- Whether callers of `ConvexHttpClient` must supply a request key on the public entry, given Probe 1 (the question is on D6 and on `spec:command.idempotency-and-receipts`).

What S0 leaves for S1's opening:

- Start `npm run dev` in a background shell before the first build job. It keeps `fixture/convex/_generated` current while agents write functions.
- `tsconfig.json` sets `moduleSuffixes: [".d", ""]` and `erasableSyntaxOnly` for the whole repository. The library S1 starts meets both. Decide then whether the library gets a `tsconfig` of its own.
- `r3-completeness-test-seams-and-fixture-app-undefined` and `r3-completeness-or-rows-bound-to-one-point` are `partially-fixed`: the harness side is done, and the part that needs a kernel waits for S1.

Decisions each later slice needs on paper before its code:

- S2: stock created through a domain operation (`r3-architecture-example-domain-cannot-create-stock`); the transition that makes the first summary writable (`r3-completeness-first-generation-has-no-bootstrap`); what a list uses in place of the helper hook that loses rows after a capped split (`s0-helper-hook-loses-rows-after-a-capped-split`).
- S4: order-independent cross-stream folds and whether deletion keeps fold memory (`r3-architecture-history-fold-order-and-deletion`); who owns the tenant list (`r3-architecture-tenant-list-undefined`); operator authority and entry points (`r3-completeness-operator-entry-points-undefined`); refusal or a paused catch-up for history rollback (`r3-architecture-history-generation-rollback-unpaused`).
- S5: history-reading migrations off the command path unless the owner changes D3 (`r3-fidelity-migrate-on-load-replays-history-against-d3`); whether paused migrations are supported (`r3-fidelity-baseline-sweep-and-the-pause-contradict`); reopening authority, failure scope and drill cadence as explicit extensions (`r3-fidelity-restore-policies-cited-to-the-doc`).

Eighteen findings are listed in the sorting report as wasted effort on paper before the code exists, such as the carrier for appended envelopes and the restore checkpoint. Leave those `open` with a note that the build decides.

## Tactical decisions taken on 2026-10-01

The owner accepted the first nine on the session's recommendation. The session took the rest during S0. Any of them can be reopened.

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

## Owner queue

Platform decisions. None blocks S1's opening, and the first five bear on S1's paper decisions.

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
