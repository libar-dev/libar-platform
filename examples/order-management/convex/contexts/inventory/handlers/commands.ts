/**
 * @libar-docs
 * @libar-docs-pattern InventoryCommandHandlers
 * @libar-docs-status completed
 * @libar-docs-command
 * @libar-docs-arch-role command-handler
 * @libar-docs-arch-context inventory
 * @libar-docs-arch-layer application
 * @libar-docs-uses InventoryDeciders, InventoryRepository
 *
 * Inventory command handlers implementing the dual-write pattern.
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
 * FACTORY PATTERN: Handlers use decider factories where appropriate:
 * - createEntityDeciderHandler() for entity creation (CreateProduct)
 * - createDeciderHandler() for simple modifications (AddStock, ConfirmReservation)
 * - Hybrid pattern for multi-entity commands (ReserveStock, Release, Expire)
 */
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  generateEventId,
  generateId,
  toStreamId,
  toCorrelationId,
  toCausationId,
  type EventData,
  type UnknownRecord,
} from "@libar-dev/platform-core";
import { successResult, rejectedResult } from "@libar-dev/platform-core/handlers";
import { createDeciderHandler, createEntityDeciderHandler } from "@libar-dev/platform-core/decider";
import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";
import { NotFoundError } from "@libar-dev/platform-core/repository";
import { inventoryRepo, reservationRepo } from "../repository.js";
import { createInitialInventoryCMS } from "../domain/inventory.js";
import { type ReservationItem, createInitialReservationCMS } from "../domain/reservation.js";
import { InventoryInvariantError, InventoryErrorCodes } from "../domain/invariants.js";
import {
  defaultInventoryCommandLogger,
  logCommandStart,
  logCommandSuccess,
  logCommandRejected,
  logCommandFailed,
  logCommandError,
} from "./_helpers.js";
import {
  decideCreateProduct,
  decideAddStock,
  decideConfirmReservation,
  decideReserveStock,
  decideReleaseReservation,
  decideExpireReservation,
  reserveMultipleDCBDecider,
} from "../domain/deciders/index.js";
import type {
  StockReservedPayload,
  ReservationFailedPayload,
  ReservationReleasedPayload,
  ReservationExpiredPayload,
  ReserveStockData,
  ReleaseReservationData,
  ExpireReservationData,
} from "../domain/deciders/types.js";

// Re-export success data types from domain layer (single source of truth)
export type {
  CreateProductData,
  AddStockData,
  ReserveStockData,
  ConfirmReservationData,
  ReleaseReservationData,
  ExpireReservationData,
} from "../domain/deciders/types.js";

/**
 * Current event schema version.
 * Increment when event payload structure changes.
 */
export const CURRENT_EVENT_SCHEMA_VERSION = 1;

// =============================================================================
// FACTORY-BASED HANDLER CONFIGURATIONS
// =============================================================================

/**
 * Base configuration shared by all Inventory decider handlers.
 *
 * Provides common infrastructure for:
 * - Loading Inventory CMS state from repository
 * - Applying state updates via db.patch
 * - Handling NotFoundError as rejection
 * - Logging command lifecycle
 */
const baseInventoryHandlerConfig = {
  streamType: "Inventory",
  schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
  loadState: async (ctx: unknown, entityId: string) =>
    inventoryRepo.load(ctx as MutationCtx, entityId),
  applyUpdate: async (
    ctx: unknown,
    _id: unknown,
    _cms: unknown,
    update: unknown,
    version: number,
    now: number
  ) => {
    await (ctx as MutationCtx).db.patch(_id as Id<"inventoryCMS">, {
      ...(update as object),
      version,
      updatedAt: now,
    });
  },
  logger: defaultInventoryCommandLogger,
  handleError: (error: unknown, entityId: string) => {
    if (error instanceof NotFoundError) {
      return rejectedResult("PRODUCT_NOT_FOUND", (error as NotFoundError).message, {
        productId: entityId,
      });
    }
    throw error;
  },
} as const;

/**
 * Base configuration shared by all Reservation decider handlers.
 */
