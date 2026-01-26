/**
 * Orders Bounded Context Contract
 *
 * This contract formally defines the Orders bounded context:
 * - Identity and versioning
 * - Command types (write operations)
 * - Event types (domain events)
 * - CMS types (aggregate state)
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
import { ORDER_EVENT_TYPES } from "./domain/events.js";
import { OrderErrorCodes } from "./domain/invariants.js";
import type { OrderCMS } from "./domain/order.js";
import {
  CURRENT_ORDER_CMS_VERSION,
  createInitialOrderCMS,
  upcastOrderCMS,
} from "./domain/order.js";

/**
 * All order command types.
 */
export const ORDER_COMMAND_TYPES = [
  "CreateOrder",
  "AddOrderItem",
  "RemoveOrderItem",
  "SubmitOrder",
  "ConfirmOrder",
  "CancelOrder",
] as const;

export type OrderCommandType = (typeof ORDER_COMMAND_TYPES)[number];

/**
 * Orders Bounded Context Contract
 *
 * Defines the public contract for the Orders context following DDD principles.
 * This enables:
 * - Type-safe command/event discovery
 * - Bounded context documentation
 * - Contract versioning for evolution
 */
export const OrdersContextContract = {
  identity: {
    name: "orders",
    description: "Order management bounded context for e-commerce order lifecycle",
    version: 1,
    streamTypePrefix: "Order",
  },
  executionMode: "dual-write",
  commandTypes: ORDER_COMMAND_TYPES,
  eventTypes: ORDER_EVENT_TYPES,
  cmsTypes: {
    orderCMS: {
      tableName: "orderCMS",
      currentStateVersion: CURRENT_ORDER_CMS_VERSION,
      description: "Order aggregate state (draft, submitted, confirmed, cancelled)",
    },
  },
  errorCodes: Object.values(OrderErrorCodes),
} as const satisfies DualWriteContextContract<
  typeof ORDER_COMMAND_TYPES,
  typeof ORDER_EVENT_TYPES,
  { orderCMS: CMSTypeDefinition }
>;

/**
 * Type helpers for extracting types from the contract.
 */
export type OrdersCommand = ExtractCommandTypes<typeof OrdersContextContract>;
export type OrdersEvent = ExtractEventTypes<typeof OrdersContextContract>;

// ============================================================================
// COMMAND DEFINITIONS
// ============================================================================

/**
 * Formal command definitions with metadata for documentation and introspection.
 *
 * Each definition captures:
 * - Target aggregate and whether it creates new instances
 * - Events that may be produced
 * - Error codes that may be thrown
 */
export const OrderCommandDefinitions: CommandDefinitionRegistry<typeof ORDER_COMMAND_TYPES> = {
  CreateOrder: defineCommand({
    commandType: "CreateOrder",
    description: "Creates a new order in draft status for a customer",
    targetAggregate: "Order",
    createsAggregate: true,
    producesEvents: ["OrderCreated"],
    errorCodes: [OrderErrorCodes.ORDER_ALREADY_EXISTS],
  }),
  AddOrderItem: defineCommand({
    commandType: "AddOrderItem",
    description: "Adds a product item to a draft order",
    targetAggregate: "Order",
    createsAggregate: false,
    producesEvents: ["OrderItemAdded"],
    errorCodes: [
      OrderErrorCodes.ORDER_NOT_FOUND,
      OrderErrorCodes.ORDER_NOT_IN_DRAFT,
      OrderErrorCodes.MAX_ITEMS_EXCEEDED,
      OrderErrorCodes.INVALID_QUANTITY,
      OrderErrorCodes.INVALID_PRICE,
      OrderErrorCodes.INVALID_ITEM_DATA,
    ],
  }),
  RemoveOrderItem: defineCommand({
    commandType: "RemoveOrderItem",
    description: "Removes a product item from a draft order",
    targetAggregate: "Order",
    createsAggregate: false,
    producesEvents: ["OrderItemRemoved"],
    errorCodes: [
      OrderErrorCodes.ORDER_NOT_FOUND,
      OrderErrorCodes.ORDER_NOT_IN_DRAFT,
      OrderErrorCodes.ITEM_NOT_FOUND,
    ],
  }),
  SubmitOrder: defineCommand({
    commandType: "SubmitOrder",
    description: "Submits a draft order for processing (triggers inventory reservation)",
    targetAggregate: "Order",
    createsAggregate: false,
    producesEvents: ["OrderSubmitted"],
    errorCodes: [
      OrderErrorCodes.ORDER_NOT_FOUND,
      OrderErrorCodes.ORDER_NOT_IN_DRAFT,
      OrderErrorCodes.ORDER_HAS_NO_ITEMS,
    ],
  }),
  ConfirmOrder: defineCommand({
    commandType: "ConfirmOrder",
    description: "Confirms a submitted order after successful inventory reservation",
    targetAggregate: "Order",
    createsAggregate: false,
    producesEvents: ["OrderConfirmed"],
    errorCodes: [OrderErrorCodes.ORDER_NOT_FOUND, OrderErrorCodes.ORDER_NOT_SUBMITTED],
  }),
  CancelOrder: defineCommand({
    commandType: "CancelOrder",
    description: "Cancels an order (can cancel draft or submitted orders)",
    targetAggregate: "Order",
    createsAggregate: false,
    producesEvents: ["OrderCancelled"],
    errorCodes: [
      OrderErrorCodes.ORDER_NOT_FOUND,
      OrderErrorCodes.ORDER_ALREADY_CANCELLED,
      OrderErrorCodes.ORDER_ALREADY_CONFIRMED,
    ],
  }),
};

