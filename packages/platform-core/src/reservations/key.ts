/**
 * ## Reservation Key Utilities
 *
 * Utilities for creating, parsing, and validating reservation keys.
 *
 * Key format: `${type}:${value}` (e.g., "email:alice@example.com")
 *
 * @module reservations/key
 * @since Phase 20
 */

import type {
  ReservationKey,
  ParsedReservationKey,
  ReservationKeyValidationError,
} from "./types.js";
import { MAX_TYPE_LENGTH, MAX_VALUE_LENGTH } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Separator character used in reservation keys.
 */
export const KEY_SEPARATOR = ":";

/**
 * Prefix used for deterministic reservation IDs.
 */
export const RESERVATION_ID_PREFIX = "res_";

// =============================================================================
// Key Creation
// =============================================================================

/**
 * Create a reservation key from type and value.
 *
 * @param type - Reservation type (e.g., "email", "username")
 * @param value - Value to reserve
 * @returns Branded reservation key
 * @throws Error if type or value is invalid
 *
 * @example
 * ```typescript
 * const key = createReservationKey("email", "alice@example.com");
 * // Returns: "email:alice@example.com" as ReservationKey
 * ```
 */
export function createReservationKey(type: string, value: string): ReservationKey {
  const error = validateReservationKeyParts(type, value);
  if (error) {
    throw new Error(`Invalid reservation key: ${error.message} (${error.code})`);
  }
  return `${type}${KEY_SEPARATOR}${value}` as ReservationKey;
}

/**
 * Try to create a reservation key, returning null on validation failure.
 *
 * @param type - Reservation type
 * @param value - Value to reserve
 * @returns Reservation key or null if invalid
 *
 * @example
 * ```typescript
 * const key = tryCreateReservationKey("email", "alice@example.com");
 * if (key) {
 *   // Use the validated key
 * }
 * ```
 */
export function tryCreateReservationKey(type: string, value: string): ReservationKey | null {
  const error = validateReservationKeyParts(type, value);
  if (error) {
    return null;
  }
  return `${type}${KEY_SEPARATOR}${value}` as ReservationKey;
}

// =============================================================================
// Key Parsing
// =============================================================================

/**
 * Parse a reservation key into its components.
 *
 * @param key - Reservation key to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parseReservationKey("email:alice@example.com" as ReservationKey);
 * // Returns: { type: "email", value: "alice@example.com", raw: key }
 * ```
 */
export function parseReservationKey(key: ReservationKey): ParsedReservationKey | null {
  if (!key || typeof key !== "string") {
    return null;
  }

  const separatorIndex = key.indexOf(KEY_SEPARATOR);
  if (separatorIndex === -1 || separatorIndex === 0) {
    return null;
  }

  const type = key.slice(0, separatorIndex);
  const value = key.slice(separatorIndex + 1);

  if (!type || !value) {
    return null;
  }

  return {
    type,
    value,
    raw: key,
  };
}

/**
 * Extract the type from a reservation key.
 *
 * @param key - Reservation key
 * @returns Type component or empty string if invalid
 */
export function extractType(key: ReservationKey): string {
  const parsed = parseReservationKey(key);
  return parsed?.type ?? "";
}

/**
 * Extract the value from a reservation key.
 *
 * @param key - Reservation key
 * @returns Value component or empty string if invalid
 */
export function extractValue(key: ReservationKey): string {
  const parsed = parseReservationKey(key);
  return parsed?.value ?? "";
}

// =============================================================================
// Key Validation
// =============================================================================

/**
 * Validate reservation key parts before creating a key.
 *
 * @param type - Reservation type
 * @param value - Value to reserve
 * @returns Validation error or null if valid
 */
export function validateReservationKeyParts(
  type: string,
  value: string
): ReservationKeyValidationError | null {
  if (!type && !value) {
    return {
      code: "KEY_EMPTY",
      message: "Both type and value are required",
    };
  }

  if (!type || type.trim() === "") {
    return {
      code: "TYPE_REQUIRED",
      message: "Reservation type is required",
    };
  }

  if (!value || value.trim() === "") {
    return {
      code: "VALUE_REQUIRED",
      message: "Reservation value is required",
    };
  }

  if (type.includes(KEY_SEPARATOR)) {
    return {
      code: "TYPE_CONTAINS_SEPARATOR",
      message: `Type cannot contain '${KEY_SEPARATOR}' separator`,
    };
  }

  if (type.length > MAX_TYPE_LENGTH) {
    return {
      code: "TYPE_TOO_LONG",
      message: `Type cannot exceed ${MAX_TYPE_LENGTH} characters`,
    };
  }

  if (value.length > MAX_VALUE_LENGTH) {
    return {
      code: "VALUE_TOO_LONG",
      message: `Value cannot exceed ${MAX_VALUE_LENGTH} characters`,
    };
  }

  return null;
}

