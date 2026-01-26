/**
 * Internal mutations for Inventory operations.
 *
 * These are used by the Order Fulfillment saga to:
 * 1. Reserve stock for an order
 * 2. Confirm a reservation (makes permanent)
 * 3. Release a reservation (compensation)
 *
 * These use the extended CommandOrchestrator that handles { status: "failed" }
 * for business failures like insufficient stock.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef } from "@libar-dev/platform-core";
import { createScopeKey, withDCBRetry } from "@libar-dev/platform-core/dcb";
import { commandOrchestrator, dcbRetryPool } from "./infrastructure";
import {
  reserveStockConfig,
  reserveStockDCBConfig,
  confirmReservationConfig,
  releaseReservationConfig,
} from "./commands/inventory/configs";

// =============================================================================
// TS2589 Prevention: Module-level function references
// =============================================================================
const reserveStockDCBWithRetryRef = makeFunctionReference<"mutation">(
  "inventoryInternal:reserveStockDCBWithRetry"
) as SafeMutationRef;

/**
 * Reserve stock for an order (internal - used by saga).
 *
 * Returns:
 * - { status: "success", data: { reservationId, expiresAt }, ... } on success
 * - { status: "failed", reason: "...", eventId: "..." } on insufficient stock
 * - { status: "rejected", ... } on validation errors
 * - { status: "duplicate", ... } if already processed
 */
export const reserveStock = internalMutation({
  args: {
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await commandOrchestrator.execute(ctx, reserveStockConfig, args);
  },
});

/**
 * Confirm a reservation (internal - used by saga).
 *
 * Makes the reservation permanent, deducting from available stock.
 */
export const confirmReservation = internalMutation({
  args: {
    reservationId: v.string(),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await commandOrchestrator.execute(ctx, confirmReservationConfig, args);
  },
});

/**
 * Release a reservation (internal - used by saga for compensation).
 *
 * Returns reserved stock to available.
 */
export const releaseReservation = internalMutation({
  args: {
    reservationId: v.string(),
    reason: v.string(),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await commandOrchestrator.execute(ctx, releaseReservationConfig, args);
  },
});

// =============================================================================
// DCB Retry-Enabled Handler (Phase 18a - Durable Function Adapters)
// =============================================================================

/**
 * Reserve stock using DCB with automatic OCC conflict retry.
 *
 * ## Architectural Design: Layered Infrastructure Pattern
 *
 * This handler demonstrates the correct layering of infrastructure concerns
 * around bounded context business logic, following DDD/CQRS principles:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  APP LEVEL (Infrastructure Layer)                                       │
 * │  ├── Retry Infrastructure (withDCBRetry)                                │
 * │  ├── Rate Limiting (middleware)                                         │
 * │  └── Observability (logging, dead letters)                              │
 * │                           │                                             │
 * │                           ▼                                             │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │  COMMAND ORCHESTRATOR (Application Service)                      │   │
 * │  │  ├── Command idempotency (Command Bus)                           │   │
 * │  │  ├── Dual-write coordination (CMS + Event Store)                 │   │
 * │  │  └── Projection triggering (Workpool)                            │   │
 * │  │                           │                                      │   │
 * │  │                           ▼                                      │   │
 * │  │  ┌─────────────────────────────────────────────────────────┐    │   │
 * │  │  │  BC COMPONENT (Domain Layer)                             │    │   │
 * │  │  │  ├── Deciders (pure business logic)                      │    │   │
 * │  │  │  ├── CMS State Management                                │    │   │
 * │  │  │  └── DCB Multi-Entity Validation                         │    │   │
 * │  │  └─────────────────────────────────────────────────────────┘    │   │
 * │  └─────────────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Why Retry Lives at App Level (Not in BC Component)
 *
 * 1. **Separation of Concerns**: Retry is infrastructure, not business logic.
 *    The BC component handles "what" (reserve stock), not "how often to try".
 *
 * 2. **Component Isolation Constraint**: BC components cannot self-reference
 *    via `internal.xxx` API. The `internal` namespace is generated at app
 *    level, not available inside components.
 *
 * 3. **Hexagonal Architecture**: Infrastructure adapters (retry, rate limit)
 *    wrap around the domain, they don't penetrate it.
 *
 * ## Execution Flow
 *
 * ```
 * reserveStockDCBWithRetry (app-level)
 *         │
 *         ▼
 * commandOrchestrator.execute(reserveStockDCBConfig)
 *         │
 *         ├── Record command (idempotency)
 *         ├── Run middleware (auth, logging, rate limit)
 *         ├── Call BC handler → handleReserveStockDCB
 *         │         │
 *         │         └── DCB multi-product validation
 *         │         └── Decider business logic
 *         │         └── CMS state update
 *         │
 *         ├── Append event to Event Store
 *         ├── Trigger projections via Workpool
 *         └── Return result
 *         │
 *         ▼
 * withDCBRetry.handleResult()
 *         │
 *         ├── success/rejected/failed → return as-is
 *         └── conflict → schedule retry via Workpool
 *                        → return { status: "deferred" }
 * ```
 *
 * ## Result Types
 *
 * - `success`: Reservation created, event emitted via orchestrator
 * - `rejected`: Validation failed (missing products, invalid items)
 * - `failed`: Insufficient stock (with ReservationFailed event)
 * - `deferred`: OCC conflict detected, retry scheduled via Workpool
 *
 * ## Known Limitation
 *
 * OCC is currently disabled in `handleReserveStockDCB` because BC components
 * cannot access `components.eventStore` for scope tracking. This handler
 * demonstrates the retry infrastructure and will activate once scope tracking
 * is implemented within the component. See issue #107.
 *
 * @since Phase 18a (Durable Function Adapters)
 */
export const reserveStockDCBWithRetry = internalMutation({
  args: {
    tenantId: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    // Retry args (added by withDCBRetry on conflict)
    attempt: v.optional(v.number()),
    expectedVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { attempt = 0, expectedVersion: _expectedVersion, ...commandArgs } = args;

    // Build scope key for retry partition ordering
    const scopeKey = createScopeKey(commandArgs.tenantId, "reservation", commandArgs.orderId);

    // Execute DCB operation via CommandOrchestrator
    // Note: The orchestrator handles dual-write, event store append, and projections
    const result = await commandOrchestrator.execute(ctx, reserveStockDCBConfig, commandArgs);

    // Handle result with retry adapter
    // Note: Currently DCB doesn't return "conflict" because OCC is disabled
    // in the component handler. When enabled, conflicts will trigger retry.
    const retryHandler = withDCBRetry(ctx, {
      workpool: dcbRetryPool,
      retryMutation: reserveStockDCBWithRetryRef,
      scopeKey,
      options: {
        maxAttempts: 5,
        initialBackoffMs: 100,
        backoffBase: 2,
        maxBackoffMs: 30000,
      },
    });

    // Cast result to DCBExecutionResult format for the retry handler
    // The orchestrator returns CommandMutationResult which is compatible
    const dcbResult = result as Parameters<typeof retryHandler.handleResult>[0];

    return retryHandler.handleResult(dcbResult, {
      attempt,
      retryArgs: commandArgs,
    });
  },
});
