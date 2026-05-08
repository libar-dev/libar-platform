# ADR-022: PDR 022 Value Transfer Doctrine Adoption

**Purpose:** Architecture decision record for PDR 022 Value Transfer Doctrine Adoption

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |

## Context

Several live architect sources cited doctrine that existed only in the off-branch
    `architect-studio/.../_shared/` path. That left the repo with two problems.

    1. The guidance was not self-contained inside the sources it governed.
    2. The repo still needed an explicit naming contract for shipped patterns whose executable carriers were created later.

    The main ambiguity was whether a carrier such as `EventStoreFoundationExecutableTests`
    should replace the semantic pattern name `EventStoreFoundation`, or merely carry it.

## Decision

| Topic                   | Decision                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Semantic pattern name   | Stays bare, for example `EventStoreFoundation`                                                   |
| Executable carrier name | Uses `*ExecutableTests` only for the artifact, for example `EventStoreFoundationExecutableTests` |
| Continuity mechanism    | `@architect-implements:<Pattern>` links the carrier back to the bare semantic pattern            |

This decision adopts the in-repo doctrine set under `libar-platform/architect/_shared/`
    as the authoritative guidance for value transfer, annotation ownership, pattern-carrier
    relationships, maturity classification, and FSM interpretation.

    Naming contract:


    Binding rules:

    1. Bare semantic names remain the canonical names used by roadmap specs, decisions, and graph references.
    2. `*ExecutableTests` is a carrier naming convention only. It does not rename the domain or architectural concept.
    3. `@architect-implements:<Pattern>` is the durable continuity mechanism for shipped patterns whose proving carrier is a later executable feature.
    4. `@architect-pattern` on a carrier names the artifact node that exists in the repo, while `@architect-implements` names the concept that artifact preserves.
    5. Refactoring carve-outs may create `<Pattern>ExecutableTests` carriers for older shipped patterns, but the carve-out must preserve the bare semantic name and explain the provenance honestly.

## Consequences

Positive outcomes:
    - The repo no longer relies on off-branch doctrine paths for active architect guidance.
    - Bare semantic names stay stable across roadmap specs, decisions, and future graph work.
    - Executable carriers can exist without distorting the meaning of the underlying pattern.

    Negative outcomes:
    - The repo now owns another small doctrine surface that must be maintained with the architect sources.
    - Contributors must learn the difference between artifact names and semantic pattern names instead of treating them as interchangeable.

---

[← Back to All Decisions](../DECISIONS.md)
