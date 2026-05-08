# Architect Spec Cleanup Report

**Date:** 2026-05-09
**Branch:** `architect/value-tranfer`
**Audit basis:** current branch state after Tasks 1 through 9, current architect graph query output, and the in-repo doctrine sources under `libar-platform/architect/_shared/`

This report is the durable deletion audit for the spec cleanup branch. It is written against the branch as it exists now, not against the earlier transfer session snapshot. The branch already deleted 21 design specs and one linked stub file. Relative to `main`, the branch currently stands at **18 added**, **37 modified**, and **22 deleted** files.

## 1. Current Verdict

| Category                           | Count | Current truth                                                                         |
| ---------------------------------- | ----: | ------------------------------------------------------------------------------------- |
| Standard gate-passing deletions    |    19 | Deleted on this branch after value transfer completed and carrier continuity verified |
| Narrative-only deletion exemptions |     2 | Deleted on this branch under a zero-Rule, zero-transfer exemption                     |
| Still blocked                      |     3 | Kept because the deletion gate still fails                                            |
| Meta exemption, keep               |     1 | `PackageArchitecture` stays as a structural policy record                             |
| Active, keep                       |     3 | `AgentBCComponentIsolation`, `AgentLLMIntegration`, `ProcessEnhancements`             |
| Roadmap, keep                      |    12 | Future work remains design-owned                                                      |
| Roadmap, reclassify                |     3 | `TestContentBlocks`, `ThemedDecisionArchitecture`, `AgentAdminFrontend`               |
| Original audited population        |    43 | Reconciled total                                                                      |

Additional branch facts:

- The 22 deleted files are 21 design specs plus `libar-platform/architect/stubs/testing-bdd-infrastructure/bdd-infrastructure.ts`.
- The four foundational carve-out carriers are intentionally **completed but transitional**. They preserve graph continuity and transferred rule text, but they are still non-runnable `@stub` carriers until backlog items `T5-009` and `T5-010` land.
- Task 9 cleared the review-listed F4 and F5 branch regressions. The current `pnpm architect:query -- arch dangling` output now reports **12 unrelated or pre-existing unresolved edges**, which are disclosed in Section 6.

## 2. Doctrine Sources Used For This Reconciliation

This report cites only in-repo doctrine and decision records.

- `libar-platform/architect/_shared/value-transfer.md`
- `libar-platform/architect/_shared/annotation-ownership.md`
- `libar-platform/architect/_shared/spec-pattern-relationships.md`
- `libar-platform/architect/_shared/four-tier-ladder.md`
- `libar-platform/architect/_shared/fsm-transitions.md`
- `libar-platform/architect/decisions/pdr-022-value-transfer-doctrine-adoption.feature`
- `docs/project-management/IMPROVEMENT_BACKLOG.md`, for backlog items `T5-009` and `T5-010`

No off-branch doctrine paths are used as authority here.

## 3. Audit Rules Applied

The standard pre-deletion gate comes from `value-transfer.md`.

1. The deleted design spec had a forward link to an executable carrier.
2. That forward link resolved to a real file or directory under `tests/features/`.
3. The executable carrier held `@architect-implements:<Pattern>` for the semantic pattern being removed.
4. The substantive `Rule:` content from the design spec was preserved in the carrier.
5. The architectural rationale survived the delete, either in the executable carrier itself or, where it materially belonged, in additive source annotations.

Two extra doctrine notes matter here.

- `spec-pattern-relationships.md` allows `<Pattern>ExecutableTests` carve-outs for older shipped patterns, but the carrier must keep the semantic pattern name bare through `@architect-implements:<Pattern>`.
- `fsm-transitions.md` makes workflow completion and evidence maturity separate concerns. That is why the four carve-out carriers can remain `@architect-status:completed` while this report still labels them transitional and non-runnable.

## 4. Per-Pattern Deletion Audit Matrix

### 4.1 Standard gate-passing deletions, 19 specs

