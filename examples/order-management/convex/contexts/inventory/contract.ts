/**
 * Inventory Bounded Context Contract
 *
 * This contract formally defines the Inventory bounded context:
 * - Identity and versioning
 * - Command types (write operations)
 * - Event types (domain events)
 * - CMS types (aggregate states)
 * - Error codes
 * - Formal command/event definitions with metadata
 * - CMS factory and upcaster contracts
 *
 * The contract is purely TypeScript - NO Convex runtime dependency.
 */
import type {
  DualWriteContextContract,
  CMSTypeDefinition,
  CMSFactory,
  CMSUpcasterContract,
  CommandDefinitionRegistry,
  EventDefinitionRegistry,
  ExtractCommandTypes,
  ExtractEventTypes,
} from "@libar-dev/platform-bc";
import { defineCommand, defineEvent, defineUpcaster } from "@libar-dev/platform-bc";
import { INVENTORY_EVENT_TYPES } from "./domain/events.js";
import { InventoryErrorCodes } from "./domain/invariants.js";
import type { InventoryCMS } from "./domain/inventory.js";
import {
  CURRENT_INVENTORY_CMS_VERSION,
  createInitialInventoryCMS,
  upcastInventoryCMS,
} from "./domain/inventory.js";
import type { ReservationCMS, ReservationItem } from "./domain/reservation.js";
import {
  CURRENT_RESERVATION_CMS_VERSION,
  createInitialReservationCMS,
  upcastReservationCMS,
} from "./domain/reservation.js";

/**
 * All inventory command types.
 */
export const INVENTORY_COMMAND_TYPES = [
  "CreateProduct",
  "AddStock",
  "ReserveStock",
  "ConfirmReservation",
  "ReleaseReservation",
  "ExpireReservation",
] as const;

export type InventoryCommandType = (typeof INVENTORY_COMMAND_TYPES)[number];

/**
 * Inventory Bounded Context Contract
 *
 * Defines the public contract for the Inventory context following DDD principles.
 * This context manages:
 * - Product catalog (inventoryCMS)
 * - Stock reservations (reservationCMS)
 */
export const InventoryContextContract = {
  identity: {
    name: "inventory",
    description: "Inventory management bounded context for stock and reservations",
    version: 1,
    streamTypePrefix: "Inventory",
  },
  executionMode: "dual-write",
  commandTypes: INVENTORY_COMMAND_TYPES,
  eventTypes: INVENTORY_EVENT_TYPES,
  cmsTypes: {
    inventoryCMS: {
      tableName: "inventoryCMS",
      currentStateVersion: CURRENT_INVENTORY_CMS_VERSION,
      description: "Product inventory state (stock levels, pricing)",
    },
    reservationCMS: {
      tableName: "reservationCMS",
      currentStateVersion: CURRENT_RESERVATION_CMS_VERSION,
      description: "Stock reservation state (pending, confirmed, released, expired)",
    },
  },
  errorCodes: Object.values(InventoryErrorCodes),
} as const satisfies DualWriteContextContract<
  typeof INVENTORY_COMMAND_TYPES,
  typeof INVENTORY_EVENT_TYPES,
  { inventoryCMS: CMSTypeDefinition; reservationCMS: CMSTypeDefinition }
>;

/**
 * Type helpers for extracting types from the contract.
 */
export type InventoryCommand = ExtractCommandTypes<typeof InventoryContextContract>;
export type InventoryEvent = ExtractEventTypes<typeof InventoryContextContract>;

// ============================================================================
// COMMAND DEFINITIONS
// ============================================================================

/**
 * Formal command definitions with metadata for documentation and introspection.
 *
 * Commands target either the Product aggregate (Inventory) or Reservation aggregate.
 */
export const InventoryCommandDefinitions: CommandDefinitionRegistry<
  typeof INVENTORY_COMMAND_TYPES
> = {
  CreateProduct: defineCommand({
    commandType: "CreateProduct",
    description: "Creates a new product in the inventory catalog",
    targetAggregate: "Product",
    createsAggregate: true,
    producesEvents: ["ProductCreated"],
    errorCodes: [
      InventoryErrorCodes.PRODUCT_ALREADY_EXISTS,
      InventoryErrorCodes.INVALID_PRODUCT_NAME,
      InventoryErrorCodes.INVALID_SKU,
    ],
  }),
  AddStock: defineCommand({
    commandType: "AddStock",
    description: "Adds stock quantity to an existing product",
    targetAggregate: "Product",
    createsAggregate: false,
    producesEvents: ["StockAdded"],
    errorCodes: [InventoryErrorCodes.PRODUCT_NOT_FOUND, InventoryErrorCodes.INVALID_QUANTITY],
  }),
  ReserveStock: defineCommand({
    commandType: "ReserveStock",
    description: "Reserves stock for an order (triggered by OrderFulfillmentSaga)",
    targetAggregate: "Reservation",
    createsAggregate: true,
    producesEvents: ["StockReserved", "ReservationFailed"],
    errorCodes: [
      InventoryErrorCodes.RESERVATION_ALREADY_EXISTS,
      InventoryErrorCodes.EMPTY_RESERVATION,
      InventoryErrorCodes.INVALID_QUANTITY,
      InventoryErrorCodes.PRODUCT_NOT_FOUND,
      InventoryErrorCodes.INSUFFICIENT_STOCK,
    ],
  }),
  ConfirmReservation: defineCommand({
    commandType: "ConfirmReservation",
    description: "Confirms a pending reservation after successful order confirmation",
    targetAggregate: "Reservation",
    createsAggregate: false,
    producesEvents: ["ReservationConfirmed"],
    errorCodes: [
      InventoryErrorCodes.RESERVATION_NOT_FOUND,
      InventoryErrorCodes.RESERVATION_NOT_PENDING,
      InventoryErrorCodes.RESERVATION_EXPIRED,
    ],
  }),
  ReleaseReservation: defineCommand({
    commandType: "ReleaseReservation",
    description: "Releases reserved stock back to available (order cancelled)",
    targetAggregate: "Reservation",
    createsAggregate: false,
    producesEvents: ["ReservationReleased"],
    errorCodes: [
      InventoryErrorCodes.RESERVATION_NOT_FOUND,
      InventoryErrorCodes.RESERVATION_NOT_PENDING,
    ],
  }),
  ExpireReservation: defineCommand({
    commandType: "ExpireReservation",
    description: "Expires a pending reservation that has passed its TTL (internal/scheduled)",
    targetAggregate: "Reservation",
    createsAggregate: false,
    producesEvents: ["ReservationExpired"],
    errorCodes: [
      InventoryErrorCodes.RESERVATION_NOT_FOUND,
      InventoryErrorCodes.RESERVATION_NOT_PENDING,
      InventoryErrorCodes.RESERVATION_NOT_EXPIRED,
    ],
    internal: true,
  }),
};

