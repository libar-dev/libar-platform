/**
 * Orchestration types for command execution.
 *
 * Provides type-safe configuration for the dual-write + projection pattern.
 */
import type {
  FunctionReference,
  FunctionVisibility,
  GenericMutationCtx,
  GenericDataModel,
} from "convex/server";
import type { MiddlewarePipeline } from "../middleware/MiddlewarePipeline.js";
import type { MiddlewareCommandInfo } from "../middleware/types.js";
import type { CommandCategory, AggregateTarget } from "../commands/categories.js";
import type { UnknownRecord } from "../types.js";
import type { CommandId, CorrelationId, CausationId, EventId, StreamId } from "../ids/branded.js";
import type { Logger } from "../logging/types.js";
import type { EventCategory } from "../events/category.js";

/**
 * Mutation context type using generic data model for flexibility.
 */
export type MutationCtx = GenericMutationCtx<GenericDataModel>;

/**
 * Metadata attached to events for correlation and causation tracking.
 * Uses branded types for compile-time safety.
 *
 * This is distinct from the full EventMetadata in events/types.ts which
 * includes all persisted event fields. This interface is specifically for
 * the metadata field within EventData used in command handlers.
 */
export interface EventDataMetadata {
  correlationId: CorrelationId;
  causationId: CausationId;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Event data returned by command handlers.
 *
 * This is the minimal event structure for handler results.
 * Does NOT include `boundedContext` - that's added by the orchestrator.
 *
 * Uses branded types for compile-time safety of event identifiers.
 *
 * @see NewEventData in events/builder.ts for full Event Store format
 */
export interface EventData {
  eventId: EventId;
  eventType: string;
  streamType: string;
  streamId: StreamId;
  /**
   * Schema version for upcasting pipeline (Phase 9).
   * Optional - defaults to 1 when not specified.
   */
  schemaVersion?: number;
  /**
   * Event taxonomy category (Phase 9).
   * Optional - defaults to "domain" when not specified.
   *
   * Categories:
   * - domain: Internal facts within bounded context for ES replay
   * - integration: Cross-context communication with versioned contracts
   * - trigger: ID-only notifications for GDPR compliance
   * - fat: Full state snapshots for external systems
   */
  category?: EventCategory;
  payload: UnknownRecord;
  metadata: EventDataMetadata;
}

/**
 * Success result from a command handler.
 *
 * @template TData - The typed data returned by the handler. Defaults to UnknownRecord
 *                   for flexibility when type is not yet known, but should be explicitly typed.
 */
export interface CommandHandlerSuccess<TData = UnknownRecord> {
  status: "success";
  data: TData;
  version: number;
  event: EventData;
}

/**
 * Rejected result from a command handler.
 */
export interface CommandHandlerRejected {
  status: "rejected";
  code: string;
  reason: string;
  context?: UnknownRecord;
}

/**
 * Failed result from a command handler.
 *
 * This represents a business failure that should still emit an event.
 * For example, ReserveStock failing due to insufficient stock should
 * emit a ReservationFailed event while still returning a failure status.
 *
 * Unlike "rejected" which is a validation error that doesn't emit events,
 * "failed" is a business outcome that should be recorded in the event store.
 */
export interface CommandHandlerFailed {
  status: "failed";
  reason: string;
  event: EventData;
  /**
   * Expected version for the event stream.
   * If not provided, defaults to 0 (new stream).
   * Use this when appending failure events to existing streams.
   */
  expectedVersion?: number;
  context?: UnknownRecord;
}

/**
 * Command Result Status Semantics:
 *
 * | Status    | Event Emitted | Command Status | Use Case |
 * |-----------|---------------|----------------|----------|
 * | success   | Yes           | executed       | Normal completion |
 * | failed    | Yes           | executed       | Business failure (e.g., insufficient stock) |
 * | rejected  | No            | rejected       | Validation error (e.g., invalid input) |
 * | duplicate | No            | N/A            | Idempotency (command already processed) |
 *
 * Key distinction:
 * - "failed" = Business outcome that IS recorded in event store (triggers compensation)
 * - "rejected" = Validation error that is NOT recorded in event store
 */

/**
 * Combined result type from command handlers.
 *
 * @template TData - The typed data for success results. Defaults to UnknownRecord
 *                   for flexibility when type is not yet known.
 */
export type CommandHandlerResult<TData = UnknownRecord> =
  | CommandHandlerSuccess<TData>
  | CommandHandlerRejected
  | CommandHandlerFailed;

/**
 * Result from Command Bus recordCommand.
 */
export type RecordCommandResult =
  | { status: "new" }
  | {
      status: "duplicate";
      commandStatus: "pending" | "executed" | "rejected" | "failed";
      result?: unknown;
    };

/**
 * Unified return type for command mutations.
 *
 * @template TData - The typed data for success results. Defaults to UnknownRecord
 *                   for flexibility when type is not yet known.
 *
 * Status variants:
 * - "new": Command recorded successfully (from RecordCommandResult)
 * - "duplicate": Command already processed (from RecordCommandResult)
 * - "success": Command executed successfully with data
 * - "rejected": Validation error (code + reason + optional context)
 * - "failed": Business failure with event recorded
 */
export type CommandMutationResult<TData = UnknownRecord> =
  | RecordCommandResult
  | {
      status: "success";
      data: TData;
      version: number;
      eventId: EventId;
      globalPosition: number | undefined;
    }
  | {
      status: "rejected";
      code: string;
      reason: string;
      context?: UnknownRecord;
    }
  | {
      status: "failed";
      reason: string;
      eventId: EventId;
      context?: UnknownRecord;
    };

/**
 * Configuration for projection triggering.
 *
 * @template TArgs - The command arguments
 * @template TProjectionArgs - The projection handler arguments
 * @template TResult - The success result type, must extend CommandHandlerSuccess
 * @template TData - The typed data in the result (defaults to unknown for type safety)
 */
export interface ProjectionConfig<
  TArgs,
  TProjectionArgs extends UnknownRecord,
  TResult extends CommandHandlerSuccess<TData>,
  TData = unknown,
> {
  /**
   * Reference to the projection handler mutation.
   * Must be a component public mutation (components.X.projections.Y.handler).
   */
  handler: FunctionReference<"mutation", FunctionVisibility, TProjectionArgs, unknown>;

  /**
   * Reference to the onComplete handler for dead letter tracking.
   * Optional - falls back to OrchestratorDependencies.defaultOnComplete.
   * Must be a component public mutation (components.X.projections.Y.onComplete).
   */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

  /**
   * Name of the projection for dead letter tracking.
   */
  projectionName: string;

  /**
   * Transform handler result to projection args.
   * Called after successful event append to construct projection handler arguments.
   */
  toProjectionArgs: (args: TArgs, result: TResult, globalPosition: number) => TProjectionArgs;

  /**
   * Extract the partition key for projection context.
   * Returns both the key name and value for proper context assignment.
   * Example: { name: "orderId", value: "ord_123" }
   */
  getPartitionKey: (args: TArgs) => { name: string; value: string };
}

/**
 * Configuration for projection triggering on failed commands.
 *
 * Used when a command returns { status: "failed" } (business failure with event).
 * The orchestrator will trigger this projection after emitting the failure event.
 *
 * @template TArgs - The command arguments
 * @template TProjectionArgs - The projection handler arguments
 * @template TFailed - The failed result type
 */
export interface FailedProjectionConfig<
  TArgs,
  TProjectionArgs extends UnknownRecord,
  TFailed extends CommandHandlerFailed = CommandHandlerFailed,
> {
  /**
   * Reference to the projection handler mutation.
   */
  handler: FunctionReference<"mutation", FunctionVisibility, TProjectionArgs, unknown>;

  /**
   * Reference to the onComplete handler for dead letter tracking.
   * Optional - falls back to OrchestratorDependencies.defaultOnComplete.
   */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

  /**
   * Name of the projection for dead letter tracking.
   */
  projectionName: string;

  /**
   * Transform args and failed result to projection args.
   * Called after failure event append to construct projection handler arguments.
   */
  toProjectionArgs: (args: TArgs, failedResult: TFailed, globalPosition: number) => TProjectionArgs;

  /**
   * Extract the partition key for projection context.
   */
  getPartitionKey: (args: TArgs) => { name: string; value: string };
}

/**
 * Configuration for saga routing after event append.
 * Optional - only needed for commands that trigger cross-context sagas.
 */
export interface SagaRouteConfig<TArgs> {
  /**
   * Reference to the saga router mutation.
   * Typically internal.sagas.router.routeEvent
   */
  router: FunctionReference<"mutation", FunctionVisibility, SagaRouteArgs, unknown>;

