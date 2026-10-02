# Durable and later layers review

Reviewed on 2026-10-02 against commit `dd3185a6b1c6b2bb570865a8fddb88163f91c08e`. This review covers all 43 Specs and the durable-and-later Pack. These capabilities have no implementation bindings. The findings below are contradictions or gaps in the intended behavior, established by reading and walking through the pinned steps. They are not claims of failures reproduced on a native backend.

The sensible next action is to preserve the later-layer triggers and repair these contracts when their build approaches. These findings do not justify starting Layer 3 before the transactional experiment is complete. D14 and D19 already make the safety requirements clear enough to reject several unsafe readings now.

## New findings

### DUR-01. Pending obligations can repeat an external effect after restore

Severity: blocker for durable restore. Evidence: Spec walkthrough. New relative to the ledger inspected in this review.

Sources: `design/specs/obligations/retention-and-restore.sdp.md:44`, `:67`, `:70`; `design/specs/effects/claim-call-settle.sdp.md:86`; `design/specs/obligations/retention-and-restore.restore-behind-provider.sdp.md:30`.

The rule requires reconciliation of both running obligations and pending obligations whose attempt may have run after the backup. The steps only treat restored running obligations as ambiguous. For a restored pending obligation, `rebuildStep1` selects reconciliation only when the restored row already has `reconcileRequested`.

A concrete sequence is a backup with a pending external obligation, a successful provider call after the backup, and then a restore. The old pending row has neither the completion nor the reconciliation flag. The rebuild schedules another call, which proceeds when dispatch is reopened. Under policy `none`, this can repeat an irreversible effect. Under `reconcileFirst`, the first post-restore call also bypasses the reconciliation the rule promised. The existing example tests a running obligation under `reconcileFirst`; its second pending obligation does not exercise a post-backup effect.

There is a second case under `reuseProviderKey`. If the backup predates the first claim, it contains no `providerKeyIssuedAt`. The restored claim stamps a new issue time even though that deterministic key may have first reached the provider before restore. The system can then treat an expired provider deduplication window as fresh.

Recommended action: classify every restored external obligation that lacks proof of non-execution as uncertain before ordinary dispatch. Preserve or conservatively reconstruct the provider key validity window. A restore-time epoch or explicit reconciliation pass is an option, not an approved design. Do not infer safety from the pending status in an old snapshot.

Acceptance: native backend plus end-to-end provider stub cases for a backup before claim, during running, and after settlement; repeat each applicable repetition policy and restore after provider-key expiry. Assert provider effect count and evidence, not merely stable database IDs.

### DUR-02. Provider key concatenation admits collisions between tenants

Severity: major. Evidence: deterministic string counterexample. New.

Source: `design/specs/effects/claim-call-settle.sdp.md:64`; tenant and effect key validators are strings in `design/specs/obligations/record-contract.sdp.md`.

The key `tenantId + ":" + effectKey` maps both `tenantId="a:b", effectKey="c"` and `tenantId="a", effectKey="b:c"` to `a:b:c`. The corpus does not forbid the separator in either field. Two distinct obligations sharing one provider account can therefore collide in provider idempotency even though the database index correctly distinguishes their tenant and effect key.

Recommended action: define a canonical, injective tuple encoding, or hash a canonical tuple with a stable format version. Scope to the provider account or environment if that account can be shared across deployments. Keep the chosen derivation stable across restore and retry.

Acceptance: pure tests for separator-bearing inputs, empty strings if admitted, Unicode, length bounds, and distinct tenants; one provider-stub test that proves the two obligations cause two independent effects. This changes a proposed E-58 choice and needs the owner's ruling before the Spec changes.

### DUR-03. Negative reconciliation can loop instead of returning to a call

Severity: major. Evidence: contradictory pinned steps. New.

Sources: `design/specs/effects/claim-call-settle.sdp.md:60`, `:74`, `:86`, `:95`.

The contract says a reconciliation result of `retryable` proves the provider never saw the attempt and a new call is safe. `settleStep5` selects `reconcile` whenever the policy is `reconcileFirst`, including after that negative reconciliation. Following the steps produces reconciliation, negative answer, reconciliation again, until the budget is exhausted, without ever making the safe call.