const baseReservationHandlerConfig = {
  streamType: "Reservation",
  schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
  loadState: async (ctx: unknown, entityId: string) =>
    reservationRepo.load(ctx as MutationCtx, entityId),
  applyUpdate: async (
    ctx: unknown,
    _id: unknown,
    _cms: unknown,
    update: unknown,
    version: number,
    now: number
  ) => {
    await (ctx as MutationCtx).db.patch(_id as Id<"reservationCMS">, {
      ...(update as object),
      version,
      updatedAt: now,
    });
  },
  logger: defaultInventoryCommandLogger,
  handleError: (error: unknown, entityId: string) => {
    if (error instanceof NotFoundError) {
      return rejectedResult("RESERVATION_NOT_FOUND", (error as NotFoundError).message, {
        reservationId: entityId,
      });
    }
    throw error;
  },
} as const;

// =============================================================================
// Product Handlers
// =============================================================================

/**
 * CreateProduct handler using entity creation factory.
 *
 * The factory handles:
 * - tryLoadState returning null for non-existent entities
 * - Passing TState | null to decider
 * - Using insert (not patch) for new entities
 * - Setting version to 1
 *
 * SKU uniqueness is validated via preValidate hook (requires database query).
 */
const createProductHandler = createEntityDeciderHandler({
  name: "CreateProduct",
  streamType: "Inventory",
  schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
  decider: decideCreateProduct,
  getEntityId: (args) => args.productId,
  tryLoadState: async (ctx, entityId) => inventoryRepo.tryLoad(ctx as MutationCtx, entityId),
  insert: async (ctx, entityId, stateUpdate, commandInput, version, now) => {
    // Build full initial CMS from stateUpdate + commandInput
    const cms = createInitialInventoryCMS(
      entityId,
      commandInput.productName,
      commandInput.sku,
      commandInput.unitPrice
    );
    await (ctx as MutationCtx).db.insert("inventoryCMS", {
      ...cms,
      ...stateUpdate,
      version,
      createdAt: now,
      updatedAt: now,
    });
  },
  preValidate: async (ctx, args) => {
    // Check SKU uniqueness (requires database query, so done in preValidate)
    const existingSku = await (ctx as MutationCtx).db
      .query("inventoryCMS")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
    if (existingSku) {
      return rejectedResult(
        InventoryErrorCodes.SKU_ALREADY_EXISTS,
        `SKU "${args.sku}" is already in use`,
        { sku: args.sku }
      );
    }
    return undefined; // Continue with decider
  },
  logger: defaultInventoryCommandLogger,
  handleError: (error) => {
    if (error instanceof InventoryInvariantError) {
      return rejectedResult(error.code, error.message, error.context);
    }
    throw error;
  },
});

/**
 * Handle CreateProduct command.
 *
 * Uses createEntityDeciderHandler factory with decideCreateProduct for pure domain logic.
 */
export const handleCreateProduct = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
  },
  handler: async (ctx, args) => createProductHandler(ctx, args),
});

// --- AddStock ---

const addStockHandler = createDeciderHandler({
  ...baseInventoryHandlerConfig,
  name: "AddStock",
  decider: decideAddStock,
  getEntityId: (args) => args.productId,
});

/**
 * Handle AddStock command.
 *
 * Uses createDeciderHandler factory with decideAddStock for pure domain logic.
 */
export const handleAddStock = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    productId: v.string(),
    quantity: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => addStockHandler(ctx, args),
});

// =============================================================================
// Reservation Handlers
// =============================================================================

/**
 * Handle ReserveStock command.
 *
 * HYBRID PATTERN: Handler coordinates multi-entity I/O, decider handles pure validation.
 * All-or-nothing: Either all items are reserved or none.
 */
