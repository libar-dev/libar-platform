# 📋 Event Correctness Migration

**Purpose:** Detailed documentation for the Event Correctness Migration pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 27      |
| Quarter  | Q2-2026 |

## Description

**Problem:** `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager
  lifecycle parity are coupled correctness concerns. Splitting them would create inconsistent event-store
  guarantees and leave downstream consumers migrating against moving contracts.

  **Solution:** Plan P14, P17, and P18 as one correctness packet. Implementation starts with a full
  consumer inventory, lands PDR-018 and PDR-015 first, then migrates idempotency, `globalPosition`,
  and canonical process-manager transitions together.

## Dependencies

- Depends on: Tranche0ReadinessHarness
- Depends on: Tranche0ReleaseCiDocsProcessGuardrails

## Acceptance Criteria

**Event correctness packet starts from decisions and inventory**

- Given the correctness packet is planned
- When implementation begins
- Then PDR-018 and PDR-015 are committed before runtime changes complete
- And a consumer inventory exists before `globalPosition` migration work starts

**Old and new checkpoint formats are handled explicitly**

- Given historical checkpoint formats exist
- When the new `globalPosition` representation lands
- Then old checkpoints are read through a compat path
- And new checkpoints cannot be misread as old

## Business Rules

**P14, P17, and P18 remain one correctness packet**

Idempotency, `globalPosition`, and PM transition parity are reviewed as one correctness surface.
    Same-key/same-payload dedup returns the original event; same-key/different-payload is rejected and audited.

_Verified by: Event correctness packet starts from decisions and inventory_

**Compatibility and ordering remain explicit**

The packet carries its own compatibility reader, parity tests, and evidence trail.
    Evidence for this packet follows `.sisyphus/evidence/task-5-event-correctness.{ext}`.

_Verified by: Old and new checkpoint formats are handled explicitly_

---

[← Back to Pattern Registry](../PATTERNS.md)
