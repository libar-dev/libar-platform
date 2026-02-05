/**
 * CommandOrchestrator class for executing the dual-write + projection pattern.
 */
import type { FunctionReference } from "convex/server";
import {
  generateCommandId,
  toCommandId,
  toEventId,
  type CommandId,
  type EventId,
} from "../ids/index.js";
import { createCorrelationChain } from "../correlation/index.js";
import type { CorrelationChain } from "../correlation/index.js";
import { DEFAULT_EVENT_CATEGORY, DEFAULT_SCHEMA_VERSION } from "../events/category.js";
import type { MiddlewareCommandInfo } from "../middleware/types.js";
import type {
  CommandConfig,
  CommandHandlerFailed,
  CommandHandlerResult,
  CommandHandlerSuccess,
  CommandMutationResult,
  MutationCtx,
  OrchestratorDependencies,
} from "./types.js";
import type { UnknownRecord } from "../types.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * @libar-docs
 * @libar-docs-command @libar-docs-core @libar-docs-overview
 * @libar-docs-pattern CommandOrchestrator
 * @libar-docs-status completed
 * @libar-docs-usecase "Executing commands with dual-write pattern"
 * @libar-docs-usecase "Coordinating CMS update, event append, and projection trigger"
 * @libar-docs-usecase "Ensuring command idempotency across retries"
 * @libar-docs-uses EventStore, CommandBus, MiddlewarePipeline, Workpool
 * @libar-docs-used-by BoundedContextHandlers
 *
 * ## CommandOrchestrator - Dual-Write Pattern Implementation
 *
 * The CommandOrchestrator encapsulates the 7-step dual-write + projection execution
 * pattern that is central to this DDD/ES/CQRS architecture.
 *
 * ### When to Use
 *
 * - Every command handler uses this pattern
 * - Implementing new commands in a bounded context
 * - Understanding command execution flow and error handling
 *
 * ### Orchestration Steps
 *
 * | Step | Action | Component | Purpose |
 * |------|--------|-----------|---------|
 * | 1 | Record command | Command Bus | Idempotency check |
 * | 2 | Call handler | Bounded Context | CMS update |
 * | 3 | Handle rejection | - | Early exit if invalid |
 * | 4 | Append event | Event Store | Audit trail |
 * | 5 | Trigger projection | Workpool | Update read models |
 * | 6 | Route saga | Workflow | Cross-context coordination |
 * | 7 | Update status | Command Bus | Final status |
 *
 * ### Key Features
 *
 * - **Idempotency**: Commands with same `commandId` return cached results
 * - **OCC Support**: Event Store version conflicts are detected and rejected
 * - **Dead Letter Support**: Failed projections are tracked via `onComplete`
 * - **Saga Routing**: Cross-context workflows triggered via Workpool
 *
 * @example
 * ```typescript
 * const middlewarePipeline = createMiddlewarePipeline()
 *   .use(createRegistryValidationMiddleware(commandRegistry));
 *
 * const orchestrator = new CommandOrchestrator({
 *   eventStore,
 *   commandBus,
 *   projectionPool,
 *   middlewarePipeline,
 * });
 *
 * export const createOrder = mutation({
 *   args: { orderId: v.string(), customerId: v.string() },
 *   handler: (ctx, args) => orchestrator.execute(ctx, createOrderConfig, args),
 * });
 * ```
 */
export class CommandOrchestrator {
  private readonly logger: Logger;

  constructor(private readonly deps: OrchestratorDependencies) {
    this.logger = deps.logger ?? createPlatformNoOpLogger();
  }

