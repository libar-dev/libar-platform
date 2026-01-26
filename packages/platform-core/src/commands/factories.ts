/**
 * Command Category Schema Factories
 *
 * Category-specific factory functions for creating typed command schemas.
 * Aligned with event schema factory patterns for consistency.
 *
 * | Factory                       | Category  | Use Case                           |
 * |-------------------------------|-----------|------------------------------------|
 * | createAggregateCommandSchema  | aggregate | Single entity state mutations      |
 * | createProcessCommandSchema    | process   | Saga/workflow commands             |
 * | createSystemCommandSchema     | system    | Admin/maintenance operations       |
 */
import { z } from "zod";
import { CommandMetadataSchema } from "./schemas.js";
import { CommandCategorySchema } from "./categories.js";
import type { CommandCategory, AggregateTarget } from "./categories.js";

/**
 * Symbol for attaching command category metadata to schema objects.
 * This avoids using Zod's internal `_def` API which is not stable.
 */
const COMMAND_CATEGORY_KEY = Symbol.for("convex-es:commandCategory");

/**
 * Enhanced command metadata with category and optional aggregate target.
 */
export const EnhancedCommandMetadataSchema = CommandMetadataSchema.extend({
  category: CommandCategorySchema.default("aggregate"),
  targetContext: z.string(),
});

/**
 * Return type for createAggregateCommandSchema.
 */
export type TypedAggregateCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof EnhancedCommandMetadataSchema.shape & {
    commandType: z.ZodLiteral<TCommandType>;
    category: z.ZodDefault<z.ZodLiteral<"aggregate">>;
    payload: TPayload;
    aggregateTarget: z.ZodOptional<
      z.ZodObject<{
        type: z.ZodString;
        idField: z.ZodString;
      }>
    >;
  }
>;

/**
 * Configuration for aggregate command schema creation.
 */
export interface AggregateCommandSchemaConfig<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> {
  /** Command type name (e.g., "CreateOrder") */
  commandType: TCommandType;
  /** Zod schema for the command payload */
  payloadSchema: TPayload;
  /** Optional aggregate target metadata */
  aggregateTarget?: AggregateTarget;
}

/**
 * Factory for aggregate commands (single entity state mutations).
 *
 * Aggregate commands target a specific aggregate root and are subject to
 * optimistic concurrency control. They typically result in domain events.
 *
 * @param config - Configuration with commandType, payloadSchema, and optional aggregateTarget
 * @returns A typed Zod schema for the aggregate command
 *
 * @example
 * ```typescript
 * const CreateOrderSchema = createAggregateCommandSchema({
 *   commandType: "CreateOrder",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *   }),
 *   aggregateTarget: {
 *     type: "Order",
 *     idField: "orderId",
 *   },
 * });
 *
 * // Type inference:
 * type CreateOrderCommand = z.infer<typeof CreateOrderSchema>;
 * ```
 */
export function createAggregateCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
>(
  config: AggregateCommandSchemaConfig<TCommandType, TPayload>
): TypedAggregateCommandSchema<TCommandType, TPayload> {
  const { commandType, payloadSchema, aggregateTarget } = config;

  // Build aggregateTarget schema - use default only if provided
  const aggregateTargetSchema = z
    .object({
      type: z.string(),
      idField: z.string(),
    })
    .optional();

  const aggregateTargetWithDefault = aggregateTarget
    ? aggregateTargetSchema.default(aggregateTarget)
    : aggregateTargetSchema;

  const schema = EnhancedCommandMetadataSchema.extend({
    commandType: z.literal(commandType),
    category: z.literal("aggregate").default("aggregate"),
    payload: payloadSchema,
    aggregateTarget: aggregateTargetWithDefault,
  }) as TypedAggregateCommandSchema<TCommandType, TPayload>;

  // Attach category metadata to avoid using Zod internal APIs
  (schema as unknown as Record<symbol, CommandCategory>)[COMMAND_CATEGORY_KEY] = "aggregate";

  return schema;
}

/**
 * Return type for createProcessCommandSchema.
 */
export type TypedProcessCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof EnhancedCommandMetadataSchema.shape & {
    commandType: z.ZodLiteral<TCommandType>;
    category: z.ZodDefault<z.ZodLiteral<"process">>;
    payload: TPayload;
    processType: z.ZodOptional<z.ZodString>;
  }
