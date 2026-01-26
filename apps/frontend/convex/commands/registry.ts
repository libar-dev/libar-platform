/**
 * Command Registry Integration
 *
 * Registers all Order commands with the CommandRegistry for:
 * - Command discovery and introspection
 * - Schema validation via structure middleware
 * - Categorization and documentation
 *
 * NOTE: This registry coexists with commandConfigs.ts by design:
 * - commandConfigs.ts: Source of truth for command execution logic
 * - commandRegistry.ts: Provides metadata, validation, and introspection
 *
 * Both patterns serve different purposes and are intended to be used together.
 */
import { z } from "zod";
import { globalRegistry } from "@libar-dev/platform-core";
import {
  createOrderConfig,
  addOrderItemConfig,
  removeOrderItemConfig,
  submitOrderConfig,
  confirmOrderConfig,
  cancelOrderConfig,
} from "./orders/configs";
import {
  createProductConfig,
  addStockConfig,
  reserveStockConfig,
  confirmReservationConfig,
  releaseReservationConfig,
  expireReservationConfig,
} from "./inventory/configs";

// ============================================
// COMMAND SCHEMAS (Zod Validation)
// ============================================

/**
 * CreateOrder command schema.
 */
export const CreateOrderSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
});

/**
 * AddOrderItem command schema.
 */
export const AddOrderItemSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

/**
 * RemoveOrderItem command schema.
 */
export const RemoveOrderItemSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
});

/**
 * SubmitOrder command schema.
 */
export const SubmitOrderSchema = z.object({
  orderId: z.string().min(1),
});

/**
 * ConfirmOrder command schema.
 */
export const ConfirmOrderSchema = z.object({
  orderId: z.string().min(1),
});

/**
 * CancelOrder command schema.
 */
export const CancelOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1),
});

// ============================================
// COMMAND REGISTRY
// ============================================

/**
 * Application command registry.
 *
 * Uses the global singleton registry from @libar-dev/platform-core.
 * This registry can be used for:
 * - Command introspection (list, lookup by type/context)
 * - Schema validation via middleware
 * - Documentation generation
 */
export const commandRegistry = globalRegistry;

/**
 * Register all Order commands with the registry.
 *
 * The config property provides the executable CommandConfig,
 * while metadata provides categorization and schema for validation.
 */
commandRegistry.register({
  config: createOrderConfig,
  metadata: {
    commandType: "CreateOrder",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Create a new order for a customer",
    schemaVersion: 1,
    tags: ["order", "create"],
  },
  argsSchema: CreateOrderSchema,
});

commandRegistry.register({
  config: addOrderItemConfig,
  metadata: {
    commandType: "AddOrderItem",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Add an item to an existing order",
    schemaVersion: 1,
    tags: ["order", "item", "add"],
  },
  argsSchema: AddOrderItemSchema,
});

commandRegistry.register({
  config: removeOrderItemConfig,
  metadata: {
    commandType: "RemoveOrderItem",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Remove an item from an existing order",
    schemaVersion: 1,
    tags: ["order", "item", "remove"],
  },
  argsSchema: RemoveOrderItemSchema,
});

commandRegistry.register({
  config: submitOrderConfig,
  metadata: {
    commandType: "SubmitOrder",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Submit an order for processing (triggers saga)",
    schemaVersion: 1,
    tags: ["order", "submit", "saga"],
  },
  argsSchema: SubmitOrderSchema,
});

commandRegistry.register({
  config: confirmOrderConfig,
  metadata: {
    commandType: "ConfirmOrder",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Confirm an order after inventory reserved",
    schemaVersion: 1,
    tags: ["order", "confirm"],
  },
  argsSchema: ConfirmOrderSchema,
});

commandRegistry.register({
  config: cancelOrderConfig,
  metadata: {
    commandType: "CancelOrder",
    boundedContext: "orders",
    category: "aggregate",
    targetAggregate: { type: "Order", idField: "orderId" },
    description: "Cancel an order with a reason",
    schemaVersion: 1,
    tags: ["order", "cancel"],
  },
  argsSchema: CancelOrderSchema,
});

// ============================================
// INVENTORY COMMAND SCHEMAS
// ============================================

/**
 * CreateProduct command schema.
 */
