/**
 * ## Release Operation
 *
 * Release a reservation, making the value available again.
 *
 * Release transitions a reservation from "reserved" to "released" status,
 * freeing the value for new reservations immediately (without waiting for TTL).
 *
 * @module reservations/release
 * @since Phase 20
 */

import type { ReleaseInput, ReleaseResult, ReservationRepository } from "./types.js";
import { validateReleaseInput } from "./validation.js";

// =============================================================================
// Release Operation
// =============================================================================

/**
 * Configuration for release operation.
 */
export interface ReleaseConfig<TCtx, TId = unknown> {
  /** Repository for database operations */
  repository: ReservationRepository<TCtx, TId>;

  /** Current timestamp (defaults to Date.now()) */
  now?: number;
}

/**
 * Release a reservation, making the value available immediately.
 *
 * Explicitly releases a reservation before its TTL expires. This is useful
 * when a user cancels an operation (e.g., abandons registration) and you
 * want to free the reserved value for other users immediately.
 *
 * ## State Machine
 *
 * Valid transition: `reserved` → `released`
 *
 * Invalid from: `confirmed`, `released`, `expired`
 *
 * ## vs. TTL Expiration
 *
 * - **Release**: Immediate, explicit user/system action
 * - **TTL Expiration**: Automatic, batch-processed by cron
 *
 * Both make the value available for new reservations.
 *
 * @param ctx - Convex mutation context
 * @param input - Release input (reservationId)
 * @param config - Release configuration
 * @returns Release result (success or error)
 *
 * @example
 * ```typescript
 * // User cancels registration
 * const result = await release(ctx, {
 *   reservationId: "res_123"
 * }, { repository: reservationRepo });
 *
 * if (result.status === "success") {
 *   console.log("Released:", result.reservationId);
 *   // Value is now available for others
 * } else {
 *   console.error("Release failed:", result.code, result.message);
 * }
 * ```
 */
export async function release<TCtx, TId = unknown>(
  ctx: TCtx,
  input: ReleaseInput,
  config: ReleaseConfig<TCtx, TId>
): Promise<ReleaseResult> {
  const { repository, now = Date.now() } = config;

  // Validate input
  const validationError = validateReleaseInput(input);
  if (validationError) {
    return {
      status: "error",
      code: validationError.code,
      message: validationError.message,
    };
  }

  // Find the reservation
  const reservation = await repository.findById(ctx, input.reservationId);
  if (!reservation) {
    return {
      status: "error",
      code: "RESERVATION_NOT_FOUND",
      message: "Reservation not found or has been processed",
    };
  }

  // Check current status
  switch (reservation.status) {
    case "confirmed":
      return {
        status: "error",
        code: "RESERVATION_ALREADY_CONFIRMED",
        message: "Cannot release a confirmed reservation",
      };

    case "released":
      return {
        status: "error",
        code: "RESERVATION_ALREADY_RELEASED",
        message: "Reservation has already been released",
      };

    case "expired":
      return {
        status: "error",
        code: "RESERVATION_ALREADY_EXPIRED",
        message: "Reservation has already expired",
      };

    case "reserved":
      // Check if expired by TTL (even if status not yet updated by cron)
      // Note: Reserved status reservations always have non-null expiresAt
      if (reservation.expiresAt !== null && reservation.expiresAt <= now) {
        return {
          status: "error",
          code: "RESERVATION_ALREADY_EXPIRED",
          message: "Reservation has expired",
        };
      }
      // Valid state - proceed with release
      break;

    default:
      return {
        status: "error",
        code: "RESERVATION_NOT_FOUND",
        message: "Reservation not found or has been processed",
      };
  }

  // Update reservation to released
  await repository.update(ctx, reservation._id, {
    status: "released",
    releasedAt: now,
    updatedAt: now,
    version: reservation.version + 1,
  });

  return {
    status: "success",
    reservationId: input.reservationId,
  };
}
