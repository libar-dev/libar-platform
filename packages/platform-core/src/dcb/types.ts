/**
 * ## Dynamic Consistency Boundaries (DCB) - Type Definitions
 *
 * Types for scope-based multi-entity coordination within bounded contexts.
 *
 * @module dcb/types
 * @since Phase 16
 */

import type { DeciderContext, DeciderEvent, DeciderOutput } from "@libar-dev/platform-decider";
import type { Logger } from "../logging/index.js";
import type { EventData } from "../orchestration/types.js";
import type { EventCategory } from "../events/category.js";
import type { UnknownRecord } from "../types.js";

// =============================================================================
// Scope Key Types
// =============================================================================

/**
 * Branded type for DCB scope keys.
 *
 * Format: `tenant:${tenantId}:${scopeType}:${scopeId}`
 *
 * The brand ensures type safety - you can't accidentally pass a regular
 * string where a validated scope key is expected.
 *
 * @example
 * ```typescript
 * const scopeKey = createScopeKey("t1", "reservation", "res_123");
 * // Type: DCBScopeKey (branded string)
 * ```
 */
export type DCBScopeKey = string & { readonly __brand: "DCBScopeKey" };

/**
 * Parsed components of a scope key.
 */
export interface ParsedScopeKey {
  /** Tenant ID for isolation */
  tenantId: string;
  /** Type of scope (e.g., "reservation", "order") */
  scopeType: string;
  /** Unique ID within the scope type */
  scopeId: string;
  /** Original scope key */
  raw: DCBScopeKey;
}

/**
 * Validation error for scope keys.
 */
export interface ScopeKeyValidationError {
  code: "INVALID_SCOPE_KEY_FORMAT" | "TENANT_ID_REQUIRED" | "SCOPE_KEY_EMPTY";
  message: string;
}

// =============================================================================
// Scope State Types
// =============================================================================

/**
 * DCB scope metadata as stored in dcbScopes table.
 */
export interface DCBScope {
  /** Unique scope key */
  scopeKey: DCBScopeKey;
  /** Current version for OCC */
  currentVersion: number;
  /** Tenant ID for isolation */
  tenantId: string;
  /** Type of scope */
  scopeType: string;
  /** Unique ID within scope type */
  scopeId: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  lastUpdatedAt: number;
  /** Stream IDs participating in this scope (for virtual streams) */
  streamIds?: string[];
}

/**
 * Result types for scope operations.
 */
export type ScopeVersionCheckResult =
  | { status: "match" }
  | { status: "mismatch"; currentVersion: number }
  | { status: "not_found" };

export type ScopeCommitResult =
  | { status: "success"; newVersion: number }
  | { status: "conflict"; currentVersion: number };

/**
 * Scope operations interface for DCB execution.
 *
 * These operations are provided by the caller (typically wrapping platform-store
 * component functions) to enable scope-level OCC within the mutation.
 *
 * ## Why callbacks instead of direct calls?
 *
 * Convex components have isolated databases. The DCB execution logic in
 * platform-core cannot directly access platform-store tables. Instead, the
 * caller passes callbacks that wrap component API calls.
 *
 * ## Transaction Safety
 *
 * All operations run within the same Convex mutation, ensuring atomicity:
 * - `getScope` reads touch the scope record for Convex's internal OCC
 * - `commitScope` validates version before committing
 * - If conflict detected, caller should not persist entity changes
 *
 * @example
 * ```typescript
 * const scopeOperations: ScopeOperations = {
 *   getScope: async () => {
 *     const result = await ctx.runQuery(components.eventStore.lib.getScope, {
 *       scopeKey: config.scopeKey,
 *     });
 *     return result;
 *   },
 *   commitScope: async (streamIds) => {
 *     return ctx.runMutation(components.eventStore.lib.commitScope, {
 *       scopeKey: config.scopeKey,
 *       expectedVersion: config.expectedVersion,
 *       streamIds,
 *     });
 *   },
 * };
 * ```
 */
