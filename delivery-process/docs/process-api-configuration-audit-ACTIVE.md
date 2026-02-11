# Process API Configuration Audit — Monorepo vs Package

> **Purpose:** Cross-context configuration reference. Documents all delivery process
> configuration differences between the monorepo (consumer) and the `delivery-process`
> package (producer), with discrepancy analysis, fixes applied, and follow-up actions.
>
> **Branch:** `feature/process-api-for-repo-context`
> **Created:** 2026-02-09 | **Auditor:** Claude Code session

---

## 1. Executive Summary

**8 discrepancies found** between the monorepo-level and package-level delivery process
configurations. Three fixed (D-1 prior, D-7 and D-8 this session), two need upstream package
fixes, two deferred for later monorepo sessions, and one confirmed as intentional.

| Category                          | Count | Issues | Status                                                              |
| --------------------------------- | ----- | ------ | ------------------------------------------------------------------- |
| Fixed (prior code changes)        | 1     | D-1    | 23 agent stubs: `* Target:` -> `@libar-docs-target`                 |
| Fixed (validation session)        | 2     | D-7,8  | CLAUDE.md count 19→21; linter false positive on `.md` prose         |
| Upstream fix needed (package)     | 2     | D-2,3  | Missing decisions glob; non-recursive spec glob                     |
| Deferred (monorepo, needs design) | 2     | D-5,6  | PDR status tags (design decision); doc generator asymmetry (future) |
| Intentional (no action)           | 1     | D-4    | Taxonomy preset difference                                          |

**158 patterns** in the current dataset (up from 142 after earlier `@libar-docs` opt-in fixes).

---

## 2. Configuration Contexts

### Two Contexts, One Pipeline

The `delivery-process` package publishes CLI tools (`process-api`, `lint-process`,
`generate-docs`, etc.) consumed by the monorepo via `@libar-dev/delivery-process` git
dependency. Each context has its own `package.json` scripts with independently configured
glob patterns.

| Aspect          | Monorepo (`package.json` root)       | Package (`deps-packages/delivery-process/package.json`) |
| --------------- | ------------------------------------ | ------------------------------------------------------- |
| **Config file** | `delivery-process.config.js`         | `delivery-process.config.ts`                            |
| **Import**      | `from "@libar-dev/delivery-process"` | `from "./src/index.js"`                                 |
| **Preset**      | `ddd-es-cqrs` (21 categories)        | `libar-generic` (3 categories)                          |
| **Tag prefix**  | `@libar-docs-`                       | `@libar-docs-`                                          |
| **CLI binary**  | `process-api` (installed)            | `tsx src/cli/process-api.ts` (direct)                   |

### `process:query` Globs

| Input Type               | Monorepo Globs                                                               | Package Globs                                      |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| **TS sources (`-i`)**    | `libar-platform/packages/*/src/**/*.ts`                                      | `src/**/*.ts`                                      |
|                          | `libar-platform/examples/order-management/convex/**/*.ts`                    |                                                    |
| **Stubs (`-i`)**         | `libar-platform/delivery-process/stubs/**/*.ts`                              | `delivery-process/stubs/**/*.ts`                   |
| **Specs (`-f`)**         | `libar-platform/delivery-process/specs/**/*.feature` (recursive)             | `delivery-process/specs/*.feature` (non-recursive) |
| **Decisions (`-f`)**     | `libar-platform/delivery-process/decisions/*.feature`                        | **MISSING**                                        |
| **Releases (`-f`)**      | `libar-platform/delivery-process/releases/*.feature`                         | `delivery-process/releases/*.feature`              |
| **Package tests (`-f`)** | `libar-platform/packages/platform-core/tests/features/behavior/**/*.feature` | N/A                                                |

### `docs:*` Script Coverage

The monorepo has 19 `docs:*` scripts. Key coverage differences:

| Content Type                                     | Scripts That Include                                                                   | Scripts That Exclude                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------- |
| **Platform TS** (`packages/*/src/**/*.ts`)       | `docs:patterns`, `docs:roadmap`, `docs:pr-changes`, `docs:changelog`, all `docs:prd:*` | `docs:remaining-work` (inconsistency) |
| **Delivery TS** (`delivery-process/src/**/*.ts`) | `docs:patterns`, `docs:roadmap`, `docs:pdrs`, `docs:pr-changes`, `docs:changelog`      | Most scripts don't need it            |
| **Stubs** (`delivery-process/stubs/**/*.ts`)     | **NONE**                                                                               | All `docs:*` scripts                  |
| **Decisions** (`decisions/*.feature`)            | `docs:pdrs`, `docs:changelog` (2 of 19)                                                | 17 other scripts                      |
| **Releases** (`releases/*.feature`)              | `docs:changelog` only                                                                  | Most scripts                          |

