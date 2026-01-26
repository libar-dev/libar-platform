# ✅ ADR-004: Unified Tag Prefix Architecture

**Purpose:** Architecture decision record for Unified Tag Prefix Architecture

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |

## Context

Two tag prefixes created confusion: libar-docs-_ (TypeScript) vs libar-process-_ (Gherkin).
Overlapping tags (pattern, phase, status) had unclear ownership. Two mental models to maintain.

## Decision

All tags use unified libar-docs-_ prefix. The libar-process-_ prefix is deprecated.
BDD standard tags (acceptance-criteria, happy-path, etc.) remain unprefixed.

    Key Locations:
    - Repo taxonomy: delivery-process/tag-registry.json (DDD/ES/CQRS categories)
    - Package taxonomy: packages/libar-dev/delivery-process/tag-registry.json (tooling categories)
    - Generated docs: docs/architecture/TAG_TAXONOMY.md (human-readable reference)
    - Regenerate command: pnpm docs:tag-taxonomy

    Tag Categories (repo level):
    domain, ddd, bounded-context, event-sourcing, decider, fsm, cqrs,
    projection, saga, command, arch, infra, validation, testing, performance,
    security, core, api, generator, middleware, correlation

    Unprefixed BDD Tags (remain without prefix):
    acceptance-criteria, happy-path, business-failure, technical-constraint,
    edge-case, validation

## Consequences

Positive outcomes: - Single mental model: "Everything uses libar-docs-\*" - Consistent grep/search patterns across codebase - Simpler onboarding for contributors

    Negative outcomes:
    - Migration of existing libar-process-* tags (scanner accepts both during transition)

---

[← Back to All Decisions](../DECISIONS.md)
