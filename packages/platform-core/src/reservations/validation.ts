/**
 * ## Reservation Validation Utilities
 *
 * Input validation for reservation operations.
 *
 * @module reservations/validation
 * @since Phase 20
 */

import type {
  ReserveInput,
  ConfirmInput,
  ReleaseInput,
  TTLValidationError,
  ReserveValidationError,
} from "./types.js";
import {
  MIN_TTL_MS,
  MAX_TTL_MS,
  MAX_RESERVATION_ID_LENGTH,
  MAX_ENTITY_ID_LENGTH,
} from "./types.js";
import { validateReservationKeyParts } from "./key.js";

// =============================================================================
// TTL Validation
// =============================================================================

/**
 * Validate TTL value.
 *
 * @param ttl - TTL in milliseconds
 * @returns Validation error or null if valid
 *
 * @example
 * ```typescript
 * const error = validateTTL(300000); // 5 minutes - valid
 * // Returns: null
 *
 * const error2 = validateTTL(0); // invalid
 * // Returns: { code: "INVALID_TTL", message: "..." }
 *
 * const error3 = validateTTL(100000000); // too long
 * // Returns: { code: "TTL_TOO_LONG", message: "..." }
 * ```
 */
export function validateTTL(ttl: number): TTLValidationError | null {
  // Number.isFinite catches both NaN and Infinity
  if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
    return {
      code: "INVALID_TTL",
      message: "TTL must be a valid finite number",
    };
  }

  if (ttl <= 0) {
    return {
      code: "INVALID_TTL",
      message: `TTL must be positive (minimum: ${MIN_TTL_MS}ms)`,
    };
  }

  if (ttl < MIN_TTL_MS) {
    return {
      code: "INVALID_TTL",
      message: `TTL must be at least ${MIN_TTL_MS}ms (1 second)`,
    };
  }

  if (ttl > MAX_TTL_MS) {
    return {
      code: "TTL_TOO_LONG",
      message: `TTL cannot exceed ${MAX_TTL_MS}ms (24 hours)`,
    };
  }

  return null;
}

/**
 * Check if TTL is valid.
 *
 * @param ttl - TTL in milliseconds
 * @returns true if valid
 */
export function isValidTTL(ttl: number): boolean {
  return validateTTL(ttl) === null;
}

/**
 * Assert TTL is valid.
 *
 * @param ttl - TTL in milliseconds
 * @throws Error if invalid
 */
export function assertValidTTL(ttl: number): void {
  const error = validateTTL(ttl);
  if (error) {
    throw new Error(`Invalid TTL: ${error.message} (${error.code})`);
  }
}

// =============================================================================
// Reserve Input Validation
// =============================================================================

/**
 * Validate reserve operation input.
 *
 * @param input - Reserve input to validate
 * @returns Validation error or null if valid
 *
 * @example
 * ```typescript
 * const error = validateReserveInput({
 *   type: "email",
 *   value: "alice@example.com",
 *   ttl: 300000
 * });
 * // Returns: null (valid)
 *
 * const error2 = validateReserveInput({
 *   type: "",
 *   value: "alice@example.com",
 *   ttl: 300000
 * });
 * // Returns: { status: "error", code: "INVALID_TYPE", message: "..." }
 * ```
 */
export function validateReserveInput(input: ReserveInput): ReserveValidationError | null {
  // Validate type and value
  const keyError = validateReservationKeyParts(input.type, input.value);
  if (keyError) {
    if (keyError.code === "TYPE_REQUIRED" || keyError.code === "TYPE_CONTAINS_SEPARATOR") {
      return {
        status: "error",
        code: "INVALID_TYPE",
        message: keyError.message,
      };
    }
    if (keyError.code === "VALUE_REQUIRED" || keyError.code === "VALUE_EMPTY") {
      return {
        status: "error",
        code: "INVALID_VALUE",
        message: keyError.message,
      };
    }
    if (keyError.code === "TYPE_TOO_LONG") {
      return {
        status: "error",
        code: "TYPE_TOO_LONG",
        message: keyError.message,
      };
    }
    if (keyError.code === "VALUE_TOO_LONG") {
      return {
        status: "error",
        code: "VALUE_TOO_LONG",
        message: keyError.message,
      };
    }
    return {
      status: "error",
      code: "INVALID_TYPE",
      message: keyError.message,
    };
  }

  // Validate TTL
  const ttlError = validateTTL(input.ttl);
  if (ttlError) {
    return {
      status: "error",
      code: ttlError.code,
      message: ttlError.message,
    };
  }

  return null;
}