// ============================================================================
// EVENT DEFINITIONS
// ============================================================================

/**
 * Formal event definitions with metadata for documentation and introspection.
 *
 * Events are organized by aggregate: Product events and Reservation events.
 */
export const InventoryEventDefinitions: EventDefinitionRegistry<typeof INVENTORY_EVENT_TYPES> = {
  // Product Events
  ProductCreated: defineEvent({
    eventType: "ProductCreated",
    description: "Emitted when a new product is added to the inventory catalog",
    sourceAggregate: "Product",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["CreateProduct"],
  }),
  StockAdded: defineEvent({
    eventType: "StockAdded",
    description: "Emitted when stock is replenished for a product",
    sourceAggregate: "Product",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["AddStock"],
  }),

  // Reservation Events
  StockReserved: defineEvent({
    eventType: "StockReserved",
    description: "Emitted when stock is successfully reserved for an order",
    sourceAggregate: "Reservation",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ReserveStock"],
    triggersProcesses: ["OrderFulfillmentSaga"],
  }),
  ReservationFailed: defineEvent({
    eventType: "ReservationFailed",
    description: "Emitted when stock reservation fails (insufficient stock)",
    sourceAggregate: "Reservation",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ReserveStock"],
    triggersProcesses: ["OrderFulfillmentSaga"],
  }),
  ReservationConfirmed: defineEvent({
    eventType: "ReservationConfirmed",
    description: "Emitted when a reservation is confirmed (order confirmed)",
    sourceAggregate: "Reservation",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ConfirmReservation"],
  }),
  ReservationReleased: defineEvent({
    eventType: "ReservationReleased",
    description: "Emitted when reserved stock is released back to available",
    sourceAggregate: "Reservation",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ReleaseReservation"],
  }),
  ReservationExpired: defineEvent({
    eventType: "ReservationExpired",
    description: "Emitted when a pending reservation exceeds its TTL",
    sourceAggregate: "Reservation",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ExpireReservation"],
    triggersProcesses: ["OrderFulfillmentSaga"],
  }),
};

// ============================================================================
// CMS FACTORIES AND UPCASTERS
// ============================================================================

/**
 * Factory type for creating initial InventoryCMS state (Product aggregate).
 */
export type InventoryCMSFactory = CMSFactory<
  { productId: string; productName: string; sku: string; unitPrice: number },
  InventoryCMS
>;

/**
 * Factory type for creating initial ReservationCMS state.
 */
export type ReservationCMSFactory = CMSFactory<
  { reservationId: string; orderId: string; items: ReservationItem[]; ttlMs?: number },
  ReservationCMS
>;

/**
 * Factory function for creating new inventory records.
 */
export const inventoryCMSFactory: InventoryCMSFactory = ({
  productId,
  productName,
  sku,
  unitPrice,
}) => createInitialInventoryCMS(productId, productName, sku, unitPrice);

/**
 * Factory function for creating new reservation records.
 */
export const reservationCMSFactory: ReservationCMSFactory = ({
  reservationId,
  orderId,
  items,
  ttlMs,
}) => createInitialReservationCMS(reservationId, orderId, items, ttlMs);

/**
 * Upcaster contract for InventoryCMS lazy migration.
 *
 * Version history:
 * - v1: Initial (productId, productName, sku, stock levels)
 * - v2: Added unitPrice field (default: $49.99 for pre-v2 products)
 */
export const inventoryCMSUpcaster: CMSUpcasterContract<InventoryCMS> = defineUpcaster({
  cmsType: "InventoryCMS",
  currentVersion: CURRENT_INVENTORY_CMS_VERSION,
  minSupportedVersion: 1,
  upcast: upcastInventoryCMS,
  description: "Upcasts InventoryCMS from v1 to v2 (adds unitPrice field)",
});

/**
 * Upcaster contract for ReservationCMS lazy migration.
 */
export const reservationCMSUpcaster: CMSUpcasterContract<ReservationCMS> = defineUpcaster({
  cmsType: "ReservationCMS",
  currentVersion: CURRENT_RESERVATION_CMS_VERSION,
  minSupportedVersion: 1,
  upcast: upcastReservationCMS,
  description: "Upcasts ReservationCMS from older versions to current schema",
});
