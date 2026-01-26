/**
 * Helper functions for defining commands with reduced boilerplate.
 *
 * These helpers provide a cleaner API than raw CommandConfig:
 * - Automatic toHandlerArgs generation
 * - Default partition key from aggregate ID field
 * - Auto-registration with global registry
 * - Better TypeScript inference
 */
import { z } from "zod";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { AggregateTarget } from "../commands/categories.js";
import type {
  CommandConfig,
  CommandHandlerFailed,
  CommandHandlerResult,
  CommandHandlerSuccess,
  WorkpoolOnCompleteArgs,
} from "../orchestration/types.js";
import type { CommandDefinitionMetadata, CommandRegistration } from "./types.js";
import { CommandRegistry } from "./CommandRegistry.js";
import type { UnknownRecord } from "../types.js";
import type { SagaRouteArgs } from "../orchestration/types.js";

/**
 * Projection configuration for defineAggregateCommand.
 */
export interface ProjectionDefinition<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
> {
  /** Reference to the projection handler mutation */
  handler: FunctionReference<"mutation", FunctionVisibility, TProjectionArgs, unknown>;

  /** Name of the projection for dead letter tracking */
  projectionName: string;

  /** Transform command result to projection args */
  toProjectionArgs: (
    args: TArgs,
    result: { data: TData; event: { eventId: string } },
    globalPosition: number
  ) => TProjectionArgs;

  /** Optional custom partition key (defaults to aggregateIdField) */
  getPartitionKey?: (args: TArgs) => { name: string; value: string };

  /** Optional onComplete handler */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;
}

/**
 * Saga route configuration for defineAggregateCommand.
 */
export interface SagaRouteDefinition<TArgs extends UnknownRecord> {
  /** Reference to the saga router mutation */
  router: FunctionReference<"mutation", FunctionVisibility, UnknownRecord, unknown>;

  /** Get the event type to route */
  getEventType: (args: TArgs) => string;

  /** Optional onComplete handler for dead letter tracking */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;
}

/**
 * Configuration for defineAggregateCommand.
 *
 * Reduces boilerplate by:
 * - Inferring THandlerArgs from argsSchema + standard fields
 * - Auto-generating toHandlerArgs that adds commandId/correlationId
 * - Providing sensible defaults for partitioning
 */
export interface AggregateCommandDefinition<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
> {
  /** Unique command type (e.g., "CreateOrder") */
  commandType: string;

  /** Target bounded context (e.g., "orders") */
  boundedContext: string;

  /** Target aggregate type (e.g., "Order") */
  targetAggregate: string;

  /** Zod schema for command arguments */
  argsSchema: z.ZodType<TArgs>;

  /** Field name used as aggregate ID (e.g., "orderId") - for partitioning */
  aggregateIdField: keyof TArgs & string;

  /** Component handler mutation reference */
  handler: FunctionReference<
    "mutation",
    FunctionVisibility,
    TArgs & { commandId: string; correlationId: string },
    CommandHandlerResult<TData>
  >;

  /** Primary projection configuration */
  projection: ProjectionDefinition<TArgs, TData, TProjectionArgs>;

  /** Optional secondary projections */
  secondaryProjections?: Array<ProjectionDefinition<TArgs, TData, UnknownRecord>>;

  /** Optional saga routing */
  sagaRoute?: SagaRouteDefinition<TArgs>;

  /** Optional failed projection */
  failedProjection?: ProjectionDefinition<TArgs, unknown, UnknownRecord>;

  /** Optional metadata */
  description?: string;
  schemaVersion?: number;
  tags?: string[];

  /** Auto-register with global registry (default: true) */
  autoRegister?: boolean;
}

/**
 * Result of defineAggregateCommand.
 */
export interface AggregateCommandResult<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
> {
  /** The executable command configuration */
  config: CommandConfig<
    TArgs,
    TArgs & { commandId: string; correlationId: string },
    CommandHandlerResult<TData>,
    TProjectionArgs,
    TData
  >;

  /** Command metadata for introspection */
  metadata: CommandDefinitionMetadata;

  /** Full registration (for manual registration if autoRegister=false) */
  registration: CommandRegistration<TArgs, TData>;
}