  /**
   * Extract saga-relevant data from command args.
   * Returns the event type to route (e.g., "OrderSubmitted").
   */
  getEventType: (args: TArgs) => string;

  /**
   * Reference to the onComplete handler for dead letter tracking.
   * Optional - falls back to OrchestratorDependencies.defaultOnComplete.
   */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;
}

/**
 * Arguments for the saga router.
 * Uses plain strings for Convex FunctionReference compatibility.
 * (Convex auto-generates function reference types with plain strings)
 * Includes index signature for Convex FunctionReference compatibility.
 */
export interface SagaRouteArgs {
  eventType: string;
  eventId: string;
  streamId: string;
  globalPosition: number;
  payload: unknown;
  /** Correlation ID for deriving correlation chains in saga commands */
  correlationId: string;
  /** Index signature for Convex FunctionReference compatibility */
  [key: string]: unknown;
}

/**
 * Configuration for a command that follows the dual-write + projection pattern.
 *
 * @template TArgs - The public API arguments (what the client sends)
 * @template THandlerArgs - The component handler arguments (includes commandId, correlationId)
 * @template TResult - The result type from the component handler
 * @template TProjectionArgs - The arguments for the projection handler
 * @template TData - The typed success data returned by the handler. Should match the data type
 *                   in TResult when TResult is CommandHandlerSuccess<TData>.
 */
export interface CommandConfig<
  TArgs,
  THandlerArgs extends UnknownRecord,
  TResult extends CommandHandlerResult<TData>,
  TProjectionArgs extends UnknownRecord,
  TData = unknown,
> {
  /**
   * Name of the command (e.g., "CreateOrder").
   * Used for Command Bus recording and logging.
   */
  commandType: string;

  /**
   * Name of the bounded context (e.g., "orders").
   * Used for Command Bus and Event Store context tagging.
   */
  boundedContext: string;

  /**
   * Reference to the component command handler mutation.
   * Must be a component public mutation (components.X.handlers.commands.handleY).
   */
  handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, TResult>;

  /**
   * Transform public args to handler args.
   * Adds commandId and correlationId to the public arguments.
   * Uses plain strings for Convex FunctionReference compatibility.
   */
  toHandlerArgs: (args: TArgs, commandId: string, correlationId: string) => THandlerArgs;

  /**
   * Projection configuration.
   * Defines how to trigger projections after successful event append.
   */
  projection: ProjectionConfig<
    TArgs,
    TProjectionArgs,
    Extract<TResult, CommandHandlerSuccess<TData>>,
    TData
  >;

  /**
   * Optional secondary projections.
   * Used for cross-context projections that need to be updated from the same event.
   * Example: orderWithInventory projection updated by both Order and Inventory events.
   */
  secondaryProjections?: Array<
    ProjectionConfig<TArgs, UnknownRecord, Extract<TResult, CommandHandlerSuccess<TData>>, TData>
  >;

  /**
   * Optional projection for failed commands (business failures with events).
   * Triggered when the handler returns { status: "failed" } which emits an event
   * but represents a business failure (e.g., insufficient stock for reservation).
   */
  failedProjection?: FailedProjectionConfig<TArgs, UnknownRecord>;

  /**
   * Optional saga routing configuration.
   * If provided, the orchestrator will call the saga router after projection enqueue.
   * Used for commands that trigger cross-context sagas (e.g., SubmitOrder → OrderFulfillment).
   */
  sagaRoute?: SagaRouteConfig<TArgs>;
}

/**
 * Interface for EventStore client.
 * Uses branded types for compile-time safety of identifiers.
 */
export interface EventStoreClient {
  appendToStream: (
    ctx: MutationCtx,
    args: {
      streamType: string;
      streamId: string;
      expectedVersion: number;
      boundedContext: string;
      events: Array<{
        eventId: EventId;
        eventType: string;
        payload: unknown;
        metadata?: {
          correlationId: CorrelationId;
          causationId?: CausationId;
          userId?: string;
          [key: string]: unknown;
        };
      }>;
    }
  ) => Promise<{
    status: "success" | "conflict";
    globalPositions?: number[];
    currentVersion?: number;
  }>;
}

/**
 * Interface for CommandBus client.
 * Uses branded types for compile-time safety of identifiers.
 */
export interface CommandBusClient {
  recordCommand: (
    ctx: MutationCtx,
    args: {
      commandId: CommandId;
      commandType: string;
      targetContext: string;
      payload: UnknownRecord;
      metadata: { correlationId: CorrelationId; timestamp: number };
    }
  ) => Promise<RecordCommandResult>;
  updateCommandResult: (
    ctx: MutationCtx,
    args: {
      commandId: CommandId;
      status: "executed" | "rejected" | "failed";
      result: unknown;
    }
  ) => Promise<boolean>;
}

/**
 * Result of a workpool run.
 */
export type WorkpoolRunResult =
  | { kind: "success"; returnValue: unknown }
  | { kind: "failed"; error: string }
  | { kind: "canceled" };

/**
 * Arguments passed to workpool onComplete handlers.
 */
export interface WorkpoolOnCompleteArgs {
  workId: string;
  context: unknown;
  result: WorkpoolRunResult;
  /** Index signature for Convex FunctionReference compatibility */
  [key: string]: unknown;
}

/**
 * Interface for Workpool client.
 *
 * Provides abstraction over @convex-dev/workpool for the orchestrator.
 * The optional `enqueueMutationBatch` method enables batching multiple
 * mutations with the same handler to reduce OCC contention.
 */
export interface WorkpoolClient {
  /**
   * Enqueue a single mutation for execution.
   */
  enqueueMutation: <TArgs extends UnknownRecord>(
    ctx: MutationCtx,
    handler: FunctionReference<"mutation", FunctionVisibility, TArgs, unknown>,
    args: TArgs,
    options?: {
      name?: string;
      onComplete?: FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      > | null;
      context?: unknown;
      runAt?: number;
      runAfter?: number;
      /**
       * Partition key for ordering within the Workpool.
       *
       * Work items with the same key are processed in order (FIFO).
       * Used by DCB retry to ensure retries for the same scope
       * execute sequentially, preventing concurrent retry collisions.
       *
       * @since Phase 18a
       */
      key?: string;
    }
  ) => Promise<unknown>;

