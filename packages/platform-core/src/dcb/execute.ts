/**
 * ## DCB Execution - executeWithDCB Implementation
 *
 * Core execution wrapper for Dynamic Consistency Boundaries.
 *
 * This module implements the `executeWithDCB()` function which:
 * 1. Validates scope key (tenant isolation)
 * 2. Loads all entities in scope
 * 3. Checks scope version (OCC)
 * 4. Calls pure DCB decider with aggregated state
 * 5. Commits scope version
 * 6. Applies state updates atomically
 * 7. Returns events for Event Store
 *
 * @module dcb/execute
 * @since Phase 16
 */

import { isSuccess, isRejected, isFailed } from "@libar-dev/platform-decider";
import type { DeciderContext, DeciderEvent } from "@libar-dev/platform-decider";
import { generateEventId } from "../ids/generator.js";
import type { EventId, StreamId, CorrelationId, CausationId } from "../ids/branded.js";
import type { EventData, EventDataMetadata } from "../orchestration/types.js";
import type { Logger } from "../logging/types.js";
import { validateScopeKey, extractScopeId } from "./scopeKey.js";
import type {
  DCBAggregatedState,
  DCBEntityState,
  ExecuteWithDCBConfig,
  DCBExecutionResult,
  DCBSuccessResult,
  DCBRejectedResult,
  DCBFailedResult,
  DCBConflictResult,
} from "./types.js";
import { DEFAULT_EVENT_CATEGORY } from "../events/category.js";

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Generic mutation context interface.
 * This is the minimum interface required for DCB operations.
 */
interface DCBMutationContext {
  db: {
    query: (table: string) => unknown;
    insert: (table: string, data: unknown) => Promise<unknown>;
    patch: (id: unknown, data: unknown) => Promise<void>;
  };
}

// =============================================================================
// Main Execution Function
// =============================================================================

/**
 * Execute a multi-entity operation within a Dynamic Consistency Boundary.
 *
 * This function orchestrates cross-entity invariant validation using scope-based
 * optimistic concurrency control (OCC). It enables atomic operations across
 * multiple aggregates within a single bounded context.
 *
 * ## Execution Flow
 *
 * 1. **Validate**: Ensure scope key format is correct for tenant isolation
 * 2. **Load Entities**: Retrieve all participating entity states
 * 3. **Build Aggregated State**: Combine entity states for decider input
 * 4. **Execute Decider**: Call pure business logic with aggregated state
 * 5. **Handle Result**: Process success/rejected/failed outcomes
 * 6. **Commit Scope**: Increment scope version for OCC before entity writes
 * 7. **Apply Updates**: Persist state changes only after scope commit succeeds
 *
 * ## OCC Behavior
 *
 * - If `expectedVersion` doesn't match current scope version, returns `conflict`
 * - For new scopes (expectedVersion = 0), creates the scope record
 * - Scope version is incremented before entity writes so conflicts never leave
 *   partial state behind
 *
 * @param ctx - Convex mutation context with scope management functions
 * @param config - DCB execution configuration
 * @returns Execution result (success, rejected, failed, or conflict)
 *
 * @example
 * ```typescript
 * const result = await executeWithDCB(ctx, {
 *   scopeKey: createScopeKey("tenant_1", "reservation", "res_123"),
 *   expectedVersion: 0,
 *   boundedContext: "inventory",
 *   streamType: "Reservation",
 *   schemaVersion: 1,
 *   entities: {
 *     streamIds: ["product_1", "product_2"],
 *     loadEntity: (ctx, streamId) => inventoryRepo.tryLoad(ctx, streamId),
 *   },
 *   decider: reserveMultipleProductsDecider,
 *   command: { orderId: "order_1", items: [...] },
 *   applyUpdate: async (ctx, _id, cms, update, version, now) => {
 *     await ctx.db.patch(_id, { ...update, version, updatedAt: now });
 *   },
 *   commandId: "cmd_123",
 *   correlationId: "corr_456",
 * });
 *
 * if (result.status === "success") {
 *   // Append result.events to Event Store
 * }
 * ```
 *
 * @since Phase 16
 */
export async function executeWithDCB<
  TCtx extends DCBMutationContext,
  TCms,
  TCommand extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
