/**
 * @libar-docs
 * @libar-docs-pattern DCBScopeKeyUtilities
 * @libar-docs-status completed
 * @libar-docs-phase 16
 * @libar-docs-ddd
 * @libar-docs-extract-shapes SCOPE_KEY_PREFIX, createScopeKey, tryCreateScopeKey, parseScopeKey, validateScopeKey, isValidScopeKey, assertValidScopeKey, isScopeTenant, extractTenantId, extractScopeType, extractScopeId
 *
 * ## DCB Scope Key Utilities
 *
 * Functions for creating, parsing, and validating scope keys.
 *
 * Scope keys follow the format: `tenant:${tenantId}:${scopeType}:${scopeId}`
 *
 * The tenant prefix is **mandatory** to ensure tenant isolation - all DCB
 * operations are scoped to a single tenant, preventing cross-tenant invariants.
 *
 * @module dcb/scopeKey
 * @since Phase 16
 */

import type { DCBScopeKey, ParsedScopeKey, ScopeKeyValidationError } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Regex pattern for valid scope keys.
 *
 * Format: tenant:${tenantId}:${scopeType}:${scopeId}
 *
 * - tenantId: non-empty, no colons
 * - scopeType: non-empty, no colons
 * - scopeId: non-empty, may contain colons (e.g., composite IDs)
 */
const SCOPE_KEY_REGEX = /^tenant:([^:]+):([^:]+):(.+)$/;

/**
 * Scope key prefix for tenant isolation.
 */
export const SCOPE_KEY_PREFIX = "tenant:" as const;

// =============================================================================
// Creation
// =============================================================================

/**
 * Create a scope key from components.
 *
 * @param tenantId - Tenant ID for isolation
 * @param scopeType - Type of scope (e.g., "reservation", "order")
 * @param scopeId - Unique ID within the scope type
 * @returns Branded scope key
 * @throws Error if any component is empty or contains invalid characters
 *
 * @example
 * ```typescript
 * const scopeKey = createScopeKey("tenant_123", "reservation", "res_456");
 * // Returns: "tenant:tenant_123:reservation:res_456" as DCBScopeKey
 * ```
 */
export function createScopeKey(tenantId: string, scopeType: string, scopeId: string): DCBScopeKey {
  // Validate non-empty
  if (!tenantId) {
    throw new Error("tenantId is required for scope key");
  }
  if (!scopeType) {
    throw new Error("scopeType is required for scope key");
  }
  if (!scopeId) {
    throw new Error("scopeId is required for scope key");
  }

  // Validate no colons in tenantId and scopeType (scopeId may have colons)
  if (tenantId.includes(":")) {
    throw new Error("tenantId cannot contain colons");
  }
  if (scopeType.includes(":")) {
    throw new Error("scopeType cannot contain colons");
  }

  return `tenant:${tenantId}:${scopeType}:${scopeId}` as DCBScopeKey;
}

/**
 * Create a scope key from components, returning null on invalid input.
 *
 * Safe version of createScopeKey that doesn't throw.
 *
 * @param tenantId - Tenant ID for isolation
 * @param scopeType - Type of scope
 * @param scopeId - Unique ID within the scope type
 * @returns Branded scope key or null if invalid
 */
export function tryCreateScopeKey(
  tenantId: string,
  scopeType: string,
  scopeId: string
): DCBScopeKey | null {
  try {
    return createScopeKey(tenantId, scopeType, scopeId);
  } catch {
    return null;
  }
}

// =============================================================================
// Parsing
// =============================================================================

/**
 * Parse a scope key into its components.
 *
 * @param scopeKey - Scope key to parse
 * @returns Parsed components if valid, null if invalid format
 *
 * @example
 * ```typescript
 * const parsed = parseScopeKey("tenant:t1:order:o1");
 * // Returns: { tenantId: "t1", scopeType: "order", scopeId: "o1", raw: "..." }
 *
 * const invalid = parseScopeKey("invalid");
 * // Returns: null
 * ```
 */