export const handleReserveStock = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { orderId, items, commandId, correlationId } = args;
    const logger = defaultInventoryCommandLogger;
    const logContext = { commandType: "ReserveStock", orderId, commandId, correlationId };

    logCommandStart(logger, logContext);

    try {
      // 1. Load all products (handler coordinates multi-entity loading)
      type ProductLoadResult = NonNullable<Awaited<ReturnType<typeof inventoryRepo.tryLoad>>>;
      const productLoadMap = new Map<string, ProductLoadResult>();
      const productCMSMap = new Map<
        string,
        NonNullable<Awaited<ReturnType<typeof inventoryRepo.tryLoad>>>["cms"]
      >();

      for (const item of items) {
        const result = await inventoryRepo.tryLoad(ctx, item.productId);
        if (result) {
          productLoadMap.set(item.productId, result);
          productCMSMap.set(item.productId, result.cms);
        }
        // Non-existent products will be handled by decider (0 stock)
      }

      // 2. Generate reservationId before calling decider (ensures decider purity)
      const reservationId = generateId("inventory", "reservation");
      const now = Date.now();

      // 3. Call pure decider for validation and decision
      const deciderContext = { now, commandId, correlationId };
      const decision = decideReserveStock(
        productCMSMap,
        { orderId, items: items as ReservationItem[], reservationId },
        deciderContext
      );

      // 4. Handle decision outcome
      if (decision.status === "rejected") {
        // Input validation failed (e.g., empty items)
        logCommandRejected(logger, logContext, {
          code: decision.code,
          message: decision.message,
        });
        return rejectedResult(decision.code, decision.message, decision.context);
      }

      if (decision.status === "failed") {
        // Business failure (insufficient stock) - emit ReservationFailed event
        // Type assertion: we know this is ReservationFailedPayload when status is "failed"
        const failedPayload = decision.event.payload as ReservationFailedPayload;
        const eventId = generateEventId("inventory");
        const event: EventData = {
          eventId,
          eventType: decision.event.eventType,
          streamType: "Reservation",
          // ReservationFailed uses orderId as streamId because no reservation entity is created.
          // This allows correlation with the order that requested the reservation.
          streamId: toStreamId(orderId),
          payload: failedPayload as unknown as UnknownRecord,
          metadata: {
            correlationId: toCorrelationId(correlationId),
            causationId: toCausationId(commandId),
            schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
          },
        };

        logCommandFailed(logger, logContext, {
          eventType: "ReservationFailed",
          reason: failedPayload.reason,
        });
        return {
          status: "failed" as const,
          reason: failedPayload.reason,
          event,
          context: { failedItems: failedPayload.failedItems },
        };
      }

      // 5. Success - coordinate multi-entity updates (handler responsibility)
      // Type assertion: after checking rejected and failed, we know it's success
      const successDecision = decision as {
        status: "success";
        event: { eventType: "StockReserved"; payload: StockReservedPayload };
        data: ReserveStockData;
        stateUpdate: undefined;
      };

      // Update each product's available/reserved quantities
      for (const item of items) {
        const productResult = productLoadMap.get(item.productId);
        // SAFETY: Within a single Convex mutation, this is safe due to serializable
        // isolation. Products validated earlier cannot be deleted by another
        // transaction mid-execution - we see a consistent snapshot.
        if (!productResult) continue;

        const { cms, _id } = productResult;
        await ctx.db.patch(_id as Id<"inventoryCMS">, {
          availableQuantity: cms.availableQuantity - item.quantity,
          reservedQuantity: cms.reservedQuantity + item.quantity,
          version: cms.version + 1,
          updatedAt: now,
        });
      }

      // 6. Create reservation CMS
      const reservationCMS = createInitialReservationCMS(
        reservationId,
        orderId,
        items as ReservationItem[]
      );
      await ctx.db.insert("reservationCMS", {
        ...reservationCMS,
        version: 1,
      });

      // 7. Build event data for app-level persistence
      const eventId = generateEventId("inventory");
      const event: EventData = {
        eventId,
        eventType: successDecision.event.eventType,
        streamType: "Reservation",
        // StockReserved uses reservationId as streamId because a reservation entity IS created.
        // Contrast with ReservationFailed above which uses orderId.
        streamId: toStreamId(reservationId),
        payload: successDecision.event.payload as unknown as UnknownRecord,
        metadata: {
          correlationId: toCorrelationId(correlationId),
          causationId: toCausationId(commandId),
          schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
        },
      };

      // 8. Return success result
      logCommandSuccess(
        logger,
        { ...logContext, reservationId },
        { version: 1, eventType: "StockReserved" }
      );
      return successResult(successDecision.data, 1, event);
    } catch (error) {
      if (error instanceof InventoryInvariantError) {
        logCommandRejected(logger, logContext, { code: error.code, message: error.message });
        return rejectedResult(error.code, error.message, error.context);
      }
      logCommandError(logger, logContext, error);
      throw error;
    }
  },
});

// --- ConfirmReservation ---

const confirmReservationHandler = createDeciderHandler({
  ...baseReservationHandlerConfig,
  name: "ConfirmReservation",
  decider: decideConfirmReservation,
  getEntityId: (args) => args.reservationId,
});

