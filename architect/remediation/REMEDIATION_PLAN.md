# Platform Remediation Plan

> **Source**: Comprehensive 4-phase review in `.full-review/00-scope.md` … `.full-review/05-final-report.md`
> **Scope**: 329 findings across 8 dimensions for `platform-bc`, `platform-bus`, `platform-core`, `platform-decider`, `platform-fsm`, `platform-store`
> **Planning horizon**: ~6 tranches spanning ~Q2–Q3 2026
> **This document is a strategic plan, not an implementation guide.** Implementation is executed through the architect FSM workflow (`roadmap → active → completed`) in separate sessions, one pattern at a time, per `CLAUDE.md` rules.

> ### ⚠ Dependency Baseline Update (2026-04-22)
>
> Convex, Zod, uuid, vitest, and related toolchain dependencies have been **upgraded as a pre-requisite for this plan's execution**. The specific version numbers quoted in the `.full-review/04a-best-practices.md` environment inventory (Convex 1.31.7, Zod 4.2.1/4.3.6 split, uuid 13, etc.) are now out of date.
>
> **Implications for this plan:**
>
> | Finding / Theme                                    | Likely Status After Upgrade                                                   | Action                                                              |
> | -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
> | BC1 (phantom `@types/uuid`)                        | Likely resolved if `@types/uuid` removed during upgrade                        | **Verify**: `pnpm list @types/uuid`. If gone, close.                |
> | BC2 (`optionalPeerDependencies` non-standard field) | Unaffected by version bump — still needs remediation                          | Keep in P06                                                         |
> | BH5 (Convex peer range `<1.35.0`)                  | Almost certainly widened as part of upgrade                                   | **Verify** actual new range; re-assess if still too tight           |
> | BM4 (Zod peer dep on `platform-bc`)                | Unaffected by Zod version bump — structural                                   | Keep in P06 / Tranche 0                                             |
> | BM8 (Convex devDep drift `^1.17.0` vs `^1.31.0`)   | Likely resolved if upgrade aligned devDeps                                    | **Verify**                                                          |
> | SL7 (uuid v13 recently major)                      | Reassess against current uuid version                                         | Re-audit per current version                                        |
> | SL8 (Zod v4 migration risks)                       | Higher priority IF Zod 4.x minor jumped further; review schema call sites     | Add a verification pass to P07 / Tranche 0                           |
> | SL9 (unbounded peer ranges on `@convex-dev/*`)     | May or may not be addressed; still worth capping intentionally                | Keep as Tranche 0 cleanup                                            |
> | Phase 2 `v.any()` + `v.unknown()` guidance (P22)   | Zod v4.x tightened parser behavior — this raises the ROI of the migration     | Consider moving P22 earlier (optionally late Tranche 1) if the upgrade surfaced new implicit-acceptance bugs |
> | Phase 4 `verbatimModuleSyntax`, ESLint rules       | Orthogonal to version bumps — unchanged                                       | Proceed as planned                                                  |
> | Phase 4 `vitest-cucumber` version drift            | Likely resolved by upgrade                                                    | **Verify** single version across packages                            |
>
> **Mandatory first action in Tranche 0 P06:** run a diff against the original 04a environment inventory and produce a short "dependency status memo" that classifies each 04a finding as `closed`, `partial`, or `still-open`. Only the `partial` + `still-open` items remain in P06's scope. The memo is committed to `.full-review/04a-dependency-delta.md` so future sessions have a traceable baseline.
>
> **Post-upgrade regression risk:** a cross-package upgrade of this scope can surface latent schema-parse behavior changes (Zod v4 minor bumps have tightened discriminated unions and optional field handling), Convex validator semantics shifts, and vitest-cucumber step-resolution differences. Tranche 0 P01 (test harness) and P07 (lint/TS hardening) must run first to confirm the upgrade is green before any behavioral Tranche 1 fix begins. If any integration test is failing post-upgrade, that failure is the first thing to triage — NOT a sign to defer the plan.
>
> **The plan's ordering is unchanged.** The upgrade shrinks Tranche 0 slightly but does not reorder tranches. The Tranche 1 correctness work (globalPosition, auth, idempotency) is independent of dependency versions.

---

## 0. How to Use This Plan

### Reading order

1. **§1 Executive Summary** — one-page orientation
2. **§2 Required Context** — Convex/architect rules that constrain every remediation
3. **§3 Guiding Principles** — the five decisions that shape ordering
4. **§4 Tranche Roadmap** — the critical path at a glance
5. **§5–§10 Tranches** — self-contained work packages with test coverage and commit plan
6. **§11–§15 Operating Model** — tests, quality gates, commit discipline, risk, success criteria
7. **§16 Finding Disposition Matrix** — every Critical/High finding mapped to a tranche and pattern

### Conventions used in this plan

| Symbol            | Meaning                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `C1`, `SC1`, `PC1`, `TC1`, `DC1`, `BC1`, `OC1` | Finding IDs from the Phase 1A/1B/2A/2B/3A/3B/4A/4B raw files                                    |
| `Pxx`             | Pattern name assigned by this plan (e.g. `P01-auth-wrapper`). These become `@architect-pattern` tags when specs are drafted |
| `ADR-0xx`         | Architecture Decision Record. Numbered continuing from ADR-033 (last committed ADR)          |
| **Tranche N**     | A phase of remediation work; tranches may overlap at their seams but have a clear critical path |
| **Gate**          | A quality bar a pattern must clear before transitioning `active → completed`                 |

### What this plan is NOT

- Not an implementation plan — no file:line edits, no code. Implementation is done via planning/design/implementation sessions per `CLAUDE.md`.
- Not a prioritization over the user's own product roadmap — the 6 tranches are an ordering of the review debt, not a replacement for v0.2.0 platform work. Interleave at the team's discretion.
- Not a schedule — effort estimates are ordinal ("small / medium / large") not calendrical.
- Not a contract — the Tranche 3 architecture refactors explicitly require design sessions and may be re-scoped or deferred based on those sessions' output.

---

## 1. Executive Summary

### What the review found

| Category        | Critical | High | Medium | Low  | Total   |
| --------------- | -------- | ---- | ------ | ---- | ------- |
| Code Quality    | 3        | 12   | 18     | 12   | 55 (+10 simplifications) |
| Architecture    | 4        | 14   | 16     | 8    | 51 (+9 simplifications)  |
| Security (new)  | 4        | 11   | 14     | 9    | 38     |
| Performance (new) | 2      | 9    | 16     | 9    | 36     |
| Testing         | 5        | 11   | 13     | 8    | 37     |
| Documentation   | 5        | 12   | 14     | 9    | 40     |
| Framework & Language | 2   | 8    | 11     | 9    | 30     |
| CI/CD & DevOps  | 4        | 11   | 18     | 9    | 42     |
| **Total**       | **29**   | **88** | **120** | **73** | **329 + 19 simplifications** |

### The five structural issues

Most individual findings trace back to five underlying decisions. Fix the five, and ~40% of the individual findings close automatically:

1. **Component-boundary trust vacuum** — component mutations accept identity args (`reviewerId`, `agentId`, `userId`, `boundedContext`) as `v.string()` with no verification. Root of SC1–SC4, SH1, SH3, SH11, M11, DC1.
2. **`globalPosition` arithmetic already exceeds `Number.MAX_SAFE_INTEGER`** at today's timestamps (~1.77e18 vs 9e15 safe-int ceiling). Silent precision loss is happening now. Root of M17, AM10, PM2, and a class of future projection-ordering bugs.
3. **Advertised-but-unenforced contracts** — `idempotencyKey` on `appendToStream` (write-only), `isAuthorizedReviewer` default-allow, Workpool partition-key ordering (`key:` is a TODO). Class of bugs: C3, SH5, M11, PM16, SC2.
4. **`platform-core` is a monolith** — 176 files, 29 subdirs, 5 independent subsystems including a full Agent bounded context with its own Convex component. Root of AC1, AC2, AC3, AC4, AH1, AH2, AH3, AH8, AM2, AM12.
5. **No release automation + no integration tests for the highest-risk package** — even after fixing issues, there is no safe way to ship them; `platform-store` has zero Docker-based integration tests, so the correctness bugs (globalPosition, idempotency, scope-key isolation) are unverifiable. Root of OC1, OC2, OC3, TC1, BH8, DH2.

### The plan in one paragraph

We build test infrastructure and release plumbing first (Tranche 0), close the trust-vacuum + idempotency + globalPosition correctness bugs next (Tranche 1), then improve performance and observability (Tranche 2), then tackle the `platform-core` split (Tranche 3) which is the largest and most optional piece, then finish with documentation, simplifications, and polish (Tranche 4). Tranche 5 absorbs whatever is still open and ensures we've closed the backlog to an acceptable residual level. Every code change ships with tests. Every pattern flows through the architect FSM. Every commit passes all hooks.

---

## 2. Required Context (Read Before Any Remediation Session)

Before planning or implementing any change in this plan, a session MUST load these constraints into context. They are non-negotiable architectural commitments of the platform and several of the review's findings can be misread without them.

### 2.1 Component Isolation Guardrails

Authoritative source: `docs/architecture/COMPONENT_ISOLATION.md`.

- Each Convex component (`platform-bus`, `platform-store`, embedded `agentBC`, `workpool`, `workflow`, `action-retrier`) has an **isolated database**. The parent app cannot `ctx.db.query()` component tables.
- **All writes in one top-level mutation commit atomically**, across component boundaries. A parent mutation that calls `components.orders.foo` then `components.audit.record` is ONE transaction. Findings that propose compensation/saga logic for operations already inside a single parent mutation are wrong; review them through this lens before implementing.
- `ctx.auth` does NOT cross component boundaries. Identity must be passed as explicit args, AND (once PDR-014 lands) verified at the component side. This is the root of the trust-vacuum cluster.
- `Id<"table">` becomes `string` at component boundaries.
- Components cannot read `process.env` — pass config as args.
- Internal component state (Workpool queue, Workflow journals, Action Retrier state) is opaque to the parent; cleanup is impossible without Docker restart. Namespace isolation (testRunId prefixes) is how tests stay independent.

Implication: when a finding says "add auth wrapper," the wrapper is **inside the component mutation**, taking a verification artifact from the parent, not a bearer token and not `ctx.auth`.

### 2.2 Convex Transaction Semantics