/**
 * Define an aggregate command with reduced boilerplate.
 *
 * Benefits over raw CommandConfig:
 * - Automatically generates toHandlerArgs
 * - Infers partition key from aggregateIdField
 * - Auto-registers with CommandRegistry
 * - Better TypeScript inference
 *
 * @example
 * ```typescript
 * export const createOrderCommand = defineAggregateCommand({
 *   commandType: "CreateOrder",
 *   boundedContext: "orders",
 *   targetAggregate: "Order",
 *   aggregateIdField: "orderId",
 *   argsSchema: z.object({
 *     orderId: z.string(),
 *     customerId: z.string(),
 *   }),
 *   handler: components.orders.handlers.commands.handleCreateOrder,
 *   projection: {
 *     handler: internal.projections.orders.orderSummary.onOrderCreated,
 *     projectionName: "orderSummary",
 *     toProjectionArgs: (args, result, globalPosition) => ({
 *       orderId: args.orderId,
 *       customerId: args.customerId,
 *       eventId: result.event.eventId,
 *       globalPosition,
 *     }),
 *   },
 * });
 *
 * // In mutation:
 * export const createOrder = mutation({
 *   args: { orderId: v.string(), customerId: v.string(), commandId: v.optional(v.string()) },
 *   handler: (ctx, args) => orchestrator.execute(ctx, createOrderCommand.config, args),
 * });
 * ```
 */
export function defineAggregateCommand<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
>(
  definition: AggregateCommandDefinition<TArgs, TData, TProjectionArgs>
): AggregateCommandResult<TArgs, TData, TProjectionArgs> {
  const {
    commandType,
    boundedContext,
    targetAggregate,
    argsSchema,
    aggregateIdField,
    handler,
    projection,
    secondaryProjections,
    sagaRoute,
    failedProjection,
    description,
    schemaVersion = 1,
    tags,
    autoRegister = true,
  } = definition;

  // Build default partition key getter using aggregateIdField
  const defaultGetPartitionKey = (args: TArgs) => ({
    name: aggregateIdField,
    value: String(args[aggregateIdField]),
  });

  // Build the CommandConfig
  const config: CommandConfig<
    TArgs,
    TArgs & { commandId: string; correlationId: string },
    CommandHandlerResult<TData>,
    TProjectionArgs,
    TData
  > = {
    commandType,
    boundedContext,
    handler: handler as FunctionReference<
      "mutation",
      FunctionVisibility,
      TArgs & { commandId: string; correlationId: string },
      CommandHandlerResult<TData>
    >,

    // Auto-generated toHandlerArgs - the key boilerplate reduction
    toHandlerArgs: (
      args: TArgs,
      commandId: string,
      correlationId: string
    ): TArgs & { commandId: string; correlationId: string } => ({
      ...args,
      commandId,
      correlationId,
    }),

    projection: {
      handler: projection.handler,
      projectionName: projection.projectionName,
      toProjectionArgs: (
        args: TArgs,
        result: CommandHandlerSuccess<TData>,
        globalPosition: number
      ) =>
        projection.toProjectionArgs(
          args,
          { data: result.data, event: result.event },
          globalPosition
        ),
      getPartitionKey: projection.getPartitionKey ?? defaultGetPartitionKey,
      ...(projection.onComplete ? { onComplete: projection.onComplete } : {}),
    },

    ...(secondaryProjections
      ? {
          secondaryProjections: secondaryProjections.map((sp) => ({
            handler: sp.handler,
            projectionName: sp.projectionName,
            toProjectionArgs: (
              args: TArgs,
              result: CommandHandlerSuccess<TData>,
              globalPosition: number
            ) =>
              sp.toProjectionArgs(args, { data: result.data, event: result.event }, globalPosition),
            getPartitionKey: sp.getPartitionKey ?? defaultGetPartitionKey,
            ...(sp.onComplete ? { onComplete: sp.onComplete } : {}),
          })),
        }
      : {}),

    ...(sagaRoute
      ? {
          sagaRoute: {
            router: sagaRoute.router as FunctionReference<
              "mutation",
              FunctionVisibility,
              SagaRouteArgs,
              unknown
            >,
            getEventType: sagaRoute.getEventType,
            // Pass through onComplete for dead letter tracking
            ...(sagaRoute.onComplete ? { onComplete: sagaRoute.onComplete } : {}),
          },
        }
      : {}),

    ...(failedProjection
      ? {
          failedProjection: {
            handler: failedProjection.handler,
            projectionName: failedProjection.projectionName,
            toProjectionArgs: (
              args: TArgs,
              failedResult: CommandHandlerFailed,
              globalPosition: number
            ) =>
              failedProjection.toProjectionArgs(
                args,
                { data: failedResult, event: { eventId: failedResult.event.eventId } },
                globalPosition
              ),
            getPartitionKey: failedProjection.getPartitionKey ?? defaultGetPartitionKey,
            ...(failedProjection.onComplete ? { onComplete: failedProjection.onComplete } : {}),
          },
        }
      : {}),
  };

  const targetAggregateInfo: AggregateTarget = {
    type: targetAggregate,
    idField: aggregateIdField,
  };

  // Build metadata with conditional optional properties (exactOptionalPropertyTypes)
  const metadata: CommandDefinitionMetadata = {
    commandType,
    boundedContext,
    category: "aggregate",
    targetAggregate: targetAggregateInfo,
    schemaVersion,
  };
  if (description !== undefined) {
    metadata.description = description;
  }
  if (tags !== undefined) {
    metadata.tags = tags;
  }

  const registration: CommandRegistration<TArgs, TData> = {
    metadata,
    argsSchema,
    config: config as CommandConfig<
      TArgs,
      UnknownRecord,
      CommandHandlerResult<TData>,
      UnknownRecord,
      TData
    >,
    registeredAt: Date.now(),
  };

  // Auto-register if enabled
  if (autoRegister) {
    CommandRegistry.getInstance().register(registration);
  }

  return { config, metadata, registration };
}

