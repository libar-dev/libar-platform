# Release Configuration Template

> **Purpose:** Configure releases using TypeScript phase files as process metadata source
> **Status:** Active - validated approach
> **PDR Reference:** PDR-002 - TypeScript Process Metadata, PDR-003 - Behavior Feature File Structure, PDR-006 - Tag Registry Harmonization

---

## Overview

This template guides the creation of TypeScript phase files with `@libar-docs-*` JSDoc annotations as the primary source for process metadata. This approach replaces ceremonial DataTable content in timeline `.feature` files.

**Vision:** Programmatic, flexible approach that can generate any roadmap, changelog, delivery phase, or PR change documents required.

---

## Tag Prefix Strategy

The monorepo uses **two intentional tag prefixes** for different contexts:

| Prefix             | Used In               | Purpose                               | Registry                              |
| ------------------ | --------------------- | ------------------------------------- | ------------------------------------- |
| `@libar-docs-*`    | TypeScript files      | Pattern documentation, phase metadata | `docs/architecture/tag-registry.json` |
| `@libar-process-*` | Gherkin feature files | Process tracking, timeline metadata   | `delivery-process/tag-registry.json`  |

**Key insight:** The pattern name (e.g., `EventStore`) serves as the join key between sources, not shared tags.

### Why Two Prefixes?

1. **TypeScript phase files** use `@libar-docs-*` because:
   - They're code files parsed by TypeScript AST
   - IDE support works with JSDoc annotations
   - Existing pattern extraction uses this prefix

2. **Gherkin spec files** use `@libar-process-*` because:
   - They're parsed by Gherkin scanner
   - Process metadata (effort, status) differs from pattern documentation
   - Clear separation of "what" (pattern) from "when" (process)

**IMPORTANT:** Short-form tags like `@pattern:` or `@status:` (without prefix) are deprecated. Use full prefixes.

---

## What Actually Works Today

### Minimum Required

```typescript
/** @libar-docs */

/**
 * @libar-docs-core
 * @libar-docs-pattern CoreInfrastructure
 * @libar-docs-status completed
 *
 * ## Core Infrastructure
 *
 * Build shared types, schemas, and utilities.
 */
export interface Phase01CoreInfrastructure {
  readonly phase: 1;
  readonly release: "v0.1.0";
}
```

### What Gets Rendered in PATTERNS.md

```markdown
### Phase 1

- **CoreInfrastructure** - Completed
```

### Adding Dependencies

```typescript
/**
 * @libar-docs-depends-on CoreInfrastructure
 * @libar-docs-enables CommandBus,ProjectionCategories
 */
```

Renders as:

```markdown
- **EventStore** - Completed depends on: CoreInfrastructure
```

---

## Directory Structure

```
delivery-process/
 src/
    phases/
        v0.1.0/           # Release version
            phase-01-core-infrastructure.ts
            phase-02-event-store.ts
            phase-03-command-bus.ts
        v0.2.0/
            phase-14-deciders.ts
        v0.3.0/
            phase-47-process-metadata-expansion.ts
 specs/                   # Pure requirement specs (no process tags)
    delivery-process/     # Specs for delivery-process itself
 decisions/               # PDRs for process decisions
 templates/
    release-configuration-template.md  # This file
 fragments/
 generators/
```

---

## Step-by-Step Procedure

### Step 1: Create release directory

```bash
mkdir -p delivery-process/src/phases/v{X.Y.Z}
```

### Step 2: Create phase file

```typescript
/** @libar-docs */

/**
 * @libar-docs-{category}
 * @libar-docs-pattern {PatternName}
 * @libar-docs-status completed|roadmap|active
 * @libar-docs-phase {N}
 * @libar-docs-quarter Q{N}-{YYYY}
 * @libar-docs-completed {YYYY-MM-DD}
 * @libar-docs-effort {estimate}
 * @libar-docs-effort-actual {actual}
 * @libar-docs-workflow implementation|design|documentation|testing|discovery
 * @libar-docs-priority high|medium|low
 * @libar-docs-risk low|medium|high
 * @libar-docs-depends-on {Dependencies}
 * @libar-docs-enables {Enables}
 *
 * {Summary description}
 *
 * Spec: delivery-process/specs/{spec-name}.feature
 */
export interface Phase{NN}{PatternName} {
  readonly phase: {N};
  readonly release: "v{X.Y.Z}";
}
```

### Step 3: Create corresponding spec file (if not exists)

Specs go in `delivery-process/specs/` with `@libar-process-*` tags:

```gherkin
@libar-process-pattern:PatternName
@libar-process-status:roadmap
@libar-process-phase:N
@libar-process-quarter:Q1-2026
@libar-process-effort:4h
@libar-process-product-area:DeliveryProcess
@libar-process-business-value:description-of-value
@libar-process-priority:high
Feature: Pattern Name - Short Description

  **Problem:**
  Description of the problem being solved.

  **Solution:**
  Description of the solution approach.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | Deliverable 1 | Pending | Yes | src/... |
      | Deliverable 2 | Pending | No | docs/... |

  @acceptance-criteria
  Scenario: First acceptance scenario
    Given precondition
    When action
    Then outcome
```