export interface ScopeOperations {
  /**
   * Get current scope state.
   *
   * Returns scope data if exists, null if scope doesn't exist.
   * For new scopes (expectedVersion = 0), this may return null.
   */
  getScope: () => Promise<{
    currentVersion: number;
    tenantId: string;
    scopeType: string;
    scopeId: string;
  } | null>;

  /**
   * Atomically commit scope version increment with OCC validation.
   *
   * This function:
   * 1. Validates expectedVersion matches current version
   * 2. Increments version if match
   * 3. Updates streamIds list for virtual stream queries
   * 4. Returns success with new version, or conflict with current version
   *
   * @param streamIds - Stream IDs to associate with this scope
   * @returns Commit result with new version or conflict info
   */
  commitScope: (streamIds: string[]) => Promise<ScopeCommitResult>;
}

/**
 * Entity state within a DCB scope.
 *
 * Represents one entity (CMS document) participating in a scope operation.
 */
export interface DCBEntityState<TCms, TId = unknown> {
  /** Stream ID of this entity */
  streamId: string;
  /** Current CMS state */
  cms: TCms;
  /** Document ID for updates */
  _id: TId;
}

/**
 * Aggregated state for DCB decider.
 *
 * Contains all entity states within the scope, enabling cross-entity
 * invariant validation in the pure decider function.
 */
export interface DCBAggregatedState<TCms> {
  /** Scope key for this operation */
  scopeKey: DCBScopeKey;
  /** Current scope version (for OCC) */
  scopeVersion: number;
  /** Map of streamId → entity state */
  entities: Map<string, DCBEntityState<TCms>>;
}

// =============================================================================
// DCB Decider Types
// =============================================================================

/**
 * State updates returned by DCB decider.
 *
 * Maps streamId to the update for that entity. Only entities with updates
 * in this map will be modified.
 */
export type DCBStateUpdates<TUpdate> = Map<string, TUpdate>;

/**
 * DCB decider function signature.
 *
 * Unlike regular deciders that operate on a single entity, DCB deciders
 * receive aggregated state from all entities in the scope, enabling
 * cross-entity invariant validation.
 *
 * @typeParam TCms - CMS state type for entities in scope
 * @typeParam TCommand - Command input type
 * @typeParam TEvent - Event type for success/failure
 * @typeParam TData - Success data type
 * @typeParam TStateUpdate - State update type for individual entities
 */
export type DCBDecider<
  TCms,
  TCommand extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
> = (
  state: DCBAggregatedState<TCms>,
  command: TCommand,
  context: DeciderContext
) => DeciderOutput<TEvent, TData, DCBStateUpdates<TStateUpdate>>;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for loading entities in a DCB operation.
 */
export interface DCBEntityConfig<TCtx, TCms, TId = unknown> {
  /** Stream IDs of entities to load */
  streamIds: string[];

  /**
   * Load function for each entity.
   *
   * @param ctx - Mutation context
   * @param streamId - Stream ID to load
   * @returns Entity state if found, null if not exists
   */
  loadEntity: (
    ctx: TCtx,
    streamId: string
  ) => Promise<{
    cms: TCms;
    _id: TId;
  } | null>;
}

/**
 * Configuration for executeWithDCB.
 *
 * @typeParam TCtx - Convex mutation context type
 * @typeParam TCms - CMS state type
 * @typeParam TCommand - Command input type
 * @typeParam TEvent - Event type
 * @typeParam TData - Success data type
 * @typeParam TStateUpdate - State update type
 * @typeParam TId - Document ID type
 */
export interface ExecuteWithDCBConfig<
  TCtx,
  TCms,
  TCommand extends object,
  TEvent extends DeciderEvent,
  TData extends object,
  TStateUpdate,
  TId = unknown,
