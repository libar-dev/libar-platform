/**
 * ## Reservation Pattern - Type Definitions
 *
 * Types for TTL-based pre-creation uniqueness constraints.
 *
 * The reservation pattern enables optimistic uniqueness checking for distributed
 * systems where pessimistic locks are unacceptable. It uses a three-phase workflow
 * (reserve/confirm/release) with automatic TTL-based cleanup.
 *
 * ## State Machine
 *
 * ```
 * reserved ──confirm()──> confirmed (terminal)
 *     │
 *     ├──release()──> released (terminal)
 *     └──TTL──> expired (terminal)
 * ```
 *
 * @module reservations/types
 * @since Phase 20
 */

// =============================================================================
// Reservation Key Types
// =============================================================================

/**
 * Branded type for reservation keys.
 *
 * Format: `${type}:${value}` (e.g., "email:alice@example.com")
 *
 * The brand ensures type safety - you can't accidentally pass a regular
 * string where a validated reservation key is expected.
 *
 * @example
 * ```typescript
 * const key = createReservationKey("email", "alice@example.com");
 * // Type: ReservationKey (branded string)
 * // Value: "email:alice@example.com"
 * ```
 */
export type ReservationKey = string & { readonly __brand: "ReservationKey" };

/**
 * Parsed components of a reservation key.
 */
export interface ParsedReservationKey {
  /** Reservation type (e.g., "email", "username", "sku") */
  type: string;
  /** Value being reserved */
  value: string;
  /** Original reservation key */
  raw: ReservationKey;
}

/**
 * Validation error for reservation keys.
 */
export interface ReservationKeyValidationError {
  code:
    | "INVALID_KEY_FORMAT"
    | "TYPE_REQUIRED"
    | "VALUE_REQUIRED"
    | "KEY_EMPTY"
    | "TYPE_CONTAINS_SEPARATOR"
    | "VALUE_EMPTY"
    | "TYPE_TOO_LONG"
    | "VALUE_TOO_LONG";
  message: string;
}

// =============================================================================
// Reservation Status Types
// =============================================================================

/**
 * Valid reservation statuses.
 *
 * - `reserved` - Active reservation, value is claimed
 * - `confirmed` - Reservation linked to entity (terminal)
 * - `released` - Explicitly released by user (terminal)
 * - `expired` - TTL expired without confirmation (terminal)
 */
export type ReservationStatus = "reserved" | "confirmed" | "released" | "expired";

/**
 * Terminal statuses where no further transitions are possible.
 */
export type TerminalReservationStatus = "confirmed" | "released" | "expired";

/**
 * Check if a status is terminal (no further transitions allowed).
 */
export function isTerminalStatus(status: ReservationStatus): status is TerminalReservationStatus {
  return status === "confirmed" || status === "released" || status === "expired";
}

// =============================================================================
// Reservation CMS Types
// =============================================================================

/**
 * Reservation Command Model State (CMS).
 *
 * This represents the current state of a reservation stored in the database.
 * Applications must define a Convex table with this schema.
 */
export interface ReservationCMS {
  /** Unique reservation ID (deterministic hash of key) */
  reservationId: string;

  /** Reservation key: `type:value` */
  key: ReservationKey;

  /** Reservation type (e.g., "email", "username") */
  type: string;

  /** Reserved value */
  value: string;

  /** Current status */
  status: ReservationStatus;

  /** Expiration timestamp (ms since epoch); null when confirmed (permanent) */
  expiresAt: number | null;

  /** Entity ID that confirmed this reservation (set on confirm) */
  entityId: string | null;

  /** Timestamp when confirmed (set on confirm) */
  confirmedAt: number | null;

  /** Timestamp when released (set on release) */
  releasedAt: number | null;

  /** Correlation ID for tracing */
  correlationId: string | null;

  /** Version for OCC */
  version: number;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;
}

// =============================================================================
// Operation Input Types
// =============================================================================

/**
 * Input for reserve() operation.
 */