Authoritative source: `docs/architecture/CONVEX-DURABILITY-REFERENCE.md` §2 and §12.

| Function type | Guarantee               | Retry behavior                      |
| ------------- | ----------------------- | ----------------------------------- |
| Mutation      | Exactly-once (effectively) | Convex auto-retries on OCC conflict |
| Action        | At-most-once (default)  | No auto-retry; use Retrier/Workpool |
| Query         | Consistent read         | Auto-retry on transient failure     |

- OCC conflicts are auto-retried by Convex; **mutations inside Workpool are NOT retried by Workpool** — that's actions only. DCB returns `{ status: "conflict" }` as a success status; application code must schedule its own retry with backoff. This matters when evaluating H11 (`recordCommand` post-insert dedup): within a single component, the "race" it's defending against cannot happen due to serializability. The fix is a delete, not a lock.
- `ctx.scheduler.runAfter(0, …)` persists atomically with the mutation commit. Scheduled work is durable; in-memory promises are not.
- Workpool partition-key ordering (`key:` parameter) is **NOT present in the vendored Workpool v0.3.1** (see `deps-packages/workpool/src/client/index.ts:393-433`). Several findings propose using it; those fixes are blocked on upstream. Document the gap (DM8) rather than pretend.

### 2.3 `globalPosition` Precision (the single most important correctness note)

Current formula in `platform-store/src/component/lib.ts:27-36`:

```
globalPosition = timestamp * 1e6 + streamHash * 1e3 + version % 1000
```

With `Date.now() ~ 1.77e12`, the result is `~1.77e18`. `Number.MAX_SAFE_INTEGER` is `~9e15`. We are past safe integer by >2 orders of magnitude, TODAY.

Implications for the remediation:

- Any test that uses `===` on `globalPosition` at realistic timestamps is already wrong.
- Any projection checkpoint comparison that assumes strict arithmetic monotonicity can produce the same `number` value for distinct events ~256 units apart (since `Number.EPSILON * 1e18 ≈ 222`).
- This is a **correctness** bug, not a performance bug. It is reviewed in Phase 1 (M17), Phase 1B (AM10), and Phase 2B (PM2), but all three are the same bug.

Fix options (to be chosen in an PDR-015 design session):

| Option | Pros | Cons |
| ------ | ---- | ---- |
| `bigint` (Convex `v.int64()`) | Exact precision forever | Serialization cost, validator friction, every downstream consumer changes |
| Monotonic counter row | Single source of truth, simple comparisons | Write contention on one row (OCC hotspot) |
| Use `_creationTime` + `version` tuple | Free from Convex, always safe | Not a single sortable scalar, API changes |
| Compact timestamp (seconds × 1e6 instead of ms × 1e6) | Within safe int for decades | Loses sub-second ordering under high throughput |

This decision is non-trivial; it gets a design session in Tranche 1.

### 2.4 Architect FSM Workflow

Authoritative source: `CLAUDE.md` "Architect Process" section and `libar-platform/architect/ARCHITECT-GUIDE.md`.

- Every pattern flows through `roadmap → active → completed` (terminal). The plan in this document creates ~25–30 patterns. Each needs a feature file in `libar-platform/architect/specs/platform/` with `@architect-pattern:Name` and `@architect-status:roadmap` to start.
- Planning sessions produce roadmap specs. They do NOT write code. They do NOT transition status.
- Design sessions (optional) produce stubs + decision specs (PDRs/ADRs). They do NOT implement. They transition `roadmap → active` only if the pattern is truly ready to implement.
- Implementation sessions transition `roadmap → active` FIRST, then implement, then transition `active → completed` only when ALL deliverables are done.
- Completed specs are hard-locked; modifying them requires `@architect-unlock-reason:<reason>`.
- `pnpm architect-guard --staged` runs in pre-commit. Violations block the commit. Never use `--no-verify` to bypass.

Implication: this plan's patterns (§16) are candidate `@architect-pattern` names. When implementation starts, each gets a feature file drafted in a planning session before any code is written.

### 2.5 Review-specific guardrails from `00-scope.md`

Reviewers were explicitly told to treat the following as **intentional**, not anti-patterns. This plan inherits those rules:

1. **Component Isolation** — parent apps cannot directly query component tables. This is architecturally enforced; do not "fix" it.
2. **TS2589 Prevention via `makeFunctionReference` + `SafeMutationRef`** — deliberate workaround for TypeScript depth-counter overflow. Do not refactor these away. Note: fixing TS2589 in one file can surface new TS2589 errors elsewhere; run `pnpm typecheck` iteratively.
3. **Deciders are pure** — no `ctx`, no I/O, no side effects.
4. **Dual-write CMS + event in the same mutation** — always. Not a saga.
5. **No backward-compatibility code** — delete unused code outright; no `_unused` vars, no re-export stubs, no "removed X" comments.
6. **Projections, not direct CMS reads** — reads go through projection tables.

### 2.6 Known vendored-dependency constraints

- **Workpool v0.3.1** (vendored in `deps-packages/workpool/`) has NO `key:` partition parameter. Per-entity ordering fixes (PM16, AM11 retry storm risk, DM8) cannot be implemented in-place; they must either (a) wait for upstream, (b) be emulated with a small custom queue, or (c) be explicitly documented as a gap. This plan chooses (c) for Tranche 1 and revisits in Tranche 3.
- **Convex peer range** `>=1.17.0 <1.35.0` is tighter than needed (BH5). Changes that require newer Convex features need to either widen the range or stay within the pinned band.
- **Zod v4** peer. Schema parser behavior tightened vs v3; Phase 2 SL8 flagged migration risks to audit.

---

## 3. Guiding Principles

The five decisions that shape this plan's ordering. Each is a trade-off the team has implicitly made by prioritizing quality, safety, and shippability over speed.

### 3.1 Test infrastructure before test-dependent fixes

The `platform-store` Docker harness (TC1, OC3) blocks ~14 perf/correctness tests in Phase 3's must-add lists. Similarly, `platform-core/testing/` already has a working integration harness that the must-add auth/identity tests can piggyback on. Therefore: **build harness first** (Tranche 0), then fix the bugs the harness is meant to catch (Tranche 1). We do not "fix globalPosition then write a regression test" — the regression test arrives first, documents the bug, and then the fix turns it green.

### 3.2 Release plumbing before any user-facing fix

OC1 (no release automation, no CHANGELOGs, all packages at 0.1.0) means even when we fix something, consumers have no way to know or opt in. Tranche 0 therefore lands semantic-release + changesets + Dependabot + `pnpm audit` in CI **before** any behavior-changing fix. This also front-loads CHANGELOG discipline (DH2), so every subsequent tranche contributes release notes instead of reconstructing them later.

### 3.3 Contract Status before new contracts

DH1, DH2, DC1, DC2, DC5 collectively demand a "Contract Status: Enforced / Advertised Only / Planned" convention in JSDoc. Introducing this early (Tranche 0) lets every subsequent fix tag its new contracts, preventing the class of bugs where docs promise something code doesn't deliver. The cost is small (doc convention + a lint rule); the benefit cascades.

### 3.4 Security fixes carry authoritative auth ADR

SC1–SC4 + SH1, SH3, SH11, M11 are not independent bugs — they're one platform-level decision replicated at ~5 component mutations. Fixing them ad-hoc creates drift. Therefore: PDR-014 (the canonical auth-wrapper convention) lands first in Tranche 1, and every component-mutation fix references it. New component mutations added after this point MUST conform.

### 3.5 Architecture splits are optional until proven needed

AC1 (platform-core monolith) is a real finding, but the split is a multi-week effort with significant API-surface disruption. This plan schedules it in Tranche 3 with a **design session** gate: if the split is judged lower-ROI than alternatives (better layering rules enforced in CI, clearer README stability column, etc.), it gets deferred. The other fixes in Tranche 3 (saga/projection pool split, idempotency/index audit) are independent and proceed regardless.

---

## 4. Tranche Roadmap

### Critical path

```
Tranche 0 ──► Tranche 1 ──► Tranche 2 ──► Tranche 3 ──► Tranche 4 ──► Tranche 5
  Foundation     Trust &        Perf &      Architecture    Polish &     Backlog
                 Correctness    Observability Refactors     Simplification Burndown
   2 weeks        3 weeks        2 weeks      4–6 weeks      2 weeks      rolling
```

Tranches may overlap at the seams; a Tranche 2 fix can begin while Tranche 1 finalizes as long as no dependency is inverted. The tranche boundary is a quality gate, not a date.

### Leverage map

| Tranche | Purpose                                   | Closes (Critical) | Closes (High) | Key Prerequisite           |
| ------- | ----------------------------------------- | ---------------- | ------------- | -------------------------- |
| 0       | Test harness, release plumbing, conventions | BC1, BC2, OC1, OC2, OC3, OC4, TC1 | ~20            | None                       |
| 1       | Trust-vacuum + globalPosition + idempotency + ID generation | C1, C2, C3, SC1, SC2, SC3, SC4, M17/AM10/PM2, AM11, AC4 | ~25 | Tranche 0 (test harness)   |
| 2       | Performance, input validation, observability, pool split | AC3 (partial), PC1, PC2 | ~25            | Tranche 1 (stable base)    |
| 3       | `platform-core` split, DCB indexing, re-export shim removal | AC1, AC2 | ~15            | Tranche 1 (clean contracts) |
| 4       | Documentation rewrite, simplifications, legacy-modernizer cleanup | TC3 (partial), TC4, TC5 | ~15          | Tranches 0–3               |
| 5       | Residual backlog burn-down                | (residual)       | (residual)    | All                        |

### Finding closure projection

