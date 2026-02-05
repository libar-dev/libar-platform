/**
 * Command configurations for the Orders bounded context.
 *
 * Each configuration defines how to execute a command using the
 * dual-write + projection pattern via CommandOrchestrator.
 */
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { CommandConfig, CommandHandlerResult } from "@libar-dev/platform-core";
import { components } from "../../_generated/api";
import type {
  CreateOrderData,
  AddOrderItemData,
  RemoveOrderItemData,
  SubmitOrderData,
  ConfirmOrderData,
  CancelOrderData,
} from "../../contexts/orders/handlers/commands";

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

// Order Summary projection handlers
const orderSummaryOnCreated = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderCreated"
) as ProjectionHandler;
const orderSummaryOnItemAdded = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderItemAdded"
) as ProjectionHandler;
const orderSummaryOnItemRemoved = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderItemRemoved"
) as ProjectionHandler;
const orderSummaryOnSubmitted = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderSubmitted"
) as ProjectionHandler;
const orderSummaryOnConfirmed = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderConfirmed"
) as ProjectionHandler;
const orderSummaryOnCancelled = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderCancelled"
) as ProjectionHandler;

// Order Items projection handlers
const orderItemsOnAdded = makeFunctionReference<"mutation">(
  "projections/orders/orderItems:onOrderItemAdded"
) as ProjectionHandler;
const orderItemsOnRemoved = makeFunctionReference<"mutation">(
  "projections/orders/orderItems:onOrderItemRemoved"
) as ProjectionHandler;

// Cross-context projection handlers
const orderWithInventoryOnCreated = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderCreated"
) as ProjectionHandler;
const orderWithInventoryOnItemAdded = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderItemAdded"
) as ProjectionHandler;
const orderWithInventoryOnItemRemoved = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderItemRemoved"
) as ProjectionHandler;
const orderWithInventoryOnSubmitted = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderSubmitted"
) as ProjectionHandler;
const orderWithInventoryOnConfirmed = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderConfirmed"
) as ProjectionHandler;
const orderWithInventoryOnCancelled = makeFunctionReference<"mutation">(
  "projections/crossContext/orderWithInventory:onOrderCancelled"
) as ProjectionHandler;

// Dead letter handler
const deadLetterOnComplete = makeFunctionReference<"mutation">(
  "projections/deadLetters:onProjectionComplete"
) as ProjectionHandler;

// Customer cancellations projection handler (for agent pattern detection)
const customerCancellationsOnCancelled = makeFunctionReference<"mutation">(
  "projections/customers/customerCancellations:onOrderCancelled"
) as ProjectionHandler;

// Saga router
const sagaRouter = makeFunctionReference<"mutation">(
  "sagas/router:routeEvent"
) as ProjectionHandler;

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Create Order command arguments.
 */
export interface CreateOrderArgs {
  orderId: string;
  customerId: string;
}

/**
 * Add Order Item command arguments.
 */
export interface AddOrderItemArgs {
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Remove Order Item command arguments.
 */
export interface RemoveOrderItemArgs {
  orderId: string;
  productId: string;
}

/**
 * Submit Order command arguments.
 */
export interface SubmitOrderArgs {
  orderId: string;
}

/**
 * Confirm Order command arguments.
 */
export interface ConfirmOrderArgs {
  orderId: string;
}

/**
 * Cancel Order command arguments.
 */
export interface CancelOrderArgs {
  orderId: string;
  reason: string;
}

// ============================================
// COMMAND CONFIGURATIONS
// ============================================

/**
 * CreateOrder command configuration.
 */
export const createOrderConfig: CommandConfig<
  CreateOrderArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
    customerId: string;
  },
  CommandHandlerResult<CreateOrderData>,
  {
    orderId: string;
    customerId: string;
    eventId: string;
    globalPosition: number;
  },
  CreateOrderData
> = {
  commandType: "CreateOrder",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleCreateOrder,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
    customerId: args.customerId,
  }),
  projection: {
    handler: orderSummaryOnCreated,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, result, globalPosition) => ({
      orderId: args.orderId,
      customerId: args.customerId,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnCreated,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        customerId: args.customerId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
};

/**
 * AddOrderItem command configuration.
 */
export const addOrderItemConfig: CommandConfig<
  AddOrderItemArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
    item: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
    };
  },
  CommandHandlerResult<AddOrderItemData>,
  {
    orderId: string;
    itemCount: number;
    totalAmount: number;
    eventId: string;
    globalPosition: number;
  },
  AddOrderItemData
