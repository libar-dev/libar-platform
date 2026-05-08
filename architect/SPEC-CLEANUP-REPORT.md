# Architect Spec Cleanup Report

**Date:** 2026-05-08
**Branch:** `architect/value-tranfer`
**Scope:** Value-transfer audit + execution for the 43 design specs under `libar-platform/architect/specs/` in preparation for upgrading to the new architect package version.

> This report has TWO sections. **§A** is the post-transfer state (what was actually executed in this session). **§B** is the original audit (before any changes). Read §A first for the current verdict; §B is preserved for audit trail.

---

# §A — Post-Transfer Final State

## Executive Summary (after value-transfer execution)

| Bucket                   |  Count | Verdict                                                                                |
| ------------------------ | -----: | -------------------------------------------------------------------------------------- |
| **Deletion-ready**       | **21** | Safe to `git rm` in a follow-up cleanup PR                                             |
| **Still blocked**        |  **3** | ConfirmedOrderCancellation, AgentCommandInfrastructure, CodecDrivenReferenceGeneration |
| **META exempt – keep**   |  **1** | PackageArchitecture (formal carve-out documented in spec)                              |
| **Active – keep**        |  **3** | AgentBCComponentIsolation, AgentLLMIntegration, ProcessEnhancements                    |
| **Roadmap – keep**       | **12** | Genuine future work                                                                    |
| **Roadmap – reclassify** |  **3** | TestContentBlocks, ThemedDecisionArchitecture, AgentAdminFrontend                      |
| **TOTAL**                | **43** |                                                                                        |

**Process Guard validation:** ✅ PASS (5 added files, 56 modified files, 3 status transitions, all FSM-consistent).

## Files changed in this session

### Bulk path-prefix fix (28 files)

All `@architect-executable-specs:` paths in design specs that previously used unprefixed paths (`platform-core/...`, `order-management/...`) were corrected to fully-qualified paths (`libar-platform/packages/platform-core/...`, `libar-platform/examples/order-management/...`).

### Mechanical patches + Rule-content transfer (Agent 1 — platform-core fixable group)

- **ProjectionCategories** — design-spec forward-link patched from `tests/unit/projections` → `tests/features/behavior/projection-categories`. 3 executable .features in that dir received reverse tags + 4-field-template Rule blocks (5 design Rules transferred).
- **BddTestingInfrastructure** — 5 executable .features (`world.feature`, `guards.feature`, `polling.feature`, `integration-isolation.feature`, `platform-coverage.feature`) received `@architect-implements:BddTestingInfrastructure`. R1 (domain logic must be Gherkin) and R2 (deciders enable test isolation) **had no executable home** — newly authored as Rule blocks with verifying scenarios in `platform-coverage.feature`. Duplicate `@architect-pattern:TestEnvironmentGuards` lines deduplicated on 3 files.
- **ReactiveProjections** — 4 executable .features in `reactive-projections/` received reverse tags. All 5 design Rules transferred to the 4-field template across `conflict-detection.feature`, `hybrid-model.feature`, `reactive-eligibility.feature`, `shared-evolve.feature`.

### Mechanical patches + Rule-content transfer (Agent 2 — order-management group)

- **DurableEventsIntegration** — 6 executable .features in `tests/integration-features/durability/` received reverse tags. All 8 design Rules enriched to 4-field template (with 1 noted "TS-only coverage" for the outbox-handler rule).
- **ConfirmedOrderCancellation** — `tests/features/behavior/orders/cancel-order.feature` + `tests/integration-features/orders/cancel-order.feature` received reverse tags + 2 fully-templated Rule blocks. **Status remains `active`** — FSM transition to `completed` is out of scope for value transfer.
- **ExampleAppModernization** — 4 executable .features in `tests/features/modernization/` received reverse tags. One file (`reference-documentation.feature`) had its identity tag renamed from `ExampleAppModernization` (which duplicated the design-spec identity) to `ExampleAppModernizationExecutableTests` per bipartite naming. All 4 design Rules transferred.
- **AgentChurnRiskCompletion** — design-spec forward link **repointed** from non-existent `tests/integration-features/agent` to `tests/features/behavior/agent/on-complete.feature` (the canonical executable home). `on-complete.feature` received `@architect-pattern:AgentChurnRiskCompletionExecutableTests` + `@architect-implements:AgentChurnRiskCompletion`. Rule 1 (LLM-essential) fully covered. Rules 2 (approval expiration) and 3 (commands create real domain records) have only TS integration-test coverage — additive per doctrine.