>;

/**
 * Configuration for process command schema creation.
 */
export interface ProcessCommandSchemaConfig<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> {
  /** Command type name (e.g., "StartOrderFulfillment") */
  commandType: TCommandType;
  /** Zod schema for the command payload */
  payloadSchema: TPayload;
  /** Optional process/saga type name */
  processType?: string;
}

/**
 * Factory for process commands (saga/workflow operations).
 *
 * Process commands coordinate work across multiple aggregates or bounded contexts.
 * They typically trigger compensation on failure and may span multiple transactions.
 *
 * @param config - Configuration with commandType, payloadSchema, and optional processType
 * @returns A typed Zod schema for the process command
 *
 * @example
 * ```typescript
 * const StartOrderFulfillmentSchema = createProcessCommandSchema({
 *   commandType: "StartOrderFulfillment",
 *   payloadSchema: z.object({
 *     orderId: z.string(),
 *     warehouseId: z.string(),
 *   }),
 *   processType: "OrderFulfillmentSaga",
 * });
 * ```
 */
export function createProcessCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
>(
  config: ProcessCommandSchemaConfig<TCommandType, TPayload>
): TypedProcessCommandSchema<TCommandType, TPayload> {
  const { commandType, payloadSchema, processType } = config;

  // Build processType schema - use default only if provided
  const processTypeSchema = processType
    ? z.string().optional().default(processType)
    : z.string().optional();

  const schema = EnhancedCommandMetadataSchema.extend({
    commandType: z.literal(commandType),
    category: z.literal("process").default("process"),
    payload: payloadSchema,
    processType: processTypeSchema,
  }) as TypedProcessCommandSchema<TCommandType, TPayload>;

  // Attach category metadata to avoid using Zod internal APIs
  (schema as unknown as Record<symbol, CommandCategory>)[COMMAND_CATEGORY_KEY] = "process";

  return schema;
}

/**
 * Return type for createSystemCommandSchema.
 */
export type TypedSystemCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof EnhancedCommandMetadataSchema.shape & {
    commandType: z.ZodLiteral<TCommandType>;
    category: z.ZodDefault<z.ZodLiteral<"system">>;
    payload: TPayload;
    requiresIdempotency: z.ZodDefault<z.ZodBoolean>;
  }
>;

/**
 * Configuration for system command schema creation.
 */
export interface SystemCommandSchemaConfig<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
> {
  /** Command type name (e.g., "CleanupExpiredCommands") */
  commandType: TCommandType;
  /** Zod schema for the command payload */
  payloadSchema: TPayload;
  /** Whether this command requires idempotency (defaults to false) */
  requiresIdempotency?: boolean;
}

/**
 * Factory for system commands (admin/infrastructure operations).
 *
 * System commands handle administrative tasks like cleanup, migration,
 * or health checks. They may not require idempotency or event emission
 * depending on their nature.
 *
 * @param config - Configuration with commandType, payloadSchema, and optional requiresIdempotency
 * @returns A typed Zod schema for the system command
 *
 * @example
 * ```typescript
 * const CleanupExpiredCommandsSchema = createSystemCommandSchema({
 *   commandType: "CleanupExpiredCommands",
 *   payloadSchema: z.object({
 *     olderThanDays: z.number().int().positive(),
 *     dryRun: z.boolean().default(false),
 *   }),
 *   requiresIdempotency: false,
 * });
 * ```
 */
export function createSystemCommandSchema<
  TCommandType extends string,
  TPayload extends z.ZodTypeAny,
>(
  config: SystemCommandSchemaConfig<TCommandType, TPayload>
): TypedSystemCommandSchema<TCommandType, TPayload> {
  const { commandType, payloadSchema, requiresIdempotency = false } = config;

  const schema = EnhancedCommandMetadataSchema.extend({
    commandType: z.literal(commandType),
    category: z.literal("system").default("system"),
    payload: payloadSchema,
    requiresIdempotency: z.boolean().default(requiresIdempotency),
  }) as TypedSystemCommandSchema<TCommandType, TPayload>;

  // Attach category metadata to avoid using Zod internal APIs
  (schema as unknown as Record<symbol, CommandCategory>)[COMMAND_CATEGORY_KEY] = "system";

  return schema;
}

