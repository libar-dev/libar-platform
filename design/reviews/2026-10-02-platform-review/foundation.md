# Foundation, harness and evidence review

Reviewed repository commit `dd3185a`. The working tree remained unchanged. This report is the only authored file, outside the repository.

## Result

No new blocker or major runtime defect was established in this scope. One minor graph coverage gap is reproducible. Two minor documentation issues are known owner work, not discoveries that require reopening settled decisions. The harness is a sound basis for the next implementation work, subject to the main review's fresh native backend results and the already recorded production-parity questions.

The source-first review covered all 79 foundation Specs, their Pack, the harness, both scripts, CI and test configuration, the root README, retained evidence metadata, native probes 1 to 5, and the harness lifecycle and authority tests. The governing decisions document, CONTEXT.md, PLAN review rubric, session instructions, and SDP recipe catalog were read. The ledger and STATE were consulted after forming leads.

## Findings

### FOUND-01, minor, new: implementation impact lookup misses the harness's main implementation files

Evidence: `harness/native.ts:14-19` says its one code anchor binds the code under harness to the native-harness Spec. That anchor is located only in native.ts. `harness/backend.ts:70` owns backend creation and `harness/admin.ts:83` owns CLI targeting, yet recipe 4 called with only `harness/backend.ts` and `harness/admin.ts` returns no impacted Specs or at-risk nodes and returns both as coverageUnknownFiles. The exact query output is archived in `foundation-impact.json` beside this report. Including native.ts makes the native-harness Spec appear, demonstrating the difference.

Trigger and consequence: a maintainer uses the prescribed changed-file graph query after changing process cleanup or deployment selection in these files. The graph cannot direct that change to the native-harness contract or its verifiers. The comment overstates the anchor's reach. This does not establish a runtime failure or an incorrect passing test; the Protocol explicitly reports unknown coverage.

Recommended change: bind implementation-bearing harness files to the owning Spec with distinct anchors, or state and operationalize a manual fallback for coverageUnknownFiles. Do not invent more Specs merely to create file coverage.

Acceptance check: recipe 4 for each implementation-bearing harness file reaches spec:platform.native-harness, or the documented review procedure explicitly treats its coverageUnknown result as requiring the harness review. Keep the distinction between a verifier binding and a passing test.

Evidence tier: graph query and source inspection, no runtime behavior claim. Ledger match: none found; optional steering improvement rather than a release blocker.

### FOUND-02, minor, known: the foundation vocabulary and the instructed vocabulary define different concepts

Evidence: `design/specs/platform/vocabulary.sdp.md:37-38` defines command as a request to change one context, evaluated by decide, and decider as the pure domain code of a context. `CONTEXT.md` instead distinguishes the parent's command from a stream command and assigns one decider to a stream type. The model's `:21,25-26` still says receipt and generation must not be named in code before the owner rules, while current code already names both.

Trigger and consequence: an implementer reads a Pack's modelRefs, which all point at platform.vocabulary, while AGENTS.md tells that implementer to name things from CONTEXT.md. They receive different instructions for the same type or sentence. This creates naming drift before the next layer is built.

Recommended change: obtain the already queued owner ruling on which vocabulary leads, then align the model Spec and the permitted provisional language. Avoid renaming code merely to resolve this review.

Acceptance check: one authority is named and the command, stream command, decider, receipt and generation entries agree across that authority and platform.vocabulary; the before-code prohibition is either honored or explicitly replaced by the ruled provisional policy.

Evidence tier: source inspection only. Known match: `design/STATE.md:183` explicitly lists these clashes and the authority question in the owner queue. No direct ledger finding covers this newly introduced CONTEXT.md split. This is not a new platform decision for the reviewer to settle.

### FOUND-03, minor, known family: foundation status statements lag the recorded probes

Evidence: `design/specs/platform/transactional-domain-platform.sdp.md:38` says nothing has run. `design/specs/facts/fact-ledger.sdp.md:22,32` repeats it, although that same file's `:15` records probes 1 to 5. `design/specs/decisions/d02-context-owns-state-and-journal.sdp.md:26,30` says the nested-call amount is unmeasured and Probe 3 is pending, while F4 records local latency measurements and clearly leaves only hosted quota/cost unresolved.

Trigger and consequence: a maintainer reading the foundation for the next decision may repeat completed local probes or treat the existing evidence as absent. The full experiment is unfinished and hosted performance is still unknown, but those narrower limits should be what the text says.

Recommended change: remove work-status sentences from intended-truth Specs or point them at dated evidence and STATE; distinguish the completed local probe from the still-open hosted measurement. Leave the owner's governing document unchanged.

Acceptance check: foundation Specs do not say that no implementation has run or that the whole of Probe 3 is pending; run-specific facts retain dates, dependency versions and evidence references, and unperformed parts stay open.

