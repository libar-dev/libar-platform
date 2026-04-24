# ADR-021: PDR 021 Platform Store Runtime Dependency On Platform Core

**Purpose:** Architecture decision record for PDR 021 Platform Store Runtime Dependency On Platform Core

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| platform-store surface    | Current public platform-core import       |
| ------------------------- | ----------------------------------------- |
| `src/client/index.ts`     | `@libar-dev/platform-core/events`         |
| `src/client/index.ts`     | `@libar-dev/platform-core/security`       |
| `src/component/lib.ts`    | `@libar-dev/platform-core/events`         |
| `src/component/lib.ts`    | `@libar-dev/platform-core/durability`     |
| `src/component/lib.ts`    | `@libar-dev/platform-core/validation`     |
| `src/component/lib.ts`    | `@libar-dev/platform-core/processManager` |
| `src/component/schema.ts` | `@libar-dev/platform-core/validation`     |

`@libar-dev/platform-store` still declares `@libar-dev/platform-core` because package managers operate at the
    package boundary, not at the import-subpath boundary. The relevant remediation question is therefore not whether
    the dependency exists, but whether the live imports stay inside a narrow, stable, public seam.

    Current live imports observed in repo source:


    This is a constrained shared-runtime seam, not evidence that the full platform-core split from AC2 should happen
    inside this packet. AC2 remains deferred to PDR-017 follow-on work.

## Decision

| Allowed public subpath                    | Why it is allowed now                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@libar-dev/platform-core/events`         | Shared global-position/event-row invariants must stay identical across store and consumers |
| `@libar-dev/platform-core/security`       | Verification-proof creation is already part of the live client contract                    |
| `@libar-dev/platform-core/durability`     | Idempotency fingerprinting and stable serialization are shared runtime invariants          |
| `@libar-dev/platform-core/validation`     | Store validators already depend on the published boundary helpers                          |
| `@libar-dev/platform-core/processManager` | Process-manager lifecycle helpers remain shared until a later extraction is approved       |

| Forbidden surface                                                                                                         | Policy    |
| ------------------------------------------------------------------------------------------------------------------------- | --------- |
| `@libar-dev/platform-core` root barrel                                                                                    | Forbidden |
| `@libar-dev/platform-core/src/**`                                                                                         | Forbidden |
| Private or non-exported internal paths                                                                                    | Forbidden |
| Agent, orchestration, reservations, DCB, monitoring, testing, or any other platform-core surface outside the approved set | Forbidden |

Approved import set for `@libar-dev/platform-store`:


    Forbidden imports for `@libar-dev/platform-store`:


    Growth rule:
    - The approved set is intentionally narrow and frozen to the five public subpaths listed above.
    - New imports outside that set are not allowed as incremental convenience changes.
    - If `platform-store` needs additional `platform-core` surfaces, the follow-up work must extract or publish a smaller
      dedicated package or boundary under the tranche-3 architecture path instead of widening this allowlist.
    - `platform-store` must not create new cyclic dependency growth with `platform-core`; future seam expansion requires an
      explicit follow-up decision rather than silent coupling drift.

## Consequences

Positive outcomes:
    - AC4 is resolved by recording the real dependency shape instead of pretending the live runtime seam does not exist
    - The allowed public-subpath set is explicit enough for README, layer-policy, and future extraction work to agree
    - The decision keeps shared invariants centralized without turning this packet into a package-split migration

    Negative outcomes:
    - `platform-store` still carries a package-level dependency on `@libar-dev/platform-core` until a later extraction occurs
    - Future growth beyond the approved set now requires a deliberate follow-up decision instead of a quick import addition

---

[← Back to All Decisions](../DECISIONS.md)
