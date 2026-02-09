# ReservationPattern

**Purpose:** Detailed patterns for ReservationPattern

---

## Summary

**Progress:** [█████████████░░░░░░░] 2/3 (67%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 2     |
| 🚧 Active    | 0     |
| 📋 Planned   | 1     |
| **Total**    | 3     |

---

## 📋 Planned Patterns

### 📋 Deterministic Id Hashing

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Effort   | 2d      |

**Problem:** TTL-based reservations work well for multi-step flows (registration wizards),
but add overhead for simple "create if unique" operations. Need a lighter-weight alternative.

**Solution:** Generate entity stream ID from unique business key via deterministic hash.
Concurrent creates target the same stream ID; OCC detects conflict automatically.

**When to Use Each Pattern:**
| Pattern | Use Case | Mechanism | Overhead |
| Reservation | Multi-step flow, may abandon | TTL table + cron | Medium |
| Deterministic ID | Single-step create, immutable key | Hash + OCC | Low |

**Example:**

```typescript
// Two concurrent "create user with email" requests
const streamId = deterministicStreamId("User", email);
// Both get: "User:a1b2c3d4" (hash of email)

// First writer succeeds, second gets OCC conflict
await appendToStream(ctx, streamId, events, { expectedVersion: 0 });
```

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Zero infrastructure | No reservation table or cron needed |
| OCC-native | Uses existing Event Store conflict detection |
| Idempotent creates | Same input always targets same stream |
| Simpler mental model | "Hash then write" vs "reserve, create, confirm" |

**Constraint:** Only for truly immutable unique keys (username, external ID).
For mutable keys (email that can change), use Reservation Pattern instead.

**Key Concepts:**
| Concept | Description | Example |
| Business Key | Field(s) that define uniqueness | email, username, externalId |
| Hash Function | Deterministic, collision-resistant | SHA-256 truncated |
| Stream ID Format | `{EntityType}:{hash}` | `User:a1b2c3d4e5f6` |
| OCC Conflict | expectedVersion mismatch | "Stream already exists" |

#### Dependencies

- Depends on: EventStoreFoundation

#### Acceptance Criteria

**Same email produces same stream ID**

- Given entity type "User"
- And business key "alice@example.com"
- When deterministicStreamId is called twice
- Then both calls return identical stream ID
- And stream ID format is "User:{hash}"

**Composite key produces consistent hash**

- Given entity type "TenantUser"
- And composite key ["tenant_123", "alice@example.com"]
- When deterministicStreamId is called
- Then stream ID is deterministic
- And changing key order produces different hash

**Different emails produce different stream IDs**

- Given entity type "User"
- When deterministicStreamId is called with "alice@example.com"
- And deterministicStreamId is called with "bob@example.com"
- Then the stream IDs are different

**First create succeeds**

- Given no existing stream for email "alice@example.com"
- When User creation is attempted
- Then UserCreated event is appended
- And stream version becomes 1

**Second create fails with conflict**

- Given existing stream for email "alice@example.com"
- When second User creation is attempted with same email
- Then VERSION_CONFLICT error is thrown
- And error is translated to UniqueConstraintViolation

**Concurrent creates - exactly one succeeds**

- Given no existing stream for email "alice@example.com"
- When two concurrent User creations are attempted
- Then exactly one succeeds
- And the other fails with UniqueConstraintViolation

**Hash output is URL-safe**

- Given any business key input
- When hash is computed
- Then output contains only alphanumeric characters
- And output is fixed length (e.g., 16 characters)

**Hash is not reversible**

- Given a computed hash
- Then original business key cannot be derived
- And this protects sensitive keys like email

**Pattern selection by use case**

- Given a uniqueness requirement for "<field>"
- And the field is "<mutability>"
- And the flow is "<flow_type>"
- When selecting uniqueness pattern
- Then recommended pattern is "<pattern>"

#### Business Rules

**Stream ID is deterministic from business key**

Same business key always produces the same stream ID.

    **API:**
    ```typescript
    // Generate stream ID from business key
    const streamId = deterministicStreamId(entityType, businessKey);

    // With composite key
    const streamId = deterministicStreamId('TenantUser', [tenantId, email]);
    ```

_Verified by: Same email produces same stream ID, Composite key produces consistent hash, Different emails produce different stream IDs_

**OCC prevents duplicate creation**

First writer wins; second gets conflict error.

    **Conflict Handling:**
    ```typescript
    try {
      await appendToStream(ctx, streamId, [userCreatedEvent], {
        expectedVersion: 0  // Expect stream doesn't exist
      });
    } catch (error) {
      if (error.code === 'VERSION_CONFLICT') {
        // Stream already exists - unique value taken
        throw new UniqueConstraintViolation('email', email);
      }
      throw error;
    }
    ```

_Verified by: First create succeeds, Second create fails with conflict, Concurrent creates - exactly one succeeds_

**Hash algorithm is collision-resistant**

Hash should be cryptographically strong to prevent collisions.

    **Hash Requirements:**
    - Deterministic: same input always produces same output
    - Collision-resistant: different inputs produce different outputs
    - URL-safe: can be used in stream IDs without encoding

_Verified by: Hash output is URL-safe, Hash is not reversible_

**Pattern complements Reservation Pattern**

Choose based on use case; both are valid uniqueness strategies.

    **Decision Tree:**
    ```
    Is the unique key immutable (never changes)?
      │
      ├─ Yes ─► Is it a single-step create flow?
      │            │
      │            ├─ Yes ─► Deterministic ID Hashing
      │            │
      │            └─ No (multi-step wizard) ─► Reservation Pattern
      │
      └─ No (key can change, like email) ─► Reservation Pattern
    ```

_Verified by: Pattern selection by use case_

---

## ✅ Completed Patterns

### ✅ Ecst Fat Events

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 1w        |

**Problem:** Thin events require consumers to query back to the source BC,
creating coupling and requiring synchronous communication.

**Solution:** Event-Carried State Transfer (ECST) - events carry full context
for downstream consumers, eliminating back-queries:

- **Thin Event:** `{ type: 'OrderCreated', orderId: 'ord_123' }`
- **Fat Event:** `{ type: 'OrderCreated', orderId, customerId, customerName, items, totalAmount }`

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Service Independence | Consumers don't need to query source BC |
| Decoupled Evolution | Source can change without breaking consumers |
| Offline Processing | Event contains everything needed |
| Published Language | Fat events define the integration contract |

**Key Concepts:**
| Concept | Description | Example |
| embedEntity | Snapshot entity fields into event | embedEntity(customer, ['id', 'name']) |
| embedCollection | Snapshot collection into event | embedCollection(orderItems) |
| schemaVersion | Track structure for upcasting | schemaVersion: 2 |
| cryptoShred | Mark PII for GDPR deletion | { field: 'email', shred: true } |

#### Dependencies

- Depends on: DeciderPattern

#### Acceptance Criteria

**Consumer processes event without back-query**

- Given an "OrderSubmitted" fat event with customer details embedded
- When the inventory service receives the event
- Then it should not query the orders BC
- And it should use embedded customer name for the reservation

**Fat event includes schema version**

- Given an "OrderSubmitted" fat event
- When created with createFatEvent()
- Then schemaVersion field should be included
- And version should match current schema definition

**PII fields are marked for shredding**

- Given a fat event with customerEmail field
- When embedEntity is called with crypto-shredding option
- Then the field should be marked as shreddable
- And deletion process can identify PII fields

**Event type selection by use case**

- Given an event for "<use_case>"
- When determining event type
- Then it should be "<event_type>"

#### Business Rules

**Fat events enable service independence**

Consumers don't need to query source BC for context.

    **Current State (thin event - requires back-query):**

```typescript
// Thin event - consumer must query source BC
const event = {
  type: "OrderSubmitted",
  payload: { orderId: "ord_123" },
};
// Consumer: "I need customer name... let me query Orders BC"
const order = await ordersBC.getOrder(event.payload.orderId);
```

**Target State (fat event - self-contained):**

```typescript
// Fat event - consumer has all context
const event = createFatEvent("OrderSubmitted", {
  orderId: "ord_123",
  customer: embedEntity(customer, ["id", "name", "email"]),
  items: embedCollection(orderItems),
  totalAmount: 150.0,
});
// Consumer: "I have everything I need!"
```

_Verified by: Consumer processes event without back-query_

**Builder utilities handle schema versioning**

Fat events include schema version for upcasting support.

_Verified by: Fat event includes schema version_

**Crypto-shredding markers identify PII fields**

GDPR compliance requires marking personal data for deletion.

_Verified by: PII fields are marked for shredding_

**Use fat events for cross-context integration**

Same-context projections can use thin events for efficiency.

_Verified by: Event type selection by use case_

---

### ✅ Reservation Pattern

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 1w        |

**Problem:** Uniqueness constraints before entity creation require check-then-create
patterns with race condition risk, or post-creation unique indexes.

**Solution:** TTL-based reservations for enforcing uniqueness BEFORE entity creation:

1. **Reserve** — Claim a unique value with TTL
2. **Confirm** — Convert reservation to permanent entity
3. **Release/Expire** — Free the reservation if unused

#### Dependencies

- Depends on: DynamicConsistencyBoundaries

#### Acceptance Criteria

**Reserve email `alice@example.com` for 5 minutes during registration.**

- Given the following deliverables:

| Deliverable               | Status   | Location                                             | Tests | Test Type   |
| ------------------------- | -------- | ---------------------------------------------------- | ----- | ----------- |
| Reservation table schema  | complete | @libar-dev/platform-core/src/reservations/schema.ts  | Yes   | unit        |
| reserve() function        | complete | @libar-dev/platform-core/src/reservations/reserve.ts | Yes   | unit        |
| confirm() function        | complete | @libar-dev/platform-core/src/reservations/confirm.ts | Yes   | unit        |
| release() function        | complete | @libar-dev/platform-core/src/reservations/release.ts | Yes   | unit        |
| TTL expiration cron       | complete | @libar-dev/platform-core/src/reservations/expire.ts  | Yes   | integration |
| Reservation documentation | complete | docs/architecture/RESERVATION-PATTERN.md             | No    | -           |

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

#### Business Rules

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

[← Back to Roadmap](../ROADMAP.md)
