# ADR-007: PDR 007 Two Tier Spec Architecture

**Purpose:** Architecture decision record for PDR 007 Two Tier Spec Architecture

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |
| Phase    | 50       |

## Context

We have two distinct needs for feature files: 1. Planning and Tracking - What to build, progress, deliverables 2. Implementation Proof - How it works, unit tests, edge cases

    Initially, both were conflated into single feature files. This led to:
    - Duplication between roadmap specs and package tests
    - Unclear ownership of scenarios
    - Confusion about what is executable vs documentation

## Decision

| Tier    | Location                        | Purpose                          | Executable |
| ------- | ------------------------------- | -------------------------------- | ---------- |
| Roadmap | libar-platform/architect/specs/ | Planning, tracking, deliverables | No         |
| Package | packages/\*/tests/features/     | Implementation tests             | Yes        |

| Spec Type | Tag                                 | Purpose                 |
| --------- | ----------------------------------- | ----------------------- |
| Roadmap   | @architect-executable-specs:path    | Points to package tests |
| Package   | @architect-roadmap-spec:PatternName | Links back to roadmap   |

Establish a two-tier architecture with clear separation:

    Traceability via Metadata:

    Instead of duplicating scenarios, use @architect-* tags for linking:


    Architecture Rules:

    1. Roadmap specs are planning documents, not executable tests
       - Located in libar-platform/architect/specs/{product-area}/
       - Contains deliverables tables and high-level acceptance criteria
       - Has @architect-pattern tag for tracking
       - Has high-level Rule blocks (not granular scenarios)
       - Does NOT have step definitions

    2. Package specs are executable implementation tests
       - Located in libar-platform/packages/{package}/tests/features/behavior/
       - Has @architect-pattern tag linking to roadmap
       - Has step definitions that run via vitest-cucumber
       - Covers edge cases and error scenarios

    3. Traceability is metadata-based, not duplication-based
       - Cross-references via tags eliminate scenario duplication
       - Deliverables table links to specific executable spec files

    4. Completed roadmap specs become minimal tracking records
       - Detailed behavior lives in package specs
       - Roadmap spec becomes lightweight record with links
       - Deliverables table shows all items complete
       - @architect-executable-specs points to package tests

    5. Active roadmap specs may have placeholder scenarios
       - During implementation, acceptance criteria guide development
       - These are replaced with links when complete

## Consequences

Positive outcomes: - No duplication, clear ownership, metadata-based traceability - Roadmap specs stay lightweight (planning documents) - Package specs are authoritative for behavior

    Negative outcomes:
    - Requires discipline to maintain tag relationships
    - Two places to look (mitigated by cross-references)

---

[← Back to All Decisions](../DECISIONS.md)
