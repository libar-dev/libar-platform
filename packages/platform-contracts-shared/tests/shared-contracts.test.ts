import { describe, expect, it } from "vitest";

import {
  EVENT_CATEGORIES,
  PROCESS_MANAGER_STATUSES,
  SCOPE_KEY_PREFIX,
  createScopeKey,
  extractScopeId,
  extractScopeType,
  extractTenantId,
  isEventCategory,
  isProcessManagerStatus,
  parseScopeKey,
  validateScopeKey,
} from "../src/index.js";

describe("platform-contracts-shared", () => {
  it("exports the canonical event category tuple", () => {
    expect(EVENT_CATEGORIES).toEqual(["domain", "integration", "trigger", "fat"]);
    expect(EVENT_CATEGORIES.every((value) => isEventCategory(value))).toBe(true);
  });

  it("exports the canonical process manager status tuple", () => {
    expect(PROCESS_MANAGER_STATUSES).toEqual(["idle", "processing", "completed", "failed"]);
    expect(PROCESS_MANAGER_STATUSES.every((value) => isProcessManagerStatus(value))).toBe(true);
  });

  it("creates and parses the canonical scope key format", () => {
    const scopeKey = createScopeKey("tenant-1", "reservation", "res-123");

    expect(scopeKey.startsWith(SCOPE_KEY_PREFIX)).toBe(true);
    expect(parseScopeKey(scopeKey)).toEqual({
      tenantId: "tenant-1",
      scopeType: "reservation",
      scopeId: "res-123",
      raw: scopeKey,
    });
    expect(extractTenantId(scopeKey)).toBe("tenant-1");
    expect(extractScopeType(scopeKey)).toBe("reservation");
    expect(extractScopeId(scopeKey)).toBe("res-123");
  });

  it("rejects invalid scope keys", () => {
    expect(validateScopeKey("")).toEqual({
      code: "SCOPE_KEY_EMPTY",
      message: "Scope key cannot be empty",
    });
    expect(validateScopeKey("reservation:res-123")?.code).toBe("INVALID_SCOPE_KEY_FORMAT");
  });
});
