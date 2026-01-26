/**
 * Types for Inventory decider functions.
 *
 * Defines the event payloads and command inputs for pure decider functions.
 * These types enable type-safe decider outputs without infrastructure dependencies.
 *
 * Two CMS types are used in this bounded context:
 * - InventoryCMS: Product stock levels (productId-keyed)
 * - ReservationCMS: Order reservations (reservationId-keyed)
 */

import type { DeciderEvent, DeciderContext } from "@libar-dev/platform-core/decider";
import type { DCBAggregatedState, DCBStateUpdates } from "@libar-dev/platform-core/dcb";
import type { InventoryCMS } from "../inventory.js";
import type { ReservationCMS, ReservationItem, ReservationStatus } from "../reservation.js";

// Re-export ReservationItem for convenience
export type { ReservationItem };

// =============================================================================
// Event Payloads
// =============================================================================

// --- Product Events ---

export interface ProductCreatedPayload {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  /**
   * Timestamp when the product was created.
   * Used by evolve() for pure state reconstruction from event.
   */
  createdAt: number;
}

export interface StockAddedPayload {
  productId: string;
  quantity: number;
  newAvailableQuantity: number;
  reason?: string;
}

// --- Reservation Events ---

export interface StockReservedPayload {
  reservationId: string;
  orderId: string;
  items: ReservationItem[];
  expiresAt: number;
}

/**
 * FailedItem represents a single item that failed during reservation.
 */
export interface FailedItem {
  productId: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface ReservationFailedPayload {
  orderId: string;
  reason: string;
  failedItems: FailedItem[];
}

export interface ReservationConfirmedPayload {
  reservationId: string;
  orderId: string;
  /** Items included for consistency with Released/Expired and projection rebuilding. */
  items: ReservationItem[];
}

export interface ReservationReleasedPayload {
  reservationId: string;
  orderId: string;
  reason: string;
  items: ReservationItem[];
}

export interface ReservationExpiredPayload {
  reservationId: string;
  orderId: string;
  items: ReservationItem[];
}

// =============================================================================
// Event Types (with typed payloads)
// =============================================================================

// --- Product Events ---

export type ProductCreatedEvent = DeciderEvent<ProductCreatedPayload> & {
  eventType: "ProductCreated";
};

export type StockAddedEvent = DeciderEvent<StockAddedPayload> & {
  eventType: "StockAdded";
};

// --- Reservation Events ---

export type StockReservedEvent = DeciderEvent<StockReservedPayload> & {
  eventType: "StockReserved";
};

export type ReservationFailedEvent = DeciderEvent<ReservationFailedPayload> & {
  eventType: "ReservationFailed";
};

export type ReservationConfirmedEvent = DeciderEvent<ReservationConfirmedPayload> & {
  eventType: "ReservationConfirmed";
};

export type ReservationReleasedEvent = DeciderEvent<ReservationReleasedPayload> & {
  eventType: "ReservationReleased";
};

export type ReservationExpiredEvent = DeciderEvent<ReservationExpiredPayload> & {
  eventType: "ReservationExpired";
};

// --- Event Unions ---

export type InventoryEvent = ProductCreatedEvent | StockAddedEvent;

export type ReservationEvent =
  | StockReservedEvent
  | ReservationFailedEvent
  | ReservationConfirmedEvent
  | ReservationReleasedEvent
  | ReservationExpiredEvent;

export type AllInventoryEvent = InventoryEvent | ReservationEvent;

// =============================================================================
// Command Inputs (without commandId/correlationId - those come from context)
// =============================================================================

// --- Product Commands ---

export interface CreateProductInput {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
}

export interface AddStockInput {
  productId: string;
  quantity: number;
  reason?: string;
}

// --- Reservation Commands ---

export interface ReserveStockInput {
  orderId: string;
  items: ReservationItem[];
  /**
   * Pre-generated reservation ID.
   * Handler generates this before calling decider to maintain decider purity.
   * This enables deterministic testing and consistent retry behavior.
   */
  reservationId: string;
}

export interface ConfirmReservationInput {
  reservationId: string;
}

export interface ReleaseReservationInput {
  reservationId: string;
  reason: string;
}

export interface ExpireReservationInput {
  reservationId: string;
}

// --- DCB Commands ---

/**
 * Command input for DCB-based multi-product reservation.
 *
 * Similar to ReserveStockInput but used with executeWithDCB for
 * atomic cross-entity invariant validation.
 */
export interface ReserveMultipleDCBCommand {
  orderId: string;
  items: ReservationItem[];
  /**
   * Pre-generated reservation ID.
   * Handler generates this before calling DCB to maintain decider purity.
   */
  reservationId: string;
}

// =============================================================================
// State Update Types
// =============================================================================

/**
 * Partial InventoryCMS state update from decider.
 * Handler wrapper adds version and timestamp.
 */
export type InventoryStateUpdate = Partial<
  Pick<InventoryCMS, "availableQuantity" | "reservedQuantity" | "productName" | "sku" | "unitPrice">
>;

/**
 * Partial ReservationCMS state update from decider.
 * Handler wrapper adds version and timestamp.
 */
export type ReservationStateUpdate = Partial<Pick<ReservationCMS, "status">>;

// =============================================================================
// Success Data Types (canonical definitions - handlers re-export these)
// =============================================================================

export interface CreateProductData {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
}

export interface AddStockData {
  productId: string;
  newAvailableQuantity: number;
  quantity: number;
}

export interface ReserveStockData {
  reservationId: string;
  orderId: string;
  expiresAt: number;
  itemCount: number;
}

export interface ConfirmReservationData {
  reservationId: string;
  orderId: string;
}

export interface ReleaseReservationData {
  reservationId: string;
  orderId: string;
  reason: string;
}

export interface ExpireReservationData {
  reservationId: string;
  orderId: string;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { DeciderContext };

// Re-export CMS types for decider implementations
export type { InventoryCMS, ReservationCMS, ReservationStatus };

// Re-export DCB types for DCB decider implementations
export type { DCBAggregatedState, DCBStateUpdates };
