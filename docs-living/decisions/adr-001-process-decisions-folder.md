# ADR-001: PDR 001 Process Decisions Folder

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
    deps-packages/architect/architect/decisions/ and document tooling decisions
    specific to the architect package itself.

    Key distinction:
    - ADRs (package): Technical decisions about the architect tool itself
    - PDRs (repo): Process decisions about how to use the tool in this monorepo

    The separation enables:
    - Clear ownership boundaries (package vs repo concerns)
    - Different tag registries for different scopes
    - Independent evolution of package vs repo process decisions

## Decision

Process Decision Records (PDRs) for the monorepo live in /libar-platform/architect/decisions/
    as Gherkin feature files with the naming convention pdr-NNN-name.feature.

    PDRs use the same extraction infrastructure as ADRs:
    - Tags: @architect-adr:NNN
    - Sections: Gherkin Rule: keywords for Context, Decision, Consequences
    - Generator: Uses adr-list section with "Process Decision Records" header

    Directory structure:
    - libar-platform/architect/decisions/ - PDRs for monorepo process configuration
    - libar-platform/architect/specs/ - roadmap feature specs
    - libar-platform/architect/stubs/ - design-session stubs
    - libar-platform/architect/releases/ - release definition files
    - libar-platform/architect/docs/tag-taxonomy.md - generated repo taxonomy reference
    - architect.config.js - repo-level architect configuration

## Consequences

Positive outcomes:
    - Clear separation between package ADRs and repo PDRs
    - Reuses existing ADR extraction infrastructure without code changes
    - Gherkin format enables executable acceptance criteria
    - Consistent with package-level ADR approach
    - Independent tag registry allows repo-specific categories

    Negative outcomes:
    - Two separate registries to maintain (package vs repo)
    - "adr" tag name used internally for "pdr" (display-only rename)

---

[← Back to All Decisions](../DECISIONS.md)