/**
 * Check if reserve input is valid.
 *
 * @param input - Reserve input to check
 * @returns true if valid
 */
export function isValidReserveInput(input: ReserveInput): boolean {
  return validateReserveInput(input) === null;
}

/**
 * Assert reserve input is valid.
 *
 * @param input - Reserve input to validate
 * @throws Error if invalid
 */
export function assertValidReserveInput(input: ReserveInput): void {
  const error = validateReserveInput(input);
  if (error) {
    throw new Error(`Invalid reserve input: ${error.message} (${error.code})`);
  }
}

// =============================================================================
// Confirm Input Validation
// =============================================================================

/**
 * Validation error for confirm input.
 */
export interface ConfirmValidationError {
  code:
    | "RESERVATION_ID_REQUIRED"
    | "ENTITY_ID_REQUIRED"
    | "RESERVATION_ID_TOO_LONG"
    | "ENTITY_ID_TOO_LONG";
  message: string;
}

/**
 * Validate confirm operation input.
 *
 * @param input - Confirm input to validate
 * @returns Validation error or null if valid
 */
export function validateConfirmInput(input: ConfirmInput): ConfirmValidationError | null {
  if (!input.reservationId || input.reservationId.trim() === "") {
    return {
      code: "RESERVATION_ID_REQUIRED",
      message: "Reservation ID is required",
    };
  }

  if (input.reservationId.length > MAX_RESERVATION_ID_LENGTH) {
    return {
      code: "RESERVATION_ID_TOO_LONG",
      message: `Reservation ID cannot exceed ${MAX_RESERVATION_ID_LENGTH} characters`,
    };
  }

  if (!input.entityId || input.entityId.trim() === "") {
    return {
      code: "ENTITY_ID_REQUIRED",
      message: "Entity ID is required to confirm reservation",
    };
  }

  if (input.entityId.length > MAX_ENTITY_ID_LENGTH) {
    return {
      code: "ENTITY_ID_TOO_LONG",
      message: `Entity ID cannot exceed ${MAX_ENTITY_ID_LENGTH} characters`,
    };
  }

  return null;
}

/**
 * Check if confirm input is valid.
 *
 * @param input - Confirm input to check
 * @returns true if valid
 */
export function isValidConfirmInput(input: ConfirmInput): boolean {
  return validateConfirmInput(input) === null;
}

/**
 * Assert confirm input is valid.
 *
 * @param input - Confirm input to validate
 * @throws Error if invalid
 */
export function assertValidConfirmInput(input: ConfirmInput): void {
  const error = validateConfirmInput(input);
  if (error) {
    throw new Error(`Invalid confirm input: ${error.message} (${error.code})`);
  }
}

// =============================================================================
// Release Input Validation
// =============================================================================

/**
 * Validation error for release input.
 */
export interface ReleaseValidationError {
  code: "RESERVATION_ID_REQUIRED" | "RESERVATION_ID_TOO_LONG";
  message: string;
}

/**
 * Validate release operation input.
 *
 * @param input - Release input to validate
 * @returns Validation error or null if valid
 */
export function validateReleaseInput(input: ReleaseInput): ReleaseValidationError | null {
  if (!input.reservationId || input.reservationId.trim() === "") {
    return {
      code: "RESERVATION_ID_REQUIRED",
      message: "Reservation ID is required",
    };
  }

  if (input.reservationId.length > MAX_RESERVATION_ID_LENGTH) {
    return {
      code: "RESERVATION_ID_TOO_LONG",
      message: `Reservation ID cannot exceed ${MAX_RESERVATION_ID_LENGTH} characters`,
    };
  }

  return null;
}

/**
 * Check if release input is valid.
 *
 * @param input - Release input to check
 * @returns true if valid
 */
export function isValidReleaseInput(input: ReleaseInput): boolean {
  return validateReleaseInput(input) === null;
}

/**
 * Assert release input is valid.
 *
 * @param input - Release input to validate
 * @throws Error if invalid
 */
export function assertValidReleaseInput(input: ReleaseInput): void {
  const error = validateReleaseInput(input);
  if (error) {
    throw new Error(`Invalid release input: ${error.message} (${error.code})`);
  }
}
