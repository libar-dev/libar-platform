export type { EventCategory } from "./event-category.js";
export { EVENT_CATEGORIES, isEventCategory } from "./event-category.js";

export type { ProcessManagerStatus } from "./process-manager-status.js";
export { PROCESS_MANAGER_STATUSES, isProcessManagerStatus } from "./process-manager-status.js";

export type { DCBScopeKey, ParsedScopeKey, ScopeKeyValidationError } from "./scope-key.js";
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
} from "./scope-key.js";
