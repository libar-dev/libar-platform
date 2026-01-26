/**
 * ## Reserve Operation
 *
 * Reserve a unique value with TTL-based expiration.
 *
 * The reserve operation atomically claims a unique value, preventing race
 * conditions in check-then-create patterns. Uses Convex's serializable
 * isolation for OCC - only one concurrent reservation for the same key
 * will succeed.
 *
 * @module reservations/reserve
 * @since Phase 20
 */

import type {
  ReserveInput,
  ReserveResult,
  ReservationRepository,
  ReservationCMS,
} from "./types.js";
import { createReservationKey, hashReservationId } from "./key.js";
import { validateReserveInput } from "./validation.js";

// =============================================================================
// Reserve Operation
// =============================================================================

/**
 * Configuration for reserve operation.
 */
export interface ReserveConfig<TCtx, TId = unknown> {
  /** Repository for database operations */
  repository: ReservationRepository<TCtx, TId>;

  /** Current timestamp (defaults to Date.now()) */
  now?: number;
}

/**
 * Reserve a unique value with TTL.
 *
 * Creates a reservation that claims the specified value for the duration
 * of the TTL. If the value is already reserved by an active (non-expired)
 * reservation, returns a conflict result.
 *
 * ## Atomicity
 *
 * Convex's serializable isolation ensures atomic conflict detection:
 * - If two mutations try to reserve the same value concurrently, only one succeeds
 * - The `findActiveByKey` query and `insert` run in the same transaction
 * - No explicit locking required - Convex handles OCC automatically
 *
 * ## Idempotency
 *
 * The reservation ID is deterministically generated from the key. If you
 * need idempotent reserve operations (retry-safe), check if a reservation
 * with the same ID already exists first.
 *
 * @param ctx - Convex mutation context
 * @param input - Reserve input (type, value, ttl)
 * @param config - Reserve configuration
 * @returns Reserve result (success, conflict, or validation error)
 *
 * @example
 * ```typescript
 * const result = await reserve(ctx, {
 *   type: "email",
 *   value: "alice@example.com",
 *   ttl: 300000, // 5 minutes
 *   correlationId: "corr_123"
 * }, { repository: reservationRepo });
 *
 * if (result.status === "success") {
 *   console.log("Reserved:", result.reservationId);
 *   // Proceed with registration...
 * } else if (result.status === "conflict") {
 *   console.log("Already reserved:", result.existingReservationId);
 * } else {
 *   console.error("Validation error:", result.message);
 * }
 * ```
 */
export async function reserve<TCtx, TId = unknown>(
  ctx: TCtx,
  input: ReserveInput,
  config: ReserveConfig<TCtx, TId>
): Promise<ReserveResult> {
  const { repository, now = Date.now() } = config;

  // Validate input
  const validationError = validateReserveInput(input);
  if (validationError) {
    return validationError;
  }

  // Create reservation key
  const key = createReservationKey(input.type, input.value);
  const reservationId = hashReservationId(key);
  const expiresAt = now + input.ttl;

  // Check for existing active reservation
  const existing = await repository.findActiveByKey(ctx, key, now);
  if (existing) {
    // Active reservations always have non-null expiresAt (invariant)
    return {
      status: "conflict",
      code: "ALREADY_RESERVED",
      existingReservationId: existing.reservationId,
      existingExpiresAt: existing.expiresAt!,
    };
  }

  // Create new reservation
  const reservation: Omit<ReservationCMS, "version"> = {
    reservationId,
    key,
    type: input.type,
    value: input.value,
    status: "reserved",
    expiresAt,
    entityId: null,
    confirmedAt: null,
    releasedAt: null,
    correlationId: input.correlationId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repository.insert(ctx, reservation);

  return {
    status: "success",
    reservationId,
    key,
    expiresAt,
  };
}

/**
 * Reserve a unique value idempotently.
 *
 * If a reservation with the same key already exists and is still active,
 * returns the existing reservation instead of creating a new one. This
 * makes the operation safe to retry.
 *
 * @param ctx - Convex mutation context
 * @param input - Reserve input
 * @param config - Reserve configuration
 * @returns Reserve result with existing or new reservation
 *
 * @example
 * ```typescript
 * // Safe to retry - will return same reservation
 * const result1 = await reserveIdempotent(ctx, input, config);
 * const result2 = await reserveIdempotent(ctx, input, config);
 * // result1.reservationId === result2.reservationId (if both succeeded)
 * ```
 */
export async function reserveIdempotent<TCtx, TId = unknown>(
  ctx: TCtx,
  input: ReserveInput,
  config: ReserveConfig<TCtx, TId>
): Promise<ReserveResult> {
  const { repository, now = Date.now() } = config;

  // Validate input
  const validationError = validateReserveInput(input);
  if (validationError) {
    return validationError;
  }

  // Create reservation key and ID
  const key = createReservationKey(input.type, input.value);
  const reservationId = hashReservationId(key);

  // Check for existing reservation by ID (idempotency check)
  const existingById = await repository.findById(ctx, reservationId);
  if (existingById) {
    // Check if it's still active
    // Reserved status reservations always have non-null expiresAt
    if (
      existingById.status === "reserved" &&
      existingById.expiresAt !== null &&
      existingById.expiresAt > now
    ) {
      // Return existing active reservation (idempotent success)
      return {
        status: "success",
        reservationId: existingById.reservationId,
        key: existingById.key,
        expiresAt: existingById.expiresAt,
      };
    }

    // Existing reservation is expired/confirmed/released
    // Check if same key is reserved by another reservation
    const activeByKey = await repository.findActiveByKey(ctx, key, now);
    if (activeByKey && activeByKey.reservationId !== reservationId) {
      // Active reservations always have non-null expiresAt (invariant)
      return {
        status: "conflict",
        code: "ALREADY_RESERVED",
        existingReservationId: activeByKey.reservationId,
        existingExpiresAt: activeByKey.expiresAt!,
      };
    }
  } else {
    // No existing reservation with this ID - check by key
    const activeByKey = await repository.findActiveByKey(ctx, key, now);
    if (activeByKey) {
      // Active reservations always have non-null expiresAt (invariant)
      return {
        status: "conflict",
        code: "ALREADY_RESERVED",
        existingReservationId: activeByKey.reservationId,
        existingExpiresAt: activeByKey.expiresAt!,
      };
    }
  }

  // Create new reservation
  const expiresAt = now + input.ttl;
  const reservation: Omit<ReservationCMS, "version"> = {
    reservationId,
    key,
    type: input.type,
    value: input.value,
    status: "reserved",
    expiresAt,
    entityId: null,
    confirmedAt: null,
    releasedAt: null,
    correlationId: input.correlationId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repository.insert(ctx, reservation);

  return {
    status: "success",
    reservationId,
    key,
    expiresAt,
  };
}
