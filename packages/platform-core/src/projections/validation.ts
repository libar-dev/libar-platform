/**
 * Projection Category Validation
 *
 * Runtime validation for projection categories with error codes
 * and helpful error messages.
 *
 * @example
 * ```typescript
 * const result = validateProjectionCategory("view");
 * if (result.valid) {
 *   // result.category is typed as ProjectionCategory
 * } else {
 *   // result.error contains code, message, and suggestions
 * }
 * ```
 */

import type { ProjectionCategory } from "@libar-dev/platform-bc";
import { PROJECTION_CATEGORIES, ProjectionCategorySchema } from "@libar-dev/platform-bc";

/**
 * Error codes for projection validation.
 *
 * | Code | Description |
 * |------|-------------|
 * | CATEGORY_REQUIRED | Category field is missing or null/undefined |
 * | INVALID_CATEGORY | Category value is not a valid ProjectionCategory |
 */
export const PROJECTION_VALIDATION_ERRORS = {
  /** Category field is required but was missing or undefined */
  CATEGORY_REQUIRED: "CATEGORY_REQUIRED",
  /** Category value is not one of the valid categories */
  INVALID_CATEGORY: "INVALID_CATEGORY",
} as const;

/**
 * Projection validation error code type.
 */
export type ProjectionValidationErrorCode =
  (typeof PROJECTION_VALIDATION_ERRORS)[keyof typeof PROJECTION_VALIDATION_ERRORS];

/**
 * Structured validation error for projections.
 */
export interface ProjectionValidationError {
  /** Error code for programmatic handling */
  code: ProjectionValidationErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggested valid values (when applicable) */
  suggestedCategories?: readonly string[];
}

/**
 * Validation result type - either valid with the category or invalid with error.
 */
export type ProjectionCategoryValidationResult =
  | { valid: true; category: ProjectionCategory }
  | { valid: false; error: ProjectionValidationError };

/**
 * Validate a projection category value.
 *
 * Returns a discriminated union:
 * - `{ valid: true, category }` - Valid category with typed value
 * - `{ valid: false, error }` - Invalid with structured error info
 *
 * @param category - The value to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * // Valid category
 * const result1 = validateProjectionCategory("view");
 * // { valid: true, category: "view" }
 *
 * // Missing category
 * const result2 = validateProjectionCategory(undefined);
 * // { valid: false, error: { code: "CATEGORY_REQUIRED", ... } }
 *
 * // Invalid category
 * const result3 = validateProjectionCategory("custom");
 * // { valid: false, error: { code: "INVALID_CATEGORY", ... } }
 * ```
 */
export function validateProjectionCategory(category: unknown): ProjectionCategoryValidationResult {
  // Check for missing/null/undefined
  if (category === undefined || category === null) {
    return {
      valid: false,
      error: {
        code: PROJECTION_VALIDATION_ERRORS.CATEGORY_REQUIRED,
        message: `Projection category is required. Valid categories: ${PROJECTION_CATEGORIES.join(", ")}.`,
        suggestedCategories: PROJECTION_CATEGORIES,
      },
    };
  }

  // Validate using Zod schema
  const result = ProjectionCategorySchema.safeParse(category);
  if (!result.success) {
    return {
      valid: false,
      error: {
        code: PROJECTION_VALIDATION_ERRORS.INVALID_CATEGORY,
        message: `Invalid projection category "${String(category)}". Valid categories: ${PROJECTION_CATEGORIES.join(", ")}.`,
        suggestedCategories: PROJECTION_CATEGORIES,
      },
    };
  }

  return { valid: true, category: result.data };
}

/**
 * Assert that a category is valid, throwing on failure.
 *
 * Use this when you want to fail fast on invalid categories.
 *
 * @param category - The value to validate
 * @throws Error with descriptive message if category is invalid
 * @returns The validated category
 *
 * @example
 * ```typescript
 * // Throws if invalid
 * const category = assertValidCategory(input);
 * // category is typed as ProjectionCategory
 * ```
 */
export function assertValidCategory(category: unknown): ProjectionCategory {
  const result = validateProjectionCategory(category);
  if (!result.valid) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  return result.category;
}