The expiry branch also forces `reuseProviderKey` into reconciliation while its handler is allowed to omit `reconcile`. If negative reconciliation were changed to select a call, `claimStep5` would still force an expired key back to reconciliation. These paths need one explicit mode transition table.

Recommended action: pin next mode by current mode, report meaning, and policy. Distinguish provider-confirmed absence from failure to query the provider. Define what an expired-key handler without reconciliation can do, normally needs attention unless another declared safe policy applies.

Acceptance: a pure transition table followed by native tests of a negative reconciliation leading to exactly one call, an unavailable reconciliation leading to no blind call, and expired reuse with and without a reconciliation handler.

### DUR-04. Terminal late evidence has no reconciliation exit

Severity: major. Evidence: contradictory promised outcome and example assertions. New, adjacent to the existing late-evidence schema finding.

Sources: `design/specs/effects/external-effects.stale-worker-after-cancellation.sdp.md:25`, `:34`; `design/specs/obligations/operator-operations.sdp.md:46`; `design/specs/obligations/retention-and-restore.sdp.md:70`; `design/specs/obligations/lifecycle-transitions.sdp.md` terminal and late-evidence rules.

The example promises that late provider evidence after cancellation is kept and reconciled. Its assertions only keep the evidence and set `reconcileRequested`; they explicitly refuse operator reconciliation because the obligation is terminal. Nothing records that a person inspected and resolved this flag without changing the terminal status. Compensation being a new operation does not define how it consumes or links to this unresolved report.

This also conflicts with restore completion, which requires that no obligation remain flagged `reconcileRequested`. A terminal flagged obligation can satisfy neither the reconciliation entry rules nor the restore completion condition.

Recommended action: define a recorded acknowledgement or reconciliation result for terminal late evidence while retaining the original terminal status. Pin how a compensating operation references it. Do not add a new lifecycle state unless a concrete scenario requires one.

Acceptance: cancel, receive late confirmation, resolve it without stale status overwrite, run restore completion, and prove the same evidence cannot cause duplicate compensation.

### DUR-05. Deadline enforcement is absent before executing a queued attempt

Severity: major. Evidence: missing precondition in the pinned sequence. New.

Sources: `design/specs/obligations/local-reaction-wrapper.sdp.md:60` through `:68`; `design/specs/effects/claim-call-settle.sdp.md:82` through `:87`; `design/specs/obligations/lifecycle-transitions.sdp.md` exhausted-deadline rule.

The local wrapper checks the deadline only while scheduling another attempt after a failure. A first dispatch delayed past its deadline still enters the body and can succeed. A maintenance deferral keeps the attempt alive without a deadline check. The external claim similarly has no deadline precondition before dispatching the provider action. A deadline field on the record therefore does not enforce an execution deadline.

Recommended action: define whether deadline means latest start, latest retry admission, or a business expiry. If it limits execution, check it immediately before body execution or external claim. A queued call that passes a claim-time check may still start later, so the external action needs the corresponding admission rule too. Separately specify whether an operator retry extends a budget or deadline; do not infer that from incrementing the attempt number.

Acceptance: native cases where the first dispatch is delayed past deadline, a pause spans the deadline, and an operator retries exhausted work. Assert the exact operator outcome and that prohibited bodies or provider calls do not execute.

### DUR-06. Retention does not encode every repetition horizon it promises to respect

Severity: major. Evidence: rule versus bound mismatch. New.

Sources: `design/specs/obligations/retention-and-restore.sdp.md:40`, `:50`, `:60`, `:63`; `design/specs/obligations/obligation-module.sdp.md` `createStep1`.

The rule retains completed obligations until every retry, redelivery, and replay horizon has closed. The executable rule for the horizon is only the greater of 30 days and provider-key validity in the current registry. It has no input for a longer upstream redelivery or replay contract. Removing a handler version or reducing its policy can also shorten the retention of previously accepted work because retention deliberately reads current configuration rather than accepted terms.

For example, a 90-day upstream redelivery contract with a one-day provider key falls outside a 30-day retention rule. After deletion, the same effect key looks new to `createObligation` and the provider need no longer deduplicate it.

