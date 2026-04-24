# ADR-039: ADR 039 V Any Vs V Unknown Boundary Policy

**Purpose:** Architecture decision record for ADR 039 V Any Vs V Unknown Boundary Policy

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Issue                    | Consequence                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Validator used `v.any()` | Boundary type checks were weaker than necessary                                      |
| No serialized-size guard | Large payloads could cross the boundary until Convex or downstream code failed later |

The tranche-2 validation packet targets payload-like component boundaries where the platform intentionally stores
    flexible values but must still reject malformed or unbounded inputs before they become a scalability problem.

    The old contract had two issues:

## Decision

| Rule                                            | Decision                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Storage/transport validator for flexible values | Use `v.unknown()` instead of `v.any()`                                |
| Default maximum serialized size                 | 64 KiB                                                                |
| Rejection error                                 | Throw `PAYLOAD_TOO_LARGE` with field-specific context                 |
| Component configurability                       | Each component may set a local constant when it needs a different cap |

Boundary policy:


    In-scope flexible boundary fields include payload, result, customState, configOverrides, failed-command payload,
    and debug context surfaces where the structure remains intentionally open but bounded.

## Consequences

Positive outcomes:
    - The boundary contract is explicit: flexible value shape, bounded size
    - Oversized payload failures become deterministic and testable
    - Bus, store, and agent surfaces share one validation helper instead of ad hoc checks

    Negative outcomes:
    - Callers that previously relied on arbitrarily large payloads now receive explicit rejections
    - New flexible boundary fields must remember to opt into the shared size-guard policy

---

[← Back to All Decisions](../DECISIONS.md)