**NOTE:** Do NOT include `Release` column in deliverables table. Release association is managed by TypeScript phase files.

### Step 4: Generate and verify

```bash
pnpm docs:patterns
grep "Phase {N}" docs-living/PATTERNS.md
```

---

## Migrating from Timeline Feature Files

If you have existing timeline `.feature` files:

### Step 1: Extract process metadata

Copy these tags from the feature file to create a TypeScript phase file:

- `@libar-process-pattern` → `@libar-docs-pattern`
- `@libar-process-phase` → `@libar-docs-phase`
- `@libar-process-status` → `@libar-docs-status`
- `@libar-process-quarter` → `@libar-docs-quarter`
- `@libar-process-effort` → `@libar-docs-effort`
- `@libar-process-depends-on` → `@libar-docs-depends-on`
- `@libar-process-enables` → `@libar-docs-enables`

### Step 2: Convert feature file to spec

Keep the feature file but:

1. Move to `delivery-process/specs/` if it's a spec
2. Keep `@libar-process-*` tags for process tracking
3. Remove any `Release` column from DataTables

### Step 3: Delete timeline feature file

Once the TypeScript phase file and spec are in place, delete the original timeline feature file.

---

## Critical Constraints

| Constraint           | Explanation                                            |
| -------------------- | ------------------------------------------------------ |
| No `*/` in JSDoc     | Terminates comment - use `{a,b}` not `*` in paths      |
| File opt-in required | First line must be `/** @libar-docs */`                |
| Unique pattern names | Check existing patterns before naming                  |
| Valid TypeScript     | Must export interface/type                             |
| Use full prefixes    | `@libar-docs-*` for TS, `@libar-process-*` for Gherkin |

---

## Available Tags (TypeScript Phase Files)

### Required Tags

| Tag                   | Purpose                 | Example                          |
| --------------------- | ----------------------- | -------------------------------- |
| `@libar-docs-pattern` | Pattern name (required) | `@libar-docs-pattern EventStore` |
| `@libar-docs-status`  | Implementation status   | `completed`, `roadmap`, `active` |
| `@libar-docs-phase`   | Phase number            | `@libar-docs-phase 14`           |

### Completion Tags

| Tag                         | Purpose                  | Example                            |
| --------------------------- | ------------------------ | ---------------------------------- |
| `@libar-docs-quarter`       | Delivery quarter         | `@libar-docs-quarter Q4-2025`      |
| `@libar-docs-completed`     | Completion date          | `@libar-docs-completed 2026-01-02` |
| `@libar-docs-effort`        | Effort estimate          | `@libar-docs-effort 4w`            |
| `@libar-docs-effort-actual` | Actual effort (variance) | `@libar-docs-effort-actual 3.5w`   |

### Process Tags

| Tag                    | Purpose          | Example                               |
| ---------------------- | ---------------- | ------------------------------------- |
| `@libar-docs-workflow` | Workflow type    | `implementation`, `design`, `testing` |
| `@libar-docs-priority` | Backlog priority | `high`, `medium`, `low`               |
| `@libar-docs-risk`     | Risk level       | `low`, `medium`, `high`               |

### Relationship Tags

| Tag                      | Purpose                | Example                                |
| ------------------------ | ---------------------- | -------------------------------------- |
| `@libar-docs-depends-on` | Dependencies (CSV)     | `@libar-docs-depends-on EventStore`    |
| `@libar-docs-enables`    | Enables patterns (CSV) | `@libar-docs-enables CommandBus,Sagas` |

---

## Troubleshooting

### Pattern not appearing in generated docs

1. Check file has `/** @libar-docs */` on first line
2. Verify `@libar-docs-pattern` tag is present
3. Run `pnpm lint-patterns` to check for annotation errors

### Short-form tag deprecation warning

If you see warnings about `@pattern:` or `@status:`:

- In TypeScript: Change to `@libar-docs-pattern`, `@libar-docs-status`
- In Gherkin: Change to `@libar-process-pattern`, `@libar-process-status`

### Phase file not linked to spec

Ensure pattern names match exactly:

- TypeScript: `@libar-docs-pattern MyPattern`
- Gherkin: `@libar-process-pattern:MyPattern`

---

## Related Documents

- PDR-002 - TypeScript Process Metadata (decision rationale)
- PDR-003 - Behavior Feature File Structure (spec vs phase file separation)
- PDR-006 - Tag Registry Harmonization (prefix strategy)
- PROCESS_MODEL.md - Overall process model
- Tag Registry - `delivery-process/tag-registry.json`
