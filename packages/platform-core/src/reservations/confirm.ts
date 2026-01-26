/**
 * ## Confirm Operation
 *
 * Confirm a reservation, linking it to the created entity.
 *
 * Confirmation transitions a reservation from "reserved" to "confirmed" status,
 * marking it as a terminal state. The entity ID is recorded for traceability.
 *
 * @module reservations/confirm
 * @since Phase 20
 */

import type { ConfirmInput, ConfirmResult, ReservationRepository } from "./types.js";
import { validateConfirmInput } from "./validation.js";

// =============================================================================
// Confirm Operation
// =============================================================================

/**
 * Configuration for confirm operation.
 */
export interface ConfirmConfig<TCtx, TId = unknown> {
  /** Repository for database operations */
  repository: ReservationRepository<TCtx, TId>;

  /** Current timestamp (defaults to Date.now()) */
  now?: number;
}

/**
 * Confirm a reservation, linking it to an entity.
 *
 * Confirms that the reserved value has been used to create an entity.
 * The reservation transitions to "confirmed" status (terminal state)
 * and records the entity ID for traceability.
 *
 * ## State Machine
 *
 * Valid transition: `reserved` → `confirmed`
 *
 * Invalid from: `confirmed`, `released`, `expired`
 *
 * ## Post-Confirmation
 *
 * After confirmation:
 * - The value remains unavailable for new reservations (permanent claim)
 * - The reservation provides an audit trail linking entity to original reservation
 * - Applications typically create their unique index on the entity table
 *
 * @param ctx - Convex mutation context
 * @param input - Confirm input (reservationId, entityId)
 * @param config - Confirm configuration
 * @returns Confirm result (success or error)
 *
 * @example
 * ```typescript
 * // After successfully creating the user
 * const user = await createUser(ctx, { email: "alice@example.com" });
 *
 * const result = await confirm(ctx, {
 *   reservationId: "res_123",
 *   entityId: user._id
 * }, { repository: reservationRepo });
 *
 * if (result.status === "success") {
 *   console.log("Confirmed at:", result.confirmedAt);
 * } else {
 *   console.error("Confirm failed:", result.code, result.message);
 * }
 * ```
 */
export async function confirm<TCtx, TId = unknown>(
  ctx: TCtx,
  input: ConfirmInput,
  config: ConfirmConfig<TCtx, TId>
): Promise<ConfirmResult> {
  const { repository, now = Date.now() } = config;

  // Validate input
  const validationError = validateConfirmInput(input);
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
        message: "Reservation has already been confirmed",
      };

    case "released":
      return {
        status: "error",
        code: "RESERVATION_ALREADY_RELEASED",
        message: "Reservation has been released",
      };

    case "expired":
      return {
        status: "error",
        code: "RESERVATION_ALREADY_EXPIRED",
        message: "Reservation has expired",
      };

    case "reserved":
      // Check if expired (TTL passed but not yet marked)
      // Note: Reserved status reservations always have non-null expiresAt
      if (reservation.expiresAt !== null && reservation.expiresAt <= now) {
        return {
          status: "error",
          code: "RESERVATION_ALREADY_EXPIRED",
          message: "Reservation has expired",
        };
      }
      break;

    default:
      return {
        status: "error",
        code: "RESERVATION_NOT_FOUND",
        message: "Reservation not found or has been processed",
      };
  }

  // Update reservation to confirmed
  // Setting expiresAt to null indicates permanent claim (no expiration)
  await repository.update(ctx, reservation._id, {
    status: "confirmed",
    entityId: input.entityId,
    confirmedAt: now,
    expiresAt: null,
    updatedAt: now,
    version: reservation.version + 1,
  });

  return {
    status: "success",
    reservationId: input.reservationId,
    entityId: input.entityId,
    confirmedAt: now,
  };
}
