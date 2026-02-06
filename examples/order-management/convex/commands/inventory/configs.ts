/**
 * @libar-docs
 * @libar-docs-pattern InventoryCommandConfigs
 * @libar-docs-status completed
 * @libar-docs-command
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context inventory
 * @libar-docs-arch-layer application
 * @libar-docs-uses ActiveReservationsProjection, ProductCatalogProjection, OrderWithInventoryProjection
 * @libar-docs-used-by OrderManagementInfrastructure
 *
 * Command configs for 7 inventory commands. Wires each command to
 * primary/secondary projections including cross-context orderWithInventory.
 */
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { CommandConfig, CommandHandlerResult } from "@libar-dev/platform-core";
import { components } from "../../_generated/api";
import type {
  CreateProductData,
  AddStockData,
  ReserveStockData,
  ConfirmReservationData,
  ReleaseReservationData,
  ExpireReservationData,
} from "../../contexts/inventory/handlers/commands";

// =============================================================================
// Projection Handler References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing paths like `internal.projections.*`.
//
// The string path is resolved at runtime by Convex - same behavior as the
// generated api.js which also uses this approach internally.
// =============================================================================

// Simplified handler type for projections
type ProjectionHandler = FunctionReference<"mutation", FunctionVisibility>;

// Product Catalog projection handlers
const productCatalogOnCreated = makeFunctionReference<"mutation">(
  "projections/inventory/productCatalog:onProductCreated"
) as ProjectionHandler;
const productCatalogOnStockAdded = makeFunctionReference<"mutation">(
  "projections/inventory/productCatalog:onStockAdded"
) as ProjectionHandler;

// Active Reservations projection handlers
const activeReservationsOnReserved = makeFunctionReference<"mutation">(
  "projections/inventory/activeReservations:onStockReserved"
) as ProjectionHandler;
const activeReservationsOnConfirmed = makeFunctionReference<"mutation">(
  "projections/inventory/activeReservations:onReservationConfirmed"
) as ProjectionHandler;
const activeReservationsOnReleased = makeFunctionReference<"mutation">(
  "projections/inventory/activeReservations:onReservationReleased"
) as ProjectionHandler;
const activeReservationsOnExpired = makeFunctionReference<"mutation">(
  "projections/inventory/activeReservations:onReservationExpired"
) as ProjectionHandler;

// Cross-context projection handlers
const orderWithInventoryOnReserved = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onStockReserved"
) as ProjectionHandler;
const orderWithInventoryOnFailed = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onReservationFailed"
) as ProjectionHandler;
const orderWithInventoryOnConfirmed = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onReservationConfirmed"
) as ProjectionHandler;
const orderWithInventoryOnReleased = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onReservationReleased"
) as ProjectionHandler;
const orderWithInventoryOnExpired = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onReservationExpired"
) as ProjectionHandler;

// Dead letter handler
const deadLetterOnComplete = makeFunctionReference<"mutation">(
  "projections/deadLetters:onProjectionComplete"
) as ProjectionHandler;

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Create Product command arguments.
 */
export interface CreateProductArgs {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
}

/**
 * Add Stock command arguments.
 *
 * Note: `reason` uses `| undefined` for compatibility with Zod's `.optional()`
 * and TypeScript's `exactOptionalPropertyTypes` setting.
 */
export interface AddStockArgs {
  productId: string;
  quantity: number;
  reason?: string | undefined;
}

/**
 * Reserve Stock command arguments.
 */
export interface ReserveStockArgs {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

/**
 * Confirm Reservation command arguments.
 */
export interface ConfirmReservationArgs {
  reservationId: string;
}

/**
 * Release Reservation command arguments.
 */
export interface ReleaseReservationArgs {
  reservationId: string;
  reason: string;
}

/**
 * Expire Reservation command arguments.
 */
export interface ExpireReservationArgs {
  reservationId: string;
}

// ============================================
// COMMAND CONFIGURATIONS
// ============================================

/**
 * CreateProduct command configuration.
 */
export const createProductConfig: CommandConfig<
  CreateProductArgs,
  {
    commandId: string;
    correlationId: string;
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
  },
  CommandHandlerResult<CreateProductData>,
  {
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
    eventId: string;
    globalPosition: number;
  },
  CreateProductData
> = {
  commandType: "CreateProduct",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleCreateProduct,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    productId: args.productId,
    productName: args.productName,
    sku: args.sku,
    unitPrice: args.unitPrice,
  }),
  projection: {
    handler: productCatalogOnCreated,
    onComplete: deadLetterOnComplete,
    projectionName: "productCatalog",
    toProjectionArgs: (args, result, globalPosition) => ({
      productId: args.productId,
      productName: args.productName,
      sku: args.sku,
      unitPrice: args.unitPrice,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "productId", value: args.productId }),
  },
};