/**
 * Configuration for defineProcessCommand.
 */
export interface ProcessCommandDefinition<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
> extends Omit<
  AggregateCommandDefinition<TArgs, TData, TProjectionArgs>,
  "targetAggregate" | "aggregateIdField"
> {
  /** Target process/saga type (e.g., "OrderFulfillment") */
  targetProcess: string;

  /** Field name used as process ID for partitioning */
  processIdField: keyof TArgs & string;
}

/**
 * Define a process command (for saga/workflow triggers).
 * Similar to aggregate but with category: "process".
 */
export function defineProcessCommand<
  TArgs extends UnknownRecord,
  TData,
  TProjectionArgs extends UnknownRecord,
>(
  definition: ProcessCommandDefinition<TArgs, TData, TProjectionArgs>
): AggregateCommandResult<TArgs, TData, TProjectionArgs> {
  const { targetProcess, processIdField, ...rest } = definition;

  // Reuse defineAggregateCommand logic but override category
  const result = defineAggregateCommand({
    ...rest,
    targetAggregate: targetProcess,
    aggregateIdField: processIdField,
    autoRegister: false, // We'll register with correct category
  });

  // Override metadata to use process category
  // We destructure to omit targetAggregate (exactOptionalPropertyTypes)
  const { targetAggregate: _targetAggregate, ...baseMetadata } = result.metadata;
  const metadata: CommandDefinitionMetadata = {
    ...baseMetadata,
    category: "process",
    targetProcess,
  };

  const registration: CommandRegistration<TArgs, TData> = {
    ...result.registration,
    metadata,
  };

  // Register with correct category
  if (definition.autoRegister !== false) {
    CommandRegistry.getInstance().register(registration);
  }

  return { ...result, metadata, registration };
}

/**
 * Configuration for defineSystemCommand.
 * System commands are simpler - they may not require projections.
 */
export interface SystemCommandDefinition<TArgs extends UnknownRecord, TData> {
  /** Unique command type (e.g., "CleanupExpiredCommands") */
  commandType: string;