Evidence tier: source inspection plus inspection of retained native backend records, not a fresh runtime assertion. Known match: STATE's unruled temporal-prose leads, including `design/STATE.md:251`, and its earlier stale-sentence lead. Not found as a dedicated consensus-ledger entry.

## Confirmed strengths and limits

- Authority tests use ordinary clients with signed fixture tokens. The admin-as-identity demonstration is isolated, and negative visibility tests show both the specific refusal and a positive admin control against the same target on the same deployment. A source check forbids adminKey in other native tests.
- Cleanup has an ownership record published immediately after spawn; the final sweep verifies instance name and storage path before signaling. Uninspectable ownership is retained and fails the run. A final-sweep failure also amends its own evidence record to failed. The native lifecycle tests exercise real process handling, while injected ps cases belong to the pure-test tier.
- Backend releases are selected by executable hash, including cache verification. CLI children use an explicit localhost URL/admin key and their own HOME and environment. Both compositions are code-generated and the CI job rejects tracked or untracked generated drift.
- Probe 1 checks a mutation really was pending across a restart and requires both before-commit and after-commit trials. Probe 2 includes write-before-throw guards and decoded structured data. Probe 4 requires each half to succeed alone and verifies the failed combined write leaves no rows. These controls make the native tests harder to satisfy accidentally.
- The pagination probes separate the component paginator from the built-in parent paginator and from the React helper hook. They preserve the observed helper defect rather than silently adapting the test to a desired result.
- Retained evidence contains seven records, each clean=true and passed, with 24 to 52 test entries. These are historical claims at their named commits, not evidence that dd3185a passed. The parent review runs a fresh native suite. The parent reported baseline check, compiled typecheck, lint, formatting, and 307 compiled/pure-test/convex-test cases passed; this lane did not duplicate those commands.
- An apparent compiler-version discrepancy was refuted. The evidence records @typescript/native 7.0.2 and node_modules/.bin/tsc actually points at that package. The separate typescript package is also used as a parsing library by pure tests.
- Recipe 5 gives foundation 79 members, 78 defined and 1 scoped, no unresolved members, and no findings. Its 51 verifier gaps are mostly transcription Specs or facts awaiting their proper probe, not 51 claimed failing tests. Recipe 10 distinguishes declared examples from enabled verifiers. No Spec is upgraded to ready by this review.
- installedLayers remains [] for both compositions. The production declaration and release parity questions are explicitly unpinned in STATE:70 and :175. This is known missing evidence detail; it must be settled before a full production-configuration claim, but it does not by itself make each fixture probe false.
- F17 and probes 6 and 7 remain open. Their absence is consistent with the deferred build scope; they become acceptance prerequisites when rebuild and the durable profile activate.

## Primary-source checks