/**
 * AddStock command configuration.
 */
export const addStockConfig: CommandConfig<
  AddStockArgs,
  {
    commandId: string;
    correlationId: string;
    productId: string;
    quantity: number;
    reason?: string;
  },
  CommandHandlerResult<AddStockData>,
  {
    productId: string;
    newAvailableQuantity: number;
    eventId: string;
    globalPosition: number;
  },
  AddStockData
> = {
  commandType: "AddStock",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleAddStock,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    productId: args.productId,
    quantity: args.quantity,
    ...(args.reason !== undefined && { reason: args.reason }),
  }),
  projection: {
    handler: productCatalogOnStockAdded,
    onComplete: deadLetterOnComplete,
    projectionName: "productCatalog",
    toProjectionArgs: (args, result, globalPosition) => ({
      productId: args.productId,
      newAvailableQuantity: result.data.newAvailableQuantity,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "productId", value: args.productId }),
  },
};

/**
 * ReserveStock command configuration.
 *
 * Note: This command can return { status: "failed" } for insufficient stock,
 * which the extended CommandOrchestrator handles by emitting the ReservationFailed event.
 *
 * Partition key uses orderId (not reservationId) because:
 * 1. reservationId is generated by the handler, not available in args
 * 2. orderId provides logical ordering for reservation attempts per order
 */
export const reserveStockConfig: CommandConfig<
  ReserveStockArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  },
  CommandHandlerResult<ReserveStockData>,
  {
    reservationId: string;
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
    expiresAt: number;
    eventId: string;
    globalPosition: number;
  },
  ReserveStockData