export interface ReserveInput {
  /** Reservation type (e.g., "email", "username", "sku") */
  type: string;

  /** Value to reserve */
  value: string;

  /**
   * Time-to-live in milliseconds.
   *
   * - Minimum: 1000ms (1 second)
   * - Maximum: 86,400,000ms (24 hours)
   * - Recommended: 300,000ms (5 minutes) for registration flows
   */
  ttl: number;

  /** Optional correlation ID for tracing */
  correlationId?: string;
}

/**
 * Input for confirm() operation.
 */
export interface ConfirmInput {
  /** Reservation ID to confirm */
  reservationId: string;

  /** Entity ID that owns this reservation */
  entityId: string;
}

/**
 * Input for release() operation.
 */
export interface ReleaseInput {
  /** Reservation ID to release */
  reservationId: string;
}

// =============================================================================
// Operation Result Types
// =============================================================================

/**
 * Result from reserve() operation.
 */
export type ReserveResult = ReserveSuccessResult | ReserveConflictResult | ReserveValidationError;

/**
 * Successful reservation result.
 */
export interface ReserveSuccessResult {
  status: "success";
  /** Reservation ID (deterministic hash of key) */
  reservationId: string;
  /** Reservation key */
  key: ReservationKey;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * Reservation conflict - value already reserved.
 */
export interface ReserveConflictResult {
  status: "conflict";
  code: "ALREADY_RESERVED";
  /** ID of existing reservation */
  existingReservationId: string;
  /** Expiration of existing reservation */
  existingExpiresAt: number;
}

/**
 * Validation error for reserve operation.
 */
export interface ReserveValidationError {
  status: "error";
  code:
    | "INVALID_TTL"
    | "TTL_TOO_LONG"
    | "INVALID_TYPE"
    | "INVALID_VALUE"
    | "TYPE_TOO_LONG"
    | "VALUE_TOO_LONG";
  message: string;
}

/**
 * Result from confirm() operation.
 */
export type ConfirmResult = ConfirmSuccessResult | ConfirmErrorResult;

/**
 * Successful confirmation result.
 */
export interface ConfirmSuccessResult {
  status: "success";
  /** Confirmed reservation ID */
  reservationId: string;
  /** Entity ID linked to reservation */
  entityId: string;
  /** Timestamp of confirmation */
  confirmedAt: number;
}

/**
 * Confirmation error result.
 */
export interface ConfirmErrorResult {
  status: "error";
  code:
    | "RESERVATION_NOT_FOUND"
    | "RESERVATION_ALREADY_EXPIRED"
    | "RESERVATION_ALREADY_CONFIRMED"
    | "RESERVATION_ALREADY_RELEASED"
    | "RESERVATION_ID_REQUIRED"
    | "ENTITY_ID_REQUIRED"
    | "RESERVATION_ID_TOO_LONG"
    | "ENTITY_ID_TOO_LONG";
  message: string;
}

/**
 * Result from release() operation.
 */
export type ReleaseResult = ReleaseSuccessResult | ReleaseErrorResult;

/**
 * Successful release result.
 */
export interface ReleaseSuccessResult {
  status: "success";
  /** Released reservation ID */
  reservationId: string;
}

/**
 * Release error result.
 */
export interface ReleaseErrorResult {
  status: "error";
  code:
    | "RESERVATION_ID_REQUIRED"
    | "RESERVATION_NOT_FOUND"
    | "RESERVATION_ALREADY_CONFIRMED"
    | "RESERVATION_ALREADY_RELEASED"
    | "RESERVATION_ALREADY_EXPIRED"
    | "RESERVATION_ID_TOO_LONG";
  message: string;
}

// =============================================================================
// Query Types
// =============================================================================

/**
 * Options for finding a reservation.
 */
export interface FindReservationOptions {
  /** Find by reservation ID */
  reservationId?: string;

  /** Find by key */
  key?: ReservationKey;

  /** Find by type and value */
  type?: string;
  value?: string;