export const CreateProductSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  unitPrice: z.number().positive(),
});

/**
 * AddStock command schema.
 */
export const AddStockSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

/**
 * ReserveStock command schema.
 */
export const ReserveStockSchema = z.object({
  orderId: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ),
});

/**
 * ConfirmReservation command schema.
 */
export const ConfirmReservationSchema = z.object({
  reservationId: z.string().min(1),
});

/**
 * ReleaseReservation command schema.
 */
export const ReleaseReservationSchema = z.object({
  reservationId: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * ExpireReservation command schema.
 */
export const ExpireReservationSchema = z.object({
  reservationId: z.string().min(1),
});

// ============================================
// INVENTORY COMMAND REGISTRATIONS
// ============================================

commandRegistry.register({
  config: createProductConfig,
  metadata: {
    commandType: "CreateProduct",
    boundedContext: "inventory",
    category: "aggregate",
    targetAggregate: { type: "Inventory", idField: "productId" },
    description: "Create a new product in the catalog",
    schemaVersion: 1,
    tags: ["inventory", "product", "create"],
  },
  argsSchema: CreateProductSchema,
});

commandRegistry.register({
  config: addStockConfig,
  metadata: {
    commandType: "AddStock",
    boundedContext: "inventory",
    category: "aggregate",
    targetAggregate: { type: "Inventory", idField: "productId" },
    description: "Add stock to an existing product",
    schemaVersion: 1,
    tags: ["inventory", "stock", "add"],
  },
  argsSchema: AddStockSchema,
});

commandRegistry.register({
  config: reserveStockConfig,
  metadata: {
    commandType: "ReserveStock",
    boundedContext: "inventory",
    category: "aggregate",
    targetAggregate: { type: "Reservation", idField: "orderId" },
    description: "Reserve stock for an order (creates reservation)",
    schemaVersion: 1,
    tags: ["inventory", "reservation", "create"],
  },
  argsSchema: ReserveStockSchema,
});

commandRegistry.register({
  config: confirmReservationConfig,
  metadata: {
    commandType: "ConfirmReservation",
    boundedContext: "inventory",
    category: "aggregate",
    targetAggregate: { type: "Reservation", idField: "reservationId" },
    description: "Confirm a stock reservation (order confirmed)",
    schemaVersion: 1,
    tags: ["inventory", "reservation", "confirm"],
  },
  argsSchema: ConfirmReservationSchema,
});

commandRegistry.register({
  config: releaseReservationConfig,
  metadata: {
    commandType: "ReleaseReservation",
    boundedContext: "inventory",
    category: "aggregate",
    targetAggregate: { type: "Reservation", idField: "reservationId" },
    description: "Release a stock reservation (order cancelled)",
    schemaVersion: 1,
    tags: ["inventory", "reservation", "release"],
  },
  argsSchema: ReleaseReservationSchema,
});

commandRegistry.register({
  config: expireReservationConfig,
  metadata: {
    commandType: "ExpireReservation",
    boundedContext: "inventory",
    category: "system",
    targetAggregate: { type: "Reservation", idField: "reservationId" },
    description: "Expire a reservation that has passed its TTL",
    schemaVersion: 1,
    tags: ["inventory", "reservation", "expire", "system"],
  },
  argsSchema: ExpireReservationSchema,
});

// ============================================
// COMMAND LOOKUP HELPERS
// ============================================

/**
 * Get a command by type.
 */
export function getCommand(commandType: string) {
  return commandRegistry.get(commandType);
}

/**
 * Get all Order commands.
 */
export function getOrderCommands() {
  return commandRegistry.getByContext("orders");
}

/**
 * Get all Inventory commands.
 */
export function getInventoryCommands() {
  return commandRegistry.getByContext("inventory");
}

/**
 * List all registered command types.
 */
export function listCommandTypes(): string[] {
  return commandRegistry.list().map((info) => info.commandType);
}

/**
 * Validate command args against registered schema.
 */
export function validateCommandArgs(
  commandType: string,
  args: unknown
): { valid: true } | { valid: false; errors: z.ZodError } {
  const registration = commandRegistry.get(commandType);
  if (!registration || !registration.argsSchema) {
    return { valid: true }; // No schema = no validation
  }

  const result = registration.argsSchema.safeParse(args);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}