> = {
  commandType: "ReserveStock",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleReserveStock,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
    items: args.items,
  }),
  projection: {
    handler: activeReservationsOnReserved,
    onComplete: deadLetterOnComplete,
    projectionName: "activeReservations",
    toProjectionArgs: (args, result, globalPosition) => ({
      reservationId: result.data.reservationId,
      orderId: args.orderId,
      items: args.items,
      expiresAt: result.data.expiresAt,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({
      name: "orderId",
      value: args.orderId,
    }),
  },
  // Cross-context projection for success
  secondaryProjections: [
    {
      handler: orderWithInventoryOnReserved,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        reservationId: result.data.reservationId,
        orderId: args.orderId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
  // Projection for failed reservations (insufficient stock)
  failedProjection: {
    handler: orderWithInventoryOnFailed,
    onComplete: deadLetterOnComplete,
    projectionName: "orderWithInventory",
    toProjectionArgs: (args, failedResult, globalPosition) => ({
      orderId: args.orderId,
      reason: failedResult.reason,
      eventId: failedResult.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
};

/**
 * ConfirmReservation command configuration.
 */
export const confirmReservationConfig: CommandConfig<
  ConfirmReservationArgs,
  {
    commandId: string;
    correlationId: string;
    reservationId: string;
  },
  CommandHandlerResult<ConfirmReservationData>,
  {
    reservationId: string;
    orderId: string;
    eventId: string;
    globalPosition: number;
  },
  ConfirmReservationData
> = {
  commandType: "ConfirmReservation",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleConfirmReservation,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    reservationId: args.reservationId,
  }),
  projection: {
    handler: activeReservationsOnConfirmed,
    onComplete: deadLetterOnComplete,
    projectionName: "activeReservations",
    toProjectionArgs: (args, result, globalPosition) => ({
      reservationId: args.reservationId,
      orderId: result.data.orderId,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "reservationId", value: args.reservationId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnConfirmed,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        reservationId: args.reservationId,
        orderId: result.data.orderId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({
        name: "reservationId",
        value: args.reservationId,
      }),
    },
  ],
};

/**
 * ReleaseReservation command configuration.
 *
 * Note: Projection args include items from the enriched event for proper ES pattern.
 * The event.payload["items"] cast remains because EventData.payload is Record<string, unknown>.
 * TODO: Consider making EventData generic for fully typed event payloads.
 */
export const releaseReservationConfig: CommandConfig<
  ReleaseReservationArgs,
  {
    commandId: string;
    correlationId: string;
    reservationId: string;
    reason: string;
  },
  CommandHandlerResult<ReleaseReservationData>,
  {
    reservationId: string;
    orderId: string;
    reason: string;
    items: Array<{ productId: string; quantity: number }>;
    eventId: string;
    globalPosition: number;
  },
  ReleaseReservationData
> = {
  commandType: "ReleaseReservation",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleReleaseReservation,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    reservationId: args.reservationId,
    reason: args.reason,
  }),
  projection: {
    handler: activeReservationsOnReleased,
    onComplete: deadLetterOnComplete,
    projectionName: "activeReservations",
    toProjectionArgs: (args, result, globalPosition) => ({
      reservationId: args.reservationId,
      orderId: result.data.orderId,
      reason: args.reason,
      // Event payload access remains typed as Record<string, unknown> - see TODO above
      items: result.event.payload["items"] as Array<{ productId: string; quantity: number }>,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "reservationId", value: args.reservationId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnReleased,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        reservationId: args.reservationId,
        orderId: result.data.orderId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({
        name: "reservationId",
        value: args.reservationId,
      }),
    },
  ],
};

// ============================================
// DCB COMMAND CONFIGURATIONS (Phase 16 Demo)
// ============================================

/**
 * Reserve Stock DCB command arguments.
 *
 * Uses Dynamic Consistency Boundaries for atomic multi-product reservation.
 * Requires tenantId for scope key creation.
 */
export interface ReserveStockDCBArgs {
  tenantId: string;
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

/**
 * ReserveStockDCB command configuration.
 *
 * Demonstrates the DCB pattern from Phase 16 - atomic multi-product reservation
 * with cross-entity invariant validation via `executeWithDCB`.
 *
 * Key differences from `reserveStockConfig`:
 * - Uses `handleReserveStockDCB` which calls `executeWithDCB` internally
 * - Requires `tenantId` for scope key creation
 * - Atomic all-or-nothing semantics (vs hybrid pattern's partial failure risk)
 *
 * Uses the same projections as `reserveStock` since the events are the same.
 *
 * @since Phase 23 (Example App Modernization - Rule 1)
 */
export const reserveStockDCBConfig: CommandConfig<
  ReserveStockDCBArgs,
  {
    commandId: string;
    correlationId: string;
    tenantId: string;
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  },
  CommandHandlerResult<ReserveStockData & { reservationId: string }>,
  {
    reservationId: string;
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
    expiresAt: number;
    eventId: string;
    globalPosition: number;
  },
  ReserveStockData & { reservationId: string }
> = {
  commandType: "ReserveStockDCB",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleReserveStockDCB,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    tenantId: args.tenantId,
    orderId: args.orderId,
    items: args.items,
  }),
  projection: {
    handler: activeReservationsOnReserved,
    onComplete: deadLetterOnComplete,
    projectionName: "activeReservations",
    toProjectionArgs: (args, result, globalPosition) => ({
      reservationId: result.data.reservationId,
      orderId: args.orderId,
      items: args.items,
      expiresAt: result.data.expiresAt,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({
      name: "orderId",
      value: args.orderId,
    }),
  },
  // Cross-context projection for success
  secondaryProjections: [
    {
      handler: orderWithInventoryOnReserved,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        reservationId: result.data.reservationId,
        orderId: args.orderId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
  // Projection for failed reservations (insufficient stock)
  failedProjection: {
    handler: orderWithInventoryOnFailed,
    onComplete: deadLetterOnComplete,
    projectionName: "orderWithInventory",
    toProjectionArgs: (args, failedResult, globalPosition) => ({
      orderId: args.orderId,
      reason: failedResult.reason,
      eventId: failedResult.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
};

// ============================================
// CRON/INTERNAL COMMAND CONFIGURATIONS
// ============================================

/**
 * ExpireReservation command configuration.
 *
 * Used by the app-level cron to expire reservations that have passed their TTL.
 * Follows the Command pattern for proper dual-write and projection triggering.
 *
 * Note: This uses CommandOrchestrator as a pragmatic solution. The ideal abstraction
 * would be a dedicated Process Manager pattern (see ROADMAP Phase 9).
 */
export const expireReservationConfig: CommandConfig<
  ExpireReservationArgs,
  {
    commandId: string;
    correlationId: string;
    reservationId: string;
  },
  CommandHandlerResult<ExpireReservationData>,
  {
    reservationId: string;
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
    eventId: string;
    globalPosition: number;
  },
  ExpireReservationData
> = {
  commandType: "ExpireReservation",
  boundedContext: "inventory",
  handler: components.inventory.handlers.commands.handleExpireReservation,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    reservationId: args.reservationId,
  }),
  projection: {
    handler: activeReservationsOnExpired,
    onComplete: deadLetterOnComplete,
    projectionName: "activeReservations",
    toProjectionArgs: (args, result, globalPosition) => ({
      reservationId: args.reservationId,
      orderId: result.data.orderId,
      // Event payload access - items are enriched in the event for ES pattern
      items: result.event.payload["items"] as Array<{
        productId: string;
        quantity: number;
      }>,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({
      name: "reservationId",
      value: args.reservationId,
    }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnExpired,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        reservationId: args.reservationId,
        orderId: result.data.orderId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({
        name: "reservationId",
        value: args.reservationId,
      }),
    },
  ],
};