  /** Target bounded context (e.g., "system") */
  boundedContext: string;

  /** Target subsystem (e.g., "cleanup", "migration") */
  subsystem: string;

  /** Zod schema for command arguments */
  argsSchema: z.ZodType<TArgs>;

  /** Component handler mutation reference */
  handler: FunctionReference<
    "mutation",
    FunctionVisibility,
    TArgs & { commandId: string; correlationId: string },
    CommandHandlerResult<TData>
  >;

  /** Optional projection (system commands may not need projections) */
  projection?: ProjectionDefinition<TArgs, TData, UnknownRecord>;

  /** Optional metadata */
  description?: string;
  schemaVersion?: number;
  tags?: string[];

  /**
   * Auto-register with global registry (default: true).
   *
   * **Note:** Registration only occurs if a `projection` is provided,
   * as CommandConfig requires a projection field. System commands
   * without projections will silently skip registration.
   */
  autoRegister?: boolean;
}

/**
 * Result of defineSystemCommand.
 */
export interface SystemCommandResult<TArgs extends UnknownRecord, TData> {
  /** The executable command configuration (partial - may not have projection) */
  config: Partial<
    CommandConfig<
      TArgs,
      TArgs & { commandId: string; correlationId: string },
      CommandHandlerResult<TData>,
      UnknownRecord,
      TData
    >
  > & {
    commandType: string;
    boundedContext: string;
    handler: FunctionReference<
      "mutation",
      FunctionVisibility,
      TArgs & { commandId: string; correlationId: string },
      CommandHandlerResult<TData>
    >;
    toHandlerArgs: (
      args: TArgs,
      commandId: string,
      correlationId: string
    ) => TArgs & { commandId: string; correlationId: string };
  };

  /** Command metadata for introspection */
  metadata: CommandDefinitionMetadata;
}

/**
 * Define a system command (infrastructure/admin).
 * System commands may not require projections.
 */
export function defineSystemCommand<TArgs extends UnknownRecord, TData>(
  definition: SystemCommandDefinition<TArgs, TData>
): SystemCommandResult<TArgs, TData> {
  const {
    commandType,
    boundedContext,
    subsystem,
    argsSchema,
    handler,
    projection,
    description,
    schemaVersion = 1,
    tags,
    autoRegister = true,
  } = definition;

  // Build metadata with conditional optional properties (exactOptionalPropertyTypes)
  const metadata: CommandDefinitionMetadata = {
    commandType,
    boundedContext,
    category: "system",
    subsystem,
    schemaVersion,
  };
  if (description !== undefined) {
    metadata.description = description;
  }
  if (tags !== undefined) {
    metadata.tags = tags;
  }

  const toHandlerArgs = (
    args: TArgs,
    commandId: string,
    correlationId: string
  ): TArgs & { commandId: string; correlationId: string } => ({
    ...args,
    commandId,
    correlationId,
  });

  const config = {
    commandType,
    boundedContext,
    handler,
    toHandlerArgs,
    ...(projection
      ? {
          projection: {
            handler: projection.handler,
            projectionName: projection.projectionName,
            toProjectionArgs: projection.toProjectionArgs as (
              args: TArgs,
              result: CommandHandlerSuccess<TData>,
              globalPosition: number
            ) => UnknownRecord,
            getPartitionKey:
              projection.getPartitionKey ?? (() => ({ name: "system", value: commandType })),
            ...(projection.onComplete ? { onComplete: projection.onComplete } : {}),
          },
        }
      : {}),
  };

  if (autoRegister && projection) {
    // Only register if we have a projection (required for CommandConfig)
    const registration: CommandRegistration<TArgs, TData> = {
      metadata,
      argsSchema,
      config: config as CommandConfig<
        TArgs,
        UnknownRecord,
        CommandHandlerResult<TData>,
        UnknownRecord,
        TData
      >,
      registeredAt: Date.now(),
    };
    CommandRegistry.getInstance().register(registration);
  }

  return { config, metadata };
}