At the start: 29 Critical, 88 High, 120 Medium, 73 Low.
Post-Tranche 0: projected ~26C, ~80H remaining (test infra and release plumbing don't close user-visible findings but enable everything else).
Post-Tranche 1: projected ~8C, ~50H.
Post-Tranche 2: projected ~3C, ~30H.
Post-Tranche 3: projected ~1C, ~20H (the residual Critical is whatever the architecture session decides to defer).
Post-Tranche 4: ~0C, ~10H, ~50M, ~60L.
Tranche 5: sweep to ≤5 High, ≤20 Medium, Low backlog triaged.

---

## 5. Tranche 0 — Foundation (Enables Everything)

**Goal:** make the subsequent tranches testable, shippable, and governed. Nothing in this tranche changes user-visible behavior. All changes go to CI, test harness, docs, and JSDoc conventions.

**Effort:** Small–Medium. Ordered as a single coherent PR stream.

**Critical findings closed:** BC1, BC2, OC1 (partial — infrastructure), OC2, OC3, OC4, TC1

### 5.1 Patterns

| Pattern ID | Name                                        | Deliverables                                                                 | ADR/PDR       |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| P01        | Platform-store integration test harness     | `vitest.integration.config.ts`, Docker port 3216 in Justfile + CI, base test helpers, first canary test | — |
| P02        | Release automation + CHANGELOG discipline   | `changesets` config, per-package CHANGELOG stubs, conventional-commits commitlint, `publish` CI job (gated on manual dispatch initially) | PDR-007 (release process) |
| P03        | Dependency scanning in CI                   | Dependabot config (pnpm, weekly), `pnpm audit` CI step, Snyk or OSV-scanner optional | — |
| P04        | Contract Status JSDoc convention            | `@contract-status: Enforced \| Advertised-Only \| Planned` convention; lint rule; initial tagging pass on known sites (C3, M11, PM16, SC2) | ADR-042       |
| P05        | `@convex-es/*` → `@libar-dev/*` doc rename  | Repo-wide `sed` sweep, pre-commit grep guard, regenerate generated docs     | — |
| P06        | Dependency hygiene pass (post-upgrade)      | **FIRST step: produce `.full-review/04a-dependency-delta.md`** classifying each 04a finding as closed/partial/still-open against the current lockfile. Then: remove `optionalPeerDependencies` if still present, remove nested `pnpm-workspace.yaml`, add intentional upper bounds on `@convex-dev/*` peers, re-verify Zod/Convex/uuid peer ranges match installed | — |
| P07        | TS/ESLint strictness step-up                | `verbatimModuleSyntax`, `consistent-type-imports`, `no-import-type-side-effects`, `no-console`, `@convex-dev/eslint-plugin` rules audit | — |
| P08        | Per-package `typecheck` scripts + vitest config alignment | Add missing `typecheck` to 5 packages, add `vitest.config.ts` to `platform-bus`, add `name:` to 4 configs, gitignore `.tsbuildinfo` | — |
| P09        | Architect-guard in CI                       | Add `pnpm architect-guard --all --strict` to `lint-and-format` job; tighten pre-push to match | — |
| P10        | CI/CD hardening step-1                      | Pin Convex Docker image to specific tag, add `platform-bus integration tests` to CI, add CODEOWNERS, add branch protection docs | — |

### 5.2 Dependencies and ordering

```
P06 ──► P07 ──► P08  (dependency hygiene enables stricter TS)
P01 ────────────► P09, P10 (test infra enables CI hardening)
P04 ──► (tagging used by Tranche 1 patterns)
P02 ──► P03 (release plumbing + scanning travel together)
P05 is independent (doc-only)
```

### 5.3 Test coverage requirements

Tranche 0 is mostly non-behavioral; test requirements are infrastructure-level:

- **P01 canary test:** a single round-trip `appendToStream → readStream` integration test runs against Docker port 3216 in CI. This is the smoke test that proves the harness works.
- **P07 eslint rules:** a test that `pnpm lint` fails if a file introduces `import { foo }` for a type-only symbol (verbatimModuleSyntax + consistent-type-imports).
- **P09 architect-guard:** a test that a contrived spec with a `roadmap → completed` skip is rejected by CI with the specific error code.

### 5.4 Gates for `active → completed`

- All 6 packages build, typecheck, lint, and test green.
- `pnpm test:integration` passes on ports 3210, 3215, **and 3216** (new store harness).
- A synthetic release candidate PR (`0.2.0-alpha.0` changeset) ships the publish workflow end-to-end on a dry-run.
- Dependabot opens ≥1 PR (validates config is correct).
- No regressions in existing 128 feature files + 9 integration tests.

### 5.5 Commit plan for Tranche 0

One PR per pattern, merged in dependency order. Each PR:

- Titled `P0n: <pattern name>` for easy ADR cross-referencing.
- Includes a CHANGELOG entry (even if tagged `[Unreleased]` under Internal).
- Has a paired architect spec that moves `roadmap → active → completed` within the PR (the foundational work is small enough that combined planning+implementation sessions are acceptable).
- Has test changes in the same PR as the source change.

**Commit hygiene:**

- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`). This is enforced after P02 ships commitlint.
- No bypasses of hooks; if a hook fails, fix the underlying issue or revert.

### 5.6 Risks for Tranche 0

| Risk                                             | Mitigation                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Changesets/semantic-release conflicts with existing scripts | Do a dry-run on a throwaway branch; involve team review          |
| Dependabot floods CI with PRs                    | Start with `pnpm` ecosystem only; add `schedule.interval: weekly`; auto-merge disabled initially |
| `verbatimModuleSyntax` surfaces 10–30 fixes      | Expected — fix them as part of P07, do not skip                 |
| Docker image pin breaks older dev machines       | Document in `docs/development/LOCAL_SETUP.md`; provide migration note |

---

## 6. Tranche 1 — Trust & Correctness (Close the Critical Cluster)

**Goal:** eliminate the trust vacuum at component boundaries, resolve the globalPosition precision bug, and decide idempotency enforcement. This is the highest-impact tranche for security and correctness.

**Effort:** Medium (the auth-wrapper sweep) + 1 Design session (globalPosition) + Medium (idempotency implementation).

**Critical findings closed:** C1, C2, C3, SC1, SC2, SC3, SC4, M17/AM10/PM2, AM11, plus ~20 High findings in the same clusters.

### 6.1 Patterns

| Pattern ID | Name                                                | Deliverables                                                                              | ADR/PDR                         |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| P11        | **Component-boundary authentication convention** (keystone) | `verifyActor(ctx, args, proof)` helper; migration of `approve`, `reject`, `audit.record`, `agentCommands.record`, `appendToStream` to require verification; contract-status tagging | **PDR-014**                     |
| P12        | `ensureTestEnvironment` fail-closed                 | Invert guard to require affirmative allow signal; update Docker compose + CI to set `IS_TEST=1` | —                               |
| P13        | `correlationId` fabrication removal                 | Require `metadata.correlationId` at validator layer; throw if missing; migrate callers to always provide | —                               |
| P14        | **Idempotency enforcement for `appendToStream`**    | Read `by_idempotency_key` before insert; return existing event on hit; unit + integration test property "same key → same row" | **PDR-018**                     |
| P15        | Agent ID generation centralization                  | Add `generateApprovalId`, `generateAgentSubscriptionId`, `generateDecisionId` (full uuidv7, branded) to `ids/generator.ts`; delete 4 inline truncation sites | —                               |
| P16        | `isAuthorizedReviewer` default-deny                 | Invert default-allow to default-deny; require explicit allow-list; update all call sites   | —                               |
| P17        | **`globalPosition` representation fix**             | Design session; pick option (bigint / counter / compact ts / tuple); migrate formula + all consumers; property tests at realistic timestamps | **PDR-015**                     |
| P18        | PM FSM single source of truth                       | Export canonical transitions map from `processManager/lifecycle.ts`; replace hand-rewrite in `platform-store/component/lib.ts`; parity test | —                               |
| P19        | `safeApproveAction`/`safeRejectAction` expiration ordering | Move expiration check into `approveAction`/`rejectAction` themselves; close SC2 TOCTOU window | —                               |
| P20        | Agent lifecycle stubs: throw or remove              | Remove `TODO(Phase-23)` no-ops from `subscription.pause/resume/unsubscribe`; either throw explicit "not-implemented" or remove from public interface | —                               |
| P21        | `platform-store` constrained `platform-core` runtime dep | Record the accepted runtime dependency via PDR-021, freeze the allowed public subpaths, and require future extraction if coupling grows | PDR-021                         |

### 6.2 Dependencies and ordering

```
P11 (PDR-014) ──► P16 (default-deny) ──► all component-mutation patterns
P14 (PDR-018) ──► Tranche 2 index audit
P17 (PDR-015 design) ──► P17 implementation ──► Tranche 2 projection catchup perf work
P12, P13, P15, P18, P19, P20, P21 are independent of each other
```

P11 is the keystone; it goes first because every subsequent component-mutation change must conform to the PDR-014 convention. Do not write new component mutations until P11 is in.

### 6.3 Test coverage requirements (mandatory)

Tranche 1 is where the must-add security and correctness tests from Phase 3A land. Each pattern must ship with the listed tests:

**P11 (PDR-014 / auth wrapper)** — from Phase 3A security-driven must-add #5, #6, #8, #9, #11:
- `agent.approve mutation with forged reviewerId is rejected`
- `agent.reject mutation with forged agentId is rejected`
- `audit.record mutation with spoofed agentId is rejected`
- `appendToStream with spoofed boundedContext is rejected / re-written to verified BC`
- `isAuthorizedReviewer with empty roles and empty agentIds returns false` (inverted from prior default-allow)
- Integration test: end-to-end approval flow with valid caller succeeds; tampered proof fails.
- **Regression anchor:** before P11 lands, write failing tests that document the current broken behavior. P11 makes them pass.

**P12 (`ensureTestEnvironment`)** — from Phase 3A TC3:
- `ensureTestEnvironment throws when CONVEX_CLOUD_URL set and IS_TEST absent`
- `ensureTestEnvironment returns silently when IS_TEST=1`
- Table-driven: all combinations of env vars, only `IS_TEST` or `__CONVEX_TEST_MODE__` save it.

**P13 (`correlationId` fabrication)** — Phase 3A TM3:
- `appendToStream without metadata.correlationId is rejected with a clear error`
- Migrate all call sites first; this is a breaking change to the component contract.

**P14 (idempotency)** — Phase 3A must-add #2, #20, and TH2:
- `appendToStream called twice with same idempotencyKey produces exactly one event row`
- `appendToStream returns consistent eventId on duplicate idempotencyKey call`
- `getByIdempotencyKey returns the existing event after a dedup hit`
- Property test: N concurrent callers with the same key → exactly one stored event, N-1 seeing the dedup path.
- **This is a headline Tranche 1 test; it is the acceptance criterion for PDR-018.**

**P15 (ID centralization)** — Phase 2 SH8 angle:
- `generateApprovalId returns a full 128-bit uuidv7` (no truncation)
- `generateApprovalId branded types cannot be assigned to raw strings`
- Regression test: the 4 previous inline sites now call the shared helper (grep-based test if possible).

**P16 (default-deny)** — Phase 3A must-add #11, #12 **inverted**:
- `isAuthorizedReviewer with empty roles returns false`
- `isAuthorizedReviewer with explicit allow-list containing caller returns true`
- Migration: every caller that previously relied on default-allow either now passes an explicit allow-list or is deleted.

**P17 (globalPosition)** — Phase 3A TC2, TC5, must-add performance #1, #2, #10:
- `globalPosition at today's real Date.now() is strictly comparable` (whatever representation wins)
- `globalPosition for 1000 sequential appends is strictly monotonic within each stream`
- `globalPosition for two events 1ms apart at real timestamps produces distinct values`
- Property test with fast-check or similar across real-range timestamps.
- Migration test: old checkpoints (pre-migration format) can be read by new code via a compat reader; new checkpoints cannot be misread as old.

**P18 (PM FSM parity)** — Phase 3A TC5:
- Table-driven: for each `(from, to)` in `processManager/lifecycle.ts` allowed transitions, both the canonical implementation and the store-component copy accept it.
- For each `(from, to)` NOT in the allowed set, both reject.
- Property-style test with fast-check generating arbitrary (from, to) pairs.

**P19, P20, P21** — straightforward unit/integration tests; each pattern's spec details.

### 6.4 Gates for `active → completed`

- **P11 gate:** every component mutation that accepts `userId`, `agentId`, `reviewerId`, `boundedContext`, or `tenantId` either (a) calls `verifyActor()` or (b) is explicitly tagged `@contract-status: System-Only` with an audit note.
- **P14 gate:** PDR-018 committed and either implements dedup or explicitly removes the advertised contract (and the `by_idempotency_key` index, opening the door for Tranche 2's index audit).
- **P17 gate:** PDR-015 committed; the formula change, the checkpoint migration, and the property tests all land in the same PR (this is a non-trivial PR and deserves an explicit freeze on other Tranche 1 work while it's in review).
- All Tranche 1 tests green in CI at ports 3210, 3215, 3216.
- No new TS2589 errors (per the guardrail in §2 — `pnpm typecheck` iteratively after each pattern).

### 6.5 Commit plan for Tranche 1

- **P11 ships in a single PR** — splitting it across component mutations creates a mixed-state window where some mutations trust and some don't. The PR is big, but it's coherent. Include the PDR-014 text, the helper, all 5+ migration sites, all regression/acceptance tests, and CHANGELOG entries.
- **P14 and P17 ship separately**, each with their ADR.
- **P12, P13, P15, P16, P18, P19, P20, P21 ship individually.** Each is small and independently testable.
- CHANGELOG entries classified under `### Security` (P11, P12, P15, P16, P19), `### Correctness` (P13, P14, P17, P18, P21), `### Breaking` (any of the above that change public APIs — P11 and P17 are likely candidates).

### 6.6 Risks for Tranche 1

| Risk                                                       | Mitigation                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| P11 is large; review time stretches                         | Pre-read via design session before implementation; pair review         |
| P14 (idempotency) implementation diverges from PDR-018     | Block implementation until PDR-018 is merged                          |
| P17 (globalPosition) design session stalls on trade-offs    | Time-box to 2 days; if no consensus, pick `bigint` by default and revisit in 6 months |
| Breaking changes in Tranche 1 force minor bump across six packages | Planned — changesets handles this; publish as `0.2.0`              |
| `verifyActor` implementation depends on what the parent app uses for identity | The ADR is allowed to punt the exact shape to the app; the component accepts the verification artifact as a typed arg |

---

## 7. Tranche 2 — Performance, Input Validation, Observability

**Goal:** close the unbounded-query and input-validation clusters, split the shared Workpool, ship first-class observability hooks, and audit the `events` table indexes now that idempotency is resolved.

**Effort:** Medium. Patterns are independent and highly parallelizable once Tranche 1 lands.

**Critical findings closed:** AC3 (partial), PC1, PC2, plus ~25 High findings.

### 7.1 Patterns

| Pattern ID | Name                                              | Deliverables                                                                                   | ADR/PDR        |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| P22        | `v.unknown()` + byte-size cap at component boundaries | `v.any()` → `v.unknown()` migration at ~33 sites; serialized-size check helper; 64KiB default cap, configurable at component level | **PDR-019**    |
| P23        | Workpool split (projection / saga / fanout)       | `projectionPool`, `sagaPool`, `fanoutPool` as separate named pools; `OrchestratorDependencies` accepts all three; per-pool metrics hooks | **PDR-016**    |
| P24        | `recordCommand` post-insert dedup removal         | Delete lines 79–98 in `platform-bus/component/lib.ts`; document Convex serializability in comment; regression test that recordCommand is idempotent under concurrent same-commandId writes | —              |
| P25        | `readFromPosition` `hasMore` signal + event-type index | Change return shape to `{ events, nextPosition, hasMore }`; add compound index `by_event_type + globalPosition`; update projection catch-up consumers | —              |
| P26        | `events` index audit & cleanup                    | Drop `by_event_type` (superseded by P25 compound), `by_bounded_context`, `by_event_id`, `by_category` after consumer verification; schema migration with changelog | **PDR-020**    |
| P27        | `getByCorrelation` pagination                     | Add `limit`/`cursor` args to both `platform-bus` and `platform-store` `getByCorrelation`; hard cap at 1000; trimmed DTO | —              |
| P28        | `appendToStream` batch cap                        | Cap `events.length <= 100` at validator layer; throw with a clear error; update callers that batch | —              |
| P29        | Orchestrator `Promise.all` concurrency cap        | Cap `secondaryProjections` fan-out; use batch-aware Workpool calls where available; explicit limit at 50 with clear error | —              |
| P30        | Audit-record compound index                       | Add `by_decision_eventtype: ["decisionId", "eventType"]` index; convert `.collect() + .some` to `.first()`; closes PH5, PH6 | —              |
| P31        | Checkpoint bulk-patch parallelization             | `Promise.all(checkpoints.map(c => ctx.db.patch(c._id, …)))` instead of serial loop; closes PH4, PH6 | —              |
| P32        | Observability primitives                          | `PlatformMetrics` interface parallel to `Logger`; counter/histogram/gauge; no-op default + console adapter; inject in orchestrator + eventbus + workpool enqueues | **ADR-041**    |
| P33        | Logger defaults-to-console                        | Change default logger from no-op to a console adapter with INFO level; no-op only in tests; document in README | —              |
| P34        | `cleanupExpired` pagination + parallelization     | Return `{ deleted, hasMore }`; parallelize deletes within a batch; cap `batchSize` at 500; ship default crons from each component | —              |
| P35        | `readVirtualStream` denormalization               | Add `scopeKey` column on `events` + index; single range scan replaces N scans; closes PC2    | —              |

### 7.2 Dependencies and ordering

```
P22 ────────────────► all other patterns benefit (input validation first)
P23 ────────────────► P32 (metrics are per-pool)
P25 ──► P26 (new compound index replaces old redundant ones)
P14 (Tranche 1) ──► P26 (idempotency decision frees the `by_idempotency_key` index)
P27, P28, P29, P30, P31, P33, P34, P35 are independent
```

### 7.3 Test coverage requirements

**P22 (v.unknown() + size cap)** — Phase 3A must-add #3, #4, #18:
- `appendToStream with 1MB payload is rejected with PAYLOAD_TOO_LARGE`
- `appendToStream with 64KB payload succeeds`
- `recordCommand with 128KB payload is rejected`
- Every site that went from `v.any()` → `v.unknown()` has a test asserting that malformed input is rejected at the validator layer.

**P23 (pool split)** — Phase 3A must-add perf #9, TL7:
- Load test: saturate `projectionPool` with slow handler; verify `sagaPool` throughput is unaffected (back-pressure isolation)
- Orchestrator test: 20 secondary projections enqueue successfully via the correct pool
- Property test: each enqueue goes to its configured pool only (no cross-contamination)

**P24 (recordCommand dedup)** — Phase 3A must-add perf #7:
- Regression: concurrent `recordCommand` calls with the same `commandId` within one parent mutation: exactly one row, no leaked deleted-doc, no extra reads.
- Documented rationale in a comment referencing the Convex serializability ADR.

**P25 + P26 (readFromPosition + index audit)** — Phase 3A TH3, must-add perf #3, #4:
- `readFromPosition with 1%-cardinality filter returns correct results in ≤3 pages`
- `readFromPosition returns hasMore: false only at end of stream`
- After P26: every production consumer of `events` indexes is verified; schema test that the dropped indexes do not exist; rollback script if consumers are discovered post-merge.

**P27 (getByCorrelation)** — Phase 3A must-add perf #8:
- `getByCorrelation with 500 events in correlation returns paginated results`
- `getByCorrelation without cursor returns first page; with cursor continues correctly`
- Property test: no matter the fan-out, response size stays under 1MB.

**P28, P29, P30, P31, P34** — each pattern ships with targeted tests from the must-add lists; see Phase 3A for exact scenarios.

**P32 (observability)** — new:
- `Orchestrator emits command.duration histogram on every command execution`
- `EventBus emits event.dispatched counter`
- `Workpool emits queue.depth gauge` (requires Workpool surface if available; else doc the gap)
- No-op metrics interface is used in tests and asserts zero observable side effects.

**P33 (logger default)** — DH-series doc gate:
- `Orchestrator without explicit logger config logs to stdout at INFO`
- Production builds default to console; test builds default to no-op.

**P35 (readVirtualStream)** — Phase 3A TH1 + must-add perf #5, #6:
- `readVirtualStream with 50 streams completes in ≤500ms`
- Schema migration test: existing events backfill `scopeKey` correctly; new events write it on insert.

### 7.4 Gates for `active → completed`

- All Tranche 2 tests green. No regression in Tranche 0/1 tests.
- `platform-store` `appendToStream` benchmarks show ≥30% append-latency reduction after P26 drops the dead indexes (this is the concrete scalability ceiling win).
- A `PlatformMetrics` implementation is wired in the order-management example app and produces observable output locally.
- PDR-019, PDR-020, ADR-041 committed.

### 7.5 Commit plan for Tranche 2

- Each pattern ships as its own PR.
- P22 is itself a migration series — commit per-site (one PR per ~10 sites, or grouped by component).
- P26 (index drop) ships with an explicit "Breaking or Not?" note in the PR: if no external consumer uses those indexes, it's not breaking. If any do, bump minor and CHANGELOG.
- P32 is additive; consumers opt in. CHANGELOG under `### Added`.
- P33 changes default behavior; CHANGELOG under `### Changed` with migration note.

### 7.6 Risks for Tranche 2

| Risk                                                         | Mitigation                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Dropping indexes (P26) breaks external consumers              | Socialize in advance; grep consumers; ship behind a minor bump        |
| `v.unknown()` migration surfaces bugs at component boundaries | Expected — fix each site with an explicit validator; document rationale |
| Workpool pool split changes deployment surface                | Document migration in README; provide one-line migration snippet for order-management example app |
| `readVirtualStream` denorm requires historical backfill      | Phased rollout: new events write the column immediately; backfill job runs in background; reads fall back to scan while backfill incomplete |

---

## 8. Tranche 3 — Architecture Refactoring

**Goal:** address the package structural issues. This tranche is the most discretionary — the split is real but optional, and the tranche's disposition is decided by a design session, not by default.

**Effort:** Large. Must open with a design session.

**Critical findings closed:** AC1, AC2. AC4 is already resolved in Tranche 1 via PDR-021, which accepts the live `platform-store -> platform-core` dependency with constraints instead of treating it as a split trigger. Also: ~15 High.

### 8.1 Design session gate (mandatory first step)

Before any Tranche 3 pattern begins, run a design session to decide:

1. Do we split `platform-core` into `platform-core` (kernel) + `platform-agent` + `platform-reservations` + `platform-dcb` + `platform-testing`? Or do we keep it and enforce layering via `dependency-cruiser` + README stability column?
2. Do we split `platform-store` into `platform-store` (events) + `platform-pm-state` + `platform-dcb-scopes` + `platform-projection-status`? Or accept the kitchen-sink and document the trade-off?
3. Do we extract `scope-key` / `EventCategory` / `ProcessManagerStatus` to a shared zero-dep package? (Likely yes; this is the cheapest of the three.)
4. Do we keep `CommandBus` / `EventStore` client classes or delete them in favor of plain functions (AH11)?

**Output of design session:** PDR-017 (split or keep), one or two subsidiary ADRs (contracts-shared-package, client-class disposition), and a revised Tranche 3 pattern list.

If the answer to (1) and (2) is "keep for now," Tranche 3 shrinks significantly and the saved effort flows into Tranche 4. AC2 therefore remains explicitly deferred to Tranche 3 via PDR-017, while AC4 is already handled separately by PDR-021 as a constrained keep decision.

### 8.2 Patterns (conditional on design session)

Assuming the design session chooses **shared contracts package + client cleanup + no full split yet**:

| Pattern ID | Name                                                     | Deliverables                                                                                | ADR/PDR       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| P36        | `platform-contracts-shared` package                      | Extract `EVENT_CATEGORIES`, `ProcessManagerStatus`, scope-key parser to a new zero-dep pkg; both core and store import from it; closes AH4, AH5, AH6, AM3 | —             |
| P37        | Re-export shim deletion                                  | Delete `platform-core/src/fsm/index.ts`, `src/decider/index.ts` re-exports, `src/handlers/index.ts`; consumers migrate to direct package or `orchestration/` path | —             |
| P38        | `CommandBus` and `EventStore` client classes → functions | Replace thin class wrappers with typed functions; the classes were AH11 noise            | —             |
| P39        | `platform-bus` agent-subscription.ts relocation          | Move to `platform-core/src/agent/subscription.ts`; remove `platform-core` dep from `platform-bus`; closes AM2 | —             |
| P40        | `platform-core` root index slimming                      | Remove `export * from "./agent"`, `reservations`, `durability`, `dcb`, `monitoring`, `ecst`, `workpool`, `testing` from root; force subpath imports; closes AH1 | —             |
| P41        | Dependency-cruiser layering rules                        | Add config + CI job that enforces: bc/fsm/decider have no cross-deps; core can depend on bc/fsm/decider; bus and store do not depend on core | —             |
| P42        | `platform-core` monolith split (OPTIONAL)                | Only if design session greenlights. Deliverables defined in the design session itself.     | **PDR-017**   |
| P43        | `platform-store` kitchen-sink split (OPTIONAL)           | Only if design session greenlights. Deliverables defined in the design session itself.     | PDR-017 or sibling |
| P44        | DCB `readVirtualStream` — see P35 (Tranche 2)            | (listed here for readers who navigate by architecture)                                      | —             |

### 8.3 Test coverage requirements

- **P36:** schema parity test — the scope-key format in the shared package is bit-identical to what the store component produces; the PM status tuple is bit-identical to what the PM state machine uses. Drift is caught at compile time now.
- **P37, P38:** each deleted export's consumers updated; no import-resolution errors. Integration tests still pass.
- **P39:** `platform-bus` package.json no longer lists `platform-core` as a dep; the new agent-subscription path is tested end-to-end.
- **P40:** import from `@libar-dev/platform-core` root returns only the kernel; import from subpaths returns the domain-specific surfaces. Enforced by a test suite that imports from root and checks what's exported.
- **P41:** a contrived PR that adds a `platform-bus → platform-core` import fails the CI layering job.
- **P42, P43:** tests migrate alongside packages; no loss of coverage.

### 8.4 Gates

- Design session concluded and PDR-017 committed.
- If P42 or P43 chosen: migration doc in `docs/architecture/PACKAGE_SPLIT_MIGRATION.md` shipped for consumers.
- `dependency-cruiser` report: zero cross-layer violations.
- CI green.

### 8.5 Commit plan

- PDR-017 first, separately.
- P36 next — it's foundational for any split option.
- P37–P41 individually, each small.
- P42/P43 (if chosen) in a dedicated branch with phased PRs (one per extracted package).

### 8.6 Risks

| Risk                                                      | Mitigation                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Design session decides "split"; effort balloons           | Build in a time-box (2 weeks max on splits) with fall-back to P36+P37+P41 only |
| External consumers break on split                         | Only order-management is a known consumer; communicate early; deprecate paths with warnings before removal |
| `platform-agent` extraction (if chosen) requires its own Convex component | Large; design the component shape first; the embedded `agentBC` moves, it is not rebuilt |

---

## 9. Tranche 4 — Polish, Docs, Simplifications

**Goal:** clean up the long tail: documentation rewrite, the 19 simplification entries, production-hardening stubs, and the remaining Medium findings.

**Effort:** Medium; largely parallelizable; pairs well with newcomer onboarding tasks.

**Critical findings closed:** TC3 (planning-stubs), TC4, TC5 (if not already in Tranche 1). Plus ~15 High findings, most Medium findings.

### 9.1 Patterns

| Pattern ID | Name                                                      | Deliverables                                                                               | ADR/PDR         |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| P45        | Documentation rewrite (package READMEs)                   | Rewrite 6 READMEs with usage examples, stability column, Known Limitations, Security Notes; per DH3, DH5, DC5 | —               |
| P46        | "Convex Idioms We Use" cheat-sheet                        | New `docs/architecture/CONVEX_IDIOMS.md` per Phase 3B outline                               | —               |
| P47        | Per-package TESTING.md                                    | Recipes per package: how to run in isolation, how to add a BDD test, how to mock ctx     | —               |
| P48        | Error-message style guide                                 | `docs/architecture/ERROR_MESSAGE_STYLE.md`; retrofit ~15 worst offenders                    | —               |
| P49        | Production-hardening stubs implementation                 | For each of 9 stubs: either implement (circuit breakers first — impl already exists) or delete feature files with justification | —               |
| P50        | Complexity hotspot refactoring                            | Split `CommandOrchestrator.executeCoreAfterIdempotency` (250 LOC), `withPMCheckpoint` (300 LOC), `orchestration/types.ts` (768 LOC) | —               |
| P51        | Duplicated factory consolidation                          | Collapse `createDeciderHandler`/`createEntityDeciderHandler`; collapse 4 command-schema factories; delete redundant no-op loggers | —               |
| P52        | Rate-limiter consolidation                                | Delete `agent/rate-limit.ts` + `agent/agent-rate-limiter.ts`; unify on middleware+adapter  | —               |
| P53        | `platform-bc` definition-layer consolidation              | Collapse 6 `defineX` functions + 6 `XDefinitionRegistry` types into one generic              | —               |
| P54        | Error-class modernization                                 | Remove `Object.setPrototypeOf` ES5 workarounds; add `{ cause }` to thrown errors            | —               |
| P55        | `FSMTransitionError`, `CommandError`, etc. `instanceof` tests | Paired with P54                                                                        | —               |
| P56        | Coverage tooling + thresholds                             | Add `@vitest/coverage-v8`; set floor thresholds (e.g., 70% for core, 90% for bc/fsm/decider) | —               |
| P57        | Deferred-implementation docs                              | Document every remaining `TODO`/`FIXME` with an issue link or delete                       | —               |
| P58        | Error taxonomy at orchestrator boundary                   | Use `CommandError`/`ErrorCategory` at the orchestrator's return, not untyped `{ code: string, reason: string }` | —               |

### 9.2 Test coverage requirements

- Every pattern ships tests. See Phase 3A for the Medium-severity must-add items that map to these patterns.
- **P49** — at minimum: circuit breaker state machine tests (implementation already exists), admin dead-letter retry tests, rate-limiting adapter tests.
- **P50** — refactors preserve behavior; existing tests continue to pass; new unit tests exercise each extracted private method.
- **P56** — coverage thresholds enforced in CI. Below threshold = PR blocked.

### 9.3 Gates

- Per-package README stability column present, and at least one Known Limitations section per package.
- Cheat-sheet, error-message guide, testing cookbook shipped.
- Coverage thresholds hit across all six packages.
- ≤3 `TODO(Phase-nn)` comments remain in the codebase; each has an issue.

### 9.4 Commit plan

- Docs patterns (P45–P48) ship in small individual PRs.
- Refactor patterns (P50, P51, P52, P53) each ship with their before/after test parity evidence.
- P54, P55 ship together.

### 9.5 Risks

| Risk                                               | Mitigation                                                  |
| -------------------------------------------------- | ----------------------------------------------------------- |
| Refactors in P50 introduce regressions             | Per-method test before refactor; require tests green       |
| Coverage thresholds (P56) block incidental PRs     | Start thresholds at current coverage − 2%; step up quarterly |
| Documentation goes stale immediately                | Regeneration via `pnpm docs:all` enforced in pre-commit    |

---

## 10. Tranche 5 — Backlog Burn-down

**Goal:** sweep the residual findings that don't fit cleanly into earlier tranches. By this point the Critical/High count should be in the single digits.

**Effort:** Rolling. No fixed exit; aim for a per-quarter trim.

### 10.1 Candidate items

- The 9 planning-stub subsystems whose impl status was unclear (if not fully resolved in P49).
- Remaining Low findings from every phase.
- The 19 Simplification entries (`S1–S10`, `AS1–AS9`) if not absorbed by Tranche 4.
- Dependency upper-bound tightening (`BH5`, `OL9`).
- Static Docker image dependabot integration.
- Additional observability (SLO dashboards, per-command tracing, projection-lag metrics).

### 10.2 Operating model

- Maintained as a labeled backlog in GitHub Issues tagged `remediation-t5`.
- Reviewed monthly; top 3 items pulled into a tranche at each quarterly planning cycle.
- Exit criteria: 0 Critical, ≤5 High, ≤25 Medium globally.

---

## 11. Test Coverage Strategy (Cross-Tranche)

### 11.1 Coverage hierarchy (matches `CLAUDE.md` conventions)

| Level           | Framework                 | Where                                                             | When required                                              |
| --------------- | ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Unit (pure TS)  | Vitest + fast-check       | `<pkg>/tests/unit/**/*.test.ts`                                    | Always for pure modules (decider, fsm, ids, utils)         |
| BDD / spec-driven | `@amiceli/vitest-cucumber` | `<pkg>/tests/features/behavior/**/*.feature` + `.steps.ts`       | Required for every user-visible behavior                   |
| Integration    | convex-test + Docker      | `<pkg>/tests/integration/**/*.integration.test.ts`                | Required for any code that touches Convex mutations/queries |
| Property-based | fast-check (Tranche 1+)   | alongside unit or integration                                     | Required for invariants: monotonic globalPosition, idempotent append, FSM exhaustiveness |
| Security        | Integration level         | `<pkg>/tests/integration/security/**`                              | Required for every auth-related fix (regression + acceptance pair) |
| Performance    | Integration benchmark     | `<pkg>/tests/integration/perf/**`                                  | Required for any perf claim (P23, P25, P35)                 |

### 11.2 Must-add tests (consolidated)

From Phase 3A, 35 concrete test titles across security (20) and performance (15). Every one of them is assigned to a pattern in §5–§10. Before starting a pattern's implementation, the session MUST confirm the assigned tests are scoped, and write them as regression anchors **before** the code change.

### 11.3 Test isolation and tenancy

- Every integration test uses `testRunId` prefix per `COMPONENT_ISOLATION.md §4.5`. This is the established pattern; do not change it in any tranche.
- Docker ports: 3210 (app integration), 3215 (platform-core infra), **3216 (platform-store infra — new in Tranche 0 P01)**, 3220 (dev), 3230 (e2e). Do not share.

### 11.4 Mocking policy

- **Do not mock Convex.** Use `convex-test` with the real component harness.
- **Do not mock deciders.** They're pure; test them directly.
- Mock only: external HTTP, clock (via injected `Clock` interface where the code supports it; otherwise fixed timestamps), and `Math.random` for determinism (SH7 jitter tests).

### 11.5 Property-test budget

Property tests are required for invariants in these patterns:
- P17 (globalPosition monotonicity)
- P14 (idempotency key → single row)
- P18 (FSM exhaustiveness — from/to pair space)
- P22 (payload-size validator)
- P29 (fan-out cap)

### 11.6 Regression-anchor discipline

For every pattern that fixes a Critical or High finding, write a test that **fails against the current code and passes after the fix**. Commit the failing test first (skipped or gated), then the fix, then ungate. This makes the fix auditable in the PR diff.

---

## 12. Quality Gates (Applied to Every Pattern)

A pattern cannot transition `active → completed` unless all gates pass. This is the DoD per PDR-005.

### 12.1 Universal gates

| Gate                               | Check                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Build                              | `pnpm build` succeeds for all 6 packages                                              |
| Typecheck                          | `pnpm typecheck` succeeds; no new TS2589 surfaced (run iteratively)                   |
| Lint                               | `pnpm lint` succeeds; 0 new `any` beyond what the pattern intentionally allows        |
| Format                             | `pnpm format:check` succeeds                                                          |
| Unit tests                         | `pnpm test:packages` green                                                            |
| Integration tests                  | `pnpm test:integration` green on all ports                                            |
| Architect guard                    | `pnpm architect-guard --staged` green (pre-commit) and `--all --strict` green (CI)    |
| Coverage                           | After Tranche 4 P56 lands: coverage thresholds not regressed                          |
| CHANGELOG                          | Changeset entry added                                                                 |
| Spec                               | `@architect-pattern` feature file committed, transitioning through FSM                |
| No `--no-verify`                   | Commit and push both pass hooks; if hook fails, fix, don't bypass                     |
| Regression anchor                  | Failing test committed before fix; passes after                                       |

### 12.2 Security-pattern gates (P11, P12, P14, P15, P16, P19, P20)

| Gate                               | Check                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Regression test pair               | One test asserts the vulnerable behavior is rejected after the fix; one documents the pre-fix failing state |
| Threat-model note                  | PR description includes "What CWE does this close" and "Scope of authorization"       |
| Sensitive-data sanitization        | If the pattern touches error/stack/log output, PR confirms no PII / no internal paths |
| Test env isolation                 | Uses namespace-prefixed data; runs on isolated Docker instance                         |

### 12.3 Correctness-pattern gates (P14, P17, P18, P24, P25)

| Gate                               | Check                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Property test                       | At least one property-based invariant, where applicable                                |
| Realistic-timestamp test           | Tests use `Date.now()`-scale values, not toy constants                                 |
| Migration compat                   | If schema/data format changes, migration script or compat reader is tested            |

### 12.4 Performance-pattern gates (P23, P25, P26, P28, P29, P30, P31, P35)

| Gate                               | Check                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Benchmark vs. baseline             | Documented latency/throughput delta, methodology in PR                                  |
| No new index without justification | PDR-020 style audit for any added index                                                 |
| No new `.collect()` without cap    | Every new query has either `.paginate()`, `.take(N)`, or `.first()`                    |

### 12.5 Architecture-pattern gates (P36–P43)

| Gate                               | Check                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Design session                     | ADR committed before any implementation                                                |
| Layering check                     | `dependency-cruiser` green (after P41)                                                 |
| Public-API compatibility           | Explicit Breaking / Non-Breaking classification in changeset                            |
| Consumer communication             | If breaking: announcement in CHANGELOG + migration note in README                      |

### 12.6 Convex-idiom gates (applicable to all Convex-touching patterns)

Per `CONVEX-DURABILITY-REFERENCE.md`:

- **Mutations** — never non-deterministic (no `fetch`, no `crypto.randomUUID()` — use `uuidv7()` only at non-transaction boundaries).
- **Actions** — never rely on automatic retry; use Action Retrier or Workpool if retry matters.
- **Workpool enqueue** — if per-entity ordering matters, note that Workpool v0.3.1 does not support `key:` and document the gap (per §2.6).
- **DCB conflict** — handle `{ status: "conflict" }` as a success status with manual retry + backoff; never expect Workpool mutation retry.
- **Scheduler** — `ctx.scheduler.runAfter(0, …)` is transactional; use it instead of promise chains.
- **Component boundaries** — parent-to-component calls within one mutation are ONE transaction; do not add compensation.

---

## 13. Commit & PR Plan

### 13.1 One pattern = one PR (with exceptions)

Default rule: each pattern ships in one PR. Exceptions are called out in the tranche sections (e.g., P11, P17, P14).

### 13.2 Branch naming

`feature/remediation/P<NN>-<kebab-pattern-name>`

Example: `feature/remediation/P11-component-boundary-auth-wrapper`

### 13.3 PR template (required fields)

```markdown
## Pattern
P<NN>: <name>
Links: ADR-0xx (if applicable), Spec: libar-platform/architect/specs/platform/<path>

## Findings closed
- <ID>: <short title>
- …

## Summary
<1–3 sentences on what changed and why>

## Test plan
- [ ] Regression anchor added (test that documents pre-fix failure)
- [ ] Acceptance tests added (per pattern's test list)
- [ ] Property/benchmark tests added (if applicable)
- [ ] All hooks pass (no `--no-verify`)
- [ ] CHANGELOG entry added

## Breaking change?
No / Yes (category: <API | contract | schema | behavior>)

## Convex idioms verified
- [ ] Transaction semantics: still single-transaction, no added compensation
- [ ] Component auth: verifyActor called or contract-status tagged
- [ ] `v.unknown()` over `v.any()` at boundaries
- [ ] No `.collect()` on growing tables without pagination
```

### 13.4 Commit message format (enforced by commitlint after Tranche 0 P02)

Conventional commits. Examples:

```
feat(platform-store): add idempotency enforcement to appendToStream (P14)
fix(platform-core): close tenant-spoofing window in appendToStream (P11, SC3)
refactor(platform-core): collapse createDeciderHandler duplication (P51, H2)
test(platform-store): add globalPosition precision property test (P17, TC5)
docs(platform-bus): add Known Limitations section (P45, DH1)
chore(ci): pin Convex Docker image to 1.31.7 (OH1)
```

### 13.5 Merge policy

- Squash merge; preserve the full test + code in the squashed commit.
- Main branch protection: all Tranche 0 P09 + P10 hardening in place; requires review approval + green CI + green architect-guard.
- Publish happens from main via changesets workflow, gated on manual dispatch.

### 13.6 Release cadence

- **v0.2.0-alpha.N** — pre-release cadence during Tranche 0 and 1 for integrators to test.
- **v0.2.0** — after Tranche 1 lands completely (auth + correctness + idempotency).
- **v0.3.0** — after Tranche 2 (perf + obs + validation; breaking if P26 drops external-consumer indexes).
- **v0.4.0** — after Tranche 3 architecture decisions (potentially breaking depending on split choice).
- **v0.5.0** — after Tranche 4 polish.
- **v1.0.0** — when Tranche 5 backlog is at stable residual level AND there's a public commitment to maintenance.

---

## 14. Risk Register

### 14.1 Strategic risks

| Risk                                                           | Impact | Likelihood | Mitigation                                                         |
| -------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------ |
| Team does not sustain tranche cadence                          | H      | M          | Tranche 0 lowers friction for everything else; split tranches into smaller PRs to keep momentum |
| Platform-core split (P42) balloons                             | H      | M          | Design session time-box; fallback to P36+P37+P41 only              |
| Breaking changes fragment consumers                            | M      | M          | Stage breaking via pre-release (-alpha), migration docs, CHANGELOG discipline |
| New test harness (P01) duplicates work if platform-core test infra evolves | M      | L          | Share as much convex-test helper code as possible; put common helpers in a shared testing subpath |
| Tranche 1 P11 PDR-014 requires app-side verifier implementation | M      | H          | PDR-014 accepts "verification proof" as an opaque arg; the exact shape is app-defined. The component checks it's present and valid (e.g., signed or session-scoped), not what it means. This lets the component land before the full app integration. |
| `globalPosition` migration (P17) loses historical event ordering | H      | L          | Migration reader preserves arithmetic comparability for pre-migration events; new events use new representation; PDR-015 covers migration plan |

### 14.2 Operational risks

| Risk                                                         | Impact | Likelihood | Mitigation                                                         |
| ------------------------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------ |
| `PUSH_ALL=1` / `SKIP_DOCKER_TESTS=1` bypass in Tranche 0 OC4  | M      | M          | Remove `PUSH_ALL=1`; rename `SKIP_DOCKER_TESTS=1` to `SKIP_INTEGRATION_TESTS=1` with warning banner; add test-verification log |
| Convex backend `:latest` drift breaks CI mid-tranche          | M      | M          | OH1 pins image in Tranche 0; post-Tranche 0, bumps are intentional |
| Dependabot floods PRs                                        | L      | M          | Weekly schedule; auto-merge disabled; bundle by ecosystem           |
| Coverage threshold blocks incidental PR work                  | L      | M          | Start thresholds at current; step up quarterly                     |

### 14.3 Correctness risks specific to Convex

| Risk                                                           | Impact | Likelihood | Mitigation                                                        |
| -------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------- |
| TS2589 cascade on a fix                                        | M      | M          | Run `pnpm typecheck` iteratively after each fix; keep a running log of which files are at depth-budget edge |
| Workpool partition TODO becomes silent ordering bug            | H      | L (already existing) | P32 observability flags it; Tranche 3 revisits once upstream ships the `key:` parameter |
| `v.any()` → `v.unknown()` migration breaks deserialization in consumers | M      | L          | Stage per-site; keep `v.any()` only at documented escape hatches (payload); CHANGELOG entry |
| Idempotency dedup (P14) mishandles concurrent same-key writes  | H      | L          | Property test with fast-check concurrent-writer simulation; transaction-level assertion |

---

## 15. Success Criteria

### 15.1 Quantitative

| Metric                                                | Start (review) | End of Tranche 1 | End of Tranche 4 | Notes                                           |
| ----------------------------------------------------- | -------------- | ---------------- | ---------------- | ----------------------------------------------- |
| Critical findings open                                | 29             | ≤8               | 0                |                                                 |
| High findings open                                    | 88             | ≤50              | ≤10              |                                                 |
| Medium findings open                                  | 120            | ≤100             | ≤50              |                                                 |
| Low findings open                                     | 73             | ≤73              | ≤60              | Low is a rolling burn-down                      |
| `platform-store` integration test count               | 0              | ≥10              | ≥30              |                                                 |
| Packages with `CHANGELOG.md`                          | 0/6            | 6/6              | 6/6              | Tranche 0 ships stubs; subsequent tranches feed  |
| Packages with `typecheck` script                     | 1/6            | 6/6              | 6/6              | Tranche 0 P08                                   |
| `v.any()` sites in component boundaries              | 33             | 33 (tagged)      | ≤3 (escape hatches only) | Tranche 2 P22                                  |
| Dead `events` indexes                                 | 4+             | 4+               | 0                | Tranche 2 P26                                   |
| ADRs committed                                        | 33             | 36+              | 41+              | 034, 035, 036, 037, 038, 039, 040, 041, 042     |
| Package test coverage (platform-core)                | unknown        | baseline         | ≥70%             | Tranche 4 P56                                   |
| Package test coverage (platform-bc / fsm / decider)  | unknown        | baseline         | ≥90%             |                                                 |

### 15.2 Qualitative

- A new contributor can read the six package READMEs + the Convex Idioms cheat-sheet and correctly use the platform without prior exposure. (Evaluate via a 1-hour onboarding session at end of Tranche 4.)
- A security auditor reviewing the component mutations finds explicit auth wrappers at every identity-bearing arg. (Red-team at end of Tranche 1.)
- An operator can observe command throughput, projection lag, and Workpool queue depth without writing their own telemetry. (Evaluate via the order-management example app at end of Tranche 2.)
- Every advertised contract in code is tagged `@contract-status: Enforced` or is documented in a Known Limitations section. (Grep-verifiable at end of Tranche 2.)
- The release process can ship a patch fix within 1 business day of a vulnerability being confirmed. (Dry-run at end of Tranche 0.)

### 15.3 Non-goals (explicit)

- **Not a zero-findings state.** Tranche 5 absorbs residuals; the bar is "acceptable residual" not "empty list."
- **Not a rewrite.** Every pattern preserves the Third Way paradigm. No replacement of CMS + events with traditional aggregates. No replacement of Convex components with microservices.
- **Not an uplift of Convex to 2.0 or similar.** Peer range may widen but we stay on current major.
- **Not a unification of the three rate-limiter files before understanding the delta.** P52 is conditional on confirming the delta is noise; if it's real, only two files collapse.
- **Not an elimination of `v.any()` from all payloads.** Payloads are intentionally opaque per-BC; the migration is to `v.unknown()` where appropriate + byte-caps, not schema validation everywhere.

---

## 16. Finding Disposition Matrix

Every Critical and High finding mapped to a pattern and tranche. Format: `Finding ID → Pattern → Tranche`. Mediums are grouped by cluster. Lows are implicitly Tranche 4/5 unless clustered into an earlier pattern.

### 16.1 Critical findings (29)

| Finding    | Pattern  | Tranche | Notes                                                              |
| ---------- | -------- | ------- | ------------------------------------------------------------------ |
| C1         | P12      | 1       | Invert fail-open → fail-closed                                     |
| C2         | P13      | 1       | Require correlationId                                              |
| C3         | P14      | 1       | Implement idempotency OR remove contract (PDR-018)                 |
| SC1        | P11      | 1       | Auth wrapper on approve/reject                                     |
| SC2        | P19      | 1       | Expiration-check ordering                                          |
| SC3        | P11      | 1       | Auth wrapper on appendToStream                                     |
| SC4        | P11      | 1       | Auth wrapper on audit.record                                       |
| DC1, DC2, DC3, DC4, DC5 | P11 (DC1, DC2), P46 (DC3), P45 (DC4, DC5), P04 (DC2) | 0–2 | Doc critical findings distributed                   |
| M17/AM10/PM2 | P17    | 1       | globalPosition (PDR-015)                                           |
| AM11       | P18      | 1       | PM FSM parity                                                      |
| AC1        | P42 (opt) / P41 | 3 | Depends on design session                                           |
| AC2        | P42 (opt) | 3     | deferred-to-Tranche-3-PDR-017; acknowledged follow-on architecture work |
| AC3        | P43 (opt) | 3     | Conditional                                                        |
| AC4        | P21      | 1       | resolved-via-PDR-021; accepted constrained runtime dependency      |
| PC1        | P27      | 2       | getByCorrelation pagination                                        |
| PC2        | P35      | 2       | readVirtualStream denormalization                                  |
| TC1, TC2, TC3, TC4, TC5 | P01 (TC1), P11 tests (TC2), P49 (TC3), Tranche 1 patterns (TC4, TC5) | 0–4 |                                            |
| BC1        | P06      | 0       | Phantom @types/uuid — likely **closed by upgrade**; verify in delta memo |
| BC2        | P06      | 0       | optionalPeerDependencies — structural, unaffected by upgrade        |
| OC1, OC2, OC3, OC4 | P02, P03, P01, P10 | 0 | All Tranche 0                                                        |

### 16.2 High findings (88) — by cluster

Listing clusters rather than individual IDs to keep this section navigable. Phase files retain the full titles.

| Cluster                                            | Example IDs                                   | Patterns           | Tranche |
| -------------------------------------------------- | --------------------------------------------- | ------------------ | ------- |
| Component-boundary identity forgery extensions     | SH1, SH3, SH11                                | P11                | 1       |
| Systemic `v.any()` + unbounded payload            | SH2, SM1, SM5, SM7, SM8, SM12, SM14, AM6, AM16, S10 | P22, P28          | 2       |
| Handler-factory duplication                        | H2, M3, M4                                    | P51                | 4       |
| Scattered utilities                                | H3, H4, H9, L8                                | P15, P51           | 1, 4    |
| Stale placeholder / project-rule violations        | H5, H6, M10, L10                              | P20, P49           | 1, 4    |
| Orchestration & concurrency correctness            | AH9, AH10, M6, PH2, PH3, PM16                 | P23, P29           | 2       |
| Unbounded `.collect()` on growing tables          | PH1, PH4, PH5, PH6, PH7, PH8, PL6             | P24, P27, P30, P31, P34 | 2     |
| Package-layering weaknesses                        | AH1, AH2, AH3, AM2, AM4, AM13                 | P37, P39, P40      | 3       |
| Testing infrastructure                             | TH1–TH11                                      | P01, P49, P56      | 0, 4    |
| Doc drift                                          | DH1–DH12                                      | P45, P46, P47, P48 | 4       |
| Framework hygiene                                  | BH1–BH8                                       | P07, P08, P10      | 0       |
| CI/CD hardening                                    | OH1–OH11                                      | P09, P10           | 0       |
| PM FSM duplication                                 | AM11                                          | P18                | 1       |
| Scope-key duplication                              | AH6, AM3                                      | P36                | 3       |
| Reactive projection category leak                  | AM15                                          | P40                | 3       |
| Command taxonomy in core not bc                    | AM13                                          | P36                | 3       |
| Batch limits + payload caps                        | AM6, AM16                                     | P22, P28           | 2       |
| Public wrappers with no value                      | AH11                                          | P38                | 3       |
| Rate limiter fragmentation                         | AH13, AL6                                     | P52                | 4       |

### 16.3 Medium findings (120) — clusters

| Cluster                                         | Patterns covering              | Tranche |
| ----------------------------------------------- | ------------------------------ | ------- |
| Over-abstracted `platform-bc` definition layer  | P53                            | 4       |
| Complexity hotspots                             | P50                            | 4       |
| Per-request allocation tax                      | P50, P23 (via pool metrics)    | 2, 4    |
| Rate-limiter consolidation                      | P52                            | 4       |
| Index-usage audit                               | P26                            | 2       |
| Testing polish                                  | P56, P47                       | 4       |
| Doc polish                                      | P45, P46, P48                  | 4       |
| Release process                                 | P02                            | 0       |
| Dep scanning                                    | P03                            | 0       |
| Node version matrix, smoke tests, etc.          | Tranche 5                      | 5       |

### 16.4 Low findings (73)

Low findings are absorbed by whichever pattern touches the same file. Otherwise they're triaged quarterly in Tranche 5. A representative sample:

- Error-message quality (DH11) → P48 (Tranche 4)
- Unused error codes (L10) → P20 (Tranche 1) or purged opportunistically
- `toBeDefined()` overuse (TM4) → swept in Tranche 4 as part of P56 coverage work
- Justfile hardcoded secrets (OM17, OH4) → P02/P10 (Tranche 0)

---

## 17. Cross-Tranche Conventions

### 17.1 How new component mutations are introduced (post-PDR-014)

Every new component mutation MUST:

1. Accept a `verificationProof: v.union(...)` arg alongside business args.
2. Call `verifyActor(ctx, args, args.verificationProof)` before any `ctx.db.insert/patch/delete`.
3. Return a typed result (not `v.any()`); if payloads are opaque, use `v.unknown()` + size check.
4. Include contract-status JSDoc: `@contract-status: Enforced`.
5. Ship with unit + integration tests, including a forgery-rejection test.

### 17.2 How docs stay in sync

- Generated docs live in `libar-platform/docs-living/`. Never edit manually.
- `pnpm docs:all` runs in pre-commit via architect-guard.
- Package READMEs are hand-authored but regenerated on release.
- ADRs are numbered and never deleted (mark superseded).

### 17.3 Spec lifecycle for this plan

This document itself is not a spec. But every pattern (P01–P58) gets a spec drafted in a planning session, before implementation. Spec template:

```gherkin
@architect
@architect-pattern:P<NN>-<kebab-name>
@architect-status:roadmap
@architect-area:platform
@architect-quarter:<YYYY-Q>
@architect-team:platform
Feature: <Pattern Name>

  Background:
    # Deliverables table
    | Deliverable | Description | Test |
    | ... | ... | ... |

  Rule: <rule-text>
    @happy-path
    Scenario: <scenario>
      ...
    @validation
    Scenario: <failure>
      ...
```

Each pattern's Deliverables table MUST include its test commitments from §11 and §12.

### 17.4 Escalation

- If a pattern surfaces a new Critical finding: stop, document, escalate to the team, revise this plan.
- If a gate cannot be met (e.g., `pnpm test:integration` fails on a transient issue three runs in a row): escalate to the team; do not `--no-verify`.
- If a design session stalls past its time-box: fall back to the explicit default option documented in this plan.

---

## 18. Appendix — PDR Index (Proposed)

| PDR      | Title                                                      | Tranche | Pattern    |
| -------- | ---------------------------------------------------------- | ------- | ---------- |
| PDR-014  | Component-Boundary Authentication Convention               | 1       | P11        |
| PDR-015  | `globalPosition` Numeric Representation                    | 1       | P17        |
| PDR-016  | `projectionPool` Split — Named Pools per Concern           | 2       | P23        |
| PDR-017  | Tranche 3 Platform Architecture Gate                       | 3       | P42 / P43  |
| PDR-018  | Idempotency Enforcement for `appendToStream`               | 1       | P14        |
| PDR-019  | `v.any()` vs `v.unknown()` Boundary Policy                 | 2       | P22        |
| PDR-020  | `events` Table Index Policy                                | 2       | P26        |
| PDR-021  | `platform-store` Runtime Dependency on `platform-core` Accepted with Constraints | 1       | P21        |
| ADR-041  | Logger Injection & Security-Event Non-Suppression          | 2       | P32, P33   |
| ADR-042  | Contract Status JSDoc Convention                           | 0       | P04        |

PDR-007 (release process) is drafted alongside P02 in Tranche 0.

---

## 19. Appendix — Pattern Index (Flat List)

For ease of tracking. Every pattern gets a spec in `libar-platform/architect/specs/platform/`.

| ID   | Name                                                          | Tranche | ADR/PDR        |
| ---- | ------------------------------------------------------------- | ------- | -------------- |
| P01  | Platform-store integration test harness                       | 0       | —              |
| P02  | Release automation + CHANGELOG discipline                     | 0       | PDR-007        |
| P03  | Dependency scanning in CI                                      | 0       | —              |
| P04  | Contract Status JSDoc convention                              | 0       | ADR-042        |
| P05  | `@convex-es/*` → `@libar-dev/*` doc rename                    | 0       | —              |
| P06  | Dependency hygiene pass                                       | 0       | —              |
| P07  | TS/ESLint strictness step-up                                   | 0       | —              |
| P08  | Per-package `typecheck` scripts + vitest config alignment      | 0       | —              |
| P09  | Architect-guard in CI                                         | 0       | —              |
| P10  | CI/CD hardening step-1                                         | 0       | —              |
| P11  | Component-boundary authentication convention                  | 1       | PDR-014        |
| P12  | `ensureTestEnvironment` fail-closed                           | 1       | —              |
| P13  | `correlationId` fabrication removal                           | 1       | —              |
| P14  | Idempotency enforcement for `appendToStream`                  | 1       | PDR-018        |
| P15  | Agent ID generation centralization                            | 1       | —              |
| P16  | `isAuthorizedReviewer` default-deny                           | 1       | —              |
| P17  | `globalPosition` representation fix                           | 1       | PDR-015        |
| P18  | PM FSM single source of truth                                 | 1       | —              |
| P19  | `safeApproveAction` expiration ordering                        | 1       | —              |
| P20  | Agent lifecycle stubs: throw or remove                        | 1       | —              |
| P21  | `platform-store` constrained `platform-core` runtime dep      | 1       | PDR-021        |
| P22  | `v.unknown()` + byte-size cap at component boundaries         | 2       | PDR-019        |
| P23  | Workpool split (projection / saga / fanout)                   | 2       | PDR-016        |
| P24  | `recordCommand` post-insert dedup removal                     | 2       | —              |
| P25  | `readFromPosition` `hasMore` signal + event-type index        | 2       | —              |
| P26  | `events` index audit & cleanup                                | 2       | PDR-020        |
| P27  | `getByCorrelation` pagination                                 | 2       | —              |
| P28  | `appendToStream` batch cap                                    | 2       | —              |
| P29  | Orchestrator `Promise.all` concurrency cap                     | 2       | —              |
| P30  | Audit-record compound index                                   | 2       | —              |
| P31  | Checkpoint bulk-patch parallelization                         | 2       | —              |
| P32  | Observability primitives (`PlatformMetrics`)                  | 2       | ADR-041        |
| P33  | Logger defaults-to-console                                    | 2       | ADR-041        |
| P34  | `cleanupExpired` pagination + default cron                    | 2       | —              |
| P35  | `readVirtualStream` denormalization                           | 2       | —              |
| P36  | `platform-contracts-shared` package                           | 3       | —              |
| P37  | Re-export shim deletion                                       | 3       | —              |
| P38  | Client classes → functions                                    | 3       | —              |
| P39  | `platform-bus` agent-subscription.ts relocation               | 3       | —              |
| P40  | `platform-core` root index slimming                           | 3       | —              |
| P41  | Dependency-cruiser layering rules                             | 3       | —              |
| P42  | `platform-core` monolith split (OPTIONAL)                      | 3       | PDR-017        |
| P43  | `platform-store` kitchen-sink split (OPTIONAL)                | 3       | PDR-017        |
| P45  | Documentation rewrite (package READMEs)                        | 4       | —              |
| P46  | "Convex Idioms We Use" cheat-sheet                            | 4       | —              |
| P47  | Per-package TESTING.md                                         | 4       | —              |
| P48  | Error-message style guide                                     | 4       | —              |
| P49  | Production-hardening stubs implementation                     | 4       | —              |
| P50  | Complexity hotspot refactoring                                 | 4       | —              |
| P51  | Duplicated factory consolidation                              | 4       | —              |
| P52  | Rate-limiter consolidation                                    | 4       | —              |
| P53  | `platform-bc` definition-layer consolidation                  | 4       | —              |
| P54  | Error-class modernization                                      | 4       | —              |
| P55  | `instanceof` tests for custom Error classes                   | 4       | —              |
| P56  | Coverage tooling + thresholds                                 | 4       | —              |
| P57  | Deferred-implementation docs                                  | 4       | —              |
| P58  | Error taxonomy at orchestrator boundary                        | 4       | —              |

---

## 20. Closing Note

The platform is substantially more sophisticated than most codebases at this stage. The five structural issues identified in §1 compound into ~40% of individual findings; fix the five and the Medium/Low tail shrinks disproportionately. The 10-row leverage table from `05-final-report.md` is the fastest path from 329 findings to a maintainable backlog, and this plan realizes it as an ordered, test-first, FSM-governed delivery stream.

No implementation happens from this document directly. Every pattern gets a planning session that produces a `@architect-pattern` spec in `libar-platform/architect/specs/platform/`. Every spec gets an implementation session that respects FSM transitions, ships tests first as regression anchors, and passes every quality gate in §12. Every change ships in a small, reviewable PR.

**Start point:** draft P01 and P02 specs in a Tranche 0 planning session. Everything else follows.