/**
 * Return type for createBatchCommandSchema.
 */
export type TypedBatchCommandSchema<
  TCommandType extends string,
  TItemPayload extends z.ZodTypeAny,
> = z.ZodObject<
  typeof EnhancedCommandMetadataSchema.shape & {
    commandType: z.ZodLiteral<TCommandType>;
    category: z.ZodDefault<z.ZodLiteral<"batch">>;
    payload: z.ZodObject<{
      items: z.ZodArray<TItemPayload>;
    }>;
    batchConfig: z.ZodOptional<
      z.ZodObject<{
        maxItems: z.ZodOptional<z.ZodNumber>;
        continueOnError: z.ZodDefault<z.ZodBoolean>;
      }>
    >;
  }
>;

/**
 * Configuration for batch command schema creation.
 */
export interface BatchCommandSchemaConfig<
  TCommandType extends string,
  TItemPayload extends z.ZodTypeAny,
> {
  /** Command type name (e.g., "BulkCreateOrders") */
  commandType: TCommandType;
  /** Zod schema for each item in the batch */
  itemPayloadSchema: TItemPayload;
  /** Optional batch configuration */
  batchConfig?: {
    /** Maximum items allowed per batch */
    maxItems?: number;
    /** Whether to continue processing remaining items on error (default: false) */
    continueOnError?: boolean;
  };
}

/**
 * Factory for batch commands (bulk operations).
 *
 * Batch commands operate on multiple entities and have special transaction
 * semantics: atomic within a single aggregate, partial success across aggregates.
 *
 * @param config - Configuration with commandType, itemPayloadSchema, and optional batchConfig
 * @returns A typed Zod schema for the batch command
 *
 * @example
 * ```typescript
 * const BulkCreateOrdersSchema = createBatchCommandSchema({
 *   commandType: "BulkCreateOrders",
 *   itemPayloadSchema: z.object({
 *     customerId: z.string(),
 *     items: z.array(OrderItemSchema),
 *   }),
 *   batchConfig: {
 *     maxItems: 100,
 *     continueOnError: true,
 *   },
 * });
 * ```
 */
export function createBatchCommandSchema<
  TCommandType extends string,
  TItemPayload extends z.ZodTypeAny,
>(
  config: BatchCommandSchemaConfig<TCommandType, TItemPayload>
): TypedBatchCommandSchema<TCommandType, TItemPayload> {
  const { commandType, itemPayloadSchema, batchConfig } = config;

  // Build the batch config schema
  const batchConfigSchema = z
    .object({
      maxItems: z.number().int().positive().optional(),
      continueOnError: z.boolean().default(false),
    })
    .optional();

  const schema = EnhancedCommandMetadataSchema.extend({
    commandType: z.literal(commandType),
    category: z.literal("batch").default("batch"),
    payload: z.object({
      items: z.array(itemPayloadSchema),
    }),
    batchConfig: batchConfig
      ? batchConfigSchema.default({
          maxItems: batchConfig.maxItems,
          continueOnError: batchConfig.continueOnError ?? false,
        })
      : batchConfigSchema,
  }) as TypedBatchCommandSchema<TCommandType, TItemPayload>;

  // Attach category metadata to avoid using Zod internal APIs
  (schema as unknown as Record<symbol, CommandCategory>)[COMMAND_CATEGORY_KEY] = "batch";

  return schema;
}

/**
 * Helper to extract command category from a command schema type.
 *
 * Uses metadata attached by factory functions to avoid relying on
 * Zod's internal `_def` API which is not part of the public API.
 *
 * @param schema - A command schema created by a category factory
 * @returns The command category, or undefined if not found
 */
export function getCommandCategoryFromSchema(schema: z.ZodTypeAny): CommandCategory | undefined {
  // First try to read from attached metadata (stable approach)
  const metadata = (schema as unknown as Record<symbol, CommandCategory | undefined>)[
    COMMAND_CATEGORY_KEY
  ];
  if (metadata !== undefined) {
    return metadata;
  }

  // Fallback for schemas not created by our factories
  return undefined;
}
