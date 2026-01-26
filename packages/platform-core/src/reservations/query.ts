/**
 * ## Reservation Query Helpers
 *
 * Helper functions for querying reservation state.
 *
 * @module reservations/query
 * @since Phase 20
 */

import type {
  ReservationCMS,
  ReservationRepository,
  ReservationKey,
  FindReservationOptions,
  IsReservedOptions,
} from "./types.js";
import { createReservationKey } from "./key.js";

// =============================================================================
// Query Operations
// =============================================================================

/**
 * Configuration for reservation query operations.
 */
export interface ReservationQueryConfig<TCtx, TId = unknown> {
  /** Repository for database operations */
  repository: ReservationRepository<TCtx, TId>;

  /** Current timestamp (defaults to Date.now()) */
  now?: number;
}

/**
 * Find a reservation by ID or key.
 *
 * @param ctx - Convex query/mutation context
 * @param options - Find options (reservationId, key, or type+value)
 * @param config - Query configuration
 * @returns Reservation if found, null otherwise
 *
 * @example
 * ```typescript
 * // Find by ID
 * const reservation = await findReservation(ctx, {
 *   reservationId: "res_123"
 * }, { repository: reservationRepo });
 *
 * // Find by key
 * const reservation = await findReservation(ctx, {
 *   key: "email:alice@example.com" as ReservationKey
 * }, { repository: reservationRepo });
 *
 * // Find by type and value
 * const reservation = await findReservation(ctx, {
 *   type: "email",
 *   value: "alice@example.com"
 * }, { repository: reservationRepo });
 * ```
 */
export async function findReservation<TCtx, TId = unknown>(
  ctx: TCtx,
  options: FindReservationOptions,
  config: ReservationQueryConfig<TCtx, TId>
): Promise<(ReservationCMS & { _id: TId }) | null> {
  const { repository, now = Date.now() } = config;

  // Find by reservation ID
  if (options.reservationId) {
    const reservation = await repository.findById(ctx, options.reservationId);
    if (!reservation) return null;

    // Apply activeOnly filter
    // Active requires: status "reserved" with non-null expiresAt > now
    if (options.activeOnly) {
      if (
        reservation.status !== "reserved" ||
        reservation.expiresAt === null ||
        reservation.expiresAt <= now
      ) {
        return null;
      }
    }

    return reservation;
  }

  // Find by key
  let key: ReservationKey | null = null;
  if (options.key) {
    key = options.key;
  } else if (options.type && options.value) {
    key = createReservationKey(options.type, options.value);
  }

  if (!key) {
    return null;
  }

  // Use activeOnly variant if requested
  if (options.activeOnly) {
    return repository.findActiveByKey(ctx, key, now);
  }

  return repository.findByKey(ctx, key);
}

/**
 * Check if a value is currently reserved.
 *
 * Returns true if there's an active (non-expired) reservation for the value.
 *
 * @param ctx - Convex query/mutation context
 * @param options - Check options (type, value)
 * @param config - Query configuration
 * @returns true if value is reserved
 *
 * @example
 * ```typescript
 * const reserved = await isReserved(ctx, {
 *   type: "email",
 *   value: "alice@example.com"
 * }, { repository: reservationRepo });
 *
 * if (reserved) {
 *   console.log("Email is already reserved");
 * }
 * ```
 */
export async function isReserved<TCtx, TId = unknown>(
  ctx: TCtx,
  options: IsReservedOptions,
  config: ReservationQueryConfig<TCtx, TId>
): Promise<boolean> {
  const { repository } = config;
  const now = options.now ?? config.now ?? Date.now();

  const key = createReservationKey(options.type, options.value);
  const reservation = await repository.findActiveByKey(ctx, key, now);

  return reservation !== null;
}

/**
 * Get reservation by ID.
 *
 * Convenience function that throws if reservation not found.
 *
 * @param ctx - Convex query/mutation context
 * @param reservationId - Reservation ID
 * @param config - Query configuration
 * @returns Reservation
 * @throws Error if not found
 *
 * @example
 * ```typescript
 * try {
 *   const reservation = await getReservation(ctx, "res_123", config);
 *   console.log("Status:", reservation.status);
 * } catch (e) {
 *   console.log("Reservation not found");
 * }
 * ```
 */
export async function getReservation<TCtx, TId = unknown>(
  ctx: TCtx,
  reservationId: string,
  config: ReservationQueryConfig<TCtx, TId>
): Promise<ReservationCMS & { _id: TId }> {
  const reservation = await config.repository.findById(ctx, reservationId);
  if (!reservation) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }
  return reservation;
}

/**
 * Check if a reservation is active (reserved and not expired).
 *
 * Note: Confirmed reservations have null expiresAt and are NOT active
 * (they are permanent, which is a different state than "active").
 *
 * @param reservation - Reservation to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns true if reservation is active
 */
export function isReservationActive(
  reservation: ReservationCMS,
  now: number = Date.now()
): boolean {
  // Null expiresAt means confirmed (permanent) - not "active" in the TTL sense
  if (reservation.expiresAt === null) return false;
  return reservation.status === "reserved" && reservation.expiresAt > now;
}

/**
 * Check if a reservation has expired (TTL exceeded).
 *
 * Note: This checks the TTL, not the status field. A reservation might
 * have expired by TTL but not yet been marked as "expired" by the cron.
 *
 * Confirmed reservations (expiresAt === null) never expire - they are permanent.
 *
 * @param reservation - Reservation to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns true if TTL has expired
 */
export function isReservationExpired(
  reservation: ReservationCMS,
  now: number = Date.now()
): boolean {
  // Null expiresAt means confirmed (permanent) - never expires
  if (reservation.expiresAt === null) return false;
  return reservation.expiresAt <= now;
}

/**
 * Get the remaining TTL for a reservation in milliseconds.
 *
 * @param reservation - Reservation to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Remaining TTL in milliseconds (0 if expired, Infinity if permanent)
 */
export function getRemainingTTL(reservation: ReservationCMS, now: number = Date.now()): number {
  // Null expiresAt means confirmed (permanent) - infinite remaining TTL
  if (reservation.expiresAt === null) return Infinity;
  const remaining = reservation.expiresAt - now;
  return Math.max(0, remaining);
}