| Pattern                      | Deleted source spec                                                              | Durable carrier after delete                                                                                                                                                       | Rules preserved | Gate status              | Audit notes                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AgentAsBoundedContext        | `libar-platform/architect/specs/platform/agent-as-bounded-context.feature`       | `libar-platform/packages/platform-core/tests/features/behavior/agent/`                                                                                                             |               6 | G1-G5 pass               | Reverse links live across the agent behavior carrier set. Rationale survives in the carrier prose and existing package source annotations.                                                                                                                                                                 |
| BddTestingInfrastructure     | `libar-platform/architect/specs/platform/bdd-testing-infrastructure.feature`     | `libar-platform/packages/platform-core/tests/features/behavior/testing/`                                                                                                           |               5 | G1-G5 pass               | `world.feature`, `guards.feature`, `polling.feature`, `integration-isolation.feature`, and `platform-coverage.feature` share the carrier burden. The extra executable rule material lives in `platform-coverage.feature`, which is why more than one carrier file keeps the same semantic continuity edge. |
| BoundedContextFoundation     | `libar-platform/architect/specs/platform/bounded-context-foundation.feature`     | `libar-platform/packages/platform-bc/tests/features/behavior/bounded-context-foundation-executable-tests.feature`                                                                  |               5 | G1-G5 pass, transitional | Refactoring carve-out carrier created under the bare semantic name contract from PDR-022. All transferred scenarios are `@stub`. Backlog: `T5-009`, then `T5-010`.                                                                                                                                         |
| CommandBusFoundation         | `libar-platform/architect/specs/platform/command-bus-foundation.feature`         | `libar-platform/packages/platform-bus/tests/features/behavior/command-bus-foundation-executable-tests.feature`                                                                     |               5 | G1-G5 pass, transitional | Same carve-out status as above. The carrier is graph-valid and prose-complete, but not yet runnable. Backlog: `T5-009`, then `T5-010`.                                                                                                                                                                     |
| DeciderPattern               | `libar-platform/architect/specs/platform/decider-pattern.feature`                | `libar-platform/packages/platform-decider/tests/features/behavior/decider-outputs.feature`, `libar-platform/packages/platform-fsm/tests/features/behavior/fsm-transitions.feature` |               5 | G1-G5 pass               | Transfer stayed split across the decider and FSM executable surfaces because the deleted spec covered both pure decision output and transition discipline.                                                                                                                                                 |
| DurableEventsIntegration     | `libar-platform/architect/specs/platform/durable-events-integration.feature`     | `libar-platform/examples/order-management/tests/integration-features/durability/`                                                                                                  |               8 | G1-G5 pass               | Six integration carriers now hold the transferred durability rules, including the previously called-out outbox-handler rule coverage note.                                                                                                                                                                 |
| DurableFunctionAdapters      | `libar-platform/architect/specs/platform/durable-function-adapters.feature`      | `libar-platform/packages/platform-core/tests/features/behavior/durable-function-adapters/`                                                                                         |               3 | G1-G5 pass               | Existing behavior carriers were already the truthful durability surface, so the branch deleted the planning duplicate after continuity checks.                                                                                                                                                             |
| DynamicConsistencyBoundaries | `libar-platform/architect/specs/platform/dynamic-consistency-boundaries.feature` | `libar-platform/packages/platform-core/tests/features/behavior/dcb/`                                                                                                               |               5 | G1-G5 pass               | Transfer remains on the DCB behavior carrier set, not in doctrine prose.                                                                                                                                                                                                                                   |
| EcstFatEvents                | `libar-platform/architect/specs/platform/ecst-fat-events.feature`                | `libar-platform/packages/platform-core/tests/features/behavior/ecst/`                                                                                                              |               4 | G1-G5 pass               | Existing executable carriers now hold the deleted pattern's rule content and continuity tag.                                                                                                                                                                                                               |
| EventReplayInfrastructure    | `libar-platform/architect/specs/platform/event-replay-infrastructure.feature`    | `libar-platform/packages/platform-core/tests/features/behavior/event-replay/replay-progress.feature`                                                                               |               5 | G1-G5 pass               | The replay-progress carrier is the durable runtime proof surface after transfer.                                                                                                                                                                                                                           |
| EventStoreDurability         | `libar-platform/architect/specs/platform/event-store-durability.feature`         | `libar-platform/packages/platform-core/tests/features/behavior/event-store-durability/`                                                                                            |               7 | G1-G5 pass               | Runtime durability rules now live in the platform-core event-store-durability carrier set.                                                                                                                                                                                                                 |
| EventStoreFoundation         | `libar-platform/architect/specs/platform/event-store-foundation.feature`         | `libar-platform/packages/platform-store/tests/features/behavior/event-store-foundation-executable-tests.feature`                                                                   |               5 | G1-G5 pass, transitional | Refactoring carve-out carrier. Completed for graph continuity and preserved rule text, not yet runnable. Backlog: `T5-009`, then `T5-010`.                                                                                                                                                                 |
| ProjectionCategories         | `libar-platform/architect/specs/platform/projection-categories.feature`          | `libar-platform/packages/platform-core/tests/features/behavior/projection-categories/`                                                                                             |               5 | G1-G5 pass               | The stale `tests/unit/projections` pointer was replaced with the real behavior carrier directory before deletion.                                                                                                                                                                                          |
| ReactiveProjections          | `libar-platform/architect/specs/platform/reactive-projections.feature`           | `libar-platform/packages/platform-core/tests/features/behavior/reactive-projections/`                                                                                              |               5 | G1-G5 pass               | Four executable carriers now preserve the deleted spec's rule set.                                                                                                                                                                                                                                         |
| ReservationPattern           | `libar-platform/architect/specs/platform/reservation-pattern.feature`            | `libar-platform/packages/platform-core/tests/features/behavior/reservation/`                                                                                                       |               5 | G1-G5 pass               | Reservation behavior already had the right executable surface. The delete removed only the duplicate design carrier.                                                                                                                                                                                       |
| SagaOrchestration            | `libar-platform/architect/specs/platform/saga-orchestration.feature`             | `libar-platform/packages/platform-core/tests/features/behavior/orchestration/saga-orchestration-executable-tests.feature`                                                          |               5 | G1-G5 pass, transitional | Refactoring carve-out carrier. Completed for continuity, still non-runnable until `T5-009` and `T5-010`.                                                                                                                                                                                                   |
| WorkpoolPartitioningStrategy | `libar-platform/architect/specs/platform/workpool-partitioning-strategy.feature` | `libar-platform/packages/platform-core/tests/features/behavior/workpool-partitioning/`                                                                                             |               6 | G1-G5 pass               | Three executable carriers now hold the partitioning rule content.                                                                                                                                                                                                                                          |
| AgentChurnRiskCompletion     | `libar-platform/architect/specs/example-app/agent-churn-risk-completion.feature` | `libar-platform/examples/order-management/tests/features/behavior/agent/`                                                                                                          |               3 | G1-G5 pass               | The canonical carrier is the whole `tests/features/behavior/agent/` directory. `on-complete.feature` now carries the LLM-essential, approval-expiration, and command-to-domain-record rules, so this is no longer a TS-only transfer claim.                                                                |
| ExampleAppModernization      | `libar-platform/architect/specs/example-app/example-app-modernization.feature`   | `libar-platform/examples/order-management/tests/features/modernization/`                                                                                                           |               4 | G1-G5 pass               | The runtime modernization carriers absorbed the deleted design rules without changing the bare semantic name.                                                                                                                                                                                              |