> {
  /** Scope key for coordination */
  scopeKey: DCBScopeKey;

  /** Expected scope version for OCC (0 for new scopes) */
  expectedVersion: number;

  /** Bounded context name */
  boundedContext: string;

  /** Stream type for events */
  streamType: string;

  /** Event schema version */
  schemaVersion: number;

  /**
   * Event category for taxonomy classification.
   *
   * Defaults to "domain" if not specified.
   * - domain: Internal facts within bounded context for ES replay
   * - integration: Cross-context communication with versioned contracts
   * - trigger: ID-only notifications for GDPR compliance
   * - fat: Full state snapshots for external systems
   */
  eventCategory?: EventCategory;

  /**
   * Scope operations for OCC (Optimistic Concurrency Control).
   *
   * These callbacks wrap platform-store component functions to enable
   * scope-level version checking and committing within the mutation.
   *
   * **Required for OCC enforcement.** If not provided, scope version
   * checking is skipped (useful for testing pure decider logic).
   */
  scopeOperations?: ScopeOperations;

  /** Entity loading configuration */
  entities: DCBEntityConfig<TCtx, TCms, TId>;

  /** Pure decider function */
  decider: DCBDecider<TCms, TCommand, TEvent, TData, TStateUpdate>;

  /** Command to execute */
  command: TCommand;

  /**
   * Apply state update to individual entity.
   *
   * Called for each entity with an update in the decider's stateUpdate map.
   */
  applyUpdate: (
    ctx: TCtx,
    _id: TId,
    cms: TCms,
    update: TStateUpdate,
    version: number,
    timestamp: number
  ) => Promise<void>;

  /** Command ID for correlation */
  commandId: string;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Optional logger */
  logger?: Logger;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result from executeWithDCB.
 */
export type DCBExecutionResult<TData extends object> =
  | DCBSuccessResult<TData>
  | DCBRejectedResult
  | DCBFailedResult
  | DCBConflictResult;

/**
 * Successful DCB execution result.
 */
export interface DCBSuccessResult<TData extends object> {
  status: "success";
  /** Data returned from decider */
  data: TData;
  /** New scope version after commit */
  scopeVersion: number;
  /** Events to append to Event Store */
  events: EventData[];
}

/**
 * Rejected DCB execution (business rule violation, no events emitted).
 */
export interface DCBRejectedResult {
  status: "rejected";
  /** Error code */
  code: string;
  /** Human-readable reason */
  reason: string;
  /** Optional context */
  context?: UnknownRecord;
}

/**
 * Failed DCB execution (business failure with event).
 */
export interface DCBFailedResult {
  status: "failed";
  /** Failure reason */
  reason: string;
  /** Events to append (failure events) */
  events: EventData[];
  /** Optional context */
  context?: UnknownRecord;
}

/**
 * OCC conflict detected during DCB execution.
 */
export interface DCBConflictResult {
  status: "conflict";
  /** Current scope version (different from expected) */
  currentVersion: number;
}

// =============================================================================
// Retry Result Types (Phase 18a - DCB Retry Helper)
// =============================================================================

/**
 * Deferred DCB execution (retry scheduled via Workpool).
 *
 * Returned when an OCC conflict is detected and a retry has been
 * scheduled. The operation will be retried automatically with the
 * updated expectedVersion.
 *
 * @since Phase 18a
 */
export interface DCBDeferredResult {
  status: "deferred";
  /** Workpool job ID for tracking the scheduled retry */
  workId: string;
  /** Which retry attempt was scheduled (0-indexed) */
  retryAttempt: number;
  /** Delay in milliseconds before retry executes */
  scheduledAfterMs: number;
}

/**
 * Result type including deferred status for DCB retry operations.
 *
 * This extends DCBExecutionResult to include the "deferred" status
 * returned when a conflict triggers an automatic retry via Workpool.
 *
 * @typeParam TData - Success data type from decider
 * @since Phase 18a
 */
export type DCBRetryResult<TData extends object> =
  | DCBSuccessResult<TData>
  | DCBRejectedResult
  | DCBFailedResult
  | DCBDeferredResult;
