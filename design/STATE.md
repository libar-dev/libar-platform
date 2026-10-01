# State of the design corpus

Written on 2026-10-01 at the close of the `adopt` unit. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
168 specs · 5 packs · 0 anchors → 173 nodes · 881 edges (0 errors, 0 warnings)
validate: 0 errors · 0 warnings; readiness divergence: []
open questions: 67 Specs, 129 questions, 12 blocking; extensions registered: 48
stated readiness: {'defined': 156, 'scoped': 12}
ledger: 231 findings, {'fixed': 111, 'open': 116, 'partially-fixed': 4}
open findings by slice: {'L3': 22, 'P': 18, 'S0': 6, 'S1': 17, 'S2': 7, 'S3': 1, 'S4': 30, 'S5': 15}
corpus digest: 6f0b395c30948893
protocol: file:vendor/libar-dev-software-delivery-protocol-0.0.0-5993da7.tgz
```

The default branch is `main`, published at `github.com/libar-dev/libar-platform`. The owner fast-forwarded it to the corpus on 2026-10-01. Each unit works on its own branch, named for the unit, and opens a pull request. The session commits and pushes its branch; merging to `main` stays with the owner.

## Where the work stands

Review round 3 is complete for all five lenses at `f44cad4`. No lens approved. It left 116 open findings: 1 blocker, 36 majors, 79 minors. Three round-2 fixes are `partially-fixed`, each carried by a round-3 finding.

The owner changed the plan on 2026-10-01. A final design cannot be reached by design work alone, so the design is now finished by building it, one slice at a time. The numbers agree. Each fix round added names that the next round found defects in. A blind GPT read of one area found about 15 defects that three review rounds had not recorded. And of the 37 open blockers and majors, a read-only analysis predicts that code would catch 28: 6 at the compiler, 2 in a pure test, 16 in `convex-test`, 3 on a native backend, 1 in a measurement. The other 9, and 49 of the 79 minors, are judgment that no code catches, so review continues beside the build.

Every open finding carries a `slice` and a `detector` field in the ledger. The detector is that analysis's prediction of the cheapest thing that would catch the finding. Nothing was compiled or run to produce it.

| Slice | Builds | Open findings | Blocker, major, minor |
|---|---|---|---|
| S0 | Repository layout, toolchain, fixture app, test tiers; probes 2 to 5 | 6 | 0, 3, 3 |
| S1 | Layers 0 and 1, thin: deciders, kernel types, one context component, journal and adapter, command pipeline, receipts, actor and tenancy, the minimal grant bootstrap | 17 | 0, 4, 13 |
| S2 | Layer 2, thin: `PlaceOrder` over Orders and Inventory, a legal way to create stock, the summary written in the command with its first active generation, queries and lists | 7 | 1, 3, 3 |
| S3 | Measurement: 1, 10 and 100 lines, without and with contention. Repeated after S4 and S5 | 1 | 0, 0, 1 |
| S4 | Generations and rebuild, the history view and the write pause, with the tenant list, operator entry points and gate audit the rebuild uses; Probe 6 | 30 | 0, 14, 16 |
| S5 | Baseline migration, restore, the rest of operators and audit, maintenance jobs; the transactional part of Probe 7 | 15 | 0, 7, 8 |
| L3 | Layers 3 to 6, written from what the experiment shows | 22 | 0, 5, 17 |
| P | Polish with no effect on what is built: citations, markers, stale sentences, README | 18 | 0, 0, 18 |

Aggregate and cross-context projections sit in S4 and are not part of the pinned experiment. Remove an unsupported generic promise before designing a helper no view needs.

What the `adopt` unit did, on the Protocol at `5993da7` (pull request 26):

- The Protocol is a pinned dependency in `package.json`, from a tarball under `vendor/`, because the commit hash installs no CLI. `docs/sdp-feedback.md` has the reason and the rest of the feedback.
- Generics use real angle brackets: 248 pairs on 114 lines of 29 Specs.
- Validate expects 0 warnings. Five checks left `tools/check.py`.
- F14, F15 and F17 state `scoped` behind a blocking question naming the probe. Nine deferred Specs carry a blocking question naming the trigger.
- The README's census sentence and open-question table are gone. `sdp census` and recipe 20 derive them.
- OQ4 is ruled: the experiment lives in this repository.

## Next unit

`slice` S0.

Four decisions come before any code, all from fix unit 7's findings. Settle them on paper first:

1. What time and interruption controls the native tier has, and how a run with adjusted time differs from production (`r3-architecture-native-tier-cannot-move-time-or-interrupt`).
2. The fixture composition, its fault seams, and the production acceptance path that stays unmodified (`r3-completeness-test-seams-and-fixture-app-undefined`).
3. Admin setup access against ordinary-client authority in visibility tests (`r3-convex-admin-acting-identity-bypasses-visibility`). The earlier platform's native tests sign ordinary JWTs from a fixture issuer with a data-URI key set, and that passed on its native backend on 2026-09-27.
4. Which acceptance alternatives the harness must cover, so it does not prove only the convenient cases (`r3-completeness-or-rows-bound-to-one-point`).

Then S0 lays out the repository, pins the toolchain and runs probes 2 to 5. Each probe becomes an `example` Spec that `verifies` its fact, bound to its test, which is the Protocol's home for a checked statement. Probe 1 runs before S1 relies on receipt boundaries.

Decisions each later slice needs on paper before its code:

- S1: who creates the first grant and changes grants (`r3-completeness-grants-have-no-writer`); one source for tenant scope (`r3-sdp-tenant-scope-passed-two-ways`); drop the standing command registry unless a reader needs it (`r3-fidelity-command-registry-standing-without-a-reader`).
- S2: stock created through a domain operation (`r3-architecture-example-domain-cannot-create-stock`); the transition that makes the first summary writable (`r3-completeness-first-generation-has-no-bootstrap`).
- S4: order-independent cross-stream folds and whether deletion keeps fold memory (`r3-architecture-history-fold-order-and-deletion`); who owns the tenant list (`r3-architecture-tenant-list-undefined`); operator authority and entry points (`r3-completeness-operator-entry-points-undefined`); refusal or a paused catch-up for history rollback (`r3-architecture-history-generation-rollback-unpaused`).
- S5: history-reading migrations off the command path unless the owner changes D3 (`r3-fidelity-migrate-on-load-replays-history-against-d3`); whether paused migrations are supported (`r3-fidelity-baseline-sweep-and-the-pause-contradict`); reopening authority, failure scope and drill cadence as explicit extensions (`r3-fidelity-restore-policies-cited-to-the-doc`).

Eighteen findings are listed in the sorting report as wasted effort on paper before the code exists, such as the carrier for appended envelopes and the restore checkpoint. Leave those `open` with a note that the build decides.

## Tactical decisions taken on 2026-10-01

The owner accepted these on the session's recommendation. Any of them can be reopened.

1. Slices replace the eight fix units of the previous plan.
2. A slice is built on Specs at `defined` with no open blocker inside the slice. The owner states `ready` after the slice passes.
3. Layer 3 and later wait for the experiment. Their 22 findings are not fixed on paper first.
4. ESM only, Node 22 or later, one supported compiler. Dual builds, compatibility matrices and publishing wait for a first release.
5. npm, with one `package.json` at the repository root, as the Convex component template has it.
6. The main thread settles a GPT finding before it enters the ledger. An `unreviewed` flag still waits for its lens.
7. A lens verdict for `sdp`, `convex` and buildability may rest on a GPT read once that reviewer has caught a planted defect in a Spec.
8. Sessions delegate. `SESSIONS.md` is rewritten for it.
9. Two Protocol idioms are adopted later, when their moment comes. An extension becomes a decision Spec when the owner takes it up, and until then the E-register stays. A probe becomes an example that verifies its fact when S0 builds it.

## Owner queue

Platform decisions. None blocks S0.

1. The 129 open questions (recipe 20), the twelve ambiguities of `PLAN.md` 11 and three product decisions listed in `README.md`.
2. The seven probes. None has run. The earlier platform's evidence partly answers probes 1, 2, 3, 4 and 7 and does not touch 5 or 6.
3. Rulings the round-3 findings ask for:
   - D6 and the local wrapper: whether a derived command issued inside the reaction wrapper needs a receipt (`r3-fidelity-derived-command-receipt-question-not-on-a-spec`).
   - D3 and a history-reading migration (`r3-fidelity-migrate-on-load-replays-history-against-d3`).
   - Restore policy: whether a failed check keeps every writer out with no override, and how often the drill runs (`r3-fidelity-restore-policies-cited-to-the-doc`).
   - The `[extension]` marker: `PLAN.md` 6.5 asks for it on every extension bullet and 167 of 903 carry it (`r3-fidelity-extension-marker-applied-to-a-fifth-of-citations`).
   - D2's premise: Convex documents a commit timestamp that increases in commit order (`r3-convex-commit-timestamp-not-weighed`).
4. What code cannot choose, each at the slice named above: the grant bootstrap trust model, deployment-wide operator authority, tenant creation during a scan, the acceptable length of a write pause, history-deletion semantics, the restore override policy.
5. The maximum order size and the latency and throughput targets, before S3 benchmarks.
6. Whether the doc's statuses follow what round 3 found documented: F15's reactivity and most of Probe 4.
7. A license. The repository is public and has no license file.

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
4. F11 as stated. One of the earlier platform's tests observes the parent's identity inside a component on its pinned native backend. Recheck before a Spec says `ctx.auth` is unavailable there.
5. Convex ships `getConvexSize` and `getDocumentSize`. They answer the two byte-bound findings of S1.
6. Fifteen places where the design or a proposed fix repeats a shape the earlier platform regretted, each with the Spec line: progress kept on a row every command reads, work repeated per entry or per boundary, a stored maximum version taken as proof of coverage, a closed state with no route out, bookkeeping on the healthy path with no bounded lifetime, nested command calls where a helper would do, a recovery scan blocked by healthy work, registries with no reader.
7. Nine type names used in pinned signatures and declared by no Spec: `Journal`, `GetArgs`, `ListArgs`, `HistoryArgs`, `WriteBaselineArgs`, `WriteBaselineResult`, `DiagnosticSink`, `AuditRecordInput`, `BatchCursor`.
8. `dispatchId` on the obligation row is `v.id("_scheduled_functions")`. Nothing shows whether such an ID validates after a restore into another deployment. It belongs in Probe 7.
9. The mention audit (recipe 22) gives 78 unbacked pairs, 50 of them declared from neither side. Each slice checks the ones in its families.

The reports behind leads 1 to 6 are outside the repository, because they quote a private repository. The project notes file named in `AGENTS.md` lists them.

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