/**
 * Handle ConfirmReservation command.
 *
 * Makes a reservation permanent (stock permanently allocated).
 * Uses createDeciderHandler factory with decideConfirmReservation for pure domain logic.
 */
export const handleConfirmReservation = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    reservationId: v.string(),
  },
  handler: async (ctx, args) => confirmReservationHandler(ctx, args),
});

/**
 * Handle ReleaseReservation command.
 *
 * HYBRID PATTERN: Handler coordinates multi-entity I/O, decider handles pure validation.
 * Returns reserved stock to available (compensation).
 */
export const handleReleaseReservation = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    reservationId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { reservationId, reason, commandId, correlationId } = args;
    const logger = defaultInventoryCommandLogger;
    const logContext = {
      commandType: "ReleaseReservation",
      reservationId,
      orderId: "",
      commandId,
      correlationId,
    };

    logCommandStart(logger, logContext);

    try {
      // 1. Load reservation CMS (throws NotFoundError if missing, auto-upcasts)
      const { cms, _id: reservationDocId } = await reservationRepo.load(ctx, reservationId);
      logContext.orderId = cms.orderId;
      const now = Date.now();

      // 2. Call pure decider for validation and decision
      const deciderContext = { now, commandId, correlationId };
      const decision = decideReleaseReservation(cms, { reservationId, reason }, deciderContext);

      // 3. Handle rejection (validation failed)
      if (decision.status === "rejected") {
        logCommandRejected(logger, logContext, {
          code: decision.code,
          message: decision.message,
        });
        return rejectedResult(decision.code, decision.message, decision.context);
      }

      // 4. Success - coordinate multi-entity stock returns (handler responsibility)
      // Type assertion: decideReleaseReservation only returns rejected or success
      const successDecision = decision as {
        status: "success";
        event: { eventType: "ReservationReleased"; payload: ReservationReleasedPayload };
        data: ReleaseReservationData;
        stateUpdate: { status: "released" };
      };

      for (const item of cms.items) {
        const productResult = await inventoryRepo.tryLoad(ctx, item.productId);

        // Product may no longer exist (e.g., deleted after reservation) - skip gracefully
        if (productResult) {
          const { cms: product, _id: productDocId } = productResult;
          await ctx.db.patch(productDocId as Id<"inventoryCMS">, {
            availableQuantity: product.availableQuantity + item.quantity,
            reservedQuantity: Math.max(0, product.reservedQuantity - item.quantity),
            version: product.version + 1,
            updatedAt: now,
          });
        }
      }

      // 5. Build event data from decider output
      const eventId = generateEventId("inventory");
      const event: EventData = {
        eventId,
        eventType: successDecision.event.eventType,
        streamType: "Reservation",
        streamId: toStreamId(reservationId),
        payload: successDecision.event.payload as unknown as UnknownRecord,
        metadata: {
          correlationId: toCorrelationId(correlationId),
          causationId: toCausationId(commandId),
          schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
        },
      };

      // 6. Update reservation CMS
      const newVersion = cms.version + 1;
      await ctx.db.patch(reservationDocId as Id<"reservationCMS">, {
        ...successDecision.stateUpdate,
        version: newVersion,
        updatedAt: now,
      });

      // 7. Return result
      logCommandSuccess(logger, logContext, {
        version: newVersion,
        eventType: "ReservationReleased",
      });
      return successResult(successDecision.data, newVersion, event);
    } catch (error) {
      if (error instanceof InventoryInvariantError) {
        logCommandRejected(logger, logContext, { code: error.code, message: error.message });
        return rejectedResult(error.code, error.message, error.context);
      }
      if (error instanceof NotFoundError) {
        logCommandRejected(logger, logContext, {
          code: InventoryErrorCodes.RESERVATION_NOT_FOUND,
          message: error.message,
        });
        return rejectedResult(InventoryErrorCodes.RESERVATION_NOT_FOUND, error.message, {
          reservationId,
        });
      }
      logCommandError(logger, logContext, error);
      throw error;
    }
  },
});

/**
 * Handle ExpireReservation command (internal - used by cron).
 *
 * HYBRID PATTERN: Handler coordinates multi-entity I/O, decider handles pure validation.
 * Expires a reservation and returns stock to available.
 */
