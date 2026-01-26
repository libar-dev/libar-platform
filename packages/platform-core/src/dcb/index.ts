/**
 * ## Dynamic Consistency Boundaries (DCB) - Scope-Based Multi-Entity Coordination
 *
 * Enable cross-entity invariants within bounded contexts via scope-based OCC.
 *
 * DCB introduces scope-level optimistic concurrency control for enforcing invariants
 * that span multiple aggregates within a single bounded context. Uses `dcbScopes`
 * table for scope-level versioning and `executeWithDCB()` wrapper for composing
 * multiple Deciders into virtual streams with unified version tracking.
 *
 * ### When to Use
 *
 * - When invariants span multiple entities within the same bounded context
 * - When you need optimistic concurrency across a set of related aggregates
 * - When implementing patterns like ReserveStock across multiple products
 * - When distributed locking is unacceptable (performance, deadlock risk)
 *
 * ### Key Constraints
 *
 * - **Single-BC only**: DCB is constrained to within one bounded context
 * - **Cross-BC requires Sagas**: Use Sagas for multi-BC coordination
 * - **Mandatory tenantId**: All scopes must validate tenant isolation
 * - **Virtual streams**: Logical event composition across physical streams
 *
 * ### Scope Key Pattern
 *
 * ```
 * tenant:${tenantId}:${scopeType}:${scopeId}
 *
 * Examples:
 * tenant:t123:reservation:res_456
 * tenant:t123:order:ord_789
 * ```
 *
 * @example
 * ```typescript
 * import {
 *   createScopeKey,
 *   executeWithDCB,
 *   type DCBScopeKey,
 *   type ExecuteWithDCBConfig,
 * } from "@libar-dev/platform-core/dcb";
 *
 * // Create a scope key for multi-product reservation
 * const scopeKey = createScopeKey(tenantId, "reservation", reservationId);
 *
 * // Execute multi-entity operation with scope-based OCC
 * const result = await executeWithDCB(ctx, {
 *   scopeKey,
 *   expectedVersion: 0, // New scope
 *   boundedContext: "inventory",
 *   streamType: "Reservation",
 *   schemaVersion: 1,
 *   entities: {
 *     streamIds: productIds,
 *     loadEntity: (ctx, id) => inventoryRepo.tryLoad(ctx, id),
 *   },
 *   decider: reserveMultipleDecider,
 *   command: { orderId, items },
 *   applyUpdate: async (ctx, _id, cms, update, version, now) => {
 *     await ctx.db.patch(_id, { ...update, version, updatedAt: now });
 *   },
 *   commandId,
 *   correlationId,
 * });
 * ```
 *
 * @module dcb
 * @since Phase 16
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Scope key types
  DCBScopeKey,
  ParsedScopeKey,
  ScopeKeyValidationError,
  // Scope state types
  DCBScope,
  DCBEntityState,
  DCBAggregatedState,
  // Scope operations (OCC)
  ScopeVersionCheckResult,
  ScopeCommitResult,
  ScopeOperations,
  // Decider types
  DCBStateUpdates,
  DCBDecider,
  // Configuration types
  DCBEntityConfig,
  ExecuteWithDCBConfig,
  // Result types
  DCBExecutionResult,
  DCBSuccessResult,
  DCBRejectedResult,
  DCBFailedResult,
  DCBConflictResult,
  // Retry result types (Phase 18a)
  DCBDeferredResult,
  DCBRetryResult,
} from "./types.js";

// =============================================================================
// Scope Key Utilities
// =============================================================================

export {
  // Constants
  SCOPE_KEY_PREFIX,
  // Creation
  createScopeKey,
  tryCreateScopeKey,
  // Parsing
  parseScopeKey,
  // Validation
  validateScopeKey,
  isValidScopeKey,
  assertValidScopeKey,
  // Tenant operations
  isScopeTenant,
  extractTenantId,
  extractScopeType,
  extractScopeId,
} from "./scopeKey.js";

// =============================================================================
// Execution
// =============================================================================

export { executeWithDCB } from "./execute.js";

// =============================================================================
// Backoff Calculation (Phase 18a)
// =============================================================================

export {
  calculateBackoff,
  createBackoffCalculator,
  defaultJitter,
  noJitter,
  BACKOFF_DEFAULTS,
} from "./backoff.js";
export type { BackoffOptions } from "./backoff.js";

// =============================================================================
// DCB Retry Helper (Phase 18a)
// =============================================================================

export {
  // Main entry point
  withDCBRetry,
  // Type guards
  isDCBDeferredResult,
  isDCBSuccessResult,
  isDCBRejectedResult,
  isDCBFailedResult,
  isMaxRetriesExceeded,
  // Constants
  DCB_RETRY_DEFAULTS,
  DCB_MAX_RETRIES_EXCEEDED,
  DCB_RETRY_KEY_PREFIX,
} from "./withRetry.js";
export type {
  WorkpoolLikeForDCB,
  DCBRetryOptions,
  WithDCBRetryConfig,
  HandleResultContext,
  DCBRetryHandler,
} from "./withRetry.js";
