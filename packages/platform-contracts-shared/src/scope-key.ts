export type DCBScopeKey = string & { readonly __brand: "DCBScopeKey" };

export interface ParsedScopeKey {
  tenantId: string;
  scopeType: string;
  scopeId: string;
  raw: DCBScopeKey;
}

export interface ScopeKeyValidationError {
  code: "INVALID_SCOPE_KEY_FORMAT" | "TENANT_ID_REQUIRED" | "SCOPE_KEY_EMPTY";
  message: string;
}

const SCOPE_KEY_REGEX = /^tenant:([^:]+):([^:]+):(.+)$/;

export const SCOPE_KEY_PREFIX = "tenant:" as const;

export function createScopeKey(tenantId: string, scopeType: string, scopeId: string): DCBScopeKey {
  if (!tenantId) {
    throw new Error("tenantId is required for scope key");
  }
  if (!scopeType) {
    throw new Error("scopeType is required for scope key");
  }
  if (!scopeId) {
    throw new Error("scopeId is required for scope key");
  }
  if (tenantId.includes(":")) {
    throw new Error("tenantId cannot contain colons");
  }
  if (scopeType.includes(":")) {
    throw new Error("scopeType cannot contain colons");
  }

  return `tenant:${tenantId}:${scopeType}:${scopeId}` as DCBScopeKey;
}

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

export function parseScopeKey(scopeKey: string): ParsedScopeKey | null {
  if (!scopeKey) {
    return null;
  }

  const match = scopeKey.match(SCOPE_KEY_REGEX);
  if (!match) {
    return null;
  }

  const tenantId = match[1];
  const scopeType = match[2];
  const scopeId = match[3];

  if (!tenantId || !scopeType || !scopeId) {
    return null;
  }

  return {
    tenantId,
    scopeType,
    scopeId,
    raw: scopeKey as DCBScopeKey,
  };
}

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
      message: `Invalid scope key format. Expected: tenant:${"${tenantId}"}:${"${scopeType}"}:${"${scopeId}"}, got: ${scopeKey}`,
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

export function isValidScopeKey(scopeKey: string): scopeKey is DCBScopeKey {
  return validateScopeKey(scopeKey) === null;
}

export function assertValidScopeKey(scopeKey: string): asserts scopeKey is DCBScopeKey {
  const error = validateScopeKey(scopeKey);
  if (error) {
    throw new Error(`${error.code}: ${error.message}`);
  }
}

export function isScopeTenant(scopeKey: DCBScopeKey, tenantId: string): boolean {
  const parsed = parseScopeKey(scopeKey);
  return parsed?.tenantId === tenantId;
}

function extractParsed(scopeKey: DCBScopeKey): ParsedScopeKey {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    throw new Error(`Invalid scope key: ${scopeKey}`);
  }
  return parsed;
}

export function extractTenantId(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).tenantId;
}

export function extractScopeType(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).scopeType;
}

export function extractScopeId(scopeKey: DCBScopeKey): string {
  return extractParsed(scopeKey).scopeId;
}
