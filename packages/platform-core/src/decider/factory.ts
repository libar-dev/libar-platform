/**
 * ## createDeciderHandler - Infrastructure Wrapper Factory
 *
 * Reduces handler boilerplate by **~80%** by wrapping pure decider functions
 * with infrastructure concerns (load, persist, enqueue).
 *
 * ### When to Use
 *
 * - Converting pure decider logic to Convex mutation handler
 * - Standardizing handler structure across bounded contexts
 * - **Existing entity** modification commands
 *
 * For **entity creation**, use `createEntityDeciderHandler` instead.
 *
 * ### Orchestration Steps (Automated)
 *
 * | Step | Action | Handled By |
 * |------|--------|------------|
 * | 1 | Load CMS | `loadState` callback |
 * | 2 | Build context | Factory (timestamp, IDs) |
 * | 3 | Call decider | Pure function invocation |
 * | 4 | Transform result | Factory → `CommandHandlerResult` |
 * | 5 | Build EventData | Factory (adds metadata) |
 * | 6 | Apply state update | `applyUpdate` callback |
 * | 7 | Handle errors | `handleError` callback |
 *
 * ### Configuration vs Manual Code
 *
 * | Aspect | Before (Manual) | After (Factory) |
 * |--------|-----------------|-----------------|
 * | Lines of code | ~70 lines | ~15 lines |
 * | Boilerplate | Repeated everywhere | Eliminated |
 * | Error handling | Ad-hoc | Standardized |
 * | Event metadata | Manual | Automatic |
 *
 * ### Relationship to Other Patterns
 *
 * - Wraps **Decider** pure functions
 * - Produces **CommandHandlerResult** for **CommandOrchestrator**
 * - Uses **FSM** validation inside deciders
 *
 * @example
 * ```typescript
 * import { createDeciderHandler } from "@libar-dev/platform-core/decider";
 * import { decideSubmitOrder } from "../domain/deciders/submitOrder.js";
 *
 * const submitOrderHandler = createDeciderHandler({
 *   name: "SubmitOrder",
 *   streamType: "Order",
 *   schemaVersion: 1,
 *   decider: decideSubmitOrder,
 *   getEntityId: (args) => args.orderId,
 *   loadState: async (ctx, entityId) => orderRepo.load(ctx, entityId),
 *   applyUpdate: async (ctx, _id, cms, update, version, now) => {
 *     await ctx.db.patch(_id, { ...update, version, updatedAt: now });
 *   },
 * });
 *
 * // Use in mutation
 * export const handleSubmitOrder = mutation({
 *   args: { commandId: v.string(), correlationId: v.string(), orderId: v.string() },
 *   handler: submitOrderHandler,
 * });
 * ```
 *
 * @module decider/factory
 */

import { generateEventId, toStreamId, toCorrelationId, toCausationId } from "../ids/index.js";
import { successResult, rejectedResult, failedResult } from "../handlers/result.js";
import type { CommandHandlerResult, EventData } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";
import type { Logger } from "../logging/index.js";
// Import decider types from @libar-dev/platform-decider (Layer 0)
import type { DeciderContext, DeciderEvent, DeciderOutput } from "@libar-dev/platform-decider";
import { isSuccess, isRejected, isFailed } from "@libar-dev/platform-decider";

// =============================================================================
// Types
// =============================================================================

/**
 * Result from loading state - includes both state and document ID.
 * The _id can be any type (typically Convex Id<TableName>).
 */
export interface LoadResult<TState, TId = unknown> {
  cms: TState;
  _id: TId;
}

/**
 * Base CMS state type that all CMS must extend.
 * Requires a version field for optimistic concurrency control.
 */
export interface BaseCMSState {
  version: number;
}

/**
 * Base command args that all handlers must include.
 */
export interface BaseCommandArgs {
  commandId: string;
  correlationId: string;
}