Current official limits still support the document and transaction ceilings, with the useful qualification that the one-second query/mutation limit covers user-code execution rather than database time. Source: [Convex limits](https://docs.convex.dev/production/state/limits). The scheduled-functions documentation supports atomic scheduling from mutations and the seven-day result window. Source: [Scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions). Its introductory aggregate argument limit says 8 MB while the limits page says 16 MiB; this disagreement should be resolved against the pinned backend when scheduling-budget probes activate. No runtime claim was changed from that conflicting documentation. The components authoring page failed to fetch in this lane; the already recorded documentation/native mismatch on F11 is retained as an owner question, not resolved from memory.

The installed Vitest source handles SIGINT and SIGTERM with its exit path, so the hypothesis that native-run's process exit hook alone necessarily leaks backends on those signals was not sustained.

## Scoped Spec inventory

All files below were read. This is the complete foundation Pack membership, plus its manifest.

- `design/specs/platform/acceptance-contract.sdp.md`
- `design/specs/platform/decision-method.sdp.md`
- `design/specs/platform/existing-systems.sdp.md`
- `design/specs/platform/layers-and-profiles.sdp.md`
- `design/specs/platform/native-harness.admin-key-acting-as-identity-reaches-internal-function.sdp.md`
- `design/specs/platform/native-harness.fixture-issuer-token-yields-identity.sdp.md`
- `design/specs/platform/native-harness.ordinary-client-refused-component-function.sdp.md`
- `design/specs/platform/native-harness.ordinary-client-refused-internal-function.sdp.md`
- `design/specs/platform/native-harness.sdp.md`
- `design/specs/platform/transactional-domain-platform.sdp.md`
- `design/specs/platform/vocabulary.sdp.md`
- `design/specs/laws/law01-sanctioned-writes-only.sdp.md`
- `design/specs/laws/law02-state-and-events-commit-together.sdp.md`
- `design/specs/laws/law03-events-only-source-of-state.sdp.md`
- `design/specs/laws/law04-server-scoped-idempotency-key.sdp.md`
- `design/specs/laws/law05-authorization-before-execution-and-disclosure.sdp.md`
- `design/specs/laws/law06-technical-failure-never-a-rejection.sdp.md`
- `design/specs/laws/law07-deferred-work-never-reported-early.sdp.md`
- `design/specs/laws/law08-durable-capability-ships-operations.sdp.md`
- `design/specs/laws/law09-no-invariant-on-late-read-model.sdp.md`
- `design/specs/laws/law10-replay-never-runs-commands-or-effects.sdp.md`
- `design/specs/laws/law11-tenant-scope-named.sdp.md`
- `design/specs/laws/law12-one-retry-owner.sdp.md`
- `design/specs/decisions/d01-one-mutation-per-operation.sdp.md`
- `design/specs/decisions/d02-context-owns-state-and-journal.sdp.md`
- `design/specs/decisions/d03-events-only-source-of-next-state.sdp.md`
- `design/specs/decisions/d04-four-outcomes.sdp.md`
- `design/specs/decisions/d05-rebuildable-history-with-baselines.sdp.md`
- `design/specs/decisions/d06-idempotency-client-and-receipts.sdp.md`
- `design/specs/decisions/d07-rejections-thrown-not-stored.sdp.md`
- `design/specs/decisions/d08-read-models-in-command.sdp.md`
- `design/specs/decisions/d09-rebuild-online-by-default.sdp.md`
- `design/specs/decisions/d10-contexts-meet-in-parent-use-cases.sdp.md`
- `design/specs/decisions/d11-tenant-scope-and-authority.sdp.md`
- `design/specs/decisions/d12-one-declaration-per-command.sdp.md`
- `design/specs/decisions/d13-deferred-work-is-an-obligation.sdp.md`
- `design/specs/decisions/d14-external-effects-declare-safe-repetition.sdp.md`
- `design/specs/decisions/d15-one-retry-owner-per-obligation.sdp.md`
- `design/specs/decisions/d16-processes-use-workflow.sdp.md`
- `design/specs/decisions/d17-agents-use-the-command-path.sdp.md`
- `design/specs/decisions/d18-everything-else-waits-for-trigger.sdp.md`
- `design/specs/decisions/d19-operations-travel-with-capability.sdp.md`
- `design/specs/facts/f01-serializable-mutations-under-occ.sdp.md`
- `design/specs/facts/f02-component-calls-commit-with-caller.sdp.md`
- `design/specs/facts/f03-nested-run-mutation-partial-rollback.sdp.md`
- `design/specs/facts/f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation.sdp.md`
- `design/specs/facts/f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-query.sdp.md`
- `design/specs/facts/f04-nested-calls-cost-more-than-helpers.sdp.md`
- `design/specs/facts/f05-react-client-retries-until-confirmed.probe-1-backend-restart-with-pending-mutation.sdp.md`
- `design/specs/facts/f05-react-client-retries-until-confirmed.probe-1-client-closed-with-pending-mutation.sdp.md`
- `design/specs/facts/f05-react-client-retries-until-confirmed.probe-1-http-client-retry.sdp.md`
- `design/specs/facts/f05-react-client-retries-until-confirmed.sdp.md`
- `design/specs/facts/f06-client-mutations-run-in-order.sdp.md`
- `design/specs/facts/f07-queries-reactive-not-durable-delivery.sdp.md`
- `design/specs/facts/f08-scheduling-commits-with-mutation.sdp.md`
- `design/specs/facts/f09-scheduled-mutation-and-action-retry-semantics.sdp.md`
- `design/specs/facts/f10-action-mutation-calls-are-separate-transactions.sdp.md`
- `design/specs/facts/f11-components-have-no-ctx-auth.sdp.md`
- `design/specs/facts/f12-backups-exclude-pending-scheduled-functions.sdp.md`
- `design/specs/facts/f13-transactions-have-limits.probe-4-component-call-shares-limits.sdp.md`
- `design/specs/facts/f13-transactions-have-limits.probe-4-nested-call-shares-limits.sdp.md`
- `design/specs/facts/f13-transactions-have-limits.probe-4-nesting-depth.sdp.md`
- `design/specs/facts/f13-transactions-have-limits.sdp.md`
- `design/specs/facts/f14-convex-error-survives-nested-and-component-boundary.probe-2-component-boundary.sdp.md`
- `design/specs/facts/f14-convex-error-survives-nested-and-component-boundary.probe-2-nested-mutation.sdp.md`
- `design/specs/facts/f14-convex-error-survives-nested-and-component-boundary.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-built-in-paginate-throws-in-component.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-split-at-equal-cap.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-parent-page-outgrows-row-cap.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.probe-5-subscription-updates.sdp.md`
- `design/specs/facts/f15-parent-query-over-component-query-stays-reactive.sdp.md`
- `design/specs/facts/f16-scheduled-functions-table-shows-failed-runs.sdp.md`
- `design/specs/facts/f17-migrations-fits-generation-backfill.sdp.md`
- `design/specs/facts/fact-ledger.sdp.md`
- `design/specs/facts/probe-plan.sdp.md`
- `design/specs/foundation.pack.sdp.md`
