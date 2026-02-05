# 📋 Deterministic Id Hashing

**Purpose:** Detailed documentation for the Deterministic Id Hashing pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 20      |

## Description

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

## Dependencies

- Depends on: EventStoreFoundation

## Acceptance Criteria

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

## Business Rules

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

[← Back to Pattern Registry](../PATTERNS.md)
