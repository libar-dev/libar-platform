/**
 * Reservation CMS (Command Model State) types and utilities.
 *
 * Represents stock reservations linked to orders.
 */
import type { BaseCMS } from "@libar-dev/platform-core";
import { z } from "zod";

/**
 * Current CMS schema version.
 * Increment when the ReservationCMS structure changes.
 */
export const CURRENT_RESERVATION_CMS_VERSION = 1;

/**
 * Default reservation TTL: 1 hour in milliseconds.
 */
export const DEFAULT_RESERVATION_TTL_MS = 60 * 60 * 1000;

/**
 * Reservation status values.
 */
export type ReservationStatus = "pending" | "confirmed" | "released" | "expired";

/**
 * Reservation item schema (single source of truth).
 */
export const ReservationItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.number().int("Quantity must be an integer").positive("Quantity must be positive"),
});

/**
 * Reservation item type (derived from schema).
 */
export type ReservationItem = z.infer<typeof ReservationItemSchema>;

/**
 * Reservation CMS (Command Model State).
 *
 * Represents a stock reservation for an order.
 * Has TTL-based expiration for uncommitted reservations.
 */
export interface ReservationCMS extends BaseCMS {
  reservationId: string;
  orderId: string;
  items: ReservationItem[];
  status: ReservationStatus;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Calculate total items in reservation.
 */
export function calculateReservationItemCount(reservation: ReservationCMS): number {
  return reservation.items.length;
}

/**
 * Calculate total quantity reserved across all items.
 */
export function calculateTotalReservedQuantity(items: ReservationItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Create initial CMS for a new reservation.
 */
export function createInitialReservationCMS(
  reservationId: string,
  orderId: string,
  items: ReservationItem[],
  ttlMs: number = DEFAULT_RESERVATION_TTL_MS
): ReservationCMS {
  const now = Date.now();
  return {
    reservationId,
    orderId,
    items,
    status: "pending",
    expiresAt: now + ttlMs,
    version: 0, // Will be 1 after first event
    stateVersion: CURRENT_RESERVATION_CMS_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check if a reservation has expired.
 */
export function isReservationExpired(reservation: ReservationCMS): boolean {
  return reservation.status === "pending" && Date.now() > reservation.expiresAt;
}

/**
 * Upcast ReservationCMS from older versions to current version.
 */
export function upcastReservationCMS(raw: unknown): ReservationCMS {
  const state = raw as Record<string, unknown>;
  const currentStateVersion = typeof state["stateVersion"] === "number" ? state["stateVersion"] : 0;

  // Already at current version
  if (currentStateVersion === CURRENT_RESERVATION_CMS_VERSION) {
    return raw as ReservationCMS;
  }

  // Reject future versions that this code doesn't understand
  if (currentStateVersion > CURRENT_RESERVATION_CMS_VERSION) {
    throw new Error(
      `ReservationCMS version ${currentStateVersion} is newer than supported version ${CURRENT_RESERVATION_CMS_VERSION}. Update code to handle this version.`
    );
  }

  // Add migrations here as schema evolves

  // If no migration path, return as-is with updated version
  return {
    ...(raw as ReservationCMS),
    stateVersion: CURRENT_RESERVATION_CMS_VERSION,
  };
}