export const handleExpireReservation = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { reservationId, commandId, correlationId } = args;
    const logger = defaultInventoryCommandLogger;
    const logContext = {
      commandType: "ExpireReservation",
      reservationId,
      orderId: "",
      commandId,
      correlationId,
    };

    logCommandStart(logger, logContext);

    try {
      // 1. Load reservation CMS (throws NotFoundError if missing, auto-upcasts)
      const { cms, _id: reservationDocId } = await reservationRepo.load(ctx, reservationId);
      logContext.orderId = cms.orderId;
      const now = Date.now();

      // 2. Call pure decider for validation and decision
      const deciderContext = { now, commandId, correlationId };
      const decision = decideExpireReservation(cms, { reservationId }, deciderContext);

      // 3. Handle rejection (validation failed)
      if (decision.status === "rejected") {
        logCommandRejected(logger, logContext, {
          code: decision.code,
          message: decision.message,
        });
        return rejectedResult(decision.code, decision.message, decision.context);
      }

      // 4. Success - coordinate multi-entity stock returns (handler responsibility)
      // Type assertion: decideExpireReservation only returns rejected or success
      const successDecision = decision as {
        status: "success";
        event: { eventType: "ReservationExpired"; payload: ReservationExpiredPayload };
        data: ExpireReservationData;
        stateUpdate: { status: "expired" };
      };

      for (const item of cms.items) {
        const productResult = await inventoryRepo.tryLoad(ctx, item.productId);

        if (productResult) {
          const { cms: product, _id: productDocId } = productResult;
          await ctx.db.patch(productDocId as Id<"inventoryCMS">, {
            availableQuantity: product.availableQuantity + item.quantity,
            reservedQuantity: Math.max(0, product.reservedQuantity - item.quantity),
            version: product.version + 1,
            updatedAt: now,
          });
        }
      }

      // 5. Build event data from decider output
      const eventId = generateEventId("inventory");
      const event: EventData = {
        eventId,
        eventType: successDecision.event.eventType,
        streamType: "Reservation",
        streamId: toStreamId(reservationId),
        payload: successDecision.event.payload as unknown as UnknownRecord,
        metadata: {
          correlationId: toCorrelationId(correlationId),
          causationId: toCausationId(commandId),
          schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
        },
      };

      // 6. Update reservation CMS
      const newVersion = cms.version + 1;
      await ctx.db.patch(reservationDocId as Id<"reservationCMS">, {
        ...successDecision.stateUpdate,
        version: newVersion,
        updatedAt: now,
      });

      // 7. Return result
      logCommandSuccess(logger, logContext, {
        version: newVersion,
        eventType: "ReservationExpired",
      });
      return successResult(successDecision.data, newVersion, event);
    } catch (error) {
      if (error instanceof InventoryInvariantError) {
        logCommandRejected(logger, logContext, { code: error.code, message: error.message });
        return rejectedResult(error.code, error.message, error.context);
      }
      if (error instanceof NotFoundError) {
        logCommandRejected(logger, logContext, {
          code: InventoryErrorCodes.RESERVATION_NOT_FOUND,
          message: error.message,
        });
        return rejectedResult(InventoryErrorCodes.RESERVATION_NOT_FOUND, error.message, {
          reservationId,
        });
      }
      logCommandError(logger, logContext, error);
      throw error;
    }
  },
});

// =============================================================================
// DCB Multi-Product Reservation Handler (Phase 16 DCB Pattern Demo)
// =============================================================================

/**
 * Handle ReserveStockDCB command using Dynamic Consistency Boundaries.
 *
 * Demonstrates the DCB pattern from Phase 16 - atomic multi-product reservation
 * with cross-entity invariant validation via `executeWithDCB`.
 *
 * ## Key Differences from Hybrid `handleReserveStock`
 *
 * | Aspect | Hybrid | DCB |
 * |--------|--------|-----|
 * | Entity loading | Handler loops and loads | `executeWithDCB` loads via callback |
 * | Invariant validation | Decider receives pre-loaded Map | Decider receives `DCBAggregatedState` |
 * | State updates | Handler coordinates patches | DCB applies via `applyUpdate` callback |
 * | Atomicity | Handler-managed (partial failure risk) | Built-in all-or-nothing |
 *
 * ## Result Types
 *
 * Returns `DCBExecutionResult` which can be:
 * - `success`: All products reserved, event emitted
 * - `rejected`: Validation failed (e.g., missing products)
 * - `failed`: Business rule violation (insufficient stock), failure event emitted
 * - `conflict`: OCC conflict (if scopeOperations enabled)
 *
 * @since Phase 23 (Example App Modernization - Rule 1)
 */
