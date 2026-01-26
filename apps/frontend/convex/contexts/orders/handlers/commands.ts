/**
 * @libar-docs
 * @libar-docs-pattern OrderCommandHandlers
 * @libar-docs-status completed
 * @libar-docs-command
 * @libar-docs-arch-role command-handler
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer application
 * @libar-docs-uses OrderDeciders, OrderRepository
 *
 * Order command handlers implementing the dual-write pattern.
 *
 * CRITICAL: Every handler follows this pattern:
 * 1. Load CMS (O(1), no rehydration)
 * 2. Lazy upcast if needed
 * 3. Validate business invariants
 * 4. Apply business logic
 * 5. Update CMS
 * 6. Return event data for app-level persistence
 *
 * NOTE: Event persistence and projection triggering happen at the app level,
 * not in these handlers. This is because components can't directly access
 * other components - the app layer orchestrates between them.
 *
 * FACTORY PATTERN: Most handlers use decider factories:
 * - createEntityDeciderHandler() for entity creation (CreateOrder)
 * - createDeciderHandler() for modifications (most others)
 *
 * EXCEPTION: SubmitOrder uses a custom handler for Fat Events enrichment.
 * The factory doesn't support pre-decider enrichment, so we manually
 * load customer data before calling the decider.
 *
 * Pattern note: We separate handler creation from mutation export to work around
 * TypeScript portability issues with Convex's type inference.
 */
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  rejectedResult,
  successResult,
  type CommandHandlerResult,
  type EventData,
} from "@libar-dev/platform-core/handlers";
import {
  createDeciderHandler,
  createEntityDeciderHandler,
  isRejected,
  isFailed,
} from "@libar-dev/platform-core/decider";
import {
  generateEventId,
  toStreamId,
  toCorrelationId,
  toCausationId,
} from "@libar-dev/platform-core";
import { createInitialOrderCMS } from "../domain/order.js";
import { orderRepo } from "../repository.js";
import { NotFoundError } from "@libar-dev/platform-core/repository";
import { OrderInvariantError } from "../domain/invariants.js";
import { defaultOrderCommandLogger } from "./_helpers.js";
import { loadCustomerSnapshot } from "../domain/customer.js";
import {
  decideCreateOrder,
  decideAddOrderItem,
  decideRemoveOrderItem,
  decideSubmitOrder,
  decideConfirmOrder,
  decideCancelOrder,
} from "../domain/deciders/index.js";
import type { SubmitOrderData, SubmitOrderContext } from "../domain/deciders/types.js";
import type { UnknownRecord } from "@libar-dev/platform-core";

// Re-export success data types from domain layer (single source of truth)
export type {
  CreateOrderData,
  AddOrderItemData,
  RemoveOrderItemData,
  SubmitOrderData,
  ConfirmOrderData,
  CancelOrderData,
} from "../domain/deciders/types.js";

/**
 * Current event schema version.
 * Increment when event payload structure changes.
 *
 * V1: Original schemas
 * V2: OrderSubmitted enriched with CustomerSnapshot (Fat Events)
 */
export const CURRENT_EVENT_SCHEMA_VERSION = 2;

// =============================================================================
// CREATE ORDER (Entity Creation - Uses createEntityDeciderHandler)
// =============================================================================

/**
 * Create handler using entity creation factory.
 * The factory handles:
 * - tryLoadState returning null for non-existent entities
 * - Passing TState | null to decider
 * - Using insert (not patch) for new entities
 * - Setting version to 1
 */
const createOrderHandler = createEntityDeciderHandler({
  name: "CreateOrder",
  streamType: "Order",
  schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
  decider: decideCreateOrder,
  getEntityId: (args) => args.orderId,
  tryLoadState: async (ctx, entityId) => orderRepo.tryLoad(ctx as MutationCtx, entityId),
  insert: async (ctx, entityId, stateUpdate, commandInput, version, now) => {
    // Build full initial CMS from stateUpdate + commandInput
    const cms = createInitialOrderCMS(entityId, commandInput.customerId);
    await (ctx as MutationCtx).db.insert("orderCMS", {
      ...cms,
      ...stateUpdate,
      version,
      createdAt: now,
      updatedAt: now,
    });
  },
  logger: defaultOrderCommandLogger,
  handleError: (error) => {
    if (error instanceof OrderInvariantError) {
      return rejectedResult(error.code, error.message, error.context);
    }
    throw error;
  },
});