/**
 * Validate a reservation key string.
 *
 * @param key - Key string to validate
 * @returns Validation error or null if valid
 */
export function validateReservationKey(key: string): ReservationKeyValidationError | null {
  if (!key || typeof key !== "string" || key.trim() === "") {
    return {
      code: "KEY_EMPTY",
      message: "Reservation key is required",
    };
  }

  const separatorIndex = key.indexOf(KEY_SEPARATOR);
  if (separatorIndex === -1) {
    return {
      code: "INVALID_KEY_FORMAT",
      message: `Key must be in format 'type${KEY_SEPARATOR}value'`,
    };
  }

  if (separatorIndex === 0) {
    return {
      code: "TYPE_REQUIRED",
      message: "Reservation type is required",
    };
  }

  const type = key.slice(0, separatorIndex);
  if (type.trim() === "") {
    return {
      code: "TYPE_REQUIRED",
      message: "Reservation type is required",
    };
  }

  const value = key.slice(separatorIndex + 1);
  if (!value || value.trim() === "") {
    return {
      code: "VALUE_EMPTY",
      message: "Reservation value cannot be empty",
    };
  }

  if (type.length > MAX_TYPE_LENGTH) {
    return {
      code: "TYPE_TOO_LONG",
      message: `Type cannot exceed ${MAX_TYPE_LENGTH} characters`,
    };
  }

  if (value.length > MAX_VALUE_LENGTH) {
    return {
      code: "VALUE_TOO_LONG",
      message: `Value cannot exceed ${MAX_VALUE_LENGTH} characters`,
    };
  }

  return null;
}

/**
 * Check if a string is a valid reservation key.
 *
 * @param key - String to check
 * @returns true if valid reservation key format
 */
export function isValidReservationKey(key: string): key is ReservationKey {
  return validateReservationKey(key) === null;
}

/**
 * Assert that a string is a valid reservation key.
 *
 * @param key - String to validate
 * @throws Error if invalid
 */
export function assertValidReservationKey(key: string): asserts key is ReservationKey {
  const error = validateReservationKey(key);
  if (error) {
    throw new Error(`Invalid reservation key: ${error.message} (${error.code})`);
  }
}

// =============================================================================
// Deterministic ID Generation
// =============================================================================

/**
 * Generate a deterministic reservation ID from a key.
 *
 * Uses DJB2 hash algorithm to create consistent IDs for the same key.
 * This enables idempotent reserve operations - reserving the same key
 * multiple times will produce the same reservation ID.
 *
 * ## ⚠️ Collision Risk Warning
 *
 * DJB2 produces a 32-bit hash. Birthday paradox collision probabilities:
 * - ~1% collision at 9,300 reservations
 * - ~50% collision at 77,000 reservations
 *
 * **For high-volume production use cases**, consider:
 * 1. Using SHA-256 with truncation (requires async Web Crypto API)
 * 2. Using UUIDs for reservationId (trades idempotency for uniqueness)
 * 3. Adding a namespace prefix to partition the hash space by tenant
 *
 * For typical reservation workflows (registrations, checkouts), the 32-bit
 * space is sufficient since reservations are short-lived (TTL-based) and
 * collisions would only affect concurrent operations on different keys.
 *
 * @param key - Reservation key
 * @returns Deterministic reservation ID (12 chars: "res_" + 8 hex)
 *
 * @example
 * ```typescript
 * const key = createReservationKey("email", "alice@example.com");
 * const id = hashReservationId(key);
 * // Returns: "res_a1b2c3d4"
 *
 * // Same key always produces same ID
 * const id2 = hashReservationId(key);
 * console.assert(id === id2); // true
 * ```
 */
export function hashReservationId(key: ReservationKey): string {
  // Simple DJB2 hash algorithm for deterministic ID generation
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  // Convert to positive hex string
  const hexHash = (hash >>> 0).toString(16).padStart(8, "0");
  return `${RESERVATION_ID_PREFIX}${hexHash}`;
}

/**
 * Generate a deterministic reservation ID from type and value.
 *
 * Convenience function that combines key creation and ID hashing.
 *
 * @param type - Reservation type
 * @param value - Value to reserve
 * @returns Deterministic reservation ID
 * @throws Error if type or value is invalid
 *
 * @example
 * ```typescript
 * const id = hashReservationIdFromParts("email", "alice@example.com");
 * // Returns: "res_a1b2c3d4e5f6..."
 * ```
 */
export function hashReservationIdFromParts(type: string, value: string): string {
  const key = createReservationKey(type, value);
  return hashReservationId(key);
}