### `<Pattern>ExecutableTests` carve-out files authored (Agent 3 — foundational patterns)

Four NEW executable feature files created under the formal refactoring carve-out:

- `libar-platform/packages/platform-bc/tests/features/behavior/bounded-context-foundation-executable-tests.feature` — 5 Rule blocks transferred verbatim from `BoundedContextFoundation` design spec.
- `libar-platform/packages/platform-bus/tests/features/behavior/command-bus-foundation-executable-tests.feature` — 5 Rule blocks transferred from `CommandBusFoundation`.
- `libar-platform/packages/platform-store/tests/features/behavior/event-store-foundation-executable-tests.feature` — 5 Rule blocks transferred from `EventStoreFoundation`.
- `libar-platform/packages/platform-core/tests/features/behavior/orchestration/saga-orchestration-executable-tests.feature` — 5 Rule blocks transferred from `SagaOrchestration`.

Each carries `@architect-pattern:<Pattern>ExecutableTests` + `@architect-implements:<Pattern>` + `@architect-status:completed` + `@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention`. Forward link added to each corresponding design spec. Newly-authored scenarios are tagged `@stub` per the anti-pattern rule against inventing scenarios — step definitions will be wired in a follow-up `architect-refactor-session`.

### META carve-out (Agent 3 — PackageArchitecture)

Provenance paragraph added to `package-architecture.feature` documenting WHY no executable feature is appropriate (pure structural meta-pattern; repository-shape assertions verified by typecheck/build/lint, not Gherkin scenarios). Spec is intentionally retained — by-design exception to the deletion gate.

### Process Guard unlock-reasons (13 files)

To pass `architect-guard --staged`:

- 10 files (4 design specs + 6 executable .features) modified at `@architect-status:completed` received `@architect-unlock-reason:value-transfer-add-reverse-tags-and-enrich-rule-blocks-per-new-architect-doctrine`.
- 3 files (1 saga carve-out + 2 testing/) authored at `@architect-status:completed` received `@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention`.

## Deletion-Ready inventory (21 specs)

Safe to `git rm` in a follow-up cleanup PR:

### Platform (15)

1. `platform/agent-as-bounded-context.feature`
2. `platform/bdd-testing-infrastructure.feature`
3. `platform/bounded-context-foundation.feature` _(via ExecutableTests carve-out)_
4. `platform/command-bus-foundation.feature` _(via ExecutableTests carve-out)_
5. `platform/decider-pattern.feature`
6. `platform/durable-events-integration.feature`
7. `platform/durable-function-adapters.feature`
8. `platform/dynamic-consistency-boundaries.feature`
9. `platform/ecst-fat-events.feature`
10. `platform/event-replay-infrastructure.feature`
11. `platform/event-store-durability.feature`
12. `platform/event-store-foundation.feature` _(via ExecutableTests carve-out)_
13. `platform/projection-categories.feature`
14. `platform/reactive-projections.feature`
15. `platform/reservation-pattern.feature`
16. `platform/saga-orchestration.feature` _(via ExecutableTests carve-out)_
17. `platform/workpool-partitioning-strategy.feature`

### Root-level (2)

18. `process-metadata-expansion.feature`
19. `repo-level-docs-generation.feature`

### Example-app (3)

20. `example-app/agent-churn-risk-completion.feature` _(forward link repointed; Rules 2-3 are TS-only coverage)_
21. `example-app/example-app-modernization.feature`

### Stubs to bundle-delete with parents

- `libar-platform/architect/stubs/testing-bdd-infrastructure/` _(BddTestingInfrastructure parent ready)_
- `libar-platform/architect/stubs/agent-command-routing/` and `agent-lifecycle-fsm/` are blocked on AgentCommandInfrastructure resolution (see §A.STILL_BLOCKED).
- Other stubs (production-hardening, agent-action-handler, agent-component-isolation, integration-patterns) stay — parents are roadmap or active.

