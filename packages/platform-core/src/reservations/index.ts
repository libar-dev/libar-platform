/**
 * ## Reservation Pattern - Optimistic Uniqueness with TTL
 *
 * Enable optimistic uniqueness constraints via reserve/confirm/release workflow.
 *
 * The reservation pattern provides TTL-based pre-creation uniqueness constraints
 * for distributed systems. It solves race conditions in check-then-create patterns
 * by using a three-phase workflow:
 *
 * 1. **Reserve** - Claim a unique value with TTL
 * 2. **Confirm** - Link reservation to created entity
 * 3. **Release/Expire** - Free the value if unused
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
 * ## When to Use
 *
 * - Enforcing uniqueness before entity creation (email, username, SKU)
 * - Preventing race conditions in registration flows
 * - Distributed systems where pessimistic locks cause issues
 * - GDPR-compliant data isolation with correlation IDs
 *
 * ## Key Concepts
 *
 * | Concept | Description |
 * |---------|-------------|
 * | **Reservation Key** | `type:value` format (e.g., "email:alice@example.com") |
 * | **Deterministic ID** | Hash of key enables idempotent operations |
 * | **TTL** | Auto-cleanup of unclaimed reservations |
 * | **Repository Pattern** | Apps implement `ReservationRepository` interface |
 *
 * ## Important: Application Setup Required
 *
 * Since platform-core is a library package (not a Convex component), applications
 * must:
 *
 * 1. Define a `reservations` table using the documented schema
 * 2. Implement `ReservationRepository` to wrap Convex operations
 * 3. Set up a cron job for TTL expiration
 *
 * See `generateSchemaSnippet()` and `generateCronSnippet()` for copy/paste code.
 *
 * @example
 * ```typescript
 * import {
 *   reserve,
 *   confirm,
 *   release,
 *   type ReservationRepository
 * } from "@libar-dev/platform-core/reservations";
 *
 * // 1. Reserve email during registration
 * const result = await reserve(ctx, {
 *   type: "email",
 *   value: "alice@example.com",
 *   ttl: 300000, // 5 minutes
 * }, { repository: myReservationRepo });
 *
 * if (result.status === "success") {
 *   // 2. Create user...
 *   const user = await createUser(ctx, { email: "alice@example.com" });
 *
 *   // 3. Confirm reservation
 *   await confirm(ctx, {
 *     reservationId: result.reservationId,
 *     entityId: user._id
 *   }, { repository: myReservationRepo });
 * } else if (result.status === "conflict") {
 *   // Email already taken
 *   throw new Error("Email already registered");
 * }
 * ```
 *
 * @module reservations
 * @since Phase 20
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Key types
  ReservationKey,
  ParsedReservationKey,
  ReservationKeyValidationError,
  // Status types
  ReservationStatus,
  TerminalReservationStatus,
  // CMS types
  ReservationCMS,
  // Input types
  ReserveInput,
  ConfirmInput,
  ReleaseInput,
  // Result types
  ReserveResult,
  ReserveSuccessResult,
  ReserveConflictResult,
  ReserveValidationError,
  ConfirmResult,
  ConfirmSuccessResult,
  ConfirmErrorResult,
  ReleaseResult,
  ReleaseSuccessResult,
  ReleaseErrorResult,
  // Query types
  FindReservationOptions,
  IsReservedOptions,
  // Expiration types
  ExpireReservationsConfig,
  ExpireReservationsResult,
  // Validation types
  TTLValidationError,
  // Repository interface
  ReservationRepository,
} from "./types.js";

export {
  isTerminalStatus,
  // TTL constants
  MIN_TTL_MS,
  MAX_TTL_MS,
  DEFAULT_TTL_MS,
  // Input length limits
  MAX_TYPE_LENGTH,
  MAX_VALUE_LENGTH,
  MAX_RESERVATION_ID_LENGTH,
  MAX_ENTITY_ID_LENGTH,
} from "./types.js";

// =============================================================================
// Key Utilities
// =============================================================================

export {
  // Constants
  KEY_SEPARATOR,
  RESERVATION_ID_PREFIX,
  // Key creation
  createReservationKey,
  tryCreateReservationKey,
  // Key parsing
  parseReservationKey,
  extractType,
  extractValue,
  // Key validation
  validateReservationKeyParts,
  validateReservationKey,
  isValidReservationKey,
  assertValidReservationKey,
  // ID generation
  hashReservationId,
  hashReservationIdFromParts,
} from "./key.js";

// =============================================================================
// Validation
// =============================================================================

export type { ConfirmValidationError, ReleaseValidationError } from "./validation.js";

export {
  // TTL validation
  validateTTL,
  isValidTTL,
  assertValidTTL,
  // Reserve input validation
  validateReserveInput,
  isValidReserveInput,
  assertValidReserveInput,
  // Confirm input validation
  validateConfirmInput,
  isValidConfirmInput,
  assertValidConfirmInput,
  // Release input validation
  validateReleaseInput,
  isValidReleaseInput,
  assertValidReleaseInput,
} from "./validation.js";

// =============================================================================
// Schema Helpers
// =============================================================================

export {
  RESERVATION_SCHEMA_DOCS,
  RESERVATION_STATUS_VALUES,
  isValidReservationStatus,
  assertValidReservationStatus,
  RESERVATION_INDEXES,
  EXPIRATION_CRON_CONFIG,
  generateSchemaSnippet,
  generateCronSnippet,
} from "./schema.js";

// =============================================================================
// Operations
// =============================================================================

// Reserve
export type { ReserveConfig } from "./reserve.js";
export { reserve, reserveIdempotent } from "./reserve.js";

// Confirm
export type { ConfirmConfig } from "./confirm.js";
export { confirm } from "./confirm.js";

// Release
export type { ReleaseConfig } from "./release.js";
export { release } from "./release.js";

// Query
export type { ReservationQueryConfig } from "./query.js";
export {
  findReservation,
  isReserved,
  getReservation,
  isReservationActive,
  isReservationExpired,
  getRemainingTTL,
} from "./query.js";

// Expire
export type { ExpireConfig } from "./expire.js";
export { expireReservations, findExpiredReservations, countExpiredReservations } from "./expire.js";