export function parseScopeKey(scopeKey: string): ParsedScopeKey | null {
  if (!scopeKey) {
    return null;
  }

  const match = scopeKey.match(SCOPE_KEY_REGEX);
  if (!match) {
    return null;
  }

  // TypeScript types match groups as string | undefined, but our regex
  // guarantees these groups exist when match succeeds
  const tenantId = match[1];
  const scopeType = match[2];
  const scopeId = match[3];

  if (!tenantId || !scopeType || !scopeId) {
    // Should never happen with our regex, but TypeScript needs the check
    return null;
  }

  return {
    tenantId,
    scopeType,
    scopeId,
    raw: scopeKey as DCBScopeKey,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a scope key format.
 *
 * @param scopeKey - Scope key to validate
 * @returns Error object if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateScopeKey("reservation:res_123");
 * // Returns: { code: "INVALID_SCOPE_KEY_FORMAT", message: "..." }
 *
 * const valid = validateScopeKey("tenant:t1:reservation:res_123");
 * // Returns: null (valid)
 * ```
 */
export function validateScopeKey(scopeKey: string): ScopeKeyValidationError | null {
  if (!scopeKey) {
    return {
      code: "SCOPE_KEY_EMPTY",
      message: "Scope key cannot be empty",
    };
  }

  if (!scopeKey.startsWith(SCOPE_KEY_PREFIX)) {
    return {
      code: "INVALID_SCOPE_KEY_FORMAT",
      message: `Scope key must start with '${SCOPE_KEY_PREFIX}' prefix for tenant isolation. Got: ${scopeKey}`,
    };
  }

  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    return {
      code: "INVALID_SCOPE_KEY_FORMAT",
      message: `Invalid scope key format. Expected: tenant:\${tenantId}:\${scopeType}:\${scopeId}, got: ${scopeKey}`,
    };
  }

  if (!parsed.tenantId) {
    return {
      code: "TENANT_ID_REQUIRED",
      message: "tenantId is required in scope key",
    };
  }

  return null;
}

/**
 * Check if a scope key is valid.
 *
 * @param scopeKey - Scope key to check
 * @returns true if valid
 */
export function isValidScopeKey(scopeKey: string): scopeKey is DCBScopeKey {
  return validateScopeKey(scopeKey) === null;
}

/**
 * Assert that a scope key is valid, throwing if not.
 *
 * @param scopeKey - Scope key to assert
 * @throws Error if scope key is invalid
 */
export function assertValidScopeKey(scopeKey: string): asserts scopeKey is DCBScopeKey {
  const error = validateScopeKey(scopeKey);
  if (error) {
    throw new Error(`${error.code}: ${error.message}`);
  }
}

// =============================================================================
// Tenant Operations
// =============================================================================

/**
 * Check if a scope key belongs to a specific tenant.
 *
 * @param scopeKey - Scope key to check
 * @param tenantId - Tenant ID to match
 * @returns true if scope belongs to tenant
 */
export function isScopeTenant(scopeKey: DCBScopeKey, tenantId: string): boolean {
  const parsed = parseScopeKey(scopeKey);
  return parsed?.tenantId === tenantId;
}

/**
 * Extract components from scope key with assertion.
 *
 * @internal
 */
function extractParsed(scopeKey: DCBScopeKey): ParsedScopeKey {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    throw new Error(`Invalid scope key: ${scopeKey}`);
  }
  return parsed;
}

/**
 * Extract tenant ID from scope key.
 *
 * @param scopeKey - Scope key to extract from
 * @returns Tenant ID
 * @throws Error if scope key is invalid
 */
export function extractTenantId(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).tenantId;
}

/**
 * Extract scope type from scope key.
 *
 * @param scopeKey - Scope key to extract from
 * @returns Scope type
 * @throws Error if scope key is invalid
 */
export function extractScopeType(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).scopeType;
}

/**
 * Extract scope ID from scope key.
 *
 * @param scopeKey - Scope key to extract from
 * @returns Scope ID
 * @throws Error if scope key is invalid
 */
export function extractScopeId(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).scopeId;
}