export const handleReserveStockDCB = mutation({
  args: {
    commandId: v.string(),
    correlationId: v.string(),
    tenantId: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { tenantId, orderId, items, commandId, correlationId } = args;
    const logger = defaultInventoryCommandLogger;
    const logContext = { commandType: "ReserveStockDCB", orderId, commandId, correlationId };

    logCommandStart(logger, logContext);

    try {
      // 1. Generate IDs before DCB call (ensures decider purity)
      const reservationId = generateId("inventory", "reservation");
      const scopeKey = createScopeKey(tenantId, "reservation", orderId);

      // 2. Execute DCB - loads entities, validates invariants, applies updates atomically
      // Note: Cast ctx to satisfy DCBMutationContext generic constraint
      // The actual MutationCtx has stricter typing but is compatible at runtime
      const result = await executeWithDCB(ctx as Parameters<typeof executeWithDCB>[0], {
        scopeKey,
        expectedVersion: 0, // New reservation scope
        boundedContext: "inventory",
        streamType: "Reservation",
        schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
        // ⚠️ KNOWN LIMITATION: OCC (Optimistic Concurrency Control) is disabled.
        // scopeOperations omitted because BC components cannot access components.eventStore
        // due to Convex component isolation. This means concurrent DCB operations on the
        // same scope may not detect conflicts. See issue #107 for tracking.
        // Production systems should either: (1) use Sagas for cross-BC coordination, or
        // (2) implement scope tracking within the BC component's isolated database.
        // See: https://github.com/libar-ai/convex-event-sourcing/issues/107
        entities: {
          streamIds: items.map((i) => i.productId),
          loadEntity: async (ctx, streamId) => {
            return inventoryRepo.tryLoad(ctx as MutationCtx, streamId);
          },
        },
        decider: reserveMultipleDCBDecider,
        command: { orderId, items: items as ReservationItem[], reservationId },
        applyUpdate: async (ctx, _id, _cms, update, version, now) => {
          await (ctx as MutationCtx).db.patch(_id as Id<"inventoryCMS">, {
            ...update,
            version,
            updatedAt: now,
          });
        },
        commandId,
        correlationId,
        logger,
      });

      // 3. Handle DCB result
      if (result.status === "rejected") {
        logCommandRejected(logger, logContext, { code: result.code, message: result.reason });
        return {
          status: "rejected" as const,
          code: result.code,
          reason: result.reason,
          context: result.context,
        };
      }

      if (result.status === "failed") {
        logCommandFailed(logger, logContext, {
          eventType: "ReservationFailed",
          reason: result.reason,
        });
        // Return CommandHandlerResult-compatible format (single event, not array)
        const failedEvent = result.events[0];
        if (!failedEvent) {
          throw new Error("DCB failed result must include at least one event");
        }
        return {
          status: "failed" as const,
          reason: result.reason,
          event: failedEvent,
          context: result.context,
        };
      }

      if (result.status === "conflict") {
        // OCC conflict - would only happen if scopeOperations were wired
        logger.warn("DCB scope conflict", { scopeKey, currentVersion: result.currentVersion });
        return {
          status: "conflict" as const,
          currentVersion: result.currentVersion,
        };
      }

      // 4. Success - create ReservationCMS (DCB only updates existing entities)
      const reservationCMS = createInitialReservationCMS(
        reservationId,
        orderId,
        items as ReservationItem[]
      );
      await ctx.db.insert("reservationCMS", {
        ...reservationCMS,
        version: 1,
      });

      // 5. Return CommandHandlerResult-compatible format for orchestrator integration
      logCommandSuccess(
        logger,
        { ...logContext, reservationId },
        { version: result.scopeVersion, eventType: "StockReserved" }
      );

      const successEvent = result.events[0];
      if (!successEvent) {
        throw new Error("DCB success result must include at least one event");
      }
      return successResult({ ...result.data, reservationId }, result.scopeVersion, successEvent);
    } catch (error) {
      if (error instanceof InventoryInvariantError) {
        logCommandRejected(logger, logContext, { code: error.code, message: error.message });
        return {
          status: "rejected" as const,
          code: error.code,
          reason: error.message,
          context: error.context,
        };
      }
      logCommandError(logger, logContext, error);
      throw error;
    }
  },
});
