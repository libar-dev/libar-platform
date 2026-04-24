# ADR-018: PDR 018 Idempotency Enforcement For Append To Stream

**Purpose:** Architecture decision record for PDR 018 Idempotency Enforcement For Append To Stream

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Constraint                                                        | Why it matters                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Same key plus same payload must converge                          | Retries need a stable original result                           |
| Same key plus different payload must not be silently deduplicated | Conflicting business intent must be rejected visibly            |
| Rejection must be auditable                                       | Operators need evidence of the conflicting append attempt       |
| Core helper and direct component append must agree                | `idempotentAppendEvent()` and `appendToStream()` cannot diverge |

The old contract exposed `events[].idempotencyKey`, indexed it, and documented idempotent behavior, but
    the append path still treated the key as write-only metadata. That left callers with an advertised contract
    that could silently create duplicate or conflicting rows.

    Constraints the decision must satisfy:

## Decision

| Fingerprint field  |
| ------------------ |
| streamType         |
| streamId           |
| boundedContext     |
| tenantId (or null) |
| eventType          |
| category           |
| schemaVersion      |
| payload            |

| Case                                                           | Behavior                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| same key + same semantic fingerprint                           | Return `duplicate` with the original `eventIds`, `globalPositions`, and `newVersion` |
| same key + different semantic fingerprint                      | Return `idempotency_conflict` and persist an audit record                            |
| partial duplicate batch or mixed duplicate/non-duplicate batch | Reject as `idempotency_conflict` and audit                                           |
| no key match                                                   | Continue with normal append + OCC behavior                                           |

For every incoming event that carries an `idempotencyKey`, the Event Store computes a semantic fingerprint over:


    Decision matrix:


    The audit record is stored in `idempotencyConflictAudits` with the conflicting key, existing event identity,
    incoming and existing fingerprints, payload snapshots, and the attempt timestamp.

## Consequences

Positive outcomes:
    - Retries with the same intent converge to one durable event row and one stable result
    - Conflicting key reuse is visible instead of being silently swallowed
    - Operators can inspect rejected attempts through a durable audit trail

    Negative outcomes:
    - Callers that use `appendToStream` directly must handle `duplicate` and `idempotency_conflict` distinctly instead of assuming only `success` or `conflict`
    - Batch appenders cannot rely on partial duplicate behavior; mixed duplicate batches are rejected to avoid ambiguous replay semantics

## Rules

### Helper alignment - idempotentAppendEvent follows the same decision

| Path                                                                    | Behavior                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `idempotentAppendEvent()` sees same key + same fingerprint on pre-check | Return `duplicate` immediately                                                      |
| `idempotentAppendEvent()` sees same key + different fingerprint         | Delegate to the store path so the rejection is audited, then throw a conflict error |
| Direct `appendToStream()` caller gets `idempotency_conflict`            | Treat as a rejected append, not a successful duplicate                              |

`idempotentAppendEvent()` must not implement a softer rule than the store.

    Alignment policy:


    This keeps the helper and the direct component path consistent: duplicates converge, conflicts reject, and
    both routes preserve an auditable trail for mismatched payload reuse.

---

[← Back to All Decisions](../DECISIONS.md)
