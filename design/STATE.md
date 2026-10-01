# State of the design corpus

Written on 2026-10-01 at the close of review round 3. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
168 specs · 5 packs · 0 anchors → 173 nodes · 881 edges (0 errors, 0 warnings)
validate: 0 errors · 54 warnings; readiness divergence: []
open questions: 67 Specs, 129 questions; extensions registered: 48
ledger: 231 findings, {'fixed': 111, 'open': 116, 'partially-fixed': 4}
corpus digest: dd53321cebaf3b45
```

The owner allows session commits: on 2026-10-01 the owner gave the session the decision on when a commit is needed. The branch is `design-corpus`, cut from `main` at `abfa444`. Commit `f44cad4` is the corpus as every round-3 reviewer read it. No Spec has changed since; the commits after it change the ledger, this file and the review files only.

## Where the review stands

Round 3 is complete for all five lenses, full scope, at `f44cad4`. No lens approved.

| Lens | Round 1 | Round 2 | Round 3 | Verdict |
|---|---|---|---|---|
| `fidelity` | 0 blocker, 4 major, 5 minor | 0, 3, 5 | 0, 3, 13 | not approved |
| `convex` | 1, 2, 4 | 0, 3, 2 | 1, 6, 15 | not approved |
| `sdp` | 0, 7, 11 | 0, 5, 9 | 0, 7, 31 | not approved |
| `architecture` | 0, 4, 14 | 0, 7, 4 | 0, 10, 11 | not approved |
| `completeness` | 0, 7, 8 | 0, 3, 7 | 0, 10, 9 | not approved |

Round 3 added 116 findings: 1 blocker, 36 majors, 79 minors. All are `open` in the ledger under ids that start `r3-<lens>-`.

How the round was run. `architecture` was read in the main thread, as `SESSIONS.md` asks. The other four were read by four `fable-xhigh` agents in parallel, because the owner asked for agents on 2026-10-01 to use the weekly limit before it reset. That is a one-off departure from the main-thread rule, not a change to it. Each agent edited no Spec and appended to its own file, `reviews/r3-<lens>.jsonl`, one record per line, and the main thread merged the four files into the ledger. The files are kept: they hold the reviewers' progress records, and `r3-convex.jsonl` holds 25 `checked` records, Convex claims that hold with the page and read date, so round 4 need not fetch them again.

The one blocker is `r3-convex-read-model-list-returns-rejects-paginate-result`: the read model's list query declares a return validator the built-in `.paginate` result does not fit, so it throws on every call and Sc L2-2 cannot pass. The fix is one line.

The round-2 fixes are all reviewed now. Of the 48, 45 are confirmed. Three are `partially-fixed`, each with a round-3 finding that carries the rest: `r2-architecture-history-and-cross-context-projection-has-no-input`, `r2-completeness-aggregate-row-shape-unpinned` and `r2-convex-convex-restore-stream-check-bytes`. The fourth `partially-fixed` item is the round-1 minor whose remaining part was rejected with a reason. Nothing carries `unreviewed`.

What the round says, across lenses:

- The carrier is sound. Validate, readiness, templates, IDs, packs and the extension register hold, and README matches the corpus on counts and tables.
- Layers 0 and 1 hold up apart from single defects. The weight of the findings is in what round 2 added in a hurry: the baseline migration, the history view, the write pause's source scopes, generations across tenants and the restore's pending-work step.
- Layers 0 to 2 cannot yet be built from the Specs without guessing. The largest holes: no first generation, no operator actor and no operator entry points, no writer for grants, no tenant list, no test seams, a baseline driver that is named and not designed.
- Several findings are one defect seen by two lenses. A fix closes both: active against building generation (`completeness`, `sdp`), the operator actor (`completeness`, `sdp`), the audit record's input (`completeness`, `sdp`), the envelopes `append` does not return (`sdp`, `completeness`), the restore batch's baseline reads (`sdp`, `convex`), the nested derived command (`architecture`, `fidelity`), the list return validator (`convex`, `sdp`).

## Next unit

`fix`, unit 1 below. Then the other fix units in order, one session each. A unit that cannot finish leaves the rest `open` and says so here.

Each unit is a set of findings that touch the same Specs, so a session reads those Specs once. The ids are written without their `r3-` prefix. Where a fix needs a ruling, the session sets `owner`, keeps the provisional reading in the Spec, and adds the question to the owner queue.

1. Read models and generations (1 blocker, 9 major, 7 minor). Scope `application/` projection-contract, generation-registry, read-models, rebuild, and `command/` command-pipeline step 9 and command-declaration bindings. It holds the blocker. `architecture-one-projection-writes-every-generation`, `completeness-apply-projection-cannot-tell-active-from-building`, `sdp-generations-to-write-loses-active-and-building`, `completeness-first-generation-has-no-bootstrap`, `convex-generation-checkpoint-on-the-row-commands-read`, `architecture-cross-context-current-state-row-has-no-write-form`, `completeness-aggregate-key-change-miscounts`, `sdp-aggregate-entity-key-has-no-source`, `convex-read-model-list-returns-rejects-paginate-result`, `sdp-list-result-validator-two-shapes`, `sdp-registry-reads-per-command-two-counts`, `convex-aggregate-row-is-a-write-hot-spot`, `architecture-rollback-keeps-rows-of-deleted-subjects`, `convex-migrations-binding-cannot-run`, `fidelity-migrations-fit-stated-two-ways`, `convex-scheduled-mutation-occ-never-fails`, `sdp-index-does-not-carry-the-stated-query`.
2. The history view and the write pause (0 blocker, 3 major, 5 minor). Scope `application/` projection-contract, rebuild, write-pause, orders-inventory-example and the two L2-6 examples. Do it after unit 1, which changes the same helpers. `architecture-history-fold-order-and-deletion`, `architecture-history-backfill-cursor-and-verify`, `architecture-history-generation-rollback-unpaused`, `architecture-history-view-live-cost`, `architecture-paused-rebuild-one-stream-per-batch`, `sdp-history-batch-size-two-numbers`, `sdp-history-projection-loose-ends`, `sdp-read-model-scope-and-allow-generation-never-match`.
3. Journal, adapter, queries and the baseline migration (0 blocker, 6 major, 11 minor). Scope `context/` and `kernel/state-document-mapping`. `architecture-reads-of-streams-awaiting-baseline`, `fidelity-migrate-on-load-replays-history-against-d3`, `fidelity-baseline-sweep-and-the-pause-contradict`, `completeness-baseline-driver-unpinned`, `sdp-appended-envelopes-have-no-carrier`, `completeness-adapter-events-not-returned-by-append`, `completeness-budgets-declared-never-measured`, `convex-byte-bounds-measured-in-json`, `architecture-write-bound-refuses-what-stream-bound-admits`, `sdp-append-writes-stream-row-twice-stated`, `sdp-streams-entry-listed-without-events`, `sdp-rebuild-query-typed-with-get-args`, `convex-full-page-always-split-required`, `sdp-tenant-scope-passed-two-ways`, `sdp-context-queries-said-to-take-an-actor`, `sdp-example-domain-terms-drift`, `fidelity-import-progress-two-homes`.
4. Restore (0 blocker, 3 major, 6 minor). Scope `application/restore` and its example, after units 1 and 3, whose helpers it calls. `architecture-restore-and-baseline-migration-disagree`, `completeness-restore-checks-have-no-runner-or-usable-cursor`, `fidelity-restore-policies-cited-to-the-doc`, `sdp-restore-compare-mode-undefined`, `sdp-restore-batch-arithmetic-omits-baseline-events`, `convex-restore-check-omits-baseline-reads`, `sdp-restore-run-checkpoint-does-not-fit-the-batches`, `convex-restore-states-undocumented-behavior-as-fact`, `convex-env-switches-untyped-and-uncited`.
5. Authority, operators, tenants and audit (0 blocker, 6 major, 13 minor). Scope `command/` and `operations/baseline-operations`, then every Spec that takes an operator actor or iterates tenants. `architecture-tenant-list-undefined`, `completeness-operator-entry-points-undefined`, `sdp-operator-actor-cannot-be-established`, `completeness-grants-have-no-writer`, `sdp-parent-query-builds-actor-by-hand`, `completeness-audit-record-fields-have-no-source`, `sdp-audit-record-input-unpinned-and-gate-audit-has-no-shape`, `architecture-audit-do-nothing-option-unrecorded`, `completeness-diagnostic-record-outcomes-never-emitted`, `convex-diagnostic-counter-and-duration`, `completeness-maintenance-jobs-without-trigger`, `sdp-grants-limit-two-names`, `sdp-receipts-actor-id-claimed-as-actor-validator`, `sdp-insert-receipt-cannot-compute-expiry`, `sdp-subject-ref-duplicates-affected-ref`, `sdp-query-refusal-shape-unpinned`, `sdp-carry-or-reject-throw-shape`, `fidelity-command-registry-standing-without-a-reader`, `fidelity-index-rule-attributed-to-law-11`.
6. Obligations and effects (0 blocker, 5 major, 15 minor). Scope `obligations/` and `effects/`. Independent of units 1 to 5. `architecture-lease-outlives-running`, `sdp-late-evidence-field-cannot-hold-what-is-written`, `sdp-chain-bound-has-no-writer`, `convex-node-runtime-handler-has-no-action`, `convex-obligation-list-returns-rejects-paginate-result`, `architecture-sweeper-runs-under-the-restore-door`, `architecture-sweeper-scan-blocked-by-backlog`, `architecture-derived-command-nested-where-a-helper-suffices`, `fidelity-nested-derived-command-credited-to-d7`, `architecture-events-evidence-needs-ids-the-command-does-not-return`, `architecture-authority-recheck-names-no-permission`, `fidelity-derived-command-receipt-question-not-on-a-spec`, `sdp-handler-registry-three-shapes`, `sdp-lifecycle-writer-lists-disagree`, `sdp-terminal-patches-omit-what-lifecycle-requires`, `sdp-rearm-bound-off-by-one`, `sdp-completion-query-two-shapes`, `convex-obligation-dispatch-args-lack-tenant`, `convex-rebuild-schedules-cursor`, `convex-sweeper-reads-conflict-with-dispatches`.
7. Acceptance, the experiment and the example domain (0 blocker, 3 major, 3 minor). Scope `platform/acceptance-contract`, `application/first-experiment`, orders-inventory-example and the examples that need a seam. `architecture-native-tier-cannot-move-time-or-interrupt`, `completeness-test-seams-and-fixture-app-undefined`, `convex-admin-acting-identity-bypasses-visibility`, `architecture-example-domain-cannot-create-stock`, `fidelity-third-cost-target-substituted`, `completeness-or-rows-bound-to-one-point`.
8. Bounds, facts, citations and polish across the corpus (0 blocker, 1 major, 19 minor). Last, because it sweeps Specs the other units edit, and it ends with README. `convex-remaining-batches-bounded-in-documents-only`, `convex-nested-limits-are-documented-and-unused`, `convex-f15-reactivity-is-documented`, `convex-commit-timestamp-not-weighed`, `convex-component-env-read-as-forbidden`, `fidelity-readme-register-rows-behind-their-questions`, `fidelity-doc-citations-on-extension-content`, `fidelity-extension-marker-applied-to-a-fifth-of-citations`, `fidelity-layer-4-5-rulings-beyond-d16-d17`, `fidelity-scenario-text-marked-extension`, `fidelity-stale-sentences-after-round-2`, `completeness-small-unpinned-names`, `completeness-defined-but-never-used`, `completeness-readme-stale-against-specs`, `completeness-assumed-facts-not-named-on-every-spec`, `completeness-polish`, `sdp-intent-citations-without-constrained-by`, `sdp-contracts-compose-without-depends-on`, `sdp-application-pack-child-before-parent`, `sdp-small-naming-and-stale-sentences`.

After the eight units, round 4. No lens approved round 3, so every lens reviews again. With the corpus committed, delta scope is now computable: `git diff --name-only f44cad4..HEAD -- design/specs` plus what those Specs relate to. The fixes will touch most Layer 1 to 3 Specs, so expect the delta to be close to full scope for `sdp` and `completeness`.

## Leads for round 4

These are not findings. A reviewer confirms or drops each.

1. `convex`. `dispatchId` on the obligation row is `v.id("_scheduled_functions")`. The docs do not say whether such an ID still validates after a restore into a different deployment. The round-3 reviewer could not establish it either way; it belongs in Probe 7.
2. `convex`. The retry-exhaustion rate in `r3-convex-generation-checkpoint-on-the-row-commands-read` is an estimate. Probe 6 or the experiment's contention run has to measure it.
3. `convex`. The reviewer read most pages as the `.md` form of each docs URL with `curl`, and backend and helper source from GitHub. Three findings rest on source, not on a docs page: the admin acting-as identity and visibility, the nesting depth, and when a changed environment variable is seen. A source reading can change between versions; pin the version when the experiment's repository exists.
4. All lenses. The fix units will add names again. The round-2 fixers added `HistoryProjection`, `gateAllows`, `resumeChain`, `pendingWorkBatch` and `writes` in a hurry, and most round-3 majors sit on them. Read what the fix units add first.

## Inputs

The doc is `docs/convex-transactional-domain-platform-decisions.md`, committed and unchanged since `abfa444`. It spent a day at the repository root and is back in `docs/`; `README.md` and `PLAN.md` point there.

`docs/modern-ts.md` arrived on 2026-10-01. It is a research report on building and shipping the TypeScript library, written against the doc. No Spec cites it. The read of 2026-10-01:

- Its architecture half restates the doc and adds nothing. Where the two differ, the doc wins.
- Its engineering half covers ground the corpus does not: package boundaries and subpaths, module format, `tsconfig`, the build tool, a test catalogue, the CI matrix, publishing, and a compatibility policy that treats error codes, persisted handler keys and event schemas as contracts. Use it when the first experiment's repository is laid out (OQ4) and when the build tier of E-14 and the test tiers get their tooling.
- Its claims on the Convex component template, TypeScript 7, npm trusted publishing and tsup's end of maintenance check out against their sources, read 2026-10-01.
- Three things in it are wrong or missing. The dates it gives as end of life for Node 18 and Node 20 are those lines' last release dates; both are end of life, so its conclusion stands. It never mentions tsdown, the replacement tsup's own README names. Its six citations of the doc are broken placeholders, and each code block carries a stray language label above it.
- Do not copy its repository blueprint. It puts journal, streams, receipts and obligations into one component, which is the central store D2 rejects, and it puts receipts and obligations inside a component, where D2 and E-50 put them in the parent.
- Smaller conflicts, all resolved for the corpus: its error codes and obligation statuses are spelled differently, and its actor kinds leave out the reviewer of D11.
- Its Node 18 and CommonJS baseline came from the prompt it was given, not from the doc. The owner decides.

One Convex page was read this session: audit logging (docs.convex.dev/production/integrations/audit-logging, 2026-10-01). `log.audit(params)` blocks the commit on log persistence, needs an Enterprise plan and a dedicated deployment, emits on failed mutations and possibly on retries, and delivers to an S3 bucket. It is the evidence for `r3-architecture-audit-do-nothing-option-unrecorded`.

Pages read on 2026-10-01: Convex audit logging by the main thread, the evidence for `r3-architecture-audit-do-nothing-option-unrecorded`; and the pages, component READMEs and source files the `convex` reviewer cites in its findings and in the `checked` records of `reviews/r3-convex.jsonl`.

## Owner queue

Nothing here blocks a fix session.

1. Session commits: answered on 2026-10-01, the session decides, on `design-corpus`. Whether and when that branch merges to `main` stays with the owner.
2. The 129 open questions in `README.md`, the twelve ambiguities of `PLAN.md` 11, and three product decisions listed in `README.md`.
3. The seven probes. None has run. Round 3 found two of them largely answered by the docs: the using-components page says queries into components are reactive, which is F15 and half of Probe 5, and the docs say nested calls share the transaction limits, which is most of Probe 4. The corpus cannot change the doc's statuses; the owner decides whether the doc follows.
4. From `docs/modern-ts.md`: ESM only or dual ESM and CommonJS; the Node floor; whether package and release design becomes a sixth pack in the corpus or stays outside it.
5. Whether agent-run reviews become a standing option in `SESSIONS.md`, with the per-lens write-ahead file as their record, or stay an exception.
6. Rulings the round-3 findings will ask for when their fix unit reaches them:
   - D6 and the local wrapper: whether a derived command issued inside the reaction wrapper needs a receipt, since the obligation's fence already gives one execution (`r3-fidelity-derived-command-receipt-question-not-on-a-spec`).
   - D3 and a history-reading migration: whether a command may read past events to migrate a stream on load, or such a migration must run as a sweep only (`r3-fidelity-migrate-on-load-replays-history-against-d3`).
   - Restore policy: whether a failed check keeps every writer out with no override, and whether the drill runs before every release; the doc says neither (`r3-fidelity-restore-policies-cited-to-the-doc`).
   - The `[extension]` marker: `PLAN.md` 6.5 asks for it on every extension bullet and 167 of 903 carry it. Amend the plan or mark the bullets (`r3-fidelity-extension-marker-applied-to-a-fifth-of-citations`).
   - D2's premise: Convex now documents a commit timestamp that increases in commit order, so "Convex gives no global sequence" is no longer true as written. Nothing fails; the reason for rejecting a global position needs restating (`r3-convex-commit-timestamp-not-weighed`).
   - The native tier's identity: the admin key acting as a user passes Convex's visibility check for internal functions, so E-13 has a second difference from production. A test issuer with its keys in a data URI removes both (`r3-convex-admin-acting-identity-bypasses-visibility`).

## Leftovers

- `.claude/agents/fable-xhigh.md` is the agent definition the four round-3 reviewers ran as. It is committed.
- `design/generated/gen-a.py` is a throwaway generator in a gitignored directory.
- `docs/sdp-development-from-application-platform.md` is being written by a fifth agent the owner asked for: proposals for developing SDP further, with this corpus as the evidence. It is an input for the SDP project, not part of the corpus, and no Spec cites it.