  /**
   * Execute a command following the dual-write + projection pattern.
   *
   * When a middleware pipeline is configured, the execution is wrapped
   * with before/after hooks for validation, authorization, logging, etc.
   *
   * @param ctx - The Convex mutation context
   * @param config - Command configuration
   * @param args - Public API arguments (with optional commandId)
   * @returns The command execution result
   */
  async execute<
    TArgs extends UnknownRecord & { commandId?: string },
    THandlerArgs extends UnknownRecord,
    TResult extends CommandHandlerResult<TData>,
    TProjectionArgs extends UnknownRecord,
    TData = unknown,
  >(
    ctx: MutationCtx,
    config: CommandConfig<Omit<TArgs, "commandId">, THandlerArgs, TResult, TProjectionArgs, TData>,
    args: TArgs
  ): Promise<CommandMutationResult<TData>> {
    // Extract commandId from args, rest is the command payload
    const { commandId: providedCommandId, ...commandArgs } = args;
    // Convert string to branded type at API boundary
    const commandId = providedCommandId ? toCommandId(providedCommandId) : generateCommandId();

    // Create correlation chain for request tracing
    // The chain bundles commandId, correlationId, and causationId together
    const chain: CorrelationChain = createCorrelationChain(commandId);
    const { correlationId } = chain;

    this.logger.debug("Command received", {
      commandType: config.commandType,
      commandId,
      correlationId,
      boundedContext: config.boundedContext,
    });

    // 1. Check idempotency BEFORE middleware pipeline
    // This ensures duplicate commands return immediately without running middleware hooks
    const cmdResult = await this.deps.commandBus.recordCommand(ctx, {
      commandId,
      commandType: config.commandType,
      targetContext: config.boundedContext,
      payload: commandArgs as UnknownRecord,
      metadata: { correlationId, timestamp: Date.now() },
    });

    if (cmdResult.status === "duplicate") {
      this.logger.info("Command duplicate detected", {
        commandType: config.commandType,
        commandId,
        correlationId,
      });
      // Return cached result for idempotency - no middleware needed
      return cmdResult;
    }

    // Execute with middleware pipeline (always configured, required dependency)
    // Look up command metadata from registry if available
    const registration = this.deps.registry?.getRegistration(config.commandType);
    const category = registration?.metadata.category ?? "aggregate";
    const targetAggregate = registration?.metadata.targetAggregate;

    const middlewareCommandInfo: MiddlewareCommandInfo = {
      type: config.commandType,
      boundedContext: config.boundedContext,
      category,
      args: commandArgs as UnknownRecord,
      commandId,
      correlationId,
    };

    // Add target aggregate if available from registry
    if (targetAggregate) {
      middlewareCommandInfo.targetAggregate = targetAggregate;
    }

    // Pipeline.execute wraps the handler with before/after hooks
    // The handler receives the command info and returns a CommandHandlerResult
    // We need to adapt this to CommandMutationResult
    //
    // Capture globalPosition outside the callback scope so it survives the
    // middleware type translation. The CommandHandlerResult type doesn't have
    // globalPosition, but we need to return it in the final CommandMutationResult.
    let capturedGlobalPosition: number | undefined;

    const pipelineResult = await this.deps.middlewarePipeline.execute(
      middlewareCommandInfo,
      {}, // Empty custom context - can be extended in future
      async () => {
        // Execute the core orchestration flow (skipping idempotency check)
        const coreResult = await this.executeCoreAfterIdempotency(
          ctx,
          config,
          commandArgs as Omit<TArgs, "commandId">,
          commandId,
          chain
        );

        // Adapt CommandMutationResult to CommandHandlerResult for middleware
        // Middleware expects status of "success", "rejected", or "failed"
        if (coreResult.status === "success") {
          // Capture globalPosition for restoration after middleware translation
          capturedGlobalPosition = coreResult.globalPosition;
          // Note: streamId and payload are placeholders for middleware compatibility.
          // Actual values are available in coreResult but middleware hooks don't need them.
          return {
            status: "success" as const,
            data: coreResult.data,
            version: coreResult.version,
            event: {
              eventId: coreResult.eventId,
              eventType: config.commandType,
              streamType: config.boundedContext,
              streamId: "",
              payload: {},
              metadata: { correlationId, causationId: chain.causationId },
            },
          } as CommandHandlerResult<TData>;
        } else if (coreResult.status === "rejected") {
          return {
            status: "rejected" as const,
            code: coreResult.code,
            reason: coreResult.reason,
            context: coreResult.context,
          } as CommandHandlerResult<TData>;
        } else {
          // "failed" status
          return {
            status: "failed" as const,
            reason: coreResult.reason,
            event: {
              eventId: coreResult.eventId,
              eventType: config.commandType,
              streamType: config.boundedContext,
              streamId: "",
              payload: {},
              metadata: { correlationId, causationId: chain.causationId },
            },
          } as CommandHandlerResult<TData>;
        }
      },
      ctx // Pass raw Convex context for middlewares that need it (e.g., rate limiting)
    );

    // Convert pipeline result back to CommandMutationResult
    if (pipelineResult.status === "success") {
      const successResult = pipelineResult as CommandHandlerSuccess<TData>;
      return {
        status: "success" as const,
        data: successResult.data,
        version: successResult.version,
        eventId: successResult.event.eventId,
        globalPosition: capturedGlobalPosition, // Restored from capture
      };
    } else if (pipelineResult.status === "rejected") {
      const rejectedResult = pipelineResult as {
        code: string;
        reason: string;
        context?: UnknownRecord;
      };
      return {
        status: "rejected" as const,
        code: rejectedResult.code,
        reason: rejectedResult.reason,
        // Only include context if defined (exactOptionalPropertyTypes compliance)
        ...(rejectedResult.context ? { context: rejectedResult.context } : {}),
      };
    } else {
      // "failed" status
      return {
        status: "failed" as const,
        reason: (pipelineResult as { reason: string }).reason,
        eventId: toEventId((pipelineResult as { event: { eventId: string } }).event.eventId),
      };
    }
  }

