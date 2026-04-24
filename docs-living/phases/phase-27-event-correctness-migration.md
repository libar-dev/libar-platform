# EventCorrectnessMigration

**Purpose:** Detailed patterns for EventCorrectnessMigration

---

## Summary

**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0/1 (0%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 0     |
| 🚧 Active   | 0     |
| 📋 Planned  | 1     |
| **Total**   | 1     |

---

## 📋 Planned Patterns

### 📋 Event Correctness Migration

| Property       | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| Status         | planned                                                                             |
| Effort         | 2w                                                                                  |
| Quarter        | Q2-2026                                                                             |
| Business Value | stabilize idempotency global position and process manager correctness as one packet |

**Problem:** `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager
  lifecycle parity are coupled correctness concerns. Splitting them would create inconsistent event-store
  guarantees and leave downstream consumers migrating against moving contracts.

  **Solution:** Plan P14, P17, and P18 as one correctness packet. Implementation starts with a full
  consumer inventory, lands ADR-038 and ADR-035 first, then migrates idempotency, `globalPosition`,
  and canonical process-manager transitions together.

#### Dependencies

- Depends on: Tranche0ReadinessHarness
- Depends on: Tranche0ReleaseCiDocsProcessGuardrails

#### Acceptance Criteria

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

#### Business Rules

**P14, P17, and P18 remain one correctness packet**

Idempotency, `globalPosition`, and PM transition parity are reviewed as one correctness surface.
    Same-key/same-payload dedup returns the original event; same-key/different-payload is rejected and audited.

_Verified by: Event correctness packet starts from decisions and inventory_

**Compatibility and ordering remain explicit**

The packet carries its own compatibility reader, parity tests, and evidence trail.
    Evidence for this packet follows `.sisyphus/evidence/task-5-event-correctness.{ext}`.

_Verified by: Old and new checkpoint formats are handled explicitly_

---

[← Back to Roadmap](../ROADMAP.md)