### 4.2 Narrative-only deletion exemptions, 2 specs

These two files were deleted under a separate category. They were not standard gate-passing value transfers because there was no transferable rule content.

| Pattern                  | Deleted source spec                                                 | Why the standard gate did not apply                                                                                                                                              | Audit verdict                                                   |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ProcessMetadataExpansion | `libar-platform/architect/specs/process-metadata-expansion.feature` | The file had **0 Rule blocks** and **0 invariants**. It was a completion narrative for shipped process metadata work, not a behavioral design spec awaiting executable transfer. | Deleted under a narrative-only, zero-transfer exemption.        |
| RepoLevelDocsGeneration  | `libar-platform/architect/specs/repo-level-docs-generation.feature` | The file had **0 Rule blocks** and **0 invariants**. It served as a completion record for docs generation tooling that already shipped.                                          | Deleted under the same narrative-only, zero-transfer exemption. |

This distinction addresses the H4 doctrine review finding directly. These deletions were harmless, but they were not examples of the normal five-step transfer gate.

## 5. Transitional Carve-Out Disclosure

The following carriers are graph-valid, source-of-truth-preserving, and still non-runnable today.

| Semantic pattern         | Transitional carrier                                                                                                      | Current truth                                                                 | Backlog            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| BoundedContextFoundation | `libar-platform/packages/platform-bc/tests/features/behavior/bounded-context-foundation-executable-tests.feature`         | Completed record, all transferred scenarios marked `@stub`, harness not wired | `T5-009`, `T5-010` |
| CommandBusFoundation     | `libar-platform/packages/platform-bus/tests/features/behavior/command-bus-foundation-executable-tests.feature`            | Completed record, all transferred scenarios marked `@stub`, harness not wired | `T5-009`, `T5-010` |
| EventStoreFoundation     | `libar-platform/packages/platform-store/tests/features/behavior/event-store-foundation-executable-tests.feature`          | Completed record, all transferred scenarios marked `@stub`, harness not wired | `T5-009`, `T5-010` |
| SagaOrchestration        | `libar-platform/packages/platform-core/tests/features/behavior/orchestration/saga-orchestration-executable-tests.feature` | Completed record, all transferred scenarios marked `@stub`, harness not wired | `T5-009`, `T5-010` |