Recommended action: make the relevant accepted repetition horizon explicit, or retain a compact deduplication identity for the longer contract. Require a deliberate policy for old work when configuration changes. Do not solve this by retaining every diagnostic forever.

Acceptance: boundary tests for 30 versus 90 days, handler removal, policy shortening, and a redelivery after bulky evidence was compacted. A compact identity must still prevent an unintended second effect.

### DUR-07. The dispatch switch does not stop actions already queued by a claim

Severity: major. Evidence: pinned transaction sequence. New, related to `r3-architecture-sweeper-runs-under-the-restore-door`.

Sources: `design/specs/effects/claim-call-settle.sdp.md:83`, `:87` through `:89`; `design/specs/obligations/retention-and-restore.sdp.md:65`, `:69`.

Only the claim reads `OBLIGATIONS_DISPATCH`. A claim can commit and schedule its action immediately before the operator turns dispatch off. The action then passes `readForCall` and calls the provider while dispatch is off. The restore workflow has no drain or fence for claims already admitted, yet its wording promises no provider call while off.

Recommended action: distinguish stopping new claims from quiescing provider calls. The restore procedure needs a stated treatment of queued and in-flight actions before it starts checking restored data. An action-side check narrows the window but cannot cancel a network call already sent. Use a drain or uncertainty/reconciliation procedure for those calls.

Acceptance: hold an action after claim and before provider dispatch, turn the switch off, and prove the promised restore behavior. Repeat with a provider call already in flight and preserve uncertainty until evidence resolves it. Convex documents that cancelling a running scheduled function does not stop it: [Scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions).

### DUR-08. Large fan-out contradicts the helper's universal 16-obligation bound

Severity: major before a large fan-out is built. Evidence: incompatible pinned bounds. New.

Sources: `design/specs/obligations/fan-out-and-chains.sdp.md:45`, `:46`, `:51`, `:53`, `:60`.

The Spec says `createObligation` counts calls per mutation context and throws at the seventeenth. It also says a fan-out body's mutation creates up to 500 derived obligations. No separate helper or admitted mode exempts that body. An implementer must either bypass the bound or fail at item 17. The prose also alternates between one child for every remaining page and one child for the next page, which changes scheduling cost.

Recommended action: keep large fan-out deferred until its trigger. When it is needed, give the publishing command and the fan-out body distinct explicit budgets, with the continuation charged to the latter. Use one successor page unless a measured need justifies scheduling all remaining pages. Derive the byte and schedule limits together.

Acceptance: boundary cases at 16 and 17 static obligations and above 16 dynamic recipients, with rollback of an incomplete page and bounded continuation. Link this to `r3-convex-remaining-batches-bounded-in-documents-only`, which already records that 500 maximum-sized payloads exceed the transaction byte budget.

## Existing findings that remain material

The following are confirmations or related observations, not new findings to add again.