### Validation Scripts

| Script          | Monorepo Globs                          | Package Globs                                                                                                      |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `lint:patterns` | `libar-platform/packages/*/src/**/*.ts` | `src/**/*.ts` + `delivery-process/stubs/**/*.ts`                                                                   |
| `lint-process`  | `lint-process` (bare CLI, no flags)     | `tsx src/cli/lint-process.ts --staged`                                                                             |
| `validate:all`  | N/A (not defined at root)               | `-i 'src/**/*.ts' -i 'delivery-process/stubs/**/*.ts' -F 'delivery-process/specs/*.feature' --dod --anti-patterns` |

---

## 3. Discrepancy Register

| #       | Description                                    | Severity    | Status     | Action                                                                       |
| ------- | ---------------------------------------------- | ----------- | ---------- | ---------------------------------------------------------------------------- |
| **D-1** | 23 agent stubs with broken `* Target:` format  | **HIGH**    | **FIXED**  | `@libar-docs-target` tags added to all 23 files                              |
| **D-2** | Package `process:query` missing decisions glob | MEDIUM      | UPSTREAM   | Cannot fix in read-only subtree; needs upstream package fix                  |
| **D-3** | Non-recursive vs recursive spec globs          | LOW         | DOCUMENTED | No functional impact (no spec subdirectories in package)                     |
| **D-4** | Taxonomy preset difference                     | INTENTIONAL | N/A        | `libar-generic` (3 cat) vs `ddd-es-cqrs` (21 cat) — correct for each context |
| **D-5** | PDRs 011-013 missing `@libar-docs-status`      | LOW         | DOCUMENTED | Pure decisions with `@libar-docs-adr-status:accepted` only                   |
| **D-6** | Doc generator asymmetry (stubs/decisions)      | MEDIUM      | DOCUMENTED | Stubs in 0 of 19 `docs:*` scripts; decisions in 2 of 19                      |
| **D-7** | CLAUDE.md says "19 categories" but code has 21 | LOW         | **FIXED**  | Source modules updated 19→21; `pnpm claude:build` regenerated                |
| **D-8** | Process Guard linter false positive on `.md`   | **HIGH**    | **FIXED**  | Prose rewritten to avoid regex match; upstream file-extension filter needed  |

---

## 4. Discrepancy Detail

### D-1: Agent Stubs — `* Target:` vs `@libar-docs-target` [FIXED]

**What:** 23 agent stubs across 4 directories used `* Target: path` as a description-line
in the JSDoc body. The scanner's `extractSingleValue()` at `ast-parser.ts:111-117` only
matches the `@libar-docs-target` JSDoc tag format, so `targetPath` was `undefined` for all
23 stubs.

**Where:** `libar-platform/delivery-process/stubs/agent-{component-isolation,action-handler,command-routing,lifecycle-fsm}/`

**Impact:** `pnpm process:query -- stubs` returned empty `targetPath` for all agent stubs.
Design session context assembly could not show implementation target locations.

**Resolution:** Transformed all 23 files:

- Moved target path from description body to `@libar-docs-target` JSDoc tag
- Stripped parenthetical annotations from tag values (5 files had them)
- For `eventbus-publish-update.ts` (dual targets): primary target as `@libar-docs-target`,
  secondary target preserved as `* Also modifies:` description line

**Edge cases handled:**

| File                          | Original Annotation                          | Clean `@libar-docs-target`                              |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `lifecycle-audit-events.ts`   | `(extends existing auditEventTypeValidator)` | `platform-core/src/agent/component/audit.ts`            |
| `agent-subscription.ts`       | `(merge with existing)`                      | `platform-bus/src/agent-subscription.ts`                |
| `event-subscription-types.ts` | `(replace EventSubscription definition)`     | `platform-core/src/eventbus/types.ts`                   |
| `agent-bc-config.ts`          | `(evolution of existing)`                    | `platform-core/src/agent/types.ts`                      |
| `eventbus-publish-update.ts`  | 2 Target lines                               | Primary: `platform-core/src/eventbus/ConvexEventBus.ts` |

**Verification:** All 23 stubs now return `targetPath` via `pnpm process:query -- stubs`:

- AgentBCComponentIsolation: 8 stubs resolved
- AgentLLMIntegration: 5 stubs resolved
- AgentCommandInfrastructure: 10 stubs resolved
- All show `targetExists: false` (correct — roadmap patterns, no implementation yet)

### D-2: Package `process:query` Missing Decisions Glob [UPSTREAM]