  /**
   * Core execution logic for the dual-write + projection pattern.
   * Called AFTER the idempotency check has passed (command is new, not duplicate).
   * Extracted to support middleware wrapping while maintaining all orchestration steps.
   */
  private async executeCoreAfterIdempotency<
    TArgs extends UnknownRecord,
    THandlerArgs extends UnknownRecord,
    TResult extends CommandHandlerResult<TData>,
    TProjectionArgs extends UnknownRecord,
    TData = unknown,
  >(
    ctx: MutationCtx,
    config: CommandConfig<TArgs, THandlerArgs, TResult, TProjectionArgs, TData>,
    commandArgs: TArgs,
    commandId: CommandId,
    chain: CorrelationChain
  ): Promise<
    | { status: "success"; data: TData; version: number; eventId: EventId; globalPosition: number }
    | { status: "rejected"; code: string; reason: string; context?: UnknownRecord }
    | { status: "failed"; reason: string; eventId: EventId; context?: UnknownRecord }
  > {
    const { correlationId } = chain;

    // Note: Idempotency check was already done in execute() before calling this method

    // 2. Transform args and call component handler
    const handlerArgs = config.toHandlerArgs(commandArgs, commandId, correlationId);

    this.logger.debug("Invoking handler", {
      commandType: config.commandType,
      commandId,
      boundedContext: config.boundedContext,
    });

    // Type assertion explanation:
    // Convex's FunctionReference type system requires exact type matching for function
    // references, but our generic CommandConfig allows any function reference that matches
    // the handler signature. We use type assertion here because:
    //
    // 1. The config.handler is validated at definition time by TypeScript when the
    //    CommandConfig is created - the handler must accept THandlerArgs and return TResult
    // 2. The handlerArgs are constructed by toHandlerArgs which is also type-checked
    //    to ensure it produces the correct THandlerArgs shape
    // 3. This is a known limitation of Convex's type system with dynamic function refs
    //    that require runtime invocation via ctx.runMutation
    //
    // The type safety is preserved through the CommandConfig generic parameters, not
    // at the point of invocation.
    //
    // We use a simpler FunctionReference cast to avoid OptionalRestArgs conditional type
    // issues with generics. The args cast to UnknownRecord is safe because
    // THandlerArgs extends UnknownRecord.
    const result = (await ctx.runMutation(
      config.handler as FunctionReference<"mutation", "internal">,
      handlerArgs as UnknownRecord
    )) as TResult;

    // 3. If rejected, update command status and return
    if (result.status === "rejected") {
      this.logger.info("Command rejected", {
        commandType: config.commandType,
        commandId,
        correlationId,
        code: (result as { code?: string }).code,
        reason: (result as { reason?: string }).reason,
      });
      await this.deps.commandBus.updateCommandResult(ctx, {
        commandId,
        status: "rejected",
        result,
      });
      return result;
    }

    // 3a. If failed (business failure with event), emit event and return
    // This handles cases like ReserveStock failing due to insufficient stock,
    // which should still emit a ReservationFailed event.
    if (result.status === "failed") {
      const failedResult = result as CommandHandlerFailed;

      this.logger.info("Command failed (business failure)", {
        commandType: config.commandType,
        commandId,
        correlationId,
        reason: failedResult.reason,
        eventType: failedResult.event.eventType,
      });

      // Emit the failure event to the event store
      // Use handler-specified expectedVersion, or default to 0 for new streams
      const failedAppendResult = await this.deps.eventStore.appendToStream(ctx, {
        streamType: failedResult.event.streamType,
        streamId: failedResult.event.streamId,
        expectedVersion: failedResult.expectedVersion ?? 0,
        boundedContext: config.boundedContext,
        events: [
          {
            eventId: failedResult.event.eventId,
            eventType: failedResult.event.eventType,
            payload: failedResult.event.payload,
            metadata: failedResult.event.metadata,
          },
        ],
      });

      // 3b. Record command-event correlation for failed events
      if (
        failedAppendResult.status === "success" &&
        this.deps.commandBusComponent?.recordCommandEventCorrelation
      ) {
        await ctx.runMutation(this.deps.commandBusComponent.recordCommandEventCorrelation, {
          commandId,
          eventIds: [failedResult.event.eventId],
          commandType: config.commandType,
          boundedContext: config.boundedContext,
        });
      }

      // Trigger failed projection if configured
      const failedGlobalPosition =
        failedAppendResult.status === "success"
          ? failedAppendResult.globalPositions?.[0]
          : undefined;

      if (config.failedProjection && failedGlobalPosition !== undefined) {
        const failedProjectionArgs = config.failedProjection.toProjectionArgs(
          commandArgs,
          failedResult,
          failedGlobalPosition
        );
        const failedPartition = config.failedProjection.getPartitionKey(commandArgs);

        // Use projection-specific onComplete, fall back to orchestrator default
        const failedOnComplete = config.failedProjection.onComplete ?? this.deps.defaultOnComplete;

        await this.deps.projectionPool.enqueueMutation(
          ctx,
          config.failedProjection.handler,
          failedProjectionArgs,
          {
            ...(failedOnComplete ? { onComplete: failedOnComplete } : {}),
            context: {
              eventId: failedResult.event.eventId,
              projectionName: config.failedProjection.projectionName,
              // Partition key wrapped in structured field (Convex validators reject dynamic keys)
              partition: failedPartition,
              correlationId: chain.correlationId,
              causationId: chain.causationId,
            },
          }
        );
      }

      // Update command as executed (business failure is still an execution)
      await this.deps.commandBus.updateCommandResult(ctx, {
        commandId,
        status: "executed",
        result: { status: "failed", reason: failedResult.reason },
      });

      return {
        status: "failed" as const,
        reason: failedResult.reason,
        eventId: toEventId(failedResult.event.eventId),
      };
    }

    // Cast to success result for type safety
    const successResult = result as CommandHandlerSuccess<TData>;

    // 4. Append event to Event Store
    this.logger.debug("Appending event", {
      commandType: config.commandType,
      commandId,
      eventType: successResult.event.eventType,
      eventId: successResult.event.eventId,
      streamId: successResult.event.streamId,
      version: successResult.version,
    });

    const appendResult = await this.deps.eventStore.appendToStream(ctx, {
      streamType: successResult.event.streamType,
      streamId: successResult.event.streamId,
      expectedVersion: successResult.version - 1, // Previous version
      boundedContext: config.boundedContext,
      events: [
        {
          eventId: successResult.event.eventId,
          eventType: successResult.event.eventType,
          payload: successResult.event.payload,
          metadata: successResult.event.metadata,
        },
      ],
    });

    if (appendResult.status === "conflict") {
      this.logger.warn("Event Store OCC conflict", {
        commandType: config.commandType,
        commandId,
        correlationId,
        eventId: successResult.event.eventId,
        streamId: successResult.event.streamId,
        expectedVersion: successResult.version - 1,
      });
      // OCC conflict handling: CMS updated but Event Store failed
      // The command must be retried - Command Bus idempotency ensures
      // the retry returns the cached result without re-executing the handler.
      await this.deps.commandBus.updateCommandResult(ctx, {
        commandId,
        status: "rejected",
        result: {
          status: "rejected",
          code: "EVENT_STORE_CONFLICT",
          reason: "Event store version conflict",
        },
      });
      return {
        status: "rejected" as const,
        code: "EVENT_STORE_CONFLICT",
        reason: "Event store version conflict",
      };
    }

    // 4a. Record command-event correlation for successful events
    if (this.deps.commandBusComponent?.recordCommandEventCorrelation) {
      await ctx.runMutation(this.deps.commandBusComponent.recordCommandEventCorrelation, {
        commandId,
        eventIds: [successResult.event.eventId],
        commandType: config.commandType,
        boundedContext: config.boundedContext,
      });
    }

    // 5. Trigger projection via Workpool with dead letter support
    this.logger.debug("Event appended successfully", {
      commandType: config.commandType,
      commandId,
      eventId: successResult.event.eventId,
      globalPosition: appendResult.globalPositions?.[0],
    });

    const globalPosition = appendResult.globalPositions?.[0];

    // GlobalPosition must always be defined after a successful Event Store append.
    // If undefined, this indicates a bug in the Event Store component or an unexpected
    // edge case that requires investigation. We fail fast here rather than silently
    // skipping projections, which would cause hard-to-debug inconsistencies.
    if (globalPosition === undefined) {
      throw new Error(
        `Event Store returned undefined globalPosition for event ${successResult.event.eventId}. ` +
          `This indicates a bug in the Event Store append operation. ` +
          `Stream: ${successResult.event.streamType}:${successResult.event.streamId}, ` +
          `Version: ${successResult.version}`
      );
    }

    const projectionArgs = config.projection.toProjectionArgs(
      commandArgs,
      successResult as Extract<TResult, CommandHandlerSuccess<TData>>,
      globalPosition
    );
    const partition = config.projection.getPartitionKey(commandArgs);

    // Use projection-specific onComplete, fall back to orchestrator default
    const onComplete = config.projection.onComplete ?? this.deps.defaultOnComplete;

    await this.deps.projectionPool.enqueueMutation(ctx, config.projection.handler, projectionArgs, {
      // Note: key-based partitioning not yet available in workpool
      // Only include onComplete if defined (exactOptionalPropertyTypes compliance)
      ...(onComplete ? { onComplete } : {}),
      context: {
        eventId: successResult.event.eventId,
        projectionName: config.projection.projectionName,
        // Partition key wrapped in structured field (Convex validators reject dynamic keys)
        partition,
        // Correlation chain for tracing
        correlationId: chain.correlationId,
        causationId: chain.causationId,
      },
    });

    this.logger.debug("Projection triggered", {
      commandType: config.commandType,
      commandId,
      projectionName: config.projection.projectionName,
      partitionKey: partition.value,
    });

    // 5a. Trigger secondary projections in parallel (e.g., cross-context projections)
    //
    // NOTE on batching: We cannot use enqueueMutationBatch here because:
    // 1. Each projection may have a DIFFERENT handler (batch requires same handler)
    // 2. Each projection needs a DIFFERENT context for dead letter tracking
    //    (projectionName, partitionKey differ per projection)
    // 3. @convex-dev/workpool's batch API applies a single options object to all items
    //
    // The WorkpoolClient.enqueueMutationBatch method is available for future use
    // if Workpool adds support for per-item context.
    if (config.secondaryProjections) {
      await Promise.all(
        config.secondaryProjections.map(async (secondary) => {
          const secondaryArgs = secondary.toProjectionArgs(
            commandArgs,
            successResult as Extract<TResult, CommandHandlerSuccess<TData>>,
            globalPosition
          );
          const secondaryPartition = secondary.getPartitionKey(commandArgs);

          // Use secondary-specific onComplete, fall back to orchestrator default
          const secondaryOnComplete = secondary.onComplete ?? this.deps.defaultOnComplete;

          return this.deps.projectionPool.enqueueMutation(ctx, secondary.handler, secondaryArgs, {
            // Only include onComplete if defined (exactOptionalPropertyTypes compliance)
            ...(secondaryOnComplete ? { onComplete: secondaryOnComplete } : {}),
            context: {
              eventId: successResult.event.eventId,
              projectionName: secondary.projectionName,
              // Partition key wrapped in structured field (Convex validators reject dynamic keys)
              partition: secondaryPartition,
              // Correlation chain for tracing
              correlationId: chain.correlationId,
              causationId: chain.causationId,
            },
          });
        })
      );
    }

    // 6. Route to saga if configured (for cross-context coordination)
    // Note: Saga routing is scheduled async via workpool to avoid deep nesting.
    // Convex has a 16-level document depth limit, and synchronous saga routing
    // would exceed it due to nested workflow creation calls.
    if (config.sagaRoute) {
      const eventType = config.sagaRoute.getEventType(commandArgs);
      // Use saga-specific onComplete, fall back to orchestrator default
      const sagaOnComplete = config.sagaRoute.onComplete ?? this.deps.defaultOnComplete;

      await this.deps.projectionPool.enqueueMutation(
        ctx,
        config.sagaRoute.router,
        {
          eventType,
          eventId: successResult.event.eventId,
          streamId: successResult.event.streamId,
          globalPosition,
          payload: successResult.event.payload,
          // Pass correlation chain to saga router for derived chains
          correlationId: chain.correlationId,
        },
        {
          // Only include onComplete if defined (exactOptionalPropertyTypes compliance)
          ...(sagaOnComplete ? { onComplete: sagaOnComplete } : {}),
          context: {
            purpose: "saga-routing",
            eventType,
            streamId: successResult.event.streamId,
            // Correlation chain for tracing
            correlationId: chain.correlationId,
            causationId: chain.causationId,
          },
        }
      );
    }

    // 6a. Publish to EventBus if configured
    // The EventBus provides an alternative publish/subscribe model for event delivery.
    // It can be used alongside or instead of direct projection triggering above.
    if (this.deps.eventBus) {
      await this.deps.eventBus.publish(
        ctx,
        {
          eventId: successResult.event.eventId,
          eventType: successResult.event.eventType,
          streamType: successResult.event.streamType,
          streamId: successResult.event.streamId,
          // TODO: Make category and schemaVersion configurable via CommandConfig
          category: DEFAULT_EVENT_CATEGORY,
          schemaVersion: DEFAULT_SCHEMA_VERSION,
          boundedContext: config.boundedContext,
          globalPosition,
          timestamp: Date.now(),
          payload: successResult.event.payload,
          correlation: {
            correlationId: chain.correlationId,
            causationId: chain.causationId,
          },
        },
        chain
      );
    }

    // 7. Update command status to executed
    await this.deps.commandBus.updateCommandResult(ctx, {
      commandId,
      status: "executed",
      result: {
        status: "success",
        data: successResult.data,
        version: successResult.version,
      },
    });

    this.logger.info("Command completed", {
      commandType: config.commandType,
      commandId,
      correlationId,
      eventId: successResult.event.eventId,
      globalPosition,
      version: successResult.version,
    });

    return {
      status: "success" as const,
      data: successResult.data,
      version: successResult.version,
      eventId: toEventId(successResult.event.eventId),
      globalPosition,
    };
  }
}