| Existing ledger item | What the current text still needs | Build priority |
| --- | --- | --- |
| `r3-sdp-handler-registry-three-shapes` | One registry entry for local handlers and a clear selection by obligation kind. `entry.maxAttempts` cannot come from a bare function reference. | Before the first Layer 3 handler |
| `r3-architecture-authority-recheck-names-no-permission` | The stored authority or handler policy must identify the permission and subject being rechecked. | Before any deferred authority is trusted |
| `r3-sdp-chain-bound-has-no-writer` | A failure inside the nested body needs an outer classifier that actually records `chainBound`. | Before reaction chains |
| `r3-sdp-late-evidence-field-cannot-hold-what-is-written` | The late report and compacted count must fit a declared schema. `CompletionEvidence[]` does not admit an ambiguous provider report or a count. | Before external effects |
| `r3-architecture-lease-outlives-running` | Clear or stop treating the lease as live when the running attempt settles to pending or needs attention. | Before operator reconciliation |
| `r3-sdp-terminal-patches-omit-what-lifecycle-requires` | Pin one terminal cleanup rule and apply it to every transition. | Before the lifecycle is implemented |
| `r3-sdp-rearm-bound-off-by-one` | Choose whether five means five rearms or escalation on the fifth observation. The steps and sixth-kill example disagree. | Before sweeper acceptance |
| `r3-architecture-sweeper-scan-blocked-by-backlog` | A scan repeatedly taking the same healthy queued head must still reach failed work behind it. | Before recovery is claimed |
| `r3-convex-sweeper-reads-conflict-with-dispatches` | Measure recovery progress during a draining backlog. Do not accept the proposed stale-read fix without its safety argument and pinned API proof. | Native contention proof |
| `r3-architecture-sweeper-runs-under-the-restore-door` | Cron recovery and reconciliation must obey the same restore ordering as explicit schedule rebuild. | Before durable restore |
| `r3-convex-rebuild-schedules-cursor` | One cursor needs a defined phase and stable enumeration. Do not page a key that the pass moves without a stopping rule. | Before durable restore |
| `r3-convex-node-runtime-handler-has-no-action` | Separate Node actions from mutations and runtime-neutral policy. Prefer omitting Node support until a real handler needs it. | Before a Node provider SDK |
| `r3-sdp-completion-query-two-shapes` | A product actor needs an authorized completion query; an operator-only inspection query is not that contract. | Before a product consumes obligations |
| `r3-architecture-events-evidence-needs-ids-the-command-does-not-return` | Choose a compact evidence reference that a real handler can produce without hidden extra context reads. | First local reaction |
| `r3-architecture-derived-command-nested-where-a-helper-suffices` and its fidelity companion | Weigh the ordinary pipeline helper inside the wrapper's existing rollback boundary. | First local reaction |
| `r3-fidelity-derived-command-receipt-question-not-on-a-spec` | The owner decides whether the wrapper's atomic completion already supplies the needed retry protection for this path. | First local reaction |
| `r3-fidelity-layer-4-5-rulings-beyond-d16-d17` | Mark product policies about approval revocation and agent execution as proposals, not consequences of the doc. | Before those triggers |

One ledger entry is stale in part. `r3-convex-obligation-list-returns-rejects-paginate-result` still describes a handwritten three-field page validator, but `operator-operations.sdp.md:54` now uses `paginationResultValidator(v.any())`. The specific page-shape contradiction is gone. The unpinned item DTO remains. Review this status at the next ledger reconciliation rather than implementing its obsolete fix text.

## Steering for Layers 4 to 6

The triggers are useful and should remain. These layers need no tables or registries yet. The existing rules preserve the command boundary for agents, separate budget money from concurrency slots, keep local multi-context work atomic, and reserve asynchronous reads for a stated need.

Three small improvements would make later acceptance more precise without building anything early:

1. The cross-stream online-rebuild example asserts equality to a source cut while also requiring coverage of events and subjects created after that cut. Name the initial cut and the final catch-up/cutover condition separately when the trigger fires. A fixed old cut and complete inclusion of later writes are different assertions.
2. The approval-race example should define which actor's revocation invalidates which approval and whether blocked execution leaves any audit fact. These are product policies. Do not let a test author settle them through one expected value.
3. The workflow restart example should count provider effects separately from attempts to request an already-deduplicated obligation. A retried request can be correct without causing a second effect; the acceptance test should prove the business guarantee it names.

Before introducing a contiguous consumer sequence, revisit the native alternative already recorded as `r3-convex-commit-timestamp-not-weighed`. Current Convex documents commit timestamps and a matching snapshot bound. These can support ordered scans without a counter, but do not alone supply a consumer's gap semantics, immutable historical state, cross-context event meaning, or a complete rebuild algorithm. Probe the required behavior on the pinned backend and let the owner decide whether the doc changes. [Commit timestamp](https://docs.convex.dev/database/advanced/commit-timestamp).

## Coverage and limits

Every Spec in `design/specs/obligations/`, `effects/`, `processes/`, `agents/`, and `advanced/` was read, including all example Specs. The 43-member Pack resolves with no graph findings. Its 43 members have no enabled verifier binding, consistent with these capabilities being unimplemented. The corpus inventory beside this report lists each file and its review area.

No Layer 3 to 6 source was implemented, no Spec was edited, and no owner question was settled. The proposed fixes are steering, not approved intended truth. Current official documentation was checked on 2026-10-02 for scheduling, runtime separation, and commit timestamps. It does not substitute for the project's pinned native proofs.
