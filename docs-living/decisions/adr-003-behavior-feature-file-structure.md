# ADR-003: PDR 003 Behavior Feature File Structure

**Purpose:** Architecture decision record for PDR 003 Behavior Feature File Structure

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |
| Phase    | 46       |

## Context

The monorepo uses Gherkin feature files for requirements specification and
    behavioral acceptance tests. The original approach used "timeline .feature files"
    with libar-process-* tags for phase/release tracking, but this created problems:

    Problems with timeline .feature files:
    - DataTables for deliverables were hard to maintain
    - Phase/release metadata scattered across many files
    - Specs tightly coupled to specific phases (couldn't evolve independently)
    - Combining or splitting specs required updating process metadata everywhere
    - No centralized view of release contents

## Decision

1. SPECS DIRECTORY (libar-platform/architect/specs/)
       Pure Gherkin requirements that can evolve independently:
       - Focus on WHAT (requirements, acceptance criteria, deliverables)
       - Use semantic tags only (acceptance-criteria, opportunity-N, etc.)
       - NO libar-process-* tags (no phase numbers, no dates, no status)
       - Can be combined, split, or refined without affecting release tracking
       - Background tables list deliverables with Status/Tests/Location (no Release column)

    2. TYPESCRIPT PHASE FILES (libar-platform/architect/src/phases/vX.Y.Z/)
       Centralized release association via code annotations:
       - Focus on WHEN (phase assignment, release association, dependencies)
       - Use @architect-* JSDoc annotations for process metadata
       - Reference specs by pattern name: "Spec: libar-platform/architect/specs/name.feature"
       - Single location for all phase/release information
       - Enables dependency graphs, roadmap generation, earned-value tracking

    SEPARATION OF CONCERNS:
    - Specs answer: "What are we building?" (requirements that evolve)
    - TypeScript phase files answer: "When are we building it?" (release decisions)

    This separation allows:
    - Specs to mature through ideation, refinement, implementation
    - Release planning to happen independently of requirement evolution
    - Easy re-prioritization (just update TypeScript phase files)
    - Centralized roadmap generation from TypeScript annotations

    Tag Conventions for Spec files:
    - acceptance-criteria - Marks scenarios for requirements generation
    - Semantic grouping tags: epic, capstone, opportunity-N, foundation
    - Domain tags: orders, inventory, saga, etc.
    - Scenario tags: happy-path, validation, business-failure

    TypeScript Phase File Annotations (in @architect-* format):

    Core annotations (required):
    - @architect-pattern Name - Pattern identifier
    - @architect-status {roadmap|active|completed} - Phase status
    - @architect-phase N - Phase number
    - @architect-quarter QN-YYYY - Delivery quarter

    Completion annotations:
    - @architect-completed YYYY-MM-DD - Completion date
    - @architect-effort Nw - Planned effort (e.g., 4w, 2d, 8h)
    - @architect-effort-actual Nw - Actual effort (for variance tracking)

    Optional metadata:
    - @architect-workflow {design|implementation|documentation|testing|discovery}
    - @architect-priority {high|medium|low} - Backlog ordering (default: medium)
    - @architect-risk {low|medium|high} - Risk level (default: low)

    Relationship annotations:
    - @architect-depends-on PatternA,PatternB - Dependencies (CSV)
    - @architect-enables PatternC,PatternD - What this enables (CSV)

    Behavior Test Files (tests/features/behavior/):
    Same conventions as before:
    - @architect-pattern:Name - Links to pattern for traceability (optional)
    - acceptance-criteria - Marks scenarios for PRD generation
    - Semantic tags for organization
    - NO Release columns in DataTables

    CRITICAL: No Release References in Spec DataTables.
    Deliverable DataTables in spec files MUST NOT include Release column.
    Only TypeScript phase files may reference releases.
    Rationale: Specs describe WHAT the system does, not WHEN it was released.
    Release coupling prevents specs from evolving independently.

## Consequences

Positive outcomes:
    - Specs can evolve independently of release planning
    - Centralized release information in TypeScript files
    - Easy to re-prioritize and re-assign phases
    - TypeScript annotations enable IDE support, type checking
    - Dependency graphs can be computed from code
    - Single source of truth for roadmap generation

    Negative outcomes:
    - Requires maintaining two file types (specs + phase files)
    - Learning curve for new contributors
    - Phase files must manually reference spec files

---

[← Back to All Decisions](../DECISIONS.md)
