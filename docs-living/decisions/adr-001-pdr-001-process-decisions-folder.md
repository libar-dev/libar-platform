# ✅ ADR-001: PDR 001 Process Decisions Folder

**Purpose:** Architecture decision record for PDR 001 Process Decisions Folder

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |

## Context

The monorepo needed a location for process-level decisions (PDRs) separate from
package-level Architecture Decision Records (ADRs). Package ADRs live in
packages/libar-dev/delivery-process/tests/features/decisions/ and document
tooling decisions specific to the delivery-process package itself.

    Key distinction:
    - ADRs (package): Technical decisions about the delivery-process tool itself
    - PDRs (repo): Process decisions about how to use the tool in this monorepo

    The separation enables:
    - Clear ownership boundaries (package vs repo concerns)
    - Different tag registries for different scopes
    - Independent evolution of package vs repo process decisions

## Decision

Process Decision Records (PDRs) for the monorepo live in /delivery-process/decisions/
as Gherkin feature files with the naming convention pdr-NNN-name.feature.

    PDRs use the same extraction infrastructure as ADRs:
    - Tags: libar-process-adr:NNN (reuses existing tag system for compatibility)
    - Sections: Gherkin Rule: keywords for Context, Decision, Consequences
    - Generator: Uses adr-list section with "Process Decision Records" header

    Directory structure:
    - delivery-process/decisions/ - PDRs for monorepo process configuration
    - delivery-process/src/phases/ - TypeScript phase metadata
    - delivery-process/generators/decisions/ - PDR generator configs
    - delivery-process/templates/ - Reusable templates
    - delivery-process/fragments/ - Fragment templates
    - delivery-process/tag-registry.json - Repo-level tag registry

## Consequences

Positive outcomes: - Clear separation between package ADRs and repo PDRs - Reuses existing ADR extraction infrastructure without code changes - Gherkin format enables executable acceptance criteria - Consistent with package-level ADR approach - Independent tag registry allows repo-specific categories

    Negative outcomes:
    - Two separate registries to maintain (package vs repo)
    - "adr" tag name used internally for "pdr" (display-only rename)

---

[← Back to All Decisions](../DECISIONS.md)
