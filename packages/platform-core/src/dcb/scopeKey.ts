/**
 * @architect
 * @architect-pattern DCBScopeKeyUtilities
 * @architect-status completed
 * @architect-phase 16
 * @architect-ddd
 * @architect-extract-shapes SCOPE_KEY_PREFIX, createScopeKey, tryCreateScopeKey, parseScopeKey, validateScopeKey, isValidScopeKey, assertValidScopeKey, isScopeTenant, extractTenantId, extractScopeType, extractScopeId
 *
 * ## DCB Scope Key Utilities
 *
 * Re-export the canonical shared scope-key contract used across platform packages.
 *
 * ### When to Use
 *
 * - Creating or parsing scope keys for DCB execution and storage
 * - Sharing one canonical scope-key contract across platform-core and app code
 * - Validating tenant, scope type, and scope ID segments without duplicating helpers
 *
 * @module dcb/scopeKey
 * @since Phase 16
 */

export type {
  DCBScopeKey,
  ParsedScopeKey,
  ScopeKeyValidationError,
} from "@libar-dev/platform-contracts-shared";
export {
  SCOPE_KEY_PREFIX,
  createScopeKey,
  tryCreateScopeKey,
  parseScopeKey,
  validateScopeKey,
  isValidScopeKey,
  assertValidScopeKey,
  isScopeTenant,
  extractTenantId,
  extractScopeType,
  extractScopeId,
} from "@libar-dev/platform-contracts-shared";