  /**
   * Enqueue multiple mutations with the SAME handler for batch execution.
   * Reduces OCC contention on Workpool's internal tables by combining
   * multiple enqueue operations into a single transaction.
   *
   * Optional - when not provided, the orchestrator falls back to
   * individual enqueueMutation calls.
   *
   * @param ctx - Mutation context
   * @param handler - The mutation handler (same for all items)
   * @param argsArray - Array of arguments for each enqueued mutation
   * @param options - Shared options applied to all mutations
   * @returns Array of work IDs for each enqueued mutation
   */
  enqueueMutationBatch?: <TArgs extends UnknownRecord>(
    ctx: MutationCtx,
    handler: FunctionReference<"mutation", FunctionVisibility, TArgs, unknown>,
    argsArray: TArgs[],
    options?: {
      name?: string;
      onComplete?: FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      > | null;
      context?: unknown;
    }
  ) => Promise<unknown[]>;

  /**
   * Enqueue an action for execution in the Workpool.
   *
   * Used by ConvexEventBus for ActionSubscription dispatch.
   * The action can make external HTTP calls (e.g., LLM APIs).
   * The result flows to the onComplete handler via Workpool.
   *
   * @since Phase 22b (AgentLLMIntegration)
   */
  enqueueAction: <TArgs extends UnknownRecord>(
    ctx: MutationCtx,
    actionRef: FunctionReference<"action", FunctionVisibility, TArgs, unknown>,
    args: TArgs,
    options?: {
      onComplete?: FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      > | null;
      context?: unknown;
      /**
       * Retry behavior for the action.
       * - `true`: Use Workpool default retry behavior
       * - `false`: No retries
       * - Object: Custom retry behavior with backoff configuration
       *
       * Must be compatible with Workpool's RetryBehavior type.
       */
      retry?:
        | boolean
        | {
            maxAttempts: number;
            initialBackoffMs: number;
            base: number;
          };
    }
  ) => Promise<unknown>;
}

/**
 * EventBus interface for publish/subscribe.
 * Uses plain strings for Convex FunctionReference compatibility.
 * Import from eventbus module for full implementation.
 */
export interface EventBusClient {
  publish(
    ctx: MutationCtx,
    event: {
      eventId: string;
      eventType: string;
      streamType: string;
      streamId: string;
      category: string;
      schemaVersion: number;
      boundedContext: string;
      globalPosition: number;
      timestamp: number;
      payload: unknown;
      correlation: {
        correlationId: string;
        causationId: string;
        userId?: string;
      };
    },
    chain: {
      commandId: string;
      correlationId: string;
      causationId: string;
      userId?: string;
      initiatedAt: number;
      context?: UnknownRecord;
    }
  ): Promise<{
    matchedSubscriptions: number;
    triggeredSubscriptions: string[];
    success: boolean;
  }>;
}

/**
 * Arguments for recording command-event correlations.
 * Uses plain strings for Convex FunctionReference compatibility.
 * Includes index signature for Convex FunctionReference compatibility.
 */
export interface RecordCorrelationArgs {
  commandId: string;
  eventIds: string[];
  commandType: string;
  boundedContext: string;
  /** Index signature for Convex FunctionReference compatibility */
  [key: string]: unknown;
}

/**
 * Interface for command category lookup.
 * Used by the orchestrator to determine command category for middleware context.
 *
 * This is a minimal interface that the CommandRegistry implements.
 */
export interface CommandCategoryLookup {
  /**
   * Get command metadata by type.
   *
   * @returns Metadata with category and target aggregate if found, undefined otherwise
   */
  getRegistration(
    commandType: string
  ): { metadata: { category: CommandCategory; targetAggregate?: AggregateTarget } } | undefined;
}

/**
 * Dependencies required by the CommandOrchestrator.
 */
export interface OrchestratorDependencies {
  eventStore: EventStoreClient;
  commandBus: CommandBusClient;
  projectionPool: WorkpoolClient;
  /**
   * Default onComplete handler for projection dead letter tracking.
   * Used when projection configs don't specify their own onComplete.
   * Typically: internal.projections.deadLetters.onProjectionComplete
   */
  defaultOnComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  >;