This is intentional transitional state, not hidden runnable coverage. The branch keeps these carriers because they preserve the semantic graph and transferred rule text now, while the backlog tracks harness wiring and post-wiring expansion separately.

## 6. Remaining Dangling State After Task 9

Task 9 fixed the review-listed branch regressions on the F4 and F5 lines. The stable graph is not fully clean yet. The current dangling query reports **12 unresolved edges** that remain unrelated to the completed transfer work.

| Pattern                                             | Remaining missing references           |
| --------------------------------------------------- | -------------------------------------- |
| OrderManagementInfrastructure                       | `Workpool`, `Workflow`                 |
| Agent Component, Dead Letter Public API, DS-1 Stub  | `AgentDeadLetter`                      |
| Agent Component Definition, DS-1 Stub               | `AgentBCConfig`                        |
| Agent Component, Command Public API, DS-1 Stub      | `EmittedAgentCommand`                  |
| Agent Component, Checkpoint Public API, DS-1 Stub   | `AgentCheckpoint`                      |
| Agent Component, Audit Public API, DS-1 Stub        | `AgentAuditEvent`                      |
| Agent Component, Approval Public API, DS-1 Stub     | `PendingApproval`, `HumanInLoopConfig` |
| Cross-Component Query Types for Agent BC, DS-1 Stub | `AgentBCConfig`                        |
| OrderCommandHandlers                                | `OrderRepository`                      |
| InventoryCommandHandlers                            | `InventoryRepository`                  |

Nothing in this remaining set is a reopened F4 or F5 regression. The cleanup report needs to record that plainly so later sessions do not mistake unrelated graph debt for a failure of the completed transfer work.

## 7. Still Blocked And Kept Specs

| Pattern                        | Current blocker                                                                                                                                        | Why it still stays                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| ConfirmedOrderCancellation     | The spec is still `@architect-status:active` even though the rule transfer is complete.                                                                | Deletion waits on the honest FSM transition to `completed`. This is a workflow-truth blocker, not a missing transfer blocker. |
| AgentCommandInfrastructure     | The supposed carrier directory still does not exist as a truthful boundary and the semantic coverage remains mixed into the parent agent behavior set. | Needs a targeted refactor session to repoint carriers and add continuity tags before deletion can be honest.                  |
| CodecDrivenReferenceGeneration | The old forward link still points at a non-existent location and the live executable truth is split under a different semantic name.                   | Needs a naming decision and continuity repair before any delete is safe.                                                      |

## 8. Retained Non-Deleted Specs

### 8.1 Meta exemption, keep

| Pattern             | Why it stays                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PackageArchitecture | Structural policy record. It is not honest to force this into an executable behavior carrier, so the spec remains the durable source. |

### 8.2 Active keep

| Pattern                   | Why it stays                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| AgentBCComponentIsolation | In-flight implementation work. Not deletion-eligible.            |
| AgentLLMIntegration       | In-flight work and still blocked by `AgentBCComponentIsolation`. |
| ProcessEnhancements       | Phase 100 epic, still planning-owned.                            |

### 8.3 Roadmap keep

`AdminToolingConsolidation`, `CircuitBreakerPattern`, `ComponentBoundaryAuthenticationConvention`, `DeterministicIdHashing`, `EventCorrectnessMigration`, `HealthObservability`, `IntegrationPatterns21a`, `IntegrationPatterns21b`, `ProductionHardening`, `Tranche0ReadinessHarness`, `Tranche0ReleaseCiDocsProcessGuardrails`, `Tranche1SupportingSecurityContractSweep`.

### 8.4 Roadmap reclassify

- `TestContentBlocks`
- `ThemedDecisionArchitecture`
- `AgentAdminFrontend`

## 9. Docs-Living Parity Requirement

The generated docs under `libar-platform/docs-living/` are projections of this source graph. They must always be regenerated after spec deletions or carrier-link changes. This report should be read together with a successful `pnpm docs:all` run and a clean parity check on `libar-platform/docs-living/`.
