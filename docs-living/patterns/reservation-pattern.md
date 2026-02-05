# ✅ Reservation Pattern

**Purpose:** Detailed documentation for the Reservation Pattern pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 20        |

## Description

**Problem:** Uniqueness constraints before entity creation require check-then-create
patterns with race condition risk, or post-creation unique indexes.

**Solution:** TTL-based reservations for enforcing uniqueness BEFORE entity creation:

1. **Reserve** — Claim a unique value with TTL
2. **Confirm** — Convert reservation to permanent entity
3. **Release/Expire** — Free the reservation if unused

## Dependencies

- Depends on: DynamicConsistencyBoundaries

## Acceptance Criteria

**Reserve email `alice@example.com` for 5 minutes during registration.**

- Given the following deliverables:

| Deliverable               | Status      | Location                                             | Tests | Test Type   |
| ------------------------- | ----------- | ---------------------------------------------------- | ----- | ----------- |
| Reservation table schema  | implemented | @libar-dev/platform-core/src/reservations/schema.ts  | Yes   | unit        |
| reserve() function        | implemented | @libar-dev/platform-core/src/reservations/reserve.ts | Yes   | unit        |
| confirm() function        | implemented | @libar-dev/platform-core/src/reservations/confirm.ts | Yes   | unit        |
| release() function        | implemented | @libar-dev/platform-core/src/reservations/release.ts | Yes   | unit        |
| TTL expiration cron       | implemented | @libar-dev/platform-core/src/reservations/expire.ts  | Yes   | integration |
| Reservation documentation | implemented | docs/architecture/RESERVATION-PATTERN.md             | No    | -           |

**Concurrent reservations for same value**

- Given no existing reservation for "alice@example.com"
- When two concurrent reserve() calls are made
- Then exactly one should succeed
- And the other should fail with "already reserved"

**Reservation expires after TTL**

- Given a reservation with 5 minute TTL
- When 5 minutes pass without confirmation
- Then the reservation should be marked "expired"
- And the value should be available for new reservations

**Confirm links reservation to entity**

- Given an active reservation for "alice@example.com"
- When user completes registration
- And confirm() is called with userId
- Then reservation status should be "confirmed"
- And entityId should be linked

**User cancels registration**

- Given an active reservation for "alice@example.com"
- When user cancels registration
- And release() is called
- Then reservation should be freed
- And value should be immediately available

**Reservation key is type-scoped**

- Given a reservation for email "alice@example.com"
- And a reservation for username "alice"
- When both reservations are created
- Then both should succeed
- And keys should be "email:alice@example.com" and "username:alice"

## Business Rules

**Reservations prevent race conditions**

**Invariant:** Only one reservation can exist for a given key at any time.
Concurrent claims resolve deterministically via OCC.

    **Rationale:** Check-then-create patterns have a TOCTOU vulnerability where
    two requests may both see "not exists" and proceed to create, violating uniqueness.
    Atomic reservation eliminates this window.

    **Current State (check-then-create with race risk):**

```typescript
// Race condition: both may see email as available
const exists = await db
  .query("users")
  .filter((q) => q.eq("email", email))
  .first();
if (!exists) {
  await db.insert("users", { email }); // Both may succeed!
}
```

**Target State (reservation eliminates race):**

```typescript
// Atomic reservation - only one succeeds
const reservation = await reserve(ctx, {
  type: "email",
  value: "alice@example.com",
  ttl: 300_000, // 5 minutes
  correlationId,
});
// Returns: { reservationId, key: 'email:alice@example.com', expiresAt }
```

**Verified by:** Concurrent reservations for same value

_Verified by: Concurrent reservations for same value_

**Reservations have TTL for auto-cleanup**

**Invariant:** All reservations must have a TTL. After TTL expiry, the reservation
transitions to "expired" and the key becomes available.

    **Rationale:** Without TTL, abandoned reservations (user closes browser, network failure)
    would permanently block values. TTL ensures eventual availability.

    **Verified by:** Reservation expires after TTL

_Verified by: Reservation expires after TTL_

**Confirmation converts to permanent entity**

**Invariant:** A reservation can only be confirmed once. Confirmation atomically
transitions state to "confirmed" and links to the created entity.

    **Rationale:** The two-phase reservation→confirmation ensures the unique value is
    guaranteed available before the expensive entity creation occurs.

    **Verified by:** Confirm links reservation to entity

_Verified by: Confirm links reservation to entity_

**Release frees reservation before expiry**

**Invariant:** An active reservation can be explicitly released, immediately freeing
the key for other consumers without waiting for TTL.

    **Rationale:** Good UX requires immediate availability when users cancel.
    Waiting for TTL (potentially minutes) creates unnecessary blocking.

    **Verified by:** User cancels registration

_Verified by: User cancels registration_

**Reservation key combines type and value**

**Invariant:** Reservation keys are namespaced by type. The same value can be
reserved in different namespaces simultaneously.

    **Rationale:** A single value like "alice" may need uniqueness in multiple contexts
    (username, display name, etc.). Type-scoped keys allow independent reservations.

    **Verified by:** Reservation key is type-scoped

_Verified by: Reservation key is type-scoped_

---

[← Back to Pattern Registry](../PATTERNS.md)