**What:** The package-local `process:query` script (line 98 of `deps-packages/delivery-process/package.json`)
uses `--features 'delivery-process/specs/*.feature' --features 'delivery-process/releases/*.feature'`
but does NOT include `delivery-process/decisions/*.feature`.

**Where:** `deps-packages/delivery-process/package.json:98`

**Impact:** When running `pnpm process:query` from within the package, all 13 decision files
(PDR-001 through PDR-013) are invisible to the Process API. This was already fixed in the monorepo root script
(which includes `-f 'libar-platform/delivery-process/decisions/*.feature'`).

**Resolution:** Cannot fix in the monorepo — `deps-packages/delivery-process/` is a read-only
git subtree. The fix must be applied upstream in the `delivery-process` repo and pulled via
the next subtree update.

**Upstream fix:** Add `--features 'delivery-process/decisions/*.feature'` to the `process:query`
script in `deps-packages/delivery-process/package.json`.

### D-3: Non-Recursive vs Recursive Spec Globs [DOCUMENTED]

**What:** Package uses `specs/*.feature` (single-level glob). Monorepo uses `specs/**/*.feature`
(recursive glob).

**Where:**

- Package: `deps-packages/delivery-process/package.json:98` — `delivery-process/specs/*.feature`
- Monorepo: `package.json:83` — `libar-platform/delivery-process/specs/**/*.feature`

**Impact:** Currently no functional impact — all 40 package specs are at the top level
(`delivery-process/specs/`), no subdirectories exist. Would matter if spec subdirectories
were introduced in the package (e.g., `specs/api/`, `specs/codecs/`).

**Resolution:** Document for awareness. Consider making the package glob recursive (`**/*.feature`)
in the upstream repo.

### D-4: Taxonomy Preset Difference [INTENTIONAL]

**What:** The package uses `libar-generic` preset (3 categories: core, api, infra). The monorepo
uses `ddd-es-cqrs` preset (21 categories including domain, bounded-context, event-sourcing,
decider, etc.).

**Where:**

- Package: `deps-packages/delivery-process/delivery-process.config.ts`
- Monorepo: `delivery-process.config.js`

**Impact:** None — this is the correct design. The package is a general-purpose toolkit with
simple categorization. The monorepo is a DDD/ES/CQRS system requiring fine-grained categories.
Both share the same `@libar-docs-` tag prefix.

### D-5: PDRs 011-013 Missing `@libar-docs-status` [DOCUMENTED]

**What:** Three newer PDRs (pdr-011-agent-action-handler-architecture, pdr-012-agent-command-routing,
pdr-013-agent-lifecycle-fsm) have `@libar-docs` opt-in and `@libar-docs-adr-status:accepted`
but do NOT have a `@libar-docs-status` FSM tag.

**Where:** `libar-platform/delivery-process/decisions/pdr-011*.feature`, `pdr-012*.feature`, `pdr-013*.feature`

**Impact:** The Gherkin extractor requires `@libar-docs-status` at Gate 3 (`gherkin-extractor.ts:189-193`).
Without it, these PDRs are parsed but filtered out as "pattern references, not pattern definitions."
They are still visible via the decisions glob in `process:query` output.

**Resolution:** May be intentional — these are accepted design decisions, not lifecycle-tracked
patterns. If they should appear in roadmap/status queries, add the `completed` lifecycle status tag.
Otherwise, leave as-is.

### D-6: Doc Generator Asymmetry [DOCUMENTED]

**What:** The 19 `docs:*` scripts have inconsistent coverage of stubs, decisions, and releases.

**Where:** `package.json` lines 57-79 (monorepo root)

**Key gaps:**

- **Stubs** (`delivery-process/stubs/**/*.ts`): Included in `process:query` input but **zero** `docs:*` scripts
- **Decisions** (`decisions/*.feature`): Only in `docs:pdrs` and `docs:changelog` (2 of 19)
- **Releases** (`releases/*.feature`): Only in `docs:changelog` (1 of 19), plus some `docs:roadmap`/`docs:remaining` variants

**Impact:** Stub metadata (implementations, target paths, design decisions) does not appear in
generated documentation. The Process API surfaces this data, but the doc generators don't.

