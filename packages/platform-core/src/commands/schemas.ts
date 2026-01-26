import { z } from "zod";

/**
 * Base schema for command metadata.
 */
export const CommandMetadataSchema = z.object({
  commandId: z.string(),
  commandType: z.string(),
  correlationId: z.string(),
  userId: z.string().optional(),
  timestamp: z.number().int().positive(),
});

/**
 * Schema for a full command.
 */
export const CommandSchema = CommandMetadataSchema.extend({
  targetContext: z.string(),
  payload: z.unknown(),
});

/**
 * Return type for createCommandSchema.
 * Extends CommandMetadataSchema with typed commandType literal and payload.
 */
export type TypedCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof CommandMetadataSchema.shape & {
    commandType: z.ZodLiteral<TCommandType>;
    targetContext: z.ZodString;
    payload: TPayload;
  }
>;

/**
 * Factory function to create a typed command schema.
 *
 * Returns a Zod schema that extends CommandMetadataSchema with:
 * - A literal commandType for type safety
 * - A typed payload based on the provided schema
 * - A targetContext for bounded context routing
 *
 * @param commandType - The command type literal (e.g., "CreateOrder")
 * @param payloadSchema - Zod schema for the command payload
 * @returns A typed Zod schema for the command
 *
 * @example
 * ```typescript
 * const CreateOrderSchema = createCommandSchema(
 *   "CreateOrder",
 *   z.object({
 *     customerId: z.string(),
 *     items: z.array(OrderItemSchema),
 *   })
 * );
 *
 * // Type inference:
 * type CreateOrderCommand = z.infer<typeof CreateOrderSchema>;
 * // { commandId: string, commandType: "CreateOrder", payload: { customerId: string, items: OrderItem[] }, ... }
 * ```
 */
export function createCommandSchema<TCommandType extends string, TPayload extends z.ZodTypeAny>(
  commandType: TCommandType,
  payloadSchema: TPayload
): TypedCommandSchema<TCommandType, TPayload> {
  return CommandMetadataSchema.extend({
    commandType: z.literal(commandType),
    targetContext: z.string(),
    payload: payloadSchema,
  }) as TypedCommandSchema<TCommandType, TPayload>;
}

/**
 * Schema for successful command result.
 */
export const CommandSuccessResultSchema = z.object({
  status: z.literal("success"),
  data: z.unknown(),
  version: z.number(),
});

/**
 * Schema for rejected command result.
 */
export const CommandRejectedResultSchema = z.object({
  status: z.literal("rejected"),
  code: z.string(),
  reason: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for conflict result.
 */
export const CommandConflictResultSchema = z.object({
  status: z.literal("conflict"),
  code: z.literal("CONCURRENT_MODIFICATION"),
  currentVersion: z.number(),
});

/**
 * Schema for error result.
 */
export const CommandErrorResultSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
});

/**
 * Union schema for all command results.
 */
export const CommandResultSchema = z.discriminatedUnion("status", [
  CommandSuccessResultSchema,
  CommandRejectedResultSchema,
  CommandConflictResultSchema,
  CommandErrorResultSchema,
]);

/**
 * Schema for command status.
 */
export const CommandStatusSchema = z.enum(["pending", "executed", "rejected", "failed"]);

/**
 * Schema for stored command.
 */
export const StoredCommandSchema = CommandSchema.extend({
  status: CommandStatusSchema,
  result: CommandResultSchema.optional(),
  executedAt: z.number().optional(),
  ttl: z.number(),
});

/**
 * Type inference helpers.
 */
export type CommandMetadataSchemaType = z.infer<typeof CommandMetadataSchema>;
export type CommandSchemaType = z.infer<typeof CommandSchema>;
export type CommandResultSchemaType = z.infer<typeof CommandResultSchema>;
export type CommandStatusSchemaType = z.infer<typeof CommandStatusSchema>;
export type StoredCommandSchemaType = z.infer<typeof StoredCommandSchema>;
