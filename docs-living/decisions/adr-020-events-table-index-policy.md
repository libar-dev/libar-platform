# ADR-020: PDR 020 Events Table Index Policy

**Purpose:** Architecture decision record for PDR 020 Events Table Index Policy

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Constraint                | Implication                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| New read path first       | Consumers must be migrated before indexes are dropped                       |
| Audit must be repo-backed | Removal depends on verified in-repo consumer usage, not guesswork           |
| Rollback must stay simple | Re-adding a removed index remains the fallback if a missed consumer appears |

The event store had accumulated indexes whose usage no longer matched the active read path. Removing them too
    early would be a breaking change; leaving them forever keeps append cost higher than necessary.

    Audit constraints:

## Decision

| Old index            | Replacement / outcome                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `by_event_type`      | Replaced by `by_event_type_and_global_position`                        |
| `by_bounded_context` | Dropped after audit showed no remaining consumer                       |
| `by_event_id`        | Dropped after audit showed no remaining consumer on the `events` table |
| `by_category`        | Dropped after audit showed no remaining consumer                       |

| Surface                                 | Decision                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `readFromPosition` event-type filtering | Query `by_event_type_and_global_position`, merge, sort, page                                    |
| Replay / catch-up consumers             | Consume `{ events, nextPosition, hasMore }` from `readFromPosition`                             |
| Missed consumer discovered post-merge   | Re-add the required index in a follow-up patch and document it in changelog / remediation notes |

Replacement policy:


    Consumer policy:

## Consequences

Positive outcomes:
    - The active event-type catch-up path gets an index aligned to its pagination key
    - Dropping dead indexes reduces write amplification on the `events` table
    - The cleanup rule is explicit and repeatable for future event-store index additions

    Negative outcomes:
    - Future event-table indexes now require an explicit consumer audit before they can be removed
    - Missed out-of-repo consumers still require a follow-up rollback/re-add path if discovered later

---

[← Back to All Decisions](../DECISIONS.md)
