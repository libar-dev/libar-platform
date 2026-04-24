# 📋 Event Correctness Migration

**Purpose:** Detailed requirements for the Event Correctness Migration feature

---

## Overview

| Property       | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| Status         | planned                                                                             |
| Product Area   | Platform                                                                            |
| Business Value | stabilize idempotency global position and process manager correctness as one packet |
| Phase          | 27                                                                                  |

## Description

**Problem:** `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager
  lifecycle parity are coupled correctness concerns. Splitting them would create inconsistent event-store
  guarantees and leave downstream consumers migrating against moving contracts.

  **Solution:** Plan P14, P17, and P18 as one correctness packet. Implementation starts with a full
  consumer inventory, lands ADR-038 and ADR-035 first, then migrates idempotency, `globalPosition`,
  and canonical process-manager transitions together.

## Acceptance Criteria

**Event correctness packet starts from decisions and inventory**

- Given the correctness packet is planned
- When implementation begins
- Then ADR-038 and ADR-035 are committed before runtime changes complete
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

## Deliverables

- globalPosition consumer inventory (pending)
- ADR-038 placeholder (pending)
- ADR-035 placeholder (pending)
- appendToStream idempotency migration (pending)
- globalPosition representation migration and compat reader (pending)
- Canonical PM transition map parity (pending)
- Event correctness integration suite (pending)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