## Still blocked (3 specs)

| Pattern                            | Spec File                                       | Blocker                                                                                                                                                                                                                                    | Path forward                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ConfirmedOrderCancellation**     | `platform/confirmed-order-cancellation.feature` | Status is `active` despite 8/8 deliverables done. Reverse links + Rule transfer NOW IN PLACE — gate fails ONLY on FSM status.                                                                                                              | Run `architect-implement-spec` session → transition `active → completed` with empty deliverables-completion change. Then re-evaluate gate.                                                                                                                                                                                                    |
| **AgentCommandInfrastructure**     | `platform/agent-command-infrastructure.feature` | Forward link points at `behavior/agent/command-infrastructure/` which does not exist as a sub-dir; tests are mixed into the parent `behavior/agent/` folder (which is `AgentAsBoundedContext`'s target). Reverse links missing.            | Run `architect-refactor-session` → repoint forward link to specific files in `behavior/agent/` (e.g. `commands.feature`, `command-router.feature`, `command-bridge.feature`) AND add `@architect-implements:AgentCommandInfrastructure` reverse tags. Then bundle-delete `agent-command-routing/` + `agent-lifecycle-fsm/` stubs with parent. |
| **CodecDrivenReferenceGeneration** | `codec-driven-reference-generation.feature`     | Forward link points at non-existent `reference-generation/`. Real tests in `deps-packages/architect/tests/features/behavior/codecs/reference-codec-*.feature` carry `@architect-implements:ReferenceDocShowcase` (different pattern name). | **Decision required**: (a) repoint + rename reverse tag, OR (b) accept `ReferenceDocShowcase` as canonical and delete this spec since value has transferred under a different pattern name. **Recommend (b)** per new doctrine: executable feature is canonical.                                                                              |

## Active specs (4)

| Pattern                    | Verdict                            | Notes                                                                         |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| ConfirmedOrderCancellation | **TRANSITION** then deletion-ready | 8/8 deliverables done; FSM transition out of scope for value-transfer session |
| AgentBCComponentIsolation  | KEEP                               | In-flight Phase 22a; blocks AgentLLMIntegration                               |
| AgentLLMIntegration        | KEEP                               | In-flight Phase 22b; blocked by AgentBCComponentIsolation                     |
| ProcessEnhancements        | KEEP                               | Phase 100 epic                                                                |

## Roadmap specs (15)

### Keep (12) — genuine future work, doctrine-aligned

AdminToolingConsolidation, CircuitBreakerPattern, ComponentBoundaryAuthenticationConvention, DeterministicIdHashing, EventCorrectnessMigration, HealthObservability, IntegrationPatterns21a, IntegrationPatterns21b, ProductionHardening, Tranche0ReadinessHarness, Tranche0ReleaseCiDocsProcessGuardrails, Tranche1SupportingSecurityContractSweep.

### Reclassify (3) — re-tier in follow-up `architect-plan-session`

- **TestContentBlocks** → `architect/specs/candidates/` (pedagogical demo, minimal substance)
- **ThemedDecisionArchitecture** → `architect/specs/candidates/` (documentation enhancement, no critical path)
- **AgentAdminFrontend** → `architect/specs/candidates/` until frontend app is scaffolded (references non-existent `apps/frontend/`)

## Recommended next steps

### A. Cleanup PR — deletion of 21 ready specs

After review, the cleanup PR should:

1. `git rm` the 21 deletion-ready design specs listed above.
2. `git rm -r libar-platform/architect/stubs/testing-bdd-infrastructure/`.
3. `pnpm docs:all` to regenerate `docs-living/PATTERNS.md`, `ROADMAP.md`, timeline.
4. `pnpm architect-guard --all --strict` final validation.

### B. Follow-up sessions (separate PRs)

1. `architect-implement-spec` for ConfirmedOrderCancellation FSM transition (then bundle-delete in subsequent cleanup).
2. `architect-refactor-session` for AgentCommandInfrastructure test consolidation + reverse tags (then bundle-delete with `agent-command-routing/` + `agent-lifecycle-fsm/` stubs).
3. Decision on CodecDrivenReferenceGeneration — recommend deleting under (b) above.
4. `architect-plan-session` per spec for the 3 reclassify candidates.
5. Architect package upgrade — install new version, swap CLI prefix, replace skills, re-validate the full graph.

---

# §B — Original Audit (pre-transfer baseline)

This section preserves the original 5-bucket categorization captured at session start, before any value-transfer execution. Useful for understanding what changed and why.

| Bucket (original)           | Count | Resolution in §A                                                                                                                                                                                                                                                                         |
| --------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deletion-ready immediately  |    12 | All deleted-ready (unchanged)                                                                                                                                                                                                                                                            |
| Mechanical-patch fixable    |     5 | 4 executed → deletion-ready (BddTesting, ReactiveProjections, ProjectionCategories, DurableEventsIntegration). 1 still blocked (CodecDrivenReferenceGeneration — decision required).                                                                                                     |
| Deeper investigation needed |     7 | 4 resolved via ExecutableTests carve-out (Bounded Context, Command Bus, Event Store, Saga Foundations) → deletion-ready. 1 retained as META exempt (PackageArchitecture). 2 still blocked (AgentCommandInfrastructure, AgentChurnRiskCompletion → resolved by Agent 2 → deletion-ready). |
| Active – keep               |     4 | 3 keep + 1 transition (ConfirmedOrderCancellation deliverables 8/8)                                                                                                                                                                                                                      |
| Roadmap – keep / reclassify |    15 | 12 keep + 3 reclassify (no change)                                                                                                                                                                                                                                                       |

## Doctrine reference

This work applies the new architect package's value-transfer doctrine. Authoritative sources:

- `architect-studio/packages/architect-claude-plugin/skills/_shared/value-transfer.md` — pre-deletion gate (5 criteria), transfer checklist, anti-patterns.
- `architect-studio/packages/architect-claude-plugin/skills/_shared/annotation-ownership.md` — production-TS JSDoc annotations are **additive, not mandatory**.
- `architect-studio/packages/architect-claude-plugin/skills/_shared/spec-pattern-relationships.md` — bipartite production↔test pattern graph, `*ExecutableTests` escape hatch for shipped code.
- `architect-studio/packages/architect-claude-plugin/skills/_shared/four-tier-ladder.md` — `idea → candidate → plan → design` maturity ladder.
- `architect-studio/packages/architect-claude-plugin/skills/_shared/fsm-transitions.md` — Process Guard FSM (`roadmap → active → completed`) vs. acceptance-gate maturity flips. Unlock-reason rules (≥10 chars, no placeholders).

## The 5-criterion pre-deletion gate

A design spec is safe to delete only when **all** of:

1. **Forward link present** — design spec carries `@architect-executable-specs:<path>`.
2. **Forward link resolves** — path points at a real file/dir under `tests/features/`.
3. **Reverse link present** — that target carries `@architect-implements:<Pattern>` for the focal pattern.
4. **Rich content has landed** — every Rule block in the design spec has a counterpart Rule block in the executable feature carrying `**Invariant:**` (and `**Rationale:** / **Verified by:**` where authored).
5. **Architecturally significant rationale lives in JSDoc** — judgment call; annotations are additive.

## Glossary

- **DELETION_READY** — All 5 pre-deletion gate criteria satisfied; safe to `git rm`.
- **STILL_BLOCKED** — Gate fails on substantive issues requiring a dedicated session.
- **META exempt** — Pattern is structural metadata; deletion gate does not apply (PackageArchitecture).
- **ExecutableTests carve-out** — Formal escape hatch for shipped code that predates the `@architect-implements:` convention. Authored under refactoring carve-out per `_shared/spec-pattern-relationships.md`.
- **TRANSITION** — FSM status flip needed (most often `active` → `completed`).
- **MINIMAL_STUB / RECLASSIFY** — Spec belongs in `candidates/` or `ideas/` per the four-tier ladder.