/**
 * Handle CreateOrder command.
 *
 * Uses createEntityDeciderHandler factory with decideCreateOrder for pure domain logic.
 */
export const handleCreateOrder = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, args) => createOrderHandler(ctx, args),
});

// =============================================================================
// FACTORY-BASED HANDLERS
// =============================================================================
// These handlers use createDeciderHandler() to reduce boilerplate by ~70%.
// Each handler is created at module load time, then wrapped in a mutation.
// This separation works around TypeScript portability issues.

/**
 * Base configuration shared by all Order decider handlers.
 *
 * Provides common infrastructure for:
 * - Loading Order CMS state from repository
 * - Applying state updates via db.patch
 * - Handling NotFoundError as rejection
 * - Logging command lifecycle
 *
 * Note: Type casts (`ctx as MutationCtx`, `_id as Id<"orderCMS">`) are required
 * because this config is shared across handlers with different TDeciderInput types,
 * preventing TypeScript from inferring the specific ctx type.
 */
const baseOrderHandlerConfig = {
  streamType: "Order",
  schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
  loadState: async (ctx: unknown, entityId: string) => orderRepo.load(ctx as MutationCtx, entityId),
  applyUpdate: async (
    ctx: unknown,
    _id: unknown,
    _cms: unknown,
    update: unknown,
    version: number,
    now: number
  ) => {
    await (ctx as MutationCtx).db.patch(_id as Id<"orderCMS">, {
      ...(update as object),
      version,
      updatedAt: now,
    });
  },
  logger: defaultOrderCommandLogger,
  handleError: (error: unknown, entityId: string) => {
    if (error instanceof NotFoundError) {
      return rejectedResult("ORDER_NOT_FOUND", (error as NotFoundError).message, {
        orderId: entityId,
      });
    }
    // Handle invariant errors from deciders consistently with createOrderHandler
    if (error instanceof OrderInvariantError) {
      return rejectedResult(error.code, error.message, error.context);
    }
    throw error;
  },
} as const;

// --- AddOrderItem ---

const addOrderItemHandler = createDeciderHandler({
  ...baseOrderHandlerConfig,
  name: "AddOrderItem",
  decider: decideAddOrderItem,
  getEntityId: (args) => args.orderId,
});

/**
 * Handle AddOrderItem command.
 *
 * Uses createDeciderHandler factory with decideAddOrderItem for pure domain logic.
 */
export const handleAddOrderItem = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
    item: v.object({
      productId: v.string(),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    }),
  },
  handler: async (ctx, args) => addOrderItemHandler(ctx, args),
});

// --- RemoveOrderItem ---

const removeOrderItemHandler = createDeciderHandler({
  ...baseOrderHandlerConfig,
  name: "RemoveOrderItem",
  decider: decideRemoveOrderItem,
  getEntityId: (args) => args.orderId,
});

/**
 * Handle RemoveOrderItem command.
 *
 * Uses createDeciderHandler factory with decideRemoveOrderItem for pure domain logic.
 */
export const handleRemoveOrderItem = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
    productId: v.string(),
  },
  handler: async (ctx, args) => removeOrderItemHandler(ctx, args),
});

// --- SubmitOrder ---
// NOTE: Custom handler for Fat Events enrichment (not using factory).
// The decider needs customer data in context, which the factory doesn't support.

/**
 * Custom handler for SubmitOrder with Fat Events enrichment.
 *
 * Unlike other handlers that use createDeciderHandler, this one manually:
 * 1. Loads the order CMS
 * 2. Loads customer snapshot for enrichment
 * 3. Calls the decider with extended context
 * 4. Applies state update and returns event data
 *
 * This pattern keeps the decider pure while enabling pre-decider enrichment.
 */
