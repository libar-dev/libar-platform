/**
 * ## TTL Expiration Handler
 *
 * Batch processing for expired reservations.
 *
 * The expiration handler is designed to be called by a cron job to clean up
 * reservations that have exceeded their TTL. It processes reservations in
 * batches to avoid timeout issues with large datasets.
 *
 * @module reservations/expire
 * @since Phase 20
 */

import type {
  ReservationRepository,
  ExpireReservationsConfig,
  ExpireReservationsResult,
} from "./types.js";
import { EXPIRATION_CRON_CONFIG } from "./schema.js";

// =============================================================================
// Expire Operation
// =============================================================================

/**
 * Configuration for expire operation.
 */
export interface ExpireConfig<TCtx, TId = unknown> {
  /** Repository for database operations */
  repository: ReservationRepository<TCtx, TId>;
}

/**
 * Expire all reservations that have exceeded their TTL.
 *
 * This function is designed to be called by a cron job. It finds all
 * reservations with status "reserved" that have exceeded their TTL
 * and transitions them to "expired" status.
 *
 * ## Processing
 *
 * - Processes in batches to avoid Convex mutation timeouts
 * - Only processes "reserved" status (not already terminal)
 * - Idempotent - safe to run multiple times
 *
 * ## Recommended Cron Setup
 *
 * ```typescript
 * // convex/crons.ts
 * crons.interval(
 *   "expire-reservations",
 *   { minutes: 5 },
 *   internal.reservations.expireExpiredReservations
 * );
 * ```
 *
 * @param ctx - Convex mutation context
 * @param expireConfig - Expire options (batchSize, now)
 * @param config - Handler configuration
 * @returns Expire result with count and IDs
 *
 * @example
 * ```typescript
 * // In your convex/reservations.ts
 * export const expireExpiredReservations = internalMutation({
 *   handler: async (ctx) => {
 *     const result = await expireReservations(ctx, {
 *       batchSize: 100
 *     }, { repository: reservationRepo });
 *
 *     console.log(`Expired ${result.expiredCount} reservations`);
 *     return result;
 *   }
 * });
 * ```
 */
export async function expireReservations<TCtx, TId = unknown>(
  ctx: TCtx,
  expireConfig: ExpireReservationsConfig,
  config: ExpireConfig<TCtx, TId>
): Promise<ExpireReservationsResult> {
  const { repository } = config;
  const { batchSize = EXPIRATION_CRON_CONFIG.defaultBatchSize, now = Date.now() } = expireConfig;

  // Find expired reservations
  const expiredReservations = await repository.findExpired(ctx, now, batchSize);

  if (expiredReservations.length === 0) {
    return {
      expiredCount: 0,
      expiredIds: [],
    };
  }

  // Update each reservation to expired status
  const expiredIds: string[] = [];
  for (const reservation of expiredReservations) {
    // Double-check it's still in reserved status (concurrent safety)
    if (reservation.status === "reserved") {
      await repository.update(ctx, reservation._id, {
        status: "expired",
        updatedAt: now,
        version: reservation.version + 1,
      });
      expiredIds.push(reservation.reservationId);
    }
  }

  return {
    expiredCount: expiredIds.length,
    expiredIds,
  };
}

/**
 * Find expired reservations without updating them.
 *
 * Useful for reporting or debugging without modifying state.
 *
 * @param ctx - Convex query context
 * @param queryConfig - Query options
 * @param config - Handler configuration
 * @returns Array of expired reservations
 */
export async function findExpiredReservations<TCtx, TId = unknown>(
  ctx: TCtx,
  queryConfig: { limit?: number; now?: number },
  config: ExpireConfig<TCtx, TId>
): Promise<Array<{ reservationId: string; key: string; expiresAt: number }>> {
  const { repository } = config;
  const { limit = EXPIRATION_CRON_CONFIG.defaultBatchSize, now = Date.now() } = queryConfig;

  const expired = await repository.findExpired(ctx, now, limit);

  // Expired reservations always have non-null expiresAt (invariant)
  // Confirmed reservations have null expiresAt and cannot be returned by findExpired
  return expired.map((r) => ({
    reservationId: r.reservationId,
    key: r.key,
    expiresAt: r.expiresAt!,
  }));
}

/**
 * Count expired reservations.
 *
 * Note: This is limited by the batch size to avoid expensive full scans.
 * For accurate counts in large datasets, use a dedicated aggregation.
 *
 * @param ctx - Convex query context
 * @param queryConfig - Query options
 * @param config - Handler configuration
 * @returns Count of expired reservations (up to limit)
 */
export async function countExpiredReservations<TCtx, TId = unknown>(
  ctx: TCtx,
  queryConfig: { limit?: number; now?: number },
  config: ExpireConfig<TCtx, TId>
): Promise<number> {
  const expired = await findExpiredReservations(ctx, queryConfig, config);
  return expired.length;
}
