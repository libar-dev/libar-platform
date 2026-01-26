/**
 * Inventory Deciders - Pure decision logic for Inventory bounded context.
 *
 * This module exports all decider types, functions, and complete Decider objects.
 *
 * Usage:
 * - Import specific decider functions for handler wiring
 * - Import full Decider objects for property-based testing and event replay
 * - Import types for handler type definitions
 *
 * Pattern Reference:
 * - Single-entity: createProduct, addStock, confirmReservation
 * - Hybrid (multi-entity): reserveStock, releaseReservation, expireReservation
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