const submitOrderHandlerWithEnrichment = async (
  ctx: MutationCtx,
  args: { commandId: string; correlationId: string; orderId: string }
): Promise<CommandHandlerResult<SubmitOrderData>> => {
  const { commandId, correlationId, orderId } = args;
  const logger = defaultOrderCommandLogger;

  logger.debug("[SubmitOrder] Starting command", { orderId, commandId, correlationId });

  try {
    // 1. Load order CMS
    const loadResult = await orderRepo.load(ctx, orderId);
    const cms = loadResult.cms;
    const _id = loadResult._id as Id<"orderCMS">;

    // 2. Load customer snapshot for Fat Events enrichment
    // This is synchronous and never fails - returns null fields if missing
    const customerSnapshot = loadCustomerSnapshot(cms.customerId);

    // 3. Build extended context with customer data
    const now = Date.now();
    const context: SubmitOrderContext = {
      now,
      commandId,
      correlationId,
      customerSnapshot,
    };

    // 4. Call decider with enriched context
    const deciderResult = decideSubmitOrder(cms, { orderId }, context);

    // 5. Handle rejection using type-safe pattern
    if (isRejected(deciderResult)) {
      const { code, message, context: rejectedContext } = deciderResult;
      logger.debug("[SubmitOrder] Command rejected", { orderId, code, message });
      return rejectedResult(code, message, rejectedContext);
    }

    // 6. Handle failure (shouldn't happen with current decider)
    // Note: If decideSubmitOrder is modified to return "failed" with a failure event
    // (e.g., OrderSubmissionFailed), this handler must be updated to build the full
    // EventData structure like handleReserveStock does. See inventory/handlers/commands.ts
    // for the pattern (lines 334-363).
    if (isFailed(deciderResult)) {
      logger.error("[SubmitOrder] Unexpected failure from decider", {
        orderId,
        reason: deciderResult.reason,
        eventType: deciderResult.event.eventType,
      });
      throw new Error(
        `SubmitOrder decider returned 'failed' which is not yet supported. ` +
          `If this is intentional, update the handler to build EventData. ` +
          `Reason: ${deciderResult.reason}`
      );
    }

    // 7. At this point, deciderResult must be success - extract with type assertion
    // The type guards have narrowed away rejected and failed cases
    const successfulResult = deciderResult;
    const { data, event, stateUpdate } = successfulResult;

    // 8. Apply state update to CMS
    const newVersion = cms.version + 1;
    await ctx.db.patch(_id, {
      ...stateUpdate,
      version: newVersion,
      updatedAt: now,
    });

    logger.debug("[SubmitOrder] Command succeeded", {
      orderId,
      version: newVersion,
      eventType: event.eventType,
    });

    // 9. Build EventData for app-level persistence
    const eventId = generateEventId("order");
    const eventData: EventData = {
      eventId,
      eventType: event.eventType,
      streamType: "Order",
      streamId: toStreamId(orderId),
      payload: event.payload as unknown as UnknownRecord,
      metadata: {
        correlationId: toCorrelationId(correlationId),
        causationId: toCausationId(commandId),
        schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
      },
    };

    // 10. Return success with event data
    return successResult(data, newVersion, eventData);
  } catch (error) {
    // Handle expected errors consistently with other handlers
    if (error instanceof NotFoundError) {
      logger.debug("[SubmitOrder] Command rejected", {
        orderId,
        code: "ORDER_NOT_FOUND",
        message: error.message,
      });
      return rejectedResult("ORDER_NOT_FOUND", error.message, { orderId });
    }
    if (error instanceof OrderInvariantError) {
      logger.debug("[SubmitOrder] Command rejected", {
        orderId,
        code: error.code,
        message: error.message,
      });
      return rejectedResult(error.code, error.message, error.context);
    }
    // Re-throw unexpected errors
    throw error;
  }
};

/**
 * Handle SubmitOrder command.
 *
 * Custom handler with Fat Events enrichment - loads customer snapshot
 * before calling decider to produce V2 events with customer data.
 */
export const handleSubmitOrder = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
  },
  handler: async (ctx, args) => submitOrderHandlerWithEnrichment(ctx, args),
});

// --- ConfirmOrder ---

const confirmOrderHandler = createDeciderHandler({
  ...baseOrderHandlerConfig,
  name: "ConfirmOrder",
  decider: decideConfirmOrder,
  getEntityId: (args) => args.orderId,
});

/**
 * Handle ConfirmOrder command.
 *
 * Uses createDeciderHandler factory with decideConfirmOrder for pure domain logic.
 */
export const handleConfirmOrder = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
  },
  handler: async (ctx, args) => confirmOrderHandler(ctx, args),
});

// --- CancelOrder ---

const cancelOrderHandler = createDeciderHandler({
  ...baseOrderHandlerConfig,
  name: "CancelOrder",
  decider: decideCancelOrder,
  getEntityId: (args) => args.orderId,
});

/**
 * Handle CancelOrder command.
 *
 * Uses createDeciderHandler factory with decideCancelOrder for pure domain logic.
 */
export const handleCancelOrder = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => cancelOrderHandler(ctx, args),
});