  /**
   * Optional EventBus for publish/subscribe event delivery.
   * When provided, the orchestrator will publish events to the EventBus
   * in addition to (or instead of) direct projection triggering.
   */
  eventBus?: EventBusClient;

  /**
   * Required middleware pipeline for command pre/post processing.
   * The orchestrator wraps command execution with middleware
   * hooks for validation, authorization, logging, and rate limiting.
   *
   * @example
   * ```typescript
   * const pipeline = createMiddlewarePipeline()
   *   .use(createStructureValidationMiddleware({ schemas }))
   *   .use(createLoggingMiddleware({ logger }));
   *
   * const orchestrator = new CommandOrchestrator({
   *   // ... other deps
   *   middlewarePipeline: pipeline,
   * });
   * ```
   */
  middlewarePipeline: MiddlewarePipeline;

  /**
   * Optional Command Bus component reference for recording command-event correlations.
   * When provided, the orchestrator records which events each command produced.
   * This enables audit trail queries and command tracing.
   *
   * @example
   * ```typescript
   * const orchestrator = new CommandOrchestrator({
   *   // ... other deps
   *   commandBusComponent: {
   *     recordCommandEventCorrelation: components.commandBus.lib.recordCommandEventCorrelation,
   *   },
   * });
   * ```
   */
  commandBusComponent?: {
    recordCommandEventCorrelation: FunctionReference<
      "mutation",
      FunctionVisibility,
      RecordCorrelationArgs,
      boolean
    >;
  };

