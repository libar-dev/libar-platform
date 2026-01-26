# Reservation Pattern Architecture

> **TTL-Based Pre-Creation Uniqueness Constraints**

---

## Overview

The Reservation Pattern enables optimistic uniqueness checking for distributed systems where pessimistic locks are unacceptable. It uses a three-phase workflow (reserve/confirm/release) with automatic TTL-based cleanup.

### Problem: Race Conditions in Check-Then-Create

```typescript
// ❌ Race condition: both mutations may see email as available
const exists = await ctx.db
  .query("users")
  .withIndex("by_email", (q) => q.eq("email", email))
  .first();

if (!exists) {
  // Both mutations may succeed here!
  await ctx.db.insert("users", { email });
}
```

**Issues with check-then-create:**

- Race condition window between check and create
- No atomic claim mechanism
- Multiple entities may end up with same "unique" value
- Retroactive cleanup is messy

### Solution: TTL-Based Reservations

```typescript
// ✅ Atomic reservation - only one succeeds
const result = await reserve(
  ctx,
  {
    type: "email",
    value: "alice@example.com",
    ttl: 300_000, // 5 minutes
  },
  { repository: reservationRepo }
);

if (result.status === "success") {
  // Safe to create entity
  const user = await createUser(ctx, { email: "alice@example.com" });

  // Link reservation to entity
  await confirm(
    ctx,
    {
      reservationId: result.reservationId,
      entityId: user._id,
    },
    { repository: reservationRepo }
  );
} else if (result.status === "conflict") {
  throw new Error("Email already taken");
}
```

---

## State Machine

```
reserved ──confirm()──> confirmed (terminal)
    │
    ├──release()──> released (terminal)
    └──TTL──> expired (terminal)
```

| State       | Description                          | Transitions                           |
| ----------- | ------------------------------------ | ------------------------------------- |
| `reserved`  | Value is claimed for TTL duration    | → `confirmed` or `released`/`expired` |
| `confirmed` | Linked to created entity (permanent) | Terminal                              |
| `released`  | Explicitly freed by user             | Terminal                              |
| `expired`   | TTL exceeded without confirmation    | Terminal                              |

---

## Key Concepts

### Reservation Key

Format: `type:value` (e.g., `email:alice@example.com`)

The key uniquely identifies what's being reserved. Different types allow the same value to be reserved independently:

```typescript
// These are different reservations (different keys)
const emailKey = "email:alice@example.com";
const usernameKey = "username:alice";
```

### Deterministic ID

The reservation ID is a deterministic hash of the key:

```typescript
const id = hashReservationId(key);
// Same key always produces same ID
// Enables idempotent reserve operations
```

### TTL (Time-To-Live)

Reservations automatically expire if not confirmed:

- **Minimum**: 1 second (1,000ms)
- **Maximum**: 24 hours (86,400,000ms)
- **Recommended**: 5 minutes (300,000ms) for registration flows

---

## API Reference

### reserve()

Creates a reservation that claims the specified value for the TTL duration.

```typescript
import { reserve, type ReservationRepository } from "@libar-dev/platform-core";

const result = await reserve(
  ctx,
  {
    type: "email",
    value: "alice@example.com",
    ttl: 300_000, // 5 minutes
    correlationId: "corr_123", // optional
  },
  { repository: myReservationRepo }
);

// Result types
if (result.status === "success") {
  console.log(result.reservationId); // "res_a1b2c3d4"
  console.log(result.key); // "email:alice@example.com"
  console.log(result.expiresAt); // timestamp
}

if (result.status === "conflict") {
  console.log(result.existingReservationId);
  console.log(result.existingExpiresAt);
}

if (result.status === "error") {
  console.log(result.code); // "INVALID_TTL" | "TTL_TOO_LONG" | ...
  console.log(result.message);
}
```

### confirm()

Links a reservation to the created entity.

