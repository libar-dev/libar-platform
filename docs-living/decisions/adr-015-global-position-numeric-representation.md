# ADR-015: PDR 015 Global Position Numeric Representation

**Purpose:** Architecture decision record for PDR 015 Global Position Numeric Representation

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | design   |

## Context

| Constraint                                  | Why it matters                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Exact at real `Date.now()` scales           | Checkpoints and replay cannot depend on rounded positions               |
| Strictly monotonic for sequential appends   | Projection and PM idempotency compares positions directly               |
| Indexed in Convex                           | `readFromPosition` and global ordering still depend on an indexed field |
| Compatible with legacy checkpoint documents | Existing app/store checkpoints may still hold numeric positions         |

| Option                                                                                | Pros                                                                                      | Cons                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Keep JavaScript number and adjust formula                                             | Minimal code churn                                                                        | Rejected: still unsafe at real timestamp scales                                                          |
| Fixed-width string positions                                                          | Safe across boundaries                                                                    | Rejected: adds lexical-format coupling and non-native numeric comparisons everywhere                     |
| Pure global counter                                                                   | Strict ordering                                                                           | Rejected: loses direct timestamp decomposition and complicates compat with historical position magnitude |
| Convex int64 / TypeScript bigint with monotonic timestamp+sequence allocator (chosen) | Exact, indexable, compatible with timestamp-derived ordering, keeps monotonicity explicit | Consumers must stop assuming `number` and use compat helpers/comparators                                 |

The old representation combined `Date.now()` with hash and version arithmetic inside a JavaScript number.
    At current timestamps this exceeds `Number.MAX_SAFE_INTEGER`, which means ordering and equality become
    lossy exactly where checkpoints and replay logic need exact comparisons.

    Constraints the new representation must satisfy:


    Alternatives considered:

## Decision

| Field                               | Canonical type                                                           |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Event Store `events.globalPosition` | Convex `v.int64()`                                                       |
| Runtime type                        | TypeScript `bigint`                                                      |
| Checkpoint compat inputs            | legacy `number` or canonical `bigint`, normalized through compat helpers |

| Component                | Behavior                                                        |
| ------------------------ | --------------------------------------------------------------- |
| Timestamp bucket         | Use `Date.now()` in milliseconds                                |
| Sequence                 | Allocate a per-millisecond sequence from 0..999999              |
| Backwards clock handling | Clamp to the last allocated timestamp and continue the sequence |
| Overflow                 | Advance to the next millisecond bucket and reset sequence to 0  |
| Canonical position       | `BigInt(timestamp) * 1_000_000n + BigInt(sequence)`             |

The canonical representation is:


    Allocation rule:


    This keeps positions exact, preserves timestamp-derived ordering, and makes sequential appends strictly
    monotonic without relying on hash buckets or version modulo wraparound.

## Consequences

Positive outcomes:
    - `globalPosition` comparisons are exact and monotonic at current timestamp scales
    - Event-store ordering remains indexable in Convex via int64
    - Projection, replay, and process-manager checkpoints can read old numeric documents safely while writing the new format

    Negative outcomes:
    - Consumers that previously used arithmetic like `a - b`, `Math.max`, or `>` on `number` positions must migrate to shared bigint-aware helpers
    - Logs and UI surfaces must stringify bigint values explicitly where plain JSON serialization was assumed

## Rules

### Compatibility - legacy checkpoint numbers are read through a compat path, new writes use bigint

| Surface                                    | Policy                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Event Store indexed event rows             | New writes use int64 only                                                                |
| Projection / PM / replay checkpoint fields | Read legacy `number` or canonical `bigint`, normalize before compare                     |
| Consumer comparison logic                  | Use shared compat helpers instead of raw subtraction / `>` / `Math.max` on plain numbers |
| New checkpoint writes                      | Normalize to canonical bigint before persistence                                         |

Compatibility policy:


    Compat-reader rule: legacy numeric checkpoints are accepted only at read/input boundaries and converted via
    the shared `normalizeGlobalPosition()` helper before any ordering comparison. New checkpoint writes persist the
    canonical bigint representation so the mixed-format window narrows over time.

    The packet does not preserve unsafe "just use a number" assumptions. Any consumer that still needs ordering,
    lag, sort, or equality logic must route through the shared bigint-aware helpers.

---

[← Back to All Decisions](../DECISIONS.md)