// ============================================================================
// EVENT DEFINITIONS
// ============================================================================

/**
 * Formal event definitions with metadata for documentation and introspection.
 *
 * Each definition captures:
 * - Source aggregate and event category
 * - Schema version for evolution
 * - Commands that produce this event
 * - Downstream processes triggered
 */
export const OrderEventDefinitions: EventDefinitionRegistry<typeof ORDER_EVENT_TYPES> = {
  OrderCreated: defineEvent({
    eventType: "OrderCreated",
    description: "Emitted when a new order is created in draft status",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["CreateOrder"],
  }),
  OrderItemAdded: defineEvent({
    eventType: "OrderItemAdded",
    description: "Emitted when a product item is added to an order",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["AddOrderItem"],
  }),
  OrderItemRemoved: defineEvent({
    eventType: "OrderItemRemoved",
    description: "Emitted when a product item is removed from an order",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["RemoveOrderItem"],
  }),
  OrderSubmitted: defineEvent({
    eventType: "OrderSubmitted",
    description: "Emitted when an order is submitted for processing",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["SubmitOrder"],
    triggersProcesses: ["OrderFulfillmentSaga"],
  }),
  OrderConfirmed: defineEvent({
    eventType: "OrderConfirmed",
    description: "Emitted when an order is confirmed after successful reservation",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["ConfirmOrder"],
  }),
  OrderCancelled: defineEvent({
    eventType: "OrderCancelled",
    description: "Emitted when an order is cancelled",
    sourceAggregate: "Order",
    category: "domain",
    schemaVersion: 1,
    producedBy: ["CancelOrder"],
    triggersProcesses: ["OrderFulfillmentSaga"],
  }),
};

// ============================================================================
// CMS FACTORY AND UPCASTER
// ============================================================================

/**
 * Factory type for creating initial OrderCMS state.
 *
 * Used by CreateOrder command to initialize new order aggregates.
 */
export type OrderCMSFactory = CMSFactory<{ orderId: string; customerId: string }, OrderCMS>;

/**
 * The actual factory function (wraps domain function with object args).
 */
export const orderCMSFactory: OrderCMSFactory = ({ orderId, customerId }) =>
  createInitialOrderCMS(orderId, customerId);

/**
 * Upcaster contract for OrderCMS lazy migration.
 *
 * Handles schema evolution by migrating older CMS versions to current version
 * on-read. This enables zero-downtime migrations without backfilling.
 */
export const orderCMSUpcaster: CMSUpcasterContract<OrderCMS> = defineUpcaster({
  cmsType: "OrderCMS",
  currentVersion: CURRENT_ORDER_CMS_VERSION,
  minSupportedVersion: 1,
  upcast: upcastOrderCMS,
  description: "Upcasts OrderCMS from older versions to current schema",
});
