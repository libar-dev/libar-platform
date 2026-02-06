/**
 * @libar-docs
 * @libar-docs-pattern InventoryDeciders
 * @libar-docs-status completed
 * @libar-docs-decider
 * @libar-docs-arch-role decider
 * @libar-docs-arch-context inventory
 * @libar-docs-arch-layer domain
 * @libar-docs-used-by InventoryCommandHandlers
 *
 * Pure decision functions for Inventory aggregate (product + reservation).
 * SKU uniqueness, stock sufficiency, reservation lifecycle invariants. No I/O.
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Event Payloads
  ProductCreatedPayload,
  StockAddedPayload,
  StockReservedPayload,
  ReservationFailedPayload,
  ReservationConfirmedPayload,
  ReservationReleasedPayload,
  ReservationExpiredPayload,
  // Event Types
  ProductCreatedEvent,
  StockAddedEvent,
  StockReservedEvent,
  ReservationFailedEvent,
  ReservationConfirmedEvent,
  ReservationReleasedEvent,
  ReservationExpiredEvent,
  InventoryEvent,
  ReservationEvent,
  // Command Inputs
  CreateProductInput,
  AddStockInput,
  ReserveStockInput,
  ConfirmReservationInput,
  ReleaseReservationInput,
  ExpireReservationInput,
  // DCB Command
  ReserveMultipleDCBCommand,
  // State Updates
  InventoryStateUpdate,
  ReservationStateUpdate,
  // Success Data Types
  CreateProductData,
  AddStockData,
  ReserveStockData,
  ConfirmReservationData,
  ReleaseReservationData,
  ExpireReservationData,
  // Supporting Types
  ReservationItem,
  FailedItem,
  DeciderContext,
  // DCB Types
  DCBAggregatedState,
  DCBStateUpdates,
} from "./types.js";

// =============================================================================
// CreateProduct Decider (Entity Creation Pattern)
// =============================================================================

export { decideCreateProduct, evolveCreateProduct, createProductDecider } from "./createProduct.js";

// =============================================================================
// AddStock Decider (Standard Modification)
// =============================================================================

export { decideAddStock, evolveAddStock, addStockDecider } from "./addStock.js";

// =============================================================================
// ConfirmReservation Decider (Standard Modification)
// =============================================================================

export {
  decideConfirmReservation,
  evolveConfirmReservation,
  confirmReservationDecider,
} from "./confirmReservation.js";

// =============================================================================
// ReserveStock Decider (Hybrid Pattern)
// =============================================================================

export {
  decideReserveStock,
  evolveReserveStockForProduct,
  evolveReservationFailed,
  reserveStockDecider,
} from "./reserveStock.js";

// =============================================================================
// ReleaseReservation Decider (Hybrid Pattern)
// =============================================================================

export {
  decideReleaseReservation,
  evolveReleaseReservation,
  evolveReleaseReservationForProduct,
  releaseReservationDecider,
} from "./releaseReservation.js";

// =============================================================================
// ExpireReservation Decider (Hybrid Pattern)
// =============================================================================

export {
  decideExpireReservation,
  evolveExpireReservation,
  evolveExpireReservationForProduct,
  expireReservationDecider,
} from "./expireReservation.js";

// =============================================================================
// ReserveMultipleDCB Decider (DCB Pattern - Phase 16 Demo)
// =============================================================================

export { decideReserveMultipleDCB, reserveMultipleDCBDecider } from "./reserveMultipleDCB.js";
