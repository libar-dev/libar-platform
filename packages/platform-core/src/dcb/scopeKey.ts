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
 * @module dcb/scopeKey
 * @since Phase 16
 */

export type { DCBScopeKey, ParsedScopeKey, ScopeKeyValidationError } from "@libar-dev/platform-contracts-shared";
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
