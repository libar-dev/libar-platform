# ✅ ADR-006: PDR 006 TypeScript Taxonomy

**Purpose:** Architecture decision record for PDR 006 TypeScript Taxonomy

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |
| Phase    | 43       |

## Context

The delivery-process package uses tag-registry.json files to define taxonomy: - Categories (scanner, extractor, generator, etc.) - Metadata tags (status, phase, effort, etc.) - Aggregation tags (overview, decision, etc.)

    Previously:
    - JSON files were the source of truth
    - Zod schemas validated structure at runtime
    - No compile-time enforcement of domain values
    - Consumers used string literals that may not match registry

    Problems:
    1. Typos in status values only caught at runtime
    2. Renaming a status value requires manual search/replace
    3. No IDE autocomplete for valid taxonomy values
    4. JSON can be edited without type checking

## Decision

Adopt TypeScript as the source of truth for taxonomy:

    TypeScript Constants --> Zod Schemas --> JSON (generated)
         (source)           (validation)      (artifact)

    Key principles:
    1. TypeScript "as const" arrays define valid values
    2. Types are inferred from constants (no duplication)
    3. Zod schemas use the constants for runtime validation
    4. JSON files are generated artifacts (not edited manually)

    Implementation (2026-01-09):

    The taxonomy module was implemented at packages/libar-dev/delivery-process/src/taxonomy/:

    | File | Purpose |
    |------|---------|
    | status-values.ts | PROCESS_STATUS_VALUES constant |
    | normalized-status.ts | NORMALIZED_STATUS_VALUES constant |
    | categories.ts | CATEGORY_TAGS constant |
    | format-types.ts | FORMAT_TYPES constant |
    | hierarchy-levels.ts | HIERARCHY_LEVELS constant |
    | layer-types.ts | LAYER_TYPES constant |
    | registry-builder.ts | buildDefaultRegistry() |

    The taxonomyModified detection in process-guard was deprecated since
    TypeScript changes require recompilation, making runtime detection unnecessary.

    Superseded Spec:
    The deferred-status-handling.feature spec proposed a flag-based approach
    (libar-process-deferred:true alongside roadmap status). This was superseded
    by making "deferred" a first-class FSM status value instead.

## Consequences

Positive outcomes: - Compile-time safety for all taxonomy values - IDE autocomplete and refactoring support - Single source of truth (TypeScript) - Zod validation remains for runtime boundary protection

    Negative outcomes:
    - External tools expecting JSON need generated output (mitigated by registry-builder.ts)
    - Migration effort for existing JSON definitions (completed)

    Trade-off accepted:
    - JSON becomes a derived artifact, not source
    - External consumers use generated JSON unchanged

---

[← Back to All Decisions](../DECISIONS.md)