/**
 * Configuration for creating a decider-based handler.
 *
 * The type system is designed for TypeScript inference from the decider function:
 * - TDeciderInput is inferred from the decider's command parameter
 * - The handler's full args type is TDeciderInput & BaseCommandArgs
 *
 * @typeParam TCtx - The Convex mutation context type
 * @typeParam TState - The CMS state type (must extend BaseCMSState with version field)
 * @typeParam TDeciderInput - The domain command input type (from decider, excludes commandId/correlationId)
 * @typeParam TEvent - The event type from the decider
 * @typeParam TData - The success data type (must be object)
 * @typeParam TStateUpdate - The state update type from decider
 * @typeParam TId - The document ID type (typically Convex Id<TableName>)
 */
export interface DeciderHandlerConfig<
  TCtx,
  TState extends BaseCMSState,
  TDeciderInput extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
> {
  /**
   * Handler name for logging (e.g., "SubmitOrder").
   */
  name: string;

  /**
   * Stream type for event metadata (e.g., "Order").
   */
  streamType: string;

  /**
   * Current event schema version.
   */
  schemaVersion: number;

  /**
   * Pure decider function.
   * Receives state, domain command input (without commandId/correlationId), and context.
   * The command parameter defines the TDeciderInput type.
   */
  decider: (
    state: TState,
    command: TDeciderInput,
    context: DeciderContext
  ) => DeciderOutput<TEvent, TData, TStateUpdate>;

  /**
   * Extract entity ID from domain command input.
   * Used to load state and build stream ID.
   */
  getEntityId: (args: TDeciderInput) => string;

  /**
   * Load state from repository.
   * Should throw NotFoundError or similar if entity doesn't exist.
   */
  loadState: (ctx: TCtx, entityId: string) => Promise<LoadResult<TState, TId>>;

  /**
   * Apply state update to CMS.
   * Called with document ID, current state, update from decider, new version, and timestamp.
   */
  applyUpdate: (
    ctx: TCtx,
    _id: TId,
    cms: TState,
    update: TStateUpdate,
    version: number,
    timestamp: number
  ) => Promise<void>;

  /**
   * Optional logger for command lifecycle events.
   */
  logger?: Logger;

  /**
   * Optional custom error handler for domain errors.
   * Return a rejected result or rethrow unknown errors.
   */
  handleError?: (error: unknown, entityId: string) => CommandHandlerResult<TData>;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a command handler from a pure decider function.
 *
 * Reduces ~70 lines of handler boilerplate to ~15 lines of configuration.
 *
 * The factory handles:
 * - Loading CMS state from repository
 * - Building DeciderContext with timestamp and IDs
 * - Calling the pure decider function
 * - Transforming DeciderOutput to CommandHandlerResult
 * - Building full EventData with infrastructure metadata
 * - Applying state updates with version increment
 * - Error handling for NotFoundError and domain errors
 *
 * Type inference: The decider's command parameter type (TDeciderInput) is combined
 * with BaseCommandArgs to create the full handler args type.
 *
 * @param config - Handler configuration
 * @returns Async handler function compatible with Convex mutations
 */
export function createDeciderHandler<
  TCtx,
  TState extends BaseCMSState,
  TDeciderInput extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
>(
  config: DeciderHandlerConfig<TCtx, TState, TDeciderInput, TEvent, TData, TStateUpdate, TId>
): (ctx: TCtx, args: TDeciderInput & BaseCommandArgs) => Promise<CommandHandlerResult<TData>> {
  const {
    name,
    streamType,
    schemaVersion,
    decider,
    getEntityId,
    loadState,
    applyUpdate,
    logger,
    handleError,
  } = config;

  return async (
    ctx: TCtx,
    args: TDeciderInput & BaseCommandArgs
  ): Promise<CommandHandlerResult<TData>> => {
    const { commandId, correlationId, ...domainInput } = args;
    // Cast is safe: domainInput is args minus commandId/correlationId = TDeciderInput
    const deciderInput = domainInput as TDeciderInput;
    const entityId = getEntityId(deciderInput);

    // Log start
    logger?.debug(`[${name}] Starting command`, { entityId, commandId, correlationId });

    try {
      // 1. Load state
      const { cms, _id } = await loadState(ctx, entityId);

      // 2. Build context
      const now = Date.now();
      const context: DeciderContext = { now, commandId, correlationId };

      // 3. Call decider with domain input only
      const result = decider(cms, deciderInput, context);

      // 4. Handle result
      if (isSuccess(result)) {
        const { data, event, stateUpdate } = result;

        // Build full EventData - version is guaranteed by TState extends BaseCMSState
        const newVersion = cms.version + 1;

        const eventId = generateEventId(streamType.toLowerCase());
        const eventData: EventData = {
          eventId,
          eventType: event.eventType,
          streamType,
          streamId: toStreamId(entityId),
          // Cast payload to UnknownRecord - safe because EventPayload extends object
          // and concrete payloads are typed interfaces
          payload: event.payload as UnknownRecord,
          metadata: {
            correlationId: toCorrelationId(correlationId),
            causationId: toCausationId(commandId),
            schemaVersion,
          },
        };

        // Apply state update
        await applyUpdate(ctx, _id, cms, stateUpdate, newVersion, now);

        logger?.debug(`[${name}] Command succeeded`, {
          entityId,
          version: newVersion,
          eventType: event.eventType,
        });

        return successResult(
          data as UnknownRecord,
          newVersion,
          eventData
        ) as CommandHandlerResult<TData>;
      }

      if (isRejected(result)) {
        logger?.debug(`[${name}] Command rejected`, {
          entityId,
          code: result.code,
          message: result.message,
        });
        return rejectedResult(result.code, result.message, result.context);
      }

      if (isFailed(result)) {
        // Business failure with event
        const { reason, event, context: failContext } = result;

        // Get version for failed event - version is guaranteed by TState extends BaseCMSState
        const currentVersion = cms.version;

        const eventId = generateEventId(streamType.toLowerCase());
        const eventData: EventData = {
          eventId,
          eventType: event.eventType,
          streamType,
          streamId: toStreamId(entityId),
          // Cast payload to UnknownRecord - safe because EventPayload extends object
          payload: event.payload as UnknownRecord,
          metadata: {
            correlationId: toCorrelationId(correlationId),
            causationId: toCausationId(commandId),
            schemaVersion,
          },
        };

        logger?.debug(`[${name}] Command failed (business)`, {
          entityId,
          reason,
          eventType: event.eventType,
        });

        return failedResult(reason, eventData, currentVersion, failContext);
      }

      // Should never reach here - exhaustive check
      throw new Error(`Unknown decider result status: ${(result as { status: string }).status}`);
    } catch (error) {
      // Try custom error handler first
      if (handleError) {
        const handledResult = handleError(error, entityId);
        if (handledResult) {
          return handledResult;
        }
      }

      // Log and rethrow
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      logger?.error(`[${name}] Command error`, { entityId, error, errorType });
      throw error;
    }
  };
}

// =============================================================================
// Entity Creation Factory
// =============================================================================

/**
 * Configuration for creating a handler that creates new entities.
 *
 * Unlike DeciderHandlerConfig, this factory:
 * - Uses `tryLoadState` which returns null if entity doesn't exist (vs throwing)
 * - Passes `TState | null` to the decider (null means entity doesn't exist)
 * - Uses `insert` for creating new entities (vs `applyUpdate` for modifications)
 *
 * This pattern is appropriate for commands like CreateOrder, CreateProduct, etc.
 * where the entity may not exist yet.
 *
 * @typeParam TCtx - The Convex mutation context type
 * @typeParam TState - The CMS state type (must extend BaseCMSState with version field)
 * @typeParam TDeciderInput - The domain command input type (from decider, excludes commandId/correlationId)
 * @typeParam TEvent - The event type from the decider
 * @typeParam TData - The success data type (must be object)
 * @typeParam TStateUpdate - The state update type from decider
 * @typeParam TId - The document ID type (typically Convex Id<TableName>)
 */
export interface EntityDeciderHandlerConfig<
  TCtx,
  TState extends BaseCMSState,
  TDeciderInput extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
> {
  /**
   * Handler name for logging (e.g., "CreateOrder").
   */
  name: string;

  /**
   * Stream type for event metadata (e.g., "Order").
   */
  streamType: string;

  /**
   * Current event schema version.
   */
  schemaVersion: number;

  /**
   * Pure decider function.
   * Receives state (null if entity doesn't exist), domain command input, and context.
   * The decider should reject if entity already exists (for create commands).
   */
  decider: (
    state: TState | null,
    command: TDeciderInput,
    context: DeciderContext
  ) => DeciderOutput<TEvent, TData, TStateUpdate>;

  /**
   * Extract entity ID from domain command input.
   * Used to try loading state and build stream ID.
   */
  getEntityId: (args: TDeciderInput) => string;

  /**
   * Try to load state from repository.
   * Returns LoadResult if entity exists, null if it doesn't.
   * Should NOT throw NotFoundError - return null instead.
   */
  tryLoadState: (ctx: TCtx, entityId: string) => Promise<LoadResult<TState, TId> | null>;

  /**
   * Insert new entity into CMS.
   * Called when entity doesn't exist and decider succeeds.
   * The full state is built from the stateUpdate and command input.
   *
   * @param ctx - Convex mutation context
   * @param entityId - Entity identifier
   * @param stateUpdate - State from decider (partial initial state)
   * @param commandInput - Original command input (for additional fields like customerId)
   * @param version - Version number (always 1 for new entities)
   * @param timestamp - Current timestamp
   */
  insert: (
    ctx: TCtx,
    entityId: string,
    stateUpdate: TStateUpdate,
    commandInput: TDeciderInput,
    version: number,
    timestamp: number
  ) => Promise<void>;

  /**
   * Optional logger for command lifecycle events.
   */
  logger?: Logger;

  /**
   * Optional custom error handler for domain errors.
   * Return a rejected result or rethrow unknown errors.
   */
  handleError?: (error: unknown, entityId: string) => CommandHandlerResult<TData>;

  /**
   * Optional pre-validation before loading state and calling decider.
   * Use for cross-entity checks that require database queries (e.g., SKU uniqueness).
   *
   * @param ctx - Convex mutation context
   * @param args - Domain command input
   * @returns undefined to continue with decider, or CommandHandlerResult to short-circuit
   *
   * @example
   * ```typescript
   * preValidate: async (ctx, args) => {
   *   const existingSku = await ctx.db
   *     .query("inventoryCMS")
   *     .withIndex("by_sku", (q) => q.eq("sku", args.sku))
   *     .first();
   *   if (existingSku) {
   *     return rejectedResult("SKU_ALREADY_EXISTS", `SKU "${args.sku}" already exists`);
   *   }
   *   return undefined; // Continue with decider
   * },
   * ```
   */
  preValidate?: (
    ctx: TCtx,
    args: TDeciderInput
  ) => Promise<CommandHandlerResult<TData> | undefined>;
}

/**
 * Create a command handler for entity creation from a pure decider function.
 *
 * This factory is specifically designed for commands that create new entities.
 * Unlike `createDeciderHandler`, this factory:
 * - Uses `tryLoadState` which returns null for non-existent entities
 * - Passes `TState | null` to the decider
 * - Uses `insert` (not patch) for new entities
 * - Sets version to 1 for new entities
 *
 * @example
 * ```typescript
 * import { createEntityDeciderHandler } from "@libar-dev/platform-core/decider";
 * import { decideCreateOrder } from "../domain/deciders/createOrder.js";
 *
 * const createOrderHandler = createEntityDeciderHandler({
 *   name: "CreateOrder",
 *   streamType: "Order",
 *   schemaVersion: 1,
 *   decider: decideCreateOrder,
 *   getEntityId: (args) => args.orderId,
 *   tryLoadState: async (ctx, entityId) => orderRepo.tryLoad(ctx, entityId),
 *   insert: async (ctx, entityId, stateUpdate, commandInput, version, now) => {
 *     await ctx.db.insert("orderCMS", {
 *       orderId: entityId,
 *       customerId: commandInput.customerId,  // Access command input for additional fields
 *       ...stateUpdate,
 *       version,
 *       createdAt: now,
 *       updatedAt: now,
 *     });
 *   },
 * });
 *
 * export const handleCreateOrder = mutation({
 *   args: { commandId: v.string(), correlationId: v.string(), orderId: v.string(), customerId: v.string() },
 *   handler: async (ctx, args) => createOrderHandler(ctx, args),
 * });
 * ```
 *
 * @param config - Handler configuration
 * @returns Async handler function compatible with Convex mutations
 */
export function createEntityDeciderHandler<
  TCtx,
  TState extends BaseCMSState,
  TDeciderInput extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
>(
  config: EntityDeciderHandlerConfig<TCtx, TState, TDeciderInput, TEvent, TData, TStateUpdate, TId>
): (ctx: TCtx, args: TDeciderInput & BaseCommandArgs) => Promise<CommandHandlerResult<TData>> {
  const {
    name,
    streamType,
    schemaVersion,
    decider,
    getEntityId,
    tryLoadState,
    insert,
    logger,
    handleError,
    preValidate,
  } = config;

  return async (
    ctx: TCtx,
    args: TDeciderInput & BaseCommandArgs
  ): Promise<CommandHandlerResult<TData>> => {
    const { commandId, correlationId, ...domainInput } = args;
    // Cast is safe: domainInput is args minus commandId/correlationId = TDeciderInput
    const deciderInput = domainInput as TDeciderInput;
    const entityId = getEntityId(deciderInput);

    // Log start
    logger?.debug(`[${name}] Starting command`, { entityId, commandId, correlationId });

    try {
      // 0. Run pre-validation if provided (e.g., SKU uniqueness check)
      if (preValidate) {
        const preResult = await preValidate(ctx, deciderInput);
        if (preResult) {
          logger?.debug(`[${name}] Pre-validation failed`, { entityId });
          return preResult; // Short-circuit on rejection
        }
      }

      // 1. Try to load state (returns null if entity doesn't exist)
      const loadResult = await tryLoadState(ctx, entityId);
      const state: TState | null = loadResult?.cms ?? null;

      // 2. Build context
      const now = Date.now();
      const context: DeciderContext = { now, commandId, correlationId };

      // 3. Call decider with state (may be null for creation)
      const result = decider(state, deciderInput, context);

      // 4. Handle result
      if (isSuccess(result)) {
        const { data, event, stateUpdate } = result;

        // For entity creation, version is always 1
        const newVersion = 1;

        const eventId = generateEventId(streamType.toLowerCase());
        const eventData: EventData = {
          eventId,
          eventType: event.eventType,
          streamType,
          streamId: toStreamId(entityId),
          payload: event.payload as UnknownRecord,
          metadata: {
            correlationId: toCorrelationId(correlationId),
            causationId: toCausationId(commandId),
            schemaVersion,
          },
        };

        // Insert new entity
        await insert(ctx, entityId, stateUpdate, deciderInput, newVersion, now);

        logger?.debug(`[${name}] Command succeeded`, {
          entityId,
          version: newVersion,
          eventType: event.eventType,
        });

        return successResult(
          data as UnknownRecord,
          newVersion,
          eventData
        ) as CommandHandlerResult<TData>;
      }

      if (isRejected(result)) {
        logger?.debug(`[${name}] Command rejected`, {
          entityId,
          code: result.code,
          message: result.message,
        });
        return rejectedResult(result.code, result.message, result.context);
      }

      if (isFailed(result)) {
        // Business failure with event (less common for creation commands)
        const { reason, event, context: failContext } = result;

        // For failed creation, use version 0 (entity doesn't exist)
        const currentVersion = 0;

        const eventId = generateEventId(streamType.toLowerCase());
        const eventData: EventData = {
          eventId,
          eventType: event.eventType,
          streamType,
          streamId: toStreamId(entityId),
          payload: event.payload as UnknownRecord,
          metadata: {
            correlationId: toCorrelationId(correlationId),
            causationId: toCausationId(commandId),
            schemaVersion,
          },
        };

        logger?.debug(`[${name}] Command failed (business)`, {
          entityId,
          reason,
          eventType: event.eventType,
        });

        return failedResult(reason, eventData, currentVersion, failContext);
      }

      // Should never reach here - exhaustive check
      throw new Error(`Unknown decider result status: ${(result as { status: string }).status}`);
    } catch (error) {
      // Try custom error handler first
      if (handleError) {
        const handledResult = handleError(error, entityId);
        if (handledResult) {
          return handledResult;
        }
      }

      // Log and rethrow
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      logger?.error(`[${name}] Command error`, { entityId, error, errorType });
      throw error;
    }
  };
}