  /** Include only active reservations (not expired/confirmed/released) */
  activeOnly?: boolean;
}

/**
 * Options for isReserved check.
 */
export interface IsReservedOptions {
  /** Reservation type */
  type: string;

  /** Value to check */
  value: string;

  /** Current timestamp for TTL checking (defaults to Date.now()) */
  now?: number;
}

// =============================================================================
// TTL Expiration Types
// =============================================================================

/**
 * Configuration for TTL expiration batch processing.
 */
export interface ExpireReservationsConfig {
  /** Batch size for processing (default: 100) */
  batchSize?: number;

  /** Current timestamp for expiration check (defaults to Date.now()) */
  now?: number;
}

/**
 * Result from TTL expiration processing.
 */
export interface ExpireReservationsResult {
  /** Number of reservations expired */
  expiredCount: number;

  /** IDs of expired reservations */
  expiredIds: string[];
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * TTL validation error.
 */
export interface TTLValidationError {
  code: "INVALID_TTL" | "TTL_TOO_LONG";
  message: string;
}

/**
 * Minimum TTL in milliseconds (1 second).
 */
export const MIN_TTL_MS = 1000;

/**
 * Maximum TTL in milliseconds (24 hours).
 */
export const MAX_TTL_MS = 86_400_000;

/**
 * Default TTL in milliseconds (5 minutes).
 */
export const DEFAULT_TTL_MS = 300_000;

// =============================================================================
// Input Length Limits
// =============================================================================

/**
 * Maximum length for reservation type (64 chars).
 *
 * Types are short identifiers like "email", "username", "sku".
 * This limit prevents abuse while allowing reasonable type names.
 */
export const MAX_TYPE_LENGTH = 64;

/**
 * Maximum length for reservation value (1024 chars).
 *
 * Values include emails, usernames, URLs, etc.
 * This limit prevents storage DoS attacks while accommodating
 * most legitimate use cases.
 */
export const MAX_VALUE_LENGTH = 1024;

/**
 * Maximum length for reservation ID (64 chars).
 *
 * Reservation IDs are hash-based (format: "res_XXXXXXXX").
 * This limit provides headroom for future hash algorithm changes.
 */
export const MAX_RESERVATION_ID_LENGTH = 64;

/**
 * Maximum length for entity ID (256 chars).
 *
 * Entity IDs come from external systems and vary in format.
 * This limit accommodates UUIDs, Convex IDs, and most external IDs.
 */
export const MAX_ENTITY_ID_LENGTH = 256;

// =============================================================================
// Repository Interface
// =============================================================================

/**
 * Repository interface for reservation operations.
 *
 * This interface defines the contract that applications must implement
 * to use the reservation pattern. The implementation wraps Convex
 * database operations.
 *
 * @typeParam TCtx - Convex mutation/query context type
 * @typeParam TId - Document ID type
 */
export interface ReservationRepository<TCtx, TId = unknown> {
  /**
   * Find reservation by ID.
   */
  findById: (ctx: TCtx, reservationId: string) => Promise<(ReservationCMS & { _id: TId }) | null>;

  /**
   * Find reservation by key.
   */
  findByKey: (ctx: TCtx, key: ReservationKey) => Promise<(ReservationCMS & { _id: TId }) | null>;

  /**
   * Find active (non-expired, non-terminal) reservation by key.
   */
  findActiveByKey: (
    ctx: TCtx,
    key: ReservationKey,
    now: number
  ) => Promise<(ReservationCMS & { _id: TId }) | null>;

  /**
   * Insert new reservation.
   */
  insert: (ctx: TCtx, reservation: Omit<ReservationCMS, "version">) => Promise<TId>;

  /**
   * Update reservation by document ID.
   */
  update: (ctx: TCtx, _id: TId, update: Partial<ReservationCMS>) => Promise<void>;

  /**
   * Find expired reservations for cleanup.
   */
  findExpired: (
    ctx: TCtx,
    now: number,
    limit: number
  ) => Promise<Array<ReservationCMS & { _id: TId }>>;
}