```typescript
import { confirm } from "@libar-dev/platform-core";

const result = await confirm(
  ctx,
  {
    reservationId: "res_a1b2c3d4",
    entityId: user._id,
  },
  { repository: myReservationRepo }
);

if (result.status === "success") {
  console.log(result.confirmedAt); // timestamp
}

if (result.status === "error") {
  console.log(result.code);
  // "RESERVATION_NOT_FOUND" | "RESERVATION_ALREADY_EXPIRED" |
  // "RESERVATION_ALREADY_CONFIRMED" | "RESERVATION_ALREADY_RELEASED"
}
```

### release()

Explicitly frees a reservation before TTL expires.

```typescript
import { release } from "@libar-dev/platform-core";

const result = await release(
  ctx,
  {
    reservationId: "res_a1b2c3d4",
  },
  { repository: myReservationRepo }
);

if (result.status === "success") {
  // Value is now available for others
}
```

### Query Helpers

```typescript
import {
  findReservation,
  isReserved,
  getReservation,
  isReservationActive,
  getRemainingTTL,
} from "@libar-dev/platform-core";

// Check if value is reserved
const reserved = await isReserved(
  ctx,
  {
    type: "email",
    value: "alice@example.com",
  },
  { repository: myReservationRepo }
);

// Find reservation by ID or key
const reservation = await findReservation(
  ctx,
  {
    reservationId: "res_a1b2c3d4",
    activeOnly: true, // only return if still active
  },
  { repository: myReservationRepo }
);

// Check reservation state
if (reservation) {
  const active = isReservationActive(reservation);
  const remaining = getRemainingTTL(reservation);
}
```

---

## Application Setup

Since `@libar-dev/platform-core` is a library package (not a Convex component), applications must:

### 1. Define the Reservations Table

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  reservations: defineTable({
    reservationId: v.string(),
    key: v.string(),
    type: v.string(),
    value: v.string(),
    status: v.union(
      v.literal("reserved"),
      v.literal("confirmed"),
      v.literal("released"),
      v.literal("expired")
    ),
    expiresAt: v.number(),
    entityId: v.union(v.string(), v.null()),
    confirmedAt: v.union(v.number(), v.null()),
    releasedAt: v.union(v.number(), v.null()),
    correlationId: v.union(v.string(), v.null()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reservationId", ["reservationId"])
    .index("by_key", ["key"])
    .index("by_type_value", ["type", "value"])
    .index("by_status_expiresAt", ["status", "expiresAt"])
    .index("by_entityId", ["entityId"]),
});
```

### 2. Implement the Repository

```typescript
// convex/reservationRepo.ts
import type {
  ReservationRepository,
  ReservationCMS,
  ReservationKey,
} from "@libar-dev/platform-core";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const reservationRepo: ReservationRepository<MutationCtx | QueryCtx, Id<"reservations">> = {
  findById: async (ctx, reservationId) => {
    return ctx.db
      .query("reservations")
      .withIndex("by_reservationId", (q) => q.eq("reservationId", reservationId))
      .unique();
  },

  findByKey: async (ctx, key) => {
    return ctx.db
      .query("reservations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },

  findActiveByKey: async (ctx, key, now) => {
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!reservation) return null;
    if (reservation.status !== "reserved") return null;
    if (reservation.expiresAt <= now) return null;

    return reservation;
  },

  insert: async (ctx, reservation) => {
    return ctx.db.insert("reservations", {
      ...reservation,
      version: 1,
    });
  },

  update: async (ctx, _id, update) => {
    await ctx.db.patch(_id, update);
  },

  findExpired: async (ctx, now, limit) => {
    return ctx.db
      .query("reservations")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "reserved").lt("expiresAt", now))
      .take(limit);
  },
};
```

### 3. Set Up TTL Expiration Cron

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire-reservations",
  { minutes: 5 },
  internal.reservations.expireExpiredReservations
);

export default crons;
```

```typescript
// convex/reservations.ts
import { internalMutation } from "./_generated/server";
import { expireReservations } from "@libar-dev/platform-core";
import { reservationRepo } from "./reservationRepo";

export const expireExpiredReservations = internalMutation({
  handler: async (ctx) => {
    const result = await expireReservations(
      ctx,
      {
        batchSize: 100,
      },
      { repository: reservationRepo }
    );

    return result;
  },
});
```