>(
  ctx: TCtx,
  config: ExecuteWithDCBConfig<TCtx, TCms, TCommand, TEvent, TData, TStateUpdate, TId>
): Promise<DCBExecutionResult<TData>> {
  const {
    scopeKey,
    expectedVersion,
    boundedContext,
    streamType,
    schemaVersion,
    eventCategory = DEFAULT_EVENT_CATEGORY,
    scopeOperations,
    entities,
    decider,
    command,
    applyUpdate,
    commandId,
    correlationId,
    logger,
  } = config;

  const log = logger ?? createNoopLogger();

  // =========================================================================
  // Step 1: Validate Scope Key
  // =========================================================================

  const validationError = validateScopeKey(scopeKey);
  if (validationError) {
    log.error("DCB scope key validation failed", {
      scopeKey,
      error: validationError.code,
      message: validationError.message,
    });
    return {
      status: "rejected",
      code: validationError.code,
      reason: validationError.message,
    } satisfies DCBRejectedResult;
  }

  // Extract scopeId for use as streamId in scope-level events
  const scopeId = extractScopeId(scopeKey);

  log.debug("DCB execution starting", {
    scopeKey,
    expectedVersion,
    boundedContext,
    streamType,
    entityCount: entities.streamIds.length,
    hasOCC: !!scopeOperations,
  });

  // =========================================================================
  // Step 2: Verify Scope Version (OCC Pre-Check)
  // =========================================================================

  // If scopeOperations provided, check version BEFORE loading entities
  // This enables early conflict detection and prevents wasted work
  if (scopeOperations) {
    const scope = await scopeOperations.getScope();

    if (scope === null) {
      // Scope doesn't exist yet - only valid if expectedVersion is 0
      if (expectedVersion !== 0) {
        log.info("DCB scope not found but expectedVersion > 0", {
          scopeKey,
          expectedVersion,
        });
        return {
          status: "conflict",
          currentVersion: 0,
        } satisfies DCBConflictResult;
      }
      // New scope with expectedVersion 0 - proceed
    } else {
      // Scope exists - verify version matches
      if (scope.currentVersion !== expectedVersion) {
        log.info("DCB scope version mismatch", {
          scopeKey,
          expectedVersion,
          currentVersion: scope.currentVersion,
        });
        return {
          status: "conflict",
          currentVersion: scope.currentVersion,
        } satisfies DCBConflictResult;
      }
    }

    log.debug("DCB scope version check passed", {
      scopeKey,
      expectedVersion,
    });
  }

  // =========================================================================
  // Step 3: Load All Entities
  // =========================================================================

  const entityStates = new Map<string, DCBEntityState<TCms, TId>>();
  const missingEntities: string[] = [];

  for (const streamId of entities.streamIds) {
    const entityResult = await entities.loadEntity(ctx, streamId);

    if (entityResult === null) {
      missingEntities.push(streamId);
    } else {
      entityStates.set(streamId, {
        streamId,
        cms: entityResult.cms,
        _id: entityResult._id,
      });
    }
  }

  // If any entities are missing, we reject (caller should ensure they exist)
  if (missingEntities.length > 0) {
    log.warn("DCB entities not found", { missingEntities });
    return {
      status: "rejected",
      code: "ENTITIES_NOT_FOUND",
      reason: `Entities not found: ${missingEntities.join(", ")}`,
      context: { missingEntities },
    } satisfies DCBRejectedResult;
  }

  // =========================================================================
  // Step 4: Build Aggregated State
  // =========================================================================

  const aggregatedState: DCBAggregatedState<TCms> = {
    scopeKey,
    scopeVersion: expectedVersion,
    entities: entityStates,
  };

  // =========================================================================
  // Step 5: Create Decider Context
  // =========================================================================

  const now = Date.now();
  const deciderContext: DeciderContext = {
    now,
    commandId,
    correlationId,
  };

  // =========================================================================
  // Step 6: Execute Decider
  // =========================================================================

  const deciderResult = decider(aggregatedState, command, deciderContext);

  log.debug("DCB decider result", { status: deciderResult.status });

  // =========================================================================
  // Step 7: Handle Decider Output
  // =========================================================================

  if (isRejected(deciderResult)) {
    log.info("DCB decider rejected", {
      code: deciderResult.code,
      message: deciderResult.message,
    });
    const rejectedResult: DCBRejectedResult = {
      status: "rejected",
      code: deciderResult.code,
      reason: deciderResult.message,
    };
    if (deciderResult.context !== undefined) {
      rejectedResult.context = deciderResult.context;
    }
    return rejectedResult;
  }

  // For success and failed, we need to build events and apply updates
  const newVersion = expectedVersion + 1;

  // Build common metadata
  const baseMetadata: EventDataMetadata = {
    correlationId: correlationId as CorrelationId,
    causationId: commandId as CausationId,
  };

  if (isFailed(deciderResult)) {
    // Business failure with event - build failure event
    const failureEvent = deciderResult.event;
    const eventData: EventData = {
      eventId: generateEventId(boundedContext) as EventId,
      eventType: failureEvent.eventType,
      streamType,
      streamId: scopeId as StreamId, // Use scopeId as streamId for scope-level events
      scopeKey,
      schemaVersion,
      category: eventCategory,
      payload: failureEvent.payload as Record<string, unknown>,
      metadata: baseMetadata,
    };

    log.info("DCB business failure", {
      reason: deciderResult.reason,
      eventType: failureEvent.eventType,
    });

    const failedResult: DCBFailedResult = {
      status: "failed",
      reason: deciderResult.reason,
      events: [eventData],
    };
    if (deciderResult.context !== undefined) {
      failedResult.context = deciderResult.context;
    }
    return failedResult;
  }

  // =========================================================================
  // Step 8: Validate State Updates and Prepare Scope Commit (Success Path)
  // =========================================================================

  if (isSuccess(deciderResult)) {
    const stateUpdates = deciderResult.stateUpdate;

    const pendingUpdates: Array<{
      streamId: string;
      entityState: DCBEntityState<TCms, TId>;
      update: TStateUpdate;
    }> = [];

    // Track which stream IDs were updated for scope tracking
    const updatedStreamIds: string[] = [];

    // Validate each entity update before any write or scope commit occurs.
    for (const [streamId, update] of stateUpdates.entries()) {
      const entityState = entityStates.get(streamId);
      if (!entityState) {
        log.error("DCB state update references unknown stream", { streamId });
        throw new Error(`Unknown streamId in state update: ${streamId}`);
      }
      pendingUpdates.push({ streamId, entityState, update });
      updatedStreamIds.push(streamId);
    }

    // =========================================================================
    // Step 9: Commit Scope Version (OCC Final Check)
    // =========================================================================

    // Commit scope before entity writes so a returned conflict means nothing was patched.
    if (scopeOperations) {
      const commitResult = await scopeOperations.commitScope(updatedStreamIds);

      if (commitResult.status === "conflict") {
        log.warn("DCB scope commit conflict", {
          scopeKey,
          expectedVersion,
          currentVersion: commitResult.currentVersion,
        });
        return {
          status: "conflict",
          currentVersion: commitResult.currentVersion,
        } satisfies DCBConflictResult;
      }

      log.debug("DCB scope committed", {
        scopeKey,
        newVersion: commitResult.newVersion,
      });
    }

    // =========================================================================
    // Step 10: Apply State Updates
    // =========================================================================

    for (const { streamId, entityState, update } of pendingUpdates) {
      await applyUpdate(ctx, entityState._id, entityState.cms, update, newVersion, now);

      log.debug("DCB entity updated", {
        streamId,
        newVersion,
      });
    }

    // Build success event - single scope-level event for this operation
    const events: EventData[] = [];
    const successEvent = deciderResult.event;

    // Create a single event for the scope-level operation
    const eventData: EventData = {
      eventId: generateEventId(boundedContext) as EventId,
      eventType: successEvent.eventType,
      streamType,
      streamId: scopeId as StreamId,
      scopeKey,
      schemaVersion,
      category: eventCategory,
      payload: successEvent.payload as Record<string, unknown>,
      metadata: baseMetadata,
    };
    events.push(eventData);

    log.info("DCB execution succeeded", {
      scopeKey,
      newVersion,
      eventType: successEvent.eventType,
      updatedEntityCount: stateUpdates.size,
    });

    return {
      status: "success",
      data: deciderResult.data,
      scopeVersion: newVersion,
      events,
    } satisfies DCBSuccessResult<TData>;
  }

  // Should never reach here - all DeciderOutput cases handled
  throw new Error("Unexpected decider output status");
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a no-op logger for when no logger is provided.
 */
function createNoopLogger(): Logger {
  const noop = () => {};
  return {
    debug: noop,
    trace: noop,
    info: noop,
    report: noop,
    warn: noop,
    error: noop,
  };
}