**Resolution:** The codec-driven reference generation system is now implemented downstream
(delivery-process PR #19). The `docs:reference` generator produces all 22 reference documents
from convention-tagged decision records. The monorepo-level `docs:*` scripts still have the
asymmetry noted above, but the downstream package handles reference document generation directly.

### D-7: CLAUDE.md Category Count [FIXED]

**What:** CLAUDE.md mentions "19 categories" for the `ddd-es-cqrs` preset in two source modules,
but the actual count in `categories.ts` is 21 entries.

**Where:**

- Source of truth: `deps-packages/delivery-process/src/taxonomy/categories.ts` (21 entries)
- Stale references (now fixed):
  - `_claude-md/delivery-process/process-guard.md:86` — "19 categories" → "21 categories"
  - `_claude-md/delivery-process/source-annotations.md:9` — "19 DDD/ES/CQRS domains" → "21"
  - `_claude-md/delivery-process/source-annotations.md:12` — "19 categories" → "21 categories"

**Impact:** Minor documentation inaccuracy. The source code was always correct.

**Resolution:** Fixed in this validation session. Source modules updated, `pnpm claude:build`
regenerated `CLAUDE.md` with correct count.

### D-8: Process Guard Linter False Positive on Markdown [FIXED — workaround]

**What:** This audit document itself triggers a `lint-process` error because the Process Guard
linter's `detectStatusTransitions()` regex scans ALL staged files regardless of file extension.
Markdown prose containing the literal pattern `@libar-docs-status:VALUE` is treated as a real
FSM status transition.

**Where:** `detect-changes.ts:357-500` — `detectStatusTransitions()` function

**Root cause chain:**

1. The audit file is newly added (`A` in git status), so every line appears as `+` in the diff
2. The regex `@libar-docs-status:(\w+)` matches literal tag references in prose (lines 196, 301)
3. For new files, `fromStatus` defaults to `'roadmap'` (from `status-values.ts:43`)
4. The matched `completed` value creates an apparent `roadmap → completed` transition
5. This violates the FSM (must go `roadmap → active → completed`), triggering the error

**Why existing safeguards did not help:**

- `isGeneratedDocsPath` exclusion (line 321-324) covers `docs-living/`, `docs-generated/`,
  `docs/generated/` — but NOT `delivery-process/docs/`
- Docstring awareness (lines 412-417) tracks `"""` boundaries — irrelevant for `.md` files
- No file-extension filtering exists in the function

**Workaround applied:** Rewrote prose references to avoid the colon-joined `tag:value` format.
The bare tag name `@libar-docs-status` (without `:value`) does not trigger the regex.

**Proper upstream fix needed:** Add file-extension filtering to `detectStatusTransitions()` —
only scan `.ts` and `.feature` files, or add `delivery-process/docs/` to `isGeneratedDocsPath`.

---

## 5. Script Inventory

### Monorepo Root (`package.json`)

| Script                   | TS Inputs (`-i`)                | Feature Inputs (`-f`/`--features`)            | Has Stubs? | Has Decisions? | Has Releases? |
| ------------------------ | ------------------------------- | --------------------------------------------- | ---------- | -------------- | ------------- |
| `process:query`          | packages, order-mgmt, **stubs** | specs, decisions, releases, pkg-tests         | **Yes**    | **Yes**        | **Yes**       |
| `lint:patterns`          | packages only                   | N/A                                           | No         | N/A            | N/A           |
| `lint-process`           | (bare CLI)                      | (bare CLI)                                    | N/A        | N/A            | N/A           |
| `docs:patterns`          | packages, delivery-ts           | specs, order-mgmt tests                       | No         | No             | No            |
| `docs:roadmap`           | packages, delivery-ts           | specs, pkg-tests, order-mgmt tests            | No         | No             | No            |
| `docs:remaining-work`    | packages only                   | order-mgmt tests only                         | No         | No             | No            |
| `docs:pdrs`              | delivery-ts                     | **decisions**                                 | No         | **Yes**        | No            |
| `docs:changelog`         | packages, delivery-ts           | specs, **decisions**, **releases**, pkg-tests | No         | **Yes**        | **Yes**       |
| `docs:pr-changes`        | packages, delivery-ts           | specs, pkg-tests                              | No         | No             | No            |
| `docs:prd:*` (7 scripts) | packages, delivery-ts           | specs, pkg-tests                              | No         | No             | No            |
| `docs:business-rules`    | packages, delivery-ts           | specs                                         | No         | No             | No            |
| `docs:architecture`      | packages, delivery-ts           | specs                                         | No         | No             | No            |

### Package (`deps-packages/delivery-process/package.json`)

| Script              | TS Inputs      | Feature Inputs                 | Has Stubs? | Has Decisions? | Has Releases? |
| ------------------- | -------------- | ------------------------------ | ---------- | -------------- | ------------- |
| `process:query`     | src, **stubs** | specs, releases                | **Yes**    | **No**         | **Yes**       |
| `lint:patterns`     | src, stubs     | N/A                            | Yes        | N/A            | N/A           |
| `validate:all`      | src, stubs     | specs                          | Yes        | No             | No            |
| `docs:patterns`     | src, stubs     | specs, releases                | Yes        | No             | Yes           |
| `docs:decisions`    | src            | **decisions**                  | No         | **Yes**        | No            |
| `docs:changelog`    | src, stubs     | specs, releases, **decisions** | Yes        | **Yes**        | **Yes**       |
| Most other `docs:*` | src, stubs     | specs, releases                | Yes        | No             | Yes           |

---

## 6. Stub Resolution Status (Post-Fix)

All 26 monorepo stubs now have `targetPath` populated:

| Stub Group                   | Pattern                    | Count | Target Prefix                                                                  | `targetExists` |
| ---------------------------- | -------------------------- | ----- | ------------------------------------------------------------------------------ | -------------- |
| `agent-component-isolation/` | AgentBCComponentIsolation  | 8     | `platform-core/src/agent/component/`                                           | false          |
| `agent-action-handler/`      | AgentLLMIntegration        | 5     | `platform-core/src/agent/`, `platform-bus/src/`, `platform-core/src/eventbus/` | false          |
| `agent-command-routing/`     | AgentCommandInfrastructure | 5     | `platform-core/src/agent/`                                                     | false          |
| `agent-lifecycle-fsm/`       | AgentCommandInfrastructure | 5     | `platform-core/src/agent/`                                                     | false          |

**Total: 23 stubs, 0 resolved (all roadmap), 23 with populated `targetPath`.**

> **Note:** 3 codec-driven-reference-generation stubs were removed — implemented downstream in delivery-process PR #19.

The 10 package-level stubs in `deps-packages/delivery-process/` already used the correct
`@libar-docs-target` format and were not affected.

---

## 7. Recommendations

### Priority 1 (Next Package Release)

| #   | Action                                                                             | Effort | Where                            |
| --- | ---------------------------------------------------------------------------------- | ------ | -------------------------------- |
| R-1 | Add `--features 'delivery-process/decisions/*.feature'` to package `process:query` | 5 min  | Upstream `delivery-process` repo |
| R-2 | Make package spec glob recursive (`specs/**/*.feature`)                            | 5 min  | Upstream `delivery-process` repo |

### Priority 1b (Next Package Release — Linter)

| #   | Action                                                                                 | Effort | Where                            |
| --- | -------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| R-8 | Add file-extension filter to `detectStatusTransitions()` (only `.ts`/`.feature` files) | 15 min | Upstream `delivery-process` repo |

### Priority 2 (Next Monorepo Session)

| #       | Action                                                                      | Effort | Where                                                   |
| ------- | --------------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| ~~R-3~~ | ~~Run `pnpm claude:build` to fix "19 categories" -> "21 categories"~~       | —      | **DONE** — fixed in validation session                  |
| R-4     | Decide on PDRs 011-013: add the `completed` lifecycle status or leave as-is | 10 min | `decisions/pdr-011*.feature` through `pdr-013*.feature` |

### Priority 3 (Future — Partially addressed by CodecDrivenReferenceGeneration, now completed downstream)

| #   | Action                                                        | Effort | Where               | Status                                                                                               |
| --- | ------------------------------------------------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| R-5 | Add stubs to `docs:*` generator input globs                   | Medium | `package.json` root | Open — downstream `docs:reference` handles reference docs but monorepo `docs:*` still excludes stubs |
| R-6 | Add decisions/releases to more `docs:*` scripts               | Medium | `package.json` root | Open — same asymmetry remains                                                                        |
| R-7 | Ensure `docs:remaining-work` includes all platform TS sources | Small  | `package.json` root | Open                                                                                                 |

---

## 8. Scanner Architecture Reference

For context on why D-1 occurred, here is the extraction chain:

```
JSDoc Tag Format (works):
  @libar-docs-target src/path.ts
    -> ast-parser.ts:extractSingleValue() regex matches
    -> metadataResults.set('target', value)
    -> directive.target = value
    -> pattern.targetPath = value

Gherkin Tag Format (works):
  @libar-docs-target:src/path.ts
    -> gherkin-ast-parser.ts:normalized.startsWith('target:')
    -> metadata.target = normalized.substring(7)

Description Line Format (DOES NOT WORK):
  * Target: src/path.ts
    -> Not matched by any regex
    -> targetPath remains undefined
```

The registry-driven metadata extraction at `ast-parser.ts:559-564` iterates `registry.metadataTags`,
constructing the full tag string `@libar-docs-target` before searching the JSDoc comment text.
Description lines are never searched because they don't match the `@libar-docs-` prefix pattern.
