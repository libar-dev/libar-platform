/**
 * Pattern Registry — Validation for Pattern Definition Arrays
 *
 * Validates collections of pattern definitions for use in AgentBCConfig.
 * Checks individual pattern validity and cross-pattern constraints
 * (e.g., no duplicate names).
 *
 * @module agent/pattern-registry
 */

import type { PatternDefinition } from "./patterns.js";
import { validatePatternDefinition } from "./patterns.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for pattern registry validation.
 */
export const PATTERN_REGISTRY_ERROR_CODES = {
  /** A pattern with the same name already exists */
  DUPLICATE_PATTERN: "DUPLICATE_PATTERN",
  /** Pattern definition failed individual validation */
  INVALID_PATTERN: "INVALID_PATTERN",
  /** Pattern name is required and must be non-empty */
  PATTERN_NAME_REQUIRED: "PATTERN_NAME_REQUIRED",
  /** Pattern trigger function is required */
  TRIGGER_REQUIRED: "TRIGGER_REQUIRED",
} as const;

export type PatternRegistryErrorCode =
  (typeof PATTERN_REGISTRY_ERROR_CODES)[keyof typeof PATTERN_REGISTRY_ERROR_CODES];

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating an array of pattern definitions.
 */
export type PatternRegistryValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: PatternRegistryErrorCode;
      readonly message: string;
    };

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an array of pattern definitions.
 *
 * Checks:
 * - Each pattern passes individual validation (name, trigger, window)
 * - No duplicate pattern names exist in the array
 *
 * Returns the first error found (short-circuits on failure).
 *
 * @param patterns - Array of pattern definitions to validate
 * @returns Validation result with error details if invalid
 */
export function validatePatternDefinitions(
  patterns: readonly PatternDefinition[]
): PatternRegistryValidationResult {
  const names = new Set<string>();

  for (const pattern of patterns) {
    // Validate each individual pattern
    const result = validatePatternDefinition(pattern);
    if (!result.valid) {
      // Map pattern-level error codes to registry-level codes
      const code = mapErrorCode(result.code);
      return {
        valid: false,
        code,
        message: result.message,
      };
    }

    // Check for duplicate names
    if (names.has(pattern.name)) {
      return {
        valid: false,
        code: PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN,
        message: `Duplicate pattern name: '${pattern.name}'`,
      };
    }
    names.add(pattern.name);
  }

  return { valid: true };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Map pattern-level error codes to registry-level error codes.
 */
function mapErrorCode(patternCode: string): PatternRegistryErrorCode {
  switch (patternCode) {
    case "PATTERN_NAME_REQUIRED":
      return PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED;
    case "TRIGGER_REQUIRED":
      return PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED;
    default:
      return PATTERN_REGISTRY_ERROR_CODES.INVALID_PATTERN;
  }
}
