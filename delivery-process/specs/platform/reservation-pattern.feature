@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:ReservationPattern
@libar-docs-status:completed
@libar-docs-phase:20
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-depends-on:DynamicConsistencyBoundaries
@libar-docs-executable-specs:platform-core/tests/features/behavior/reservation
Feature: Reservation Pattern - TTL-Based Pre-Creation Uniqueness

  **Problem:** Uniqueness constraints before entity creation require check-then-create
  patterns with race condition risk, or post-creation unique indexes.

  **Solution:** TTL-based reservations for enforcing uniqueness BEFORE entity creation:
  1. **Reserve** — Claim a unique value with TTL
  2. **Confirm** — Convert reservation to permanent entity
  3. **Release/Expire** — Free the reservation if unused

  Example: Reserve email `alice@example.com` for 5 minutes during registration.

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Pre-creation uniqueness | Validate before entity exists |
  | Atomic claim | OCC on reservation table |
  | Auto-cleanup | TTL prevents orphan reservations |
  | Cross-entity coordination | Reserve multiple values atomically |

  **Reservation State Machine:**
  """
  reserved ──confirm()──> confirmed (terminal)
      │
      └──release()/TTL──> expired (terminal)
  """

  **Key Concepts:**
  | Concept | Description |
  | Reservation Table | Stores pending reservations with TTL |
  | Reservation Key | type:value (e.g., email:alice@example.com) |
  | TTL | Auto-expire if not confirmed |
  | Confirmation | Links reservation to created entity |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Reservation table schema | complete | @libar-dev/platform-core/src/reservations/schema.ts | Yes | unit |
      | reserve() function | complete | @libar-dev/platform-core/src/reservations/reserve.ts | Yes | unit |
      | confirm() function | complete | @libar-dev/platform-core/src/reservations/confirm.ts | Yes | unit |
      | release() function | complete | @libar-dev/platform-core/src/reservations/release.ts | Yes | unit |
      | TTL expiration cron | complete | @libar-dev/platform-core/src/reservations/expire.ts | Yes | integration |
      | Reservation documentation | complete | docs/architecture/RESERVATION-PATTERN.md | No | - |

  Rule: Reservations prevent race conditions

    **Invariant:** Only one reservation can exist for a given key at any time.
    Concurrent claims resolve deterministically via OCC.

    **Rationale:** Check-then-create patterns have a TOCTOU vulnerability where
    two requests may both see "not exists" and proceed to create, violating uniqueness.
    Atomic reservation eliminates this window.

    **Current State (check-then-create with race risk):**
    """typescript
    // Race condition: both may see email as available
    const exists = await db.query('users').filter(q => q.eq('email', email)).first();
    if (!exists) {
      await db.insert('users', { email }); // Both may succeed!
    }
    """

    **Target State (reservation eliminates race):**
    """typescript
    // Atomic reservation - only one succeeds
    const reservation = await reserve(ctx, {
      type: 'email',
      value: 'alice@example.com',
      ttl: 300_000, // 5 minutes
      correlationId
    });
    // Returns: { reservationId, key: 'email:alice@example.com', expiresAt }
    """

    **Verified by:** Concurrent reservations for same value

    @acceptance-criteria @happy-path
    Scenario: Concurrent reservations for same value
      Given no existing reservation for "alice@example.com"
      When two concurrent reserve() calls are made
      Then exactly one should succeed
      And the other should fail with "already reserved"

  Rule: Reservations have TTL for auto-cleanup

    **Invariant:** All reservations must have a TTL. After TTL expiry, the reservation
    transitions to "expired" and the key becomes available.

    **Rationale:** Without TTL, abandoned reservations (user closes browser, network failure)
    would permanently block values. TTL ensures eventual availability.

    **Verified by:** Reservation expires after TTL

    @acceptance-criteria @happy-path
    Scenario: Reservation expires after TTL
      Given a reservation with 5 minute TTL
      When 5 minutes pass without confirmation
      Then the reservation should be marked "expired"
      And the value should be available for new reservations

  Rule: Confirmation converts to permanent entity

    **Invariant:** A reservation can only be confirmed once. Confirmation atomically
    transitions state to "confirmed" and links to the created entity.

    **Rationale:** The two-phase reservation→confirmation ensures the unique value is
    guaranteed available before the expensive entity creation occurs.

    **Verified by:** Confirm links reservation to entity

    @acceptance-criteria @happy-path
    Scenario: Confirm links reservation to entity
      Given an active reservation for "alice@example.com"
      When user completes registration
      And confirm() is called with userId
      Then reservation status should be "confirmed"
      And entityId should be linked

  Rule: Release frees reservation before expiry

    **Invariant:** An active reservation can be explicitly released, immediately freeing
    the key for other consumers without waiting for TTL.

    **Rationale:** Good UX requires immediate availability when users cancel.
    Waiting for TTL (potentially minutes) creates unnecessary blocking.

    **Verified by:** User cancels registration

    @acceptance-criteria @happy-path
    Scenario: User cancels registration
      Given an active reservation for "alice@example.com"
      When user cancels registration
      And release() is called
      Then reservation should be freed
      And value should be immediately available

  Rule: Reservation key combines type and value

    **Invariant:** Reservation keys are namespaced by type. The same value can be
    reserved in different namespaces simultaneously.

    **Rationale:** A single value like "alice" may need uniqueness in multiple contexts
    (username, display name, etc.). Type-scoped keys allow independent reservations.

    **Verified by:** Reservation key is type-scoped

    @acceptance-criteria @happy-path
    Scenario: Reservation key is type-scoped
      Given a reservation for email "alice@example.com"
      And a reservation for username "alice"
      When both reservations are created
      Then both should succeed
      And keys should be "email:alice@example.com" and "username:alice"
