/**
 * Approval Module Unit Tests
 *
 * Tests for the human-in-loop approval workflow functions including:
 * - Approval determination (shouldRequireApproval)
 * - Authorization checks (isAuthorizedReviewer)
 * - Status transitions (approve, reject, expire)
 * - Factory functions and type guards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Error codes
  APPROVAL_ERROR_CODES,
  // Status types
  APPROVAL_STATUSES,
  isApprovalStatus,
  // Schemas
  ApprovalStatusSchema,
  PendingApprovalSchema,
  ApprovalAuthContextSchema,
  // Factory functions
  createPendingApproval,
  generateApprovalId,
  // Status transitions
  approveAction,
  rejectAction,
  expireAction,
  // Safe variants
  safeApproveAction,
  safeRejectAction,
  // Type guards
  isApprovalPending,
  isApprovalApproved,
  isApprovalRejected,
  isApprovalExpired,
  isApprovalActionable,
  // Authorization
  isAuthorizedReviewer,
  shouldRequireApproval,
  // Timeout helpers
  parseApprovalTimeout,
  isValidApprovalTimeout,
  calculateExpirationTime,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  // Helper functions
  getRemainingApprovalTime,
  formatRemainingApprovalTime,
  validatePendingApproval,
  // Types
  type PendingApproval,
  type ApprovalAuthContext,
} from "../../../src/agent/approval.js";
import type { HumanInLoopConfig } from "../../../src/agent/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestApproval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  const now = Date.now();
  return {
    approvalId: "apr_test_123",
    agentId: "test-agent",
    decisionId: "dec_test_456",
    action: { type: "TestAction", payload: { key: "value" } },
    confidence: 0.75,
    reason: "Test reason",
    status: "pending",
    requestedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours from now
    ...overrides,
  };
}

function createTestAuthContext(overrides: Partial<ApprovalAuthContext> = {}): ApprovalAuthContext {
  return {
    userId: "user-123",
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<HumanInLoopConfig> = {}): HumanInLoopConfig {
  return {
    confidenceThreshold: 0.9,
    ...overrides,
  };
}

// ============================================================================
// Error Codes Tests
// ============================================================================

describe("APPROVAL_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND).toBe("APPROVAL_NOT_FOUND");
    expect(APPROVAL_ERROR_CODES.INVALID_STATUS_TRANSITION).toBe("INVALID_STATUS_TRANSITION");
    expect(APPROVAL_ERROR_CODES.ALREADY_PROCESSED).toBe("ALREADY_PROCESSED");
    expect(APPROVAL_ERROR_CODES.APPROVAL_EXPIRED).toBe("APPROVAL_EXPIRED");
    expect(APPROVAL_ERROR_CODES.INVALID_TIMEOUT_FORMAT).toBe("INVALID_TIMEOUT_FORMAT");
    expect(APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER).toBe("UNAUTHORIZED_REVIEWER");
  });
});

// ============================================================================
// Status Types Tests
// ============================================================================

describe("APPROVAL_STATUSES", () => {
  it("contains all four statuses", () => {
    expect(APPROVAL_STATUSES).toEqual(["pending", "approved", "rejected", "expired"]);
  });

  it("is a readonly tuple with 4 elements", () => {
    expect(Array.isArray(APPROVAL_STATUSES)).toBe(true);
    expect(APPROVAL_STATUSES.length).toBe(4);
  });
});

describe("isApprovalStatus type guard", () => {
  it.each([
    ["pending", true],
    ["approved", true],
    ["rejected", true],
    ["expired", true],
    ["invalid", false],
    ["PENDING", false],
    ["Approved", false],
    ["", false],
    [123, false],
    [null, false],
    [undefined, false],
  ])("isApprovalStatus(%s) returns %s", (value, expected) => {
    expect(isApprovalStatus(value)).toBe(expected);
  });

  it("returns false for objects", () => {
    expect(isApprovalStatus({})).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isApprovalStatus(["pending"])).toBe(false);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("ApprovalStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of APPROVAL_STATUSES) {
      const result = ApprovalStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid statuses", () => {
    const invalidValues = ["custom", "PENDING", "Approved", "", 123, null];
    for (const value of invalidValues) {
      const result = ApprovalStatusSchema.safeParse(value);
      expect(result.success).toBe(false);
    }
  });
});

describe("PendingApprovalSchema", () => {
  it("accepts valid approval objects", () => {
    const approval = createTestApproval();
    const result = PendingApprovalSchema.safeParse(approval);
    expect(result.success).toBe(true);
  });

  it("rejects approval with missing required fields", () => {
    const invalid = { approvalId: "test" }; // missing other fields
    const result = PendingApprovalSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects approval with invalid confidence", () => {
    const approval = createTestApproval({ confidence: 1.5 }); // > 1
    const result = PendingApprovalSchema.safeParse(approval);
    expect(result.success).toBe(false);
  });

  it("rejects approval with negative confidence", () => {
    const approval = createTestApproval({ confidence: -0.1 });
    const result = PendingApprovalSchema.safeParse(approval);
    expect(result.success).toBe(false);
  });
});

describe("ApprovalAuthContextSchema", () => {
  it("accepts valid auth context", () => {
    const context = createTestAuthContext();
    const result = ApprovalAuthContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("accepts auth context with roles", () => {
    const context = createTestAuthContext({ roles: ["reviewer", "admin"] });
    const result = ApprovalAuthContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("accepts auth context with agentIds", () => {
    const context = createTestAuthContext({ agentIds: ["agent-1", "agent-2"] });
    const result = ApprovalAuthContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("rejects auth context with empty userId", () => {
    const result = ApprovalAuthContextSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Timeout Parsing Tests
// ============================================================================

describe("parseApprovalTimeout", () => {
  it.each([
    ["7d", 7 * 24 * 60 * 60 * 1000],
    ["24h", 24 * 60 * 60 * 1000],
    ["30m", 30 * 60 * 1000],
    ["1d", 24 * 60 * 60 * 1000],
    ["1h", 60 * 60 * 1000],
    ["1m", 60 * 1000],
  ])("parseApprovalTimeout('%s') returns %d", (input, expected) => {
    expect(parseApprovalTimeout(input)).toBe(expected);
  });

  it("returns null for invalid formats", () => {
    expect(parseApprovalTimeout("invalid")).toBeNull();
    expect(parseApprovalTimeout("abc")).toBeNull();
    expect(parseApprovalTimeout("")).toBeNull();
    expect(parseApprovalTimeout("24")).toBeNull();
    expect(parseApprovalTimeout("h24")).toBeNull();
    expect(parseApprovalTimeout("60s")).toBeNull(); // seconds not supported
  });

  it("returns null for zero values (must be positive)", () => {
    // The implementation requires value > 0
    expect(parseApprovalTimeout("0d")).toBeNull();
    expect(parseApprovalTimeout("0h")).toBeNull();
    expect(parseApprovalTimeout("0m")).toBeNull();
  });
});

describe("isValidApprovalTimeout", () => {
  it("returns true for valid formats", () => {
    expect(isValidApprovalTimeout("24h")).toBe(true);
    expect(isValidApprovalTimeout("7d")).toBe(true);
    expect(isValidApprovalTimeout("30m")).toBe(true);
  });

  it("returns false for invalid formats", () => {
    expect(isValidApprovalTimeout("invalid")).toBe(false);
    expect(isValidApprovalTimeout("")).toBe(false);
  });
});

describe("calculateExpirationTime", () => {
  it("calculates expiration with explicit timeout", () => {
    const config = createTestConfig({ approvalTimeout: "1h" });
    const requestedAt = 1000000;
    const expected = requestedAt + 60 * 60 * 1000; // 1 hour
    expect(calculateExpirationTime(config, requestedAt)).toBe(expected);
  });

  it("uses default timeout when not specified", () => {
    const config = createTestConfig(); // no approvalTimeout
    const requestedAt = 1000000;
    const expected = requestedAt + DEFAULT_APPROVAL_TIMEOUT_MS;
    expect(calculateExpirationTime(config, requestedAt)).toBe(expected);
  });

  it("uses default timeout for invalid format", () => {
    const config = createTestConfig({ approvalTimeout: "invalid" });
    const requestedAt = 1000000;
    const expected = requestedAt + DEFAULT_APPROVAL_TIMEOUT_MS;
    expect(calculateExpirationTime(config, requestedAt)).toBe(expected);
  });
});

// ============================================================================
// Approval Determination Tests (CRITICAL)
// ============================================================================

describe("shouldRequireApproval", () => {
  describe("confidence threshold behavior", () => {
    it("returns true when confidence is below threshold", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });
      expect(shouldRequireApproval(config, "SomeAction", 0.85)).toBe(true);
    });

    it("returns true when confidence is exactly at threshold (inclusive)", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });
      // At exactly 0.9, approval IS required (inclusive boundary)
      expect(shouldRequireApproval(config, "SomeAction", 0.9)).toBe(true);
    });

    it("returns false when confidence is above threshold", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });
      expect(shouldRequireApproval(config, "SomeAction", 0.95)).toBe(false);
    });

    it("uses default threshold of 0.9 when not specified", () => {
      const config: HumanInLoopConfig = {}; // no threshold
      expect(shouldRequireApproval(config, "SomeAction", 0.85)).toBe(true);
      expect(shouldRequireApproval(config, "SomeAction", 0.91)).toBe(false);
    });
  });

  describe("requiresApproval list behavior", () => {
    it("returns true when action is in requiresApproval list (regardless of confidence)", () => {
      const config = createTestConfig({
        confidenceThreshold: 0.9,
        requiresApproval: ["DeleteCustomer", "TransferFunds"],
      });

      // High confidence doesn't matter - it's in the list
      expect(shouldRequireApproval(config, "DeleteCustomer", 0.99)).toBe(true);
      expect(shouldRequireApproval(config, "TransferFunds", 1.0)).toBe(true);
    });

    it("returns false for actions not in requiresApproval list with high confidence", () => {
      const config = createTestConfig({
        confidenceThreshold: 0.9,
        requiresApproval: ["DeleteCustomer"],
      });

      expect(shouldRequireApproval(config, "UpdateCustomer", 0.95)).toBe(false);
    });
  });

  describe("autoApprove list behavior", () => {
    it("returns false when action is in autoApprove list (regardless of confidence)", () => {
      const config = createTestConfig({
        confidenceThreshold: 0.9,
        autoApprove: ["LogEvent", "SendNotification"],
      });

      // Low confidence doesn't matter - it's auto-approved
      expect(shouldRequireApproval(config, "LogEvent", 0.1)).toBe(false);
      expect(shouldRequireApproval(config, "SendNotification", 0.5)).toBe(false);
    });

    it("autoApprove takes precedence over low confidence", () => {
      const config = createTestConfig({
        confidenceThreshold: 0.9,
        autoApprove: ["SafeAction"],
      });

      expect(shouldRequireApproval(config, "SafeAction", 0.1)).toBe(false);
    });
  });

  describe("requiresApproval takes precedence over autoApprove", () => {
    it("requiresApproval wins when action is in both lists", () => {
      const config = createTestConfig({
        requiresApproval: ["ConflictAction"],
        autoApprove: ["ConflictAction"],
      });

      // requiresApproval is checked first
      expect(shouldRequireApproval(config, "ConflictAction", 0.99)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty requiresApproval and autoApprove lists", () => {
      const config = createTestConfig({
        confidenceThreshold: 0.9,
        requiresApproval: [],
        autoApprove: [],
      });

      // Falls through to confidence check
      expect(shouldRequireApproval(config, "SomeAction", 0.85)).toBe(true);
      expect(shouldRequireApproval(config, "SomeAction", 0.95)).toBe(false);
    });

    it("handles undefined requiresApproval and autoApprove", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });

      // Falls through to confidence check
      expect(shouldRequireApproval(config, "SomeAction", 0.85)).toBe(true);
    });

    it("handles confidence of 0", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });
      expect(shouldRequireApproval(config, "SomeAction", 0)).toBe(true);
    });

    it("handles confidence of 1", () => {
      const config = createTestConfig({ confidenceThreshold: 0.9 });
      expect(shouldRequireApproval(config, "SomeAction", 1)).toBe(false);
    });
  });
});

// ============================================================================
// Authorization Tests (CRITICAL)
// ============================================================================

describe("isAuthorizedReviewer", () => {
  describe("agentIds restriction", () => {
    it("returns true when approval agentId is in authContext.agentIds", () => {
      const approval = createTestApproval({ agentId: "agent-1" });
      const authContext = createTestAuthContext({ agentIds: ["agent-1", "agent-2"] });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });

    it("returns false when approval agentId is NOT in authContext.agentIds", () => {
      const approval = createTestApproval({ agentId: "agent-3" });
      const authContext = createTestAuthContext({ agentIds: ["agent-1", "agent-2"] });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(false);
    });

    it("returns true when agentIds is undefined (no restriction)", () => {
      const approval = createTestApproval({ agentId: "any-agent" });
      const authContext = createTestAuthContext({ agentIds: undefined });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });

    it("returns true when agentIds is empty array (no restriction)", () => {
      const approval = createTestApproval({ agentId: "any-agent" });
      const authContext = createTestAuthContext({ agentIds: [] });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });
  });

  describe("roles behavior", () => {
    it("returns true when user has at least one role", () => {
      const approval = createTestApproval();
      const authContext = createTestAuthContext({ roles: ["reviewer"] });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });

    it("returns true when roles is undefined (no role requirement)", () => {
      const approval = createTestApproval();
      const authContext = createTestAuthContext({ roles: undefined });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });

    it("returns true when roles is empty (defers to caller)", () => {
      const approval = createTestApproval();
      const authContext = createTestAuthContext({ roles: [] });

      // Empty roles defers to caller's own authorization logic
      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });
  });

  describe("combined agentIds and roles", () => {
    it("checks agentIds first, then roles", () => {
      const approval = createTestApproval({ agentId: "restricted-agent" });
      const authContext = createTestAuthContext({
        agentIds: ["other-agent"],
        roles: ["admin"],
      });

      // agentIds check fails even though user has admin role
      expect(isAuthorizedReviewer(approval, authContext)).toBe(false);
    });

    it("returns true when both agentIds and roles pass", () => {
      const approval = createTestApproval({ agentId: "allowed-agent" });
      const authContext = createTestAuthContext({
        agentIds: ["allowed-agent"],
        roles: ["reviewer"],
      });

      expect(isAuthorizedReviewer(approval, authContext)).toBe(true);
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("generateApprovalId", () => {
  it("generates IDs with apr_ prefix", () => {
    const id = generateApprovalId();
    expect(id.startsWith("apr_")).toBe(true);
  });

  it("generates IDs with expected format", () => {
    const id = generateApprovalId();
    // Format: apr_{timestamp}_{random}
    const parts = id.split("_");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("apr");
    expect(Number(parts[1])).not.toBeNaN(); // timestamp
    expect(parts[2].length).toBe(8); // random suffix
  });

  it("generates unique IDs over multiple calls", async () => {
    // Use real timers and small delay to ensure UUIDv7 uniqueness
    vi.useRealTimers();
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      ids.add(generateApprovalId());
      // Delay to ensure different timestamps for UUIDv7
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    // All IDs should be unique
    expect(ids.size).toBe(3);
  });
});

describe("createPendingApproval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates approval with correct initial values", () => {
    const config = createTestConfig({ approvalTimeout: "24h" });
    const approval = createPendingApproval(
      "test-agent",
      "dec_123",
      { type: "TestAction", payload: {} },
      0.75,
      "Test reason",
      config
    );

    expect(approval.agentId).toBe("test-agent");
    expect(approval.decisionId).toBe("dec_123");
    expect(approval.action.type).toBe("TestAction");
    expect(approval.confidence).toBe(0.75);
    expect(approval.reason).toBe("Test reason");
    expect(approval.status).toBe("pending");
  });

  it("generates unique approvalId over multiple calls", async () => {
    // Use real timers to ensure unique IDs (UUIDs need real time)
    vi.useRealTimers();
    const config = createTestConfig();
    const approvalIds = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const approval = createPendingApproval(
        "agent",
        `dec${i}`,
        { type: "A", payload: {} },
        0.5,
        "r",
        config
      );
      approvalIds.add(approval.approvalId);
      // Delay to ensure different timestamps for UUIDv7 (1ms is unreliable under CPU pressure)
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(approvalIds.size).toBe(3);
    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  it("sets requestedAt to current time", () => {
    const config = createTestConfig();
    const approval = createPendingApproval(
      "agent",
      "dec",
      { type: "A", payload: {} },
      0.5,
      "r",
      config
    );

    expect(approval.requestedAt).toBe(Date.now());
  });

  it("calculates expiresAt based on config timeout", () => {
    const config = createTestConfig({ approvalTimeout: "1h" });
    const approval = createPendingApproval(
      "agent",
      "dec",
      { type: "A", payload: {} },
      0.5,
      "r",
      config
    );

    const expected = Date.now() + 60 * 60 * 1000;
    expect(approval.expiresAt).toBe(expected);
  });

  it("does not include optional fields initially", () => {
    const config = createTestConfig();
    const approval = createPendingApproval(
      "agent",
      "dec",
      { type: "A", payload: {} },
      0.5,
      "r",
      config
    );

    expect(approval.reviewerId).toBeUndefined();
    expect(approval.reviewedAt).toBeUndefined();
    expect(approval.reviewNote).toBeUndefined();
    expect(approval.rejectionReason).toBeUndefined();
  });
});

// ============================================================================
// Status Transition Tests (CRITICAL)
// ============================================================================

describe("approveAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions pending approval to approved", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = approveAction(approval, "reviewer-123");

    expect(result.status).toBe("approved");
  });

  it("sets reviewerId", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = approveAction(approval, "reviewer-123");

    expect(result.reviewerId).toBe("reviewer-123");
  });

  it("sets reviewedAt to current time", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = approveAction(approval, "reviewer-123");

    expect(result.reviewedAt).toBe(Date.now());
  });

  it("includes reviewNote when provided", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = approveAction(approval, "reviewer-123", "Looks good!");

    expect(result.reviewNote).toBe("Looks good!");
  });

  it("does not include reviewNote when not provided", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = approveAction(approval, "reviewer-123");

    expect(result.reviewNote).toBeUndefined();
  });

  it("throws error when status is not pending", () => {
    const approved = createTestApproval({ status: "approved" });
    expect(() => approveAction(approved, "reviewer")).toThrow('expected "pending"');

    const rejected = createTestApproval({ status: "rejected" });
    expect(() => approveAction(rejected, "reviewer")).toThrow('expected "pending"');

    const expired = createTestApproval({ status: "expired" });
    expect(() => approveAction(expired, "reviewer")).toThrow('expected "pending"');
  });

  it("preserves other fields", () => {
    const approval = createTestApproval({
      status: "pending",
      agentId: "my-agent",
      decisionId: "my-decision",
      confidence: 0.8,
    });
    const result = approveAction(approval, "reviewer-123");

    expect(result.agentId).toBe("my-agent");
    expect(result.decisionId).toBe("my-decision");
    expect(result.confidence).toBe(0.8);
  });
});

describe("rejectAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions pending approval to rejected", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = rejectAction(approval, "reviewer-123", "Not appropriate");

    expect(result.status).toBe("rejected");
  });

  it("sets reviewerId", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = rejectAction(approval, "reviewer-123", "Reason");

    expect(result.reviewerId).toBe("reviewer-123");
  });

  it("sets rejectionReason", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = rejectAction(approval, "reviewer-123", "Customer already contacted");

    expect(result.rejectionReason).toBe("Customer already contacted");
  });

  it("sets reviewedAt to current time", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = rejectAction(approval, "reviewer-123", "Reason");

    expect(result.reviewedAt).toBe(Date.now());
  });

  it("throws error when status is not pending", () => {
    const approved = createTestApproval({ status: "approved" });
    expect(() => rejectAction(approved, "reviewer", "reason")).toThrow('expected "pending"');
  });
});

describe("expireAction", () => {
  it("transitions pending approval to expired", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = expireAction(approval);

    expect(result.status).toBe("expired");
  });

  it("does not set reviewerId (no human involved)", () => {
    const approval = createTestApproval({ status: "pending" });
    const result = expireAction(approval);

    expect(result.reviewerId).toBeUndefined();
  });

  it("throws error when status is not pending", () => {
    const approved = createTestApproval({ status: "approved" });
    expect(() => expireAction(approved)).toThrow('expected "pending"');
  });

  it("preserves original fields", () => {
    const approval = createTestApproval({ status: "pending", confidence: 0.7 });
    const result = expireAction(approval);

    expect(result.confidence).toBe(0.7);
    expect(result.approvalId).toBe(approval.approvalId);
  });
});

// ============================================================================
// Safe Variants Tests
// ============================================================================

describe("safeApproveAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns success result for valid approval", () => {
    const approval = createTestApproval({ status: "pending" });
    const authContext = createTestAuthContext();
    const result = safeApproveAction(approval, authContext, "Note");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.approval.status).toBe("approved");
    }
  });

  it("returns UNAUTHORIZED_REVIEWER when not authorized", () => {
    const approval = createTestApproval({ agentId: "restricted-agent" });
    const authContext = createTestAuthContext({ agentIds: ["other-agent"] });
    const result = safeApproveAction(approval, authContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER);
    }
  });

  it("returns INVALID_STATUS_TRANSITION when already processed", () => {
    const approval = createTestApproval({ status: "approved" });
    const authContext = createTestAuthContext();
    const result = safeApproveAction(approval, authContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(APPROVAL_ERROR_CODES.INVALID_STATUS_TRANSITION);
    }
  });

  it("returns APPROVAL_EXPIRED when past expiration", () => {
    const now = Date.now();
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now - 1000, // expired 1 second ago
    });
    const authContext = createTestAuthContext();
    const result = safeApproveAction(approval, authContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(APPROVAL_ERROR_CODES.APPROVAL_EXPIRED);
    }
  });
});

describe("safeRejectAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns success result for valid rejection", () => {
    const approval = createTestApproval({ status: "pending" });
    const authContext = createTestAuthContext();
    const result = safeRejectAction(approval, authContext, "Reason");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.approval.status).toBe("rejected");
    }
  });

  it("returns UNAUTHORIZED_REVIEWER when not authorized", () => {
    const approval = createTestApproval({ agentId: "restricted-agent" });
    const authContext = createTestAuthContext({ agentIds: ["other-agent"] });
    const result = safeRejectAction(approval, authContext, "Reason");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER);
    }
  });

  it("returns APPROVAL_EXPIRED when past expiration", () => {
    const now = Date.now();
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now - 1000,
    });
    const authContext = createTestAuthContext();
    const result = safeRejectAction(approval, authContext, "Reason");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(APPROVAL_ERROR_CODES.APPROVAL_EXPIRED);
    }
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("type guards", () => {
  describe("isApprovalPending", () => {
    it("returns true for pending status", () => {
      const approval = createTestApproval({ status: "pending" });
      expect(isApprovalPending(approval)).toBe(true);
    });

    it("returns false for other statuses", () => {
      expect(isApprovalPending(createTestApproval({ status: "approved" }))).toBe(false);
      expect(isApprovalPending(createTestApproval({ status: "rejected" }))).toBe(false);
      expect(isApprovalPending(createTestApproval({ status: "expired" }))).toBe(false);
    });
  });

  describe("isApprovalApproved", () => {
    it("returns true for approved status", () => {
      const approval = createTestApproval({ status: "approved" });
      expect(isApprovalApproved(approval)).toBe(true);
    });

    it("returns false for other statuses", () => {
      expect(isApprovalApproved(createTestApproval({ status: "pending" }))).toBe(false);
    });
  });

  describe("isApprovalRejected", () => {
    it("returns true for rejected status", () => {
      const approval = createTestApproval({ status: "rejected" });
      expect(isApprovalRejected(approval)).toBe(true);
    });

    it("returns false for other statuses", () => {
      expect(isApprovalRejected(createTestApproval({ status: "pending" }))).toBe(false);
    });
  });

  describe("isApprovalExpired", () => {
    it("returns true for expired status", () => {
      const approval = createTestApproval({ status: "expired" });
      expect(isApprovalExpired(approval)).toBe(true);
    });

    it("returns true for pending approval past expiration time", () => {
      const now = Date.now();
      const approval = createTestApproval({
        status: "pending",
        expiresAt: now - 1000, // 1 second ago
      });
      expect(isApprovalExpired(approval, now)).toBe(true);
    });

    it("returns false for pending approval before expiration", () => {
      const now = Date.now();
      const approval = createTestApproval({
        status: "pending",
        expiresAt: now + 1000, // 1 second in future
      });
      expect(isApprovalExpired(approval, now)).toBe(false);
    });

    it("returns false for approved/rejected (already processed)", () => {
      const approval = createTestApproval({ status: "approved" });
      expect(isApprovalExpired(approval)).toBe(false);
    });
  });

  describe("isApprovalActionable", () => {
    it("returns true for pending approval before expiration", () => {
      const now = Date.now();
      const approval = createTestApproval({
        status: "pending",
        expiresAt: now + 1000,
      });
      expect(isApprovalActionable(approval, now)).toBe(true);
    });

    it("returns false for pending approval at expiration", () => {
      const now = Date.now();
      const approval = createTestApproval({
        status: "pending",
        expiresAt: now, // exactly at expiration
      });
      expect(isApprovalActionable(approval, now)).toBe(false);
    });

    it("returns false for non-pending status", () => {
      const approval = createTestApproval({ status: "approved" });
      expect(isApprovalActionable(approval)).toBe(false);
    });
  });
});

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe("getRemainingApprovalTime", () => {
  it("returns remaining time for pending approval", () => {
    const now = 1000000;
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now + 5000,
    });
    expect(getRemainingApprovalTime(approval, now)).toBe(5000);
  });

  it("returns 0 for expired approval", () => {
    const now = 1000000;
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now - 1000,
    });
    expect(getRemainingApprovalTime(approval, now)).toBe(0);
  });

  it("returns 0 for non-pending status", () => {
    const approval = createTestApproval({ status: "approved" });
    expect(getRemainingApprovalTime(approval)).toBe(0);
  });
});

describe("formatRemainingApprovalTime", () => {
  it("formats hours and minutes", () => {
    const now = 1000000;
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000, // 2h 30m
    });
    expect(formatRemainingApprovalTime(approval, now)).toBe("2h 30m");
  });

  it("formats minutes only when less than 1 hour", () => {
    const now = 1000000;
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now + 45 * 60 * 1000, // 45m
    });
    expect(formatRemainingApprovalTime(approval, now)).toBe("45m");
  });

  it("returns 'expired' when expired", () => {
    const now = 1000000;
    const approval = createTestApproval({
      status: "pending",
      expiresAt: now - 1000,
    });
    expect(formatRemainingApprovalTime(approval, now)).toBe("expired");
  });
});

describe("validatePendingApproval", () => {
  it("returns true for valid approval", () => {
    const approval = createTestApproval();
    expect(validatePendingApproval(approval)).toBe(true);
  });

  it("returns false for invalid approval", () => {
    expect(validatePendingApproval({})).toBe(false);
    expect(validatePendingApproval(null)).toBe(false);
    expect(validatePendingApproval("not an object")).toBe(false);
  });

  it("returns false for approval with invalid confidence", () => {
    const invalid = { ...createTestApproval(), confidence: 2.0 };
    expect(validatePendingApproval(invalid)).toBe(false);
  });
});