---

## Common Patterns

### User Registration Flow

```typescript
export const registerUser = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    // 1. Reserve email
    const result = await reserve(
      ctx,
      {
        type: "email",
        value: email,
        ttl: 300_000, // 5 minutes
      },
      { repository: reservationRepo }
    );

    if (result.status === "conflict") {
      throw new Error("Email already registered");
    }
    if (result.status === "error") {
      throw new Error(result.message);
    }

    // 2. Create user
    const userId = await ctx.db.insert("users", { email, name });

    // 3. Confirm reservation
    await confirm(
      ctx,
      {
        reservationId: result.reservationId,
        entityId: userId,
      },
      { repository: reservationRepo }
    );

    return userId;
  },
});
```

### Graceful Cancellation

```typescript
export const cancelRegistration = mutation({
  args: { reservationId: v.string() },
  handler: async (ctx, { reservationId }) => {
    const result = await release(
      ctx,
      {
        reservationId,
      },
      { repository: reservationRepo }
    );

    if (result.status === "error") {
      // Reservation already confirmed/released/expired - that's ok
      console.log(`Reservation ${reservationId}: ${result.code}`);
    }

    return result;
  },
});
```

### Idempotent Reserve (Retry-Safe)

```typescript
import { reserveIdempotent } from "@libar-dev/platform-core";

// Safe to retry - returns existing reservation if active
const result = await reserveIdempotent(
  ctx,
  {
    type: "email",
    value: email,
    ttl: 300_000,
  },
  { repository: reservationRepo }
);
```

---

## Design Decisions

### Why Simple OCC Instead of DCB?

Reservations are **single-key operations** - you reserve one key at a time. DCB (Dynamic Consistency Boundaries) is designed for **multi-entity invariant validation** within a bounded context.

| Criterion  | Reservation Pattern | DCB               |
| ---------- | ------------------- | ----------------- |
| Entities   | Single key          | Multiple entities |
| Scope      | One reservation     | Aggregated state  |
| Complexity | Lower               | Higher            |

Convex's serializable isolation provides atomic conflict detection automatically:

- If two mutations try to reserve the same key concurrently, only one succeeds
- The `findActiveByKey` query and `insert` run in the same transaction
- No explicit locking required

### Why Repository Pattern?

`@libar-dev/platform-core` is a library package that cannot define Convex schemas or mutations directly. The repository pattern:

- Allows apps to define their own table schema
- Provides type-safe interface contract
- Enables testing with mock repositories
- Supports different storage backends

### Why TTL Instead of Explicit Cleanup?

TTL-based expiration:

- **Automatic** - No user action required for abandoned reservations
- **Configurable** - Different TTLs for different use cases
- **Batch-processed** - Efficient cleanup via cron job
- **Idempotent** - Safe to run multiple times

---

## Related Patterns

| Pattern             | Use Case                | Relationship                             |
| ------------------- | ----------------------- | ---------------------------------------- |
| **DCB**             | Multi-entity invariants | Use DCB for atomic multi-key reservation |
| **Saga**            | Cross-BC coordination   | Reservation in one step of saga workflow |
| **ECST/Fat Events** | Integration events      | Emit fat event on reservation confirm    |

---

## Troubleshooting

### "ALREADY_RESERVED" but user never completed

The previous reservation expired. Check:

1. Is your TTL long enough for your user flow?
2. Is the expiration cron running?
3. Did you call `release()` on cancellation?

### Concurrent reservation conflicts

This is expected behavior - only one reservation for the same key succeeds. Options:

1. Retry with exponential backoff (if transient conflict)
2. Show "value taken" error to user (if genuine conflict)
3. Use `reserveIdempotent()` for retry-safe operations

### Expired reservations not cleaning up

Check:

1. Cron job is registered in `convex/crons.ts`
2. `expireExpiredReservations` mutation exists
3. No errors in Convex dashboard