> = {
  commandType: "AddOrderItem",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleAddOrderItem,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
    item: {
      productId: args.productId,
      productName: args.productName,
      quantity: args.quantity,
      unitPrice: args.unitPrice,
    },
  }),
  projection: {
    handler: orderSummaryOnItemAdded,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, result, globalPosition) => ({
      orderId: args.orderId,
      itemCount: result.data.itemCount,
      totalAmount: result.data.totalAmount,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnItemAdded,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        itemCount: result.data.itemCount,
        totalAmount: result.data.totalAmount,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
    // Order items projection for Order Detail page
    {
      handler: orderItemsOnAdded,
      onComplete: deadLetterOnComplete,
      projectionName: "orderItems",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        productId: args.productId,
        productName: args.productName,
        quantity: args.quantity,
        unitPrice: args.unitPrice,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
};

/**
 * RemoveOrderItem command configuration.
 */
export const removeOrderItemConfig: CommandConfig<
  RemoveOrderItemArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
    productId: string;
  },
  CommandHandlerResult<RemoveOrderItemData>,
  {
    orderId: string;
    itemCount: number;
    totalAmount: number;
    eventId: string;
    globalPosition: number;
  },
  RemoveOrderItemData
> = {
  commandType: "RemoveOrderItem",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleRemoveOrderItem,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
    productId: args.productId,
  }),
  projection: {
    handler: orderSummaryOnItemRemoved,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, result, globalPosition) => ({
      orderId: args.orderId,
      itemCount: result.data.itemCount,
      totalAmount: result.data.totalAmount,
      eventId: result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnItemRemoved,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        itemCount: result.data.itemCount,
        totalAmount: result.data.totalAmount,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
    // Order items projection for Order Detail page
    {
      handler: orderItemsOnRemoved,
      onComplete: deadLetterOnComplete,
      projectionName: "orderItems",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        productId: args.productId,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
};

/**
 * SubmitOrder command configuration.
 *
 * This command triggers the OrderFulfillment saga for cross-context coordination.
 */
export const submitOrderConfig: CommandConfig<
  SubmitOrderArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
  },
  CommandHandlerResult<SubmitOrderData>,
  {
    orderId: string;
    eventId: string;
    globalPosition: number;
  },
  SubmitOrderData
> = {
  commandType: "SubmitOrder",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleSubmitOrder,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
  }),
  projection: {
    handler: orderSummaryOnSubmitted,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, _result, globalPosition) => ({
      orderId: args.orderId,
      eventId: _result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnSubmitted,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, _result, globalPosition) => ({
        orderId: args.orderId,
        eventId: _result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
  // Saga routing for cross-context OrderFulfillment workflow
  sagaRoute: {
    router: sagaRouter,
    getEventType: (_args) => "OrderSubmitted",
  },
};

/**
 * ConfirmOrder command configuration.
 */
export const confirmOrderConfig: CommandConfig<
  ConfirmOrderArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
  },
  CommandHandlerResult<ConfirmOrderData>,
  {
    orderId: string;
    eventId: string;
    globalPosition: number;
  },
  ConfirmOrderData
> = {
  commandType: "ConfirmOrder",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleConfirmOrder,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
  }),
  projection: {
    handler: orderSummaryOnConfirmed,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, _result, globalPosition) => ({
      orderId: args.orderId,
      eventId: _result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnConfirmed,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, _result, globalPosition) => ({
        orderId: args.orderId,
        eventId: _result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
};

/**
 * CancelOrder command configuration.
 */
export const cancelOrderConfig: CommandConfig<
  CancelOrderArgs,
  {
    commandId: string;
    correlationId: string;
    orderId: string;
    reason: string;
  },
  CommandHandlerResult<CancelOrderData>,
  {
    orderId: string;
    eventId: string;
    globalPosition: number;
  },
  CancelOrderData
> = {
  commandType: "CancelOrder",
  boundedContext: "orders",
  handler: components.orders.handlers.commands.handleCancelOrder,
  toHandlerArgs: (args, commandId, correlationId) => ({
    commandId,
    correlationId,
    orderId: args.orderId,
    reason: args.reason,
  }),
  projection: {
    handler: orderSummaryOnCancelled,
    onComplete: deadLetterOnComplete,
    projectionName: "orderSummary",
    toProjectionArgs: (args, _result, globalPosition) => ({
      orderId: args.orderId,
      eventId: _result.event.eventId,
      globalPosition,
    }),
    getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
  },
  // Cross-context projection + customer cancellations for agent pattern detection
  secondaryProjections: [
    {
      handler: orderWithInventoryOnCancelled,
      onComplete: deadLetterOnComplete,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, _result, globalPosition) => ({
        orderId: args.orderId,
        eventId: _result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
    // Customer cancellations projection for O(1) agent pattern detection
    // Note: Workpool partitions by orderId (for ordering), but projection
    // internally checkpoints by customerId via withCheckpoint
    {
      handler: customerCancellationsOnCancelled,
      onComplete: deadLetterOnComplete,
      projectionName: "customerCancellations",
      toProjectionArgs: (args, result, globalPosition) => ({
        orderId: args.orderId,
        customerId: result.data.customerId,
        reason: args.reason,
        eventId: result.event.eventId,
        globalPosition,
      }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
    },
  ],
};