  /**
   * Optional command registry for category lookup.
   * When provided, the orchestrator uses the registry to determine command
   * category and target aggregate for middleware context.
   *
   * This enables proper DDD-aware middleware execution based on command type
   * (aggregate, process, system, batch).
   *
   * @example
   * ```typescript
   * import { globalRegistry } from "@libar-dev/platform-core/registry";
   *
   * const orchestrator = new CommandOrchestrator({
   *   // ... other deps
   *   registry: globalRegistry,
   * });
   * ```
   */
  registry?: CommandCategoryLookup;

  /**
   * Optional logger for orchestrator operations.
   * If not provided, logging is disabled (no-op logger used).
   *
   * Logging points:
   * - DEBUG: Command received, handler invocation, event append, projections triggered
   * - INFO: Command completed, duplicate detected, rejection/failure
   * - WARN: Event Store OCC conflict
   *
   * @example
   * ```typescript
   * import { createScopedLogger } from "@libar-dev/platform-core";
   *
   * const orchestrator = new CommandOrchestrator({
   *   // ... other deps
   *   logger: createScopedLogger("Orchestrator", "INFO"),
   * });
   * ```
   */
  logger?: Logger;
}

// Re-export MiddlewareCommandInfo for convenience
export type { MiddlewareCommandInfo };
