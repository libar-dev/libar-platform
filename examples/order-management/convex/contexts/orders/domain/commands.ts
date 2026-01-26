/**
 * Order domain commands.
 */
import { z } from "zod";
import { createCommandSchema } from "@libar-dev/platform-core";
import { OrderItemSchema } from "./events.js";

/**
 * CreateOrder command - creates a new order.
 */
export const CreateOrderPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
});

export const CreateOrderSchema = createCommandSchema("CreateOrder", CreateOrderPayloadSchema);

export type CreateOrderCommand = z.infer<typeof CreateOrderSchema>;

/**
 * AddOrderItem command - adds an item to an order.
 */
export const AddOrderItemPayloadSchema = z.object({
  orderId: z.string(),
  item: OrderItemSchema,
});

export const AddOrderItemSchema = createCommandSchema("AddOrderItem", AddOrderItemPayloadSchema);

export type AddOrderItemCommand = z.infer<typeof AddOrderItemSchema>;

/**
 * RemoveOrderItem command - removes an item from an order.
 */
export const RemoveOrderItemPayloadSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
});

export const RemoveOrderItemSchema = createCommandSchema(
  "RemoveOrderItem",
  RemoveOrderItemPayloadSchema
);

export type RemoveOrderItemCommand = z.infer<typeof RemoveOrderItemSchema>;

/**
 * SubmitOrder command - submits an order for processing.
 */
export const SubmitOrderPayloadSchema = z.object({
  orderId: z.string(),
});

export const SubmitOrderSchema = createCommandSchema("SubmitOrder", SubmitOrderPayloadSchema);

export type SubmitOrderCommand = z.infer<typeof SubmitOrderSchema>;

/**
 * ConfirmOrder command - confirms an order.
 */
export const ConfirmOrderPayloadSchema = z.object({
  orderId: z.string(),
});

export const ConfirmOrderSchema = createCommandSchema("ConfirmOrder", ConfirmOrderPayloadSchema);

export type ConfirmOrderCommand = z.infer<typeof ConfirmOrderSchema>;

/**
 * CancelOrder command - cancels an order.
 */
export const CancelOrderPayloadSchema = z.object({
  orderId: z.string(),
  reason: z.string(),
});

export const CancelOrderSchema = createCommandSchema("CancelOrder", CancelOrderPayloadSchema);

export type CancelOrderCommand = z.infer<typeof CancelOrderSchema>;
