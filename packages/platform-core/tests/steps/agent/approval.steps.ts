/**
 * Approval Module - Step Definitions
 *
 * BDD step definitions for the human-in-loop approval workflow functions including:
 * - Error codes, status types, Zod schemas
 * - Timeout parsing and validation
 * - Approval determination (shouldRequireApproval)
 * - Authorization checks (isAuthorizedReviewer)
 * - Factory functions (generateApprovalId, createPendingApproval)
 * - Status transitions (approve, reject, expire)
 * - Safe variants (safeApproveAction, safeRejectAction)
 * - Type guards and helper functions
 *
 * Mechanical migration from tests/unit/agent/approval.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

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
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

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
    expiresAt: now + 24 * 60 * 60 * 1000,
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

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  approval: PendingApproval | null;
  authContext: ApprovalAuthContext | null;
  config: HumanInLoopConfig | null;
  result: PendingApproval | null;
  error: Error | null;
  safeResult: { success: boolean; approval?: PendingApproval; code?: string } | null;
  approvalId: string | null;
  approvalIds: Set<string>;
  expirationTime: number | null;
  requestedAt: number;
  fakeTimeActive: boolean;
}

function createInitialState(): TestState {
  return {
    approval: null,
    authContext: null,
    config: null,
    result: null,
    error: null,
    safeResult: null,
    approvalId: null,
    approvalIds: new Set(),
    expirationTime: null,
    requestedAt: 0,
    fakeTimeActive: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/approval.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    if (state.fakeTimeActive) {
      vi.useRealTimers();
      state.fakeTimeActive = false;
    }
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module is imported at the top of this file
    });
  });

  // ===========================================================================
  // Rule: Error codes contain all expected entries
  // ===========================================================================

  Rule("Error codes contain all expected entries", ({ RuleScenario }) => {
    RuleScenario("All six error codes are present", ({ Then }) => {
      Then(
        "APPROVAL_ERROR_CODES contains the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string; value: string }>(dataTable);
          for (const row of rows) {
            expect(APPROVAL_ERROR_CODES[row.code as keyof typeof APPROVAL_ERROR_CODES]).toBe(
              row.value
            );
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Status constants define the four approval statuses
  // ===========================================================================

  Rule("Status constants define the four approval statuses", ({ RuleScenario }) => {
    RuleScenario("APPROVAL_STATUSES contains all four statuses in order", ({ Then }) => {
      Then("APPROVAL_STATUSES equals pending, approved, rejected, expired", () => {
        expect(APPROVAL_STATUSES).toEqual(["pending", "approved", "rejected", "expired"]);
      });
    });

    RuleScenario("APPROVAL_STATUSES is a 4-element array", ({ Then }) => {
      Then("APPROVAL_STATUSES is an array with 4 elements", () => {
        expect(Array.isArray(APPROVAL_STATUSES)).toBe(true);
        expect(APPROVAL_STATUSES.length).toBe(4);
      });
    });
  });

  // ===========================================================================
  // Rule: isApprovalStatus type guard validates status strings
  // ===========================================================================

  Rule("isApprovalStatus type guard validates status strings", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid status strings", ({ Then }) => {
      Then(
        "isApprovalStatus returns true for all valid statuses:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(isApprovalStatus(row.value)).toBe(true);
          }
        }
      );
    });

    RuleScenario("Returns false for invalid strings", ({ Then }) => {
      Then(
        "isApprovalStatus returns false for invalid values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            expect(isApprovalStatus(row.value)).toBe(false);
          }
        }
      );
    });

    RuleScenario("Returns false for non-string types", ({ Then }) => {
      Then(
        "isApprovalStatus returns false for non-string types including number, null, undefined, object, and array",
        () => {
          expect(isApprovalStatus(123)).toBe(false);
          expect(isApprovalStatus(null)).toBe(false);
          expect(isApprovalStatus(undefined)).toBe(false);
          expect(isApprovalStatus({})).toBe(false);
          expect(isApprovalStatus(["pending"])).toBe(false);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: ApprovalStatusSchema validates with Zod
  // ===========================================================================

  Rule("ApprovalStatusSchema validates with Zod", ({ RuleScenario }) => {
    RuleScenario("Accepts all four valid statuses", ({ Then }) => {
      Then("ApprovalStatusSchema accepts all APPROVAL_STATUSES values", () => {
        for (const status of APPROVAL_STATUSES) {
          const result = ApprovalStatusSchema.safeParse(status);
          expect(result.success).toBe(true);
        }
      });
    });

    RuleScenario("Rejects invalid status values", ({ Then }) => {
      Then("ApprovalStatusSchema rejects invalid values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          const result = ApprovalStatusSchema.safeParse(row.value);
          expect(result.success).toBe(false);
        }
        // Also test non-string types
        expect(ApprovalStatusSchema.safeParse(123).success).toBe(false);
        expect(ApprovalStatusSchema.safeParse(null).success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: PendingApprovalSchema validates approval objects
  // ===========================================================================

  Rule("PendingApprovalSchema validates approval objects", ({ RuleScenario }) => {
    RuleScenario("Accepts a valid approval object", ({ Given, Then }) => {
      Given("a test approval with default values", () => {
        state.approval = createTestApproval();
      });

      Then("PendingApprovalSchema accepts the approval", () => {
        const result = PendingApprovalSchema.safeParse(state.approval);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Rejects approval with missing required fields", ({ Then }) => {
      Then("PendingApprovalSchema rejects an object with only approvalId", () => {
        const result = PendingApprovalSchema.safeParse({
          approvalId: "test",
        });
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects approval with confidence above 1", ({ Given, Then }) => {
      Given("a test approval with confidence 1.5", () => {
        state.approval = createTestApproval({ confidence: 1.5 });
      });

      Then("PendingApprovalSchema rejects the approval", () => {
        const result = PendingApprovalSchema.safeParse(state.approval);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects approval with negative confidence", ({ Given, Then }) => {
      Given("a test approval with confidence -0.1", () => {
        state.approval = createTestApproval({ confidence: -0.1 });
      });

      Then("PendingApprovalSchema rejects the approval", () => {
        const result = PendingApprovalSchema.safeParse(state.approval);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: ApprovalAuthContextSchema validates auth context objects
  // ===========================================================================

  Rule("ApprovalAuthContextSchema validates auth context objects", ({ RuleScenario }) => {
    RuleScenario("Accepts valid auth context with userId only", ({ Then }) => {
      Then('ApprovalAuthContextSchema accepts a context with userId "user-123"', () => {
        const result = ApprovalAuthContextSchema.safeParse({
          userId: "user-123",
        });
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts auth context with roles", ({ Then }) => {
      Then('ApprovalAuthContextSchema accepts a context with roles "reviewer" and "admin"', () => {
        const result = ApprovalAuthContextSchema.safeParse({
          userId: "user-123",
          roles: ["reviewer", "admin"],
        });
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts auth context with agentIds", ({ Then }) => {
      Then(
        'ApprovalAuthContextSchema accepts a context with agentIds "agent-1" and "agent-2"',
        () => {
          const result = ApprovalAuthContextSchema.safeParse({
            userId: "user-123",
            agentIds: ["agent-1", "agent-2"],
          });
          expect(result.success).toBe(true);
        }
      );
    });

    RuleScenario("Rejects auth context with empty userId", ({ Then }) => {
      Then("ApprovalAuthContextSchema rejects a context with empty userId", () => {
        const result = ApprovalAuthContextSchema.safeParse({
          userId: "",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: parseApprovalTimeout converts duration strings to milliseconds
  // ===========================================================================

  Rule("parseApprovalTimeout converts duration strings to milliseconds", ({ RuleScenario }) => {
    RuleScenario("Parses valid duration strings", ({ Then }) => {
      Then(
        "parseApprovalTimeout returns correct milliseconds:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseApprovalTimeout(row.input)).toBe(Number(row.expected));
          }
        }
      );
    });

    RuleScenario("Returns null for invalid formats", ({ Then }) => {
      Then("parseApprovalTimeout returns null for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(parseApprovalTimeout(row.input)).toBeNull();
        }
      });
    });

    RuleScenario("Returns null for zero values", ({ Then }) => {
      Then("parseApprovalTimeout returns null for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(parseApprovalTimeout(row.input)).toBeNull();
        }
      });
    });
  });

  // ===========================================================================
  // Rule: isValidApprovalTimeout checks format validity
  // ===========================================================================

  Rule("isValidApprovalTimeout checks format validity", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid timeout formats", ({ Then }) => {
      Then("isValidApprovalTimeout returns true for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(isValidApprovalTimeout(row.input)).toBe(true);
        }
      });
    });

    RuleScenario("Returns false for invalid timeout formats", ({ Then }) => {
      Then("isValidApprovalTimeout returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(isValidApprovalTimeout(row.input)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: calculateExpirationTime computes expiration from config and requestedAt
  // ===========================================================================

  Rule(
    "calculateExpirationTime computes expiration from config and requestedAt",
    ({ RuleScenario }) => {
      RuleScenario("Uses explicit timeout from config", ({ Given, When, Then }) => {
        Given('a config with approvalTimeout "1h" and requestedAt 1000000', () => {
          state.config = createTestConfig({ approvalTimeout: "1h" });
          state.requestedAt = 1000000;
        });

        When("I calculate the expiration time", () => {
          state.expirationTime = calculateExpirationTime(state.config!, state.requestedAt);
        });

        Then("the expiration time equals requestedAt plus 3600000", () => {
          expect(state.expirationTime).toBe(state.requestedAt + 3600000);
        });
      });

      RuleScenario("Uses default timeout when not specified", ({ Given, When, Then }) => {
        Given("a config with no approvalTimeout and requestedAt 1000000", () => {
          state.config = createTestConfig();
          state.requestedAt = 1000000;
        });

        When("I calculate the expiration time", () => {
          state.expirationTime = calculateExpirationTime(state.config!, state.requestedAt);
        });

        Then("the expiration time equals requestedAt plus the default timeout", () => {
          expect(state.expirationTime).toBe(state.requestedAt + DEFAULT_APPROVAL_TIMEOUT_MS);
        });
      });

      RuleScenario("Uses default timeout for invalid format", ({ Given, When, Then }) => {
        Given('a config with approvalTimeout "invalid" and requestedAt 1000000', () => {
          state.config = createTestConfig({ approvalTimeout: "invalid" });
          state.requestedAt = 1000000;
        });

        When("I calculate the expiration time", () => {
          state.expirationTime = calculateExpirationTime(state.config!, state.requestedAt);
        });

        Then("the expiration time equals requestedAt plus the default timeout", () => {
          expect(state.expirationTime).toBe(state.requestedAt + DEFAULT_APPROVAL_TIMEOUT_MS);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: shouldRequireApproval determines if approval is needed based on confidence
  // ===========================================================================

  Rule(
    "shouldRequireApproval determines if approval is needed based on confidence",
    ({ RuleScenario }) => {
      RuleScenario("Returns true when confidence is below threshold", ({ Given, Then }) => {
        Given("a config with confidenceThreshold 0.9", () => {
          state.config = createTestConfig({ confidenceThreshold: 0.9 });
        });

        Then(
          'shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true',
          () => {
            expect(shouldRequireApproval(state.config!, "SomeAction", 0.85)).toBe(true);
          }
        );
      });

      RuleScenario(
        "Returns true when confidence equals threshold (inclusive)",
        ({ Given, Then }) => {
          Given("a config with confidenceThreshold 0.9", () => {
            state.config = createTestConfig({ confidenceThreshold: 0.9 });
          });

          Then(
            'shouldRequireApproval for action "SomeAction" with confidence 0.9 returns true',
            () => {
              expect(shouldRequireApproval(state.config!, "SomeAction", 0.9)).toBe(true);
            }
          );
        }
      );

      RuleScenario("Returns false when confidence is above threshold", ({ Given, Then }) => {
        Given("a config with confidenceThreshold 0.9", () => {
          state.config = createTestConfig({ confidenceThreshold: 0.9 });
        });

        Then(
          'shouldRequireApproval for action "SomeAction" with confidence 0.95 returns false',
          () => {
            expect(shouldRequireApproval(state.config!, "SomeAction", 0.95)).toBe(false);
          }
        );
      });

      RuleScenario("Uses default threshold of 0.9 when not specified", ({ Given, Then, And }) => {
        Given("a config with no confidenceThreshold", () => {
          state.config = {} as HumanInLoopConfig;
        });

        Then(
          'shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true',
          () => {
            expect(shouldRequireApproval(state.config!, "SomeAction", 0.85)).toBe(true);
          }
        );

        And(
          'shouldRequireApproval for action "SomeAction" with confidence 0.91 returns false',
          () => {
            expect(shouldRequireApproval(state.config!, "SomeAction", 0.91)).toBe(false);
          }
        );
      });
    }
  );

  // ===========================================================================
  // Rule: requiresApproval list forces approval regardless of confidence
  // ===========================================================================

  Rule("requiresApproval list forces approval regardless of confidence", ({ RuleScenario }) => {
    RuleScenario(
      "Returns true for listed action even with high confidence",
      ({ Given, Then, And }) => {
        Given(
          'a config with confidenceThreshold 0.9 and requiresApproval list "DeleteCustomer,TransferFunds"',
          () => {
            state.config = createTestConfig({
              confidenceThreshold: 0.9,
              requiresApproval: ["DeleteCustomer", "TransferFunds"],
            });
          }
        );

        Then(
          'shouldRequireApproval for action "DeleteCustomer" with confidence 0.99 returns true',
          () => {
            expect(shouldRequireApproval(state.config!, "DeleteCustomer", 0.99)).toBe(true);
          }
        );

        And(
          'shouldRequireApproval for action "TransferFunds" with confidence 1.0 returns true',
          () => {
            expect(shouldRequireApproval(state.config!, "TransferFunds", 1.0)).toBe(true);
          }
        );
      }
    );

    RuleScenario("Returns false for unlisted action with high confidence", ({ Given, Then }) => {
      Given(
        'a config with confidenceThreshold 0.9 and requiresApproval list "DeleteCustomer"',
        () => {
          state.config = createTestConfig({
            confidenceThreshold: 0.9,
            requiresApproval: ["DeleteCustomer"],
          });
        }
      );

      Then(
        'shouldRequireApproval for action "UpdateCustomer" with confidence 0.95 returns false',
        () => {
          expect(shouldRequireApproval(state.config!, "UpdateCustomer", 0.95)).toBe(false);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: autoApprove list skips approval regardless of confidence
  // ===========================================================================

  Rule("autoApprove list skips approval regardless of confidence", ({ RuleScenario }) => {
    RuleScenario(
      "Returns false for auto-approved action with low confidence",
      ({ Given, Then, And }) => {
        Given(
          'a config with confidenceThreshold 0.9 and autoApprove list "LogEvent,SendNotification"',
          () => {
            state.config = createTestConfig({
              confidenceThreshold: 0.9,
              autoApprove: ["LogEvent", "SendNotification"],
            });
          }
        );

        Then(
          'shouldRequireApproval for action "LogEvent" with confidence 0.1 returns false',
          () => {
            expect(shouldRequireApproval(state.config!, "LogEvent", 0.1)).toBe(false);
          }
        );

        And(
          'shouldRequireApproval for action "SendNotification" with confidence 0.5 returns false',
          () => {
            expect(shouldRequireApproval(state.config!, "SendNotification", 0.5)).toBe(false);
          }
        );
      }
    );

    RuleScenario("autoApprove takes precedence over low confidence", ({ Given, Then }) => {
      Given('a config with confidenceThreshold 0.9 and autoApprove list "SafeAction"', () => {
        state.config = createTestConfig({
          confidenceThreshold: 0.9,
          autoApprove: ["SafeAction"],
        });
      });

      Then(
        'shouldRequireApproval for action "SafeAction" with confidence 0.1 returns false',
        () => {
          expect(shouldRequireApproval(state.config!, "SafeAction", 0.1)).toBe(false);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: requiresApproval takes precedence over autoApprove
  // ===========================================================================

  Rule("requiresApproval takes precedence over autoApprove", ({ RuleScenario }) => {
    RuleScenario("requiresApproval wins when action is in both lists", ({ Given, Then }) => {
      Given(
        'a config with requiresApproval "ConflictAction" and autoApprove "ConflictAction"',
        () => {
          state.config = createTestConfig({
            requiresApproval: ["ConflictAction"],
            autoApprove: ["ConflictAction"],
          });
        }
      );

      Then(
        'shouldRequireApproval for action "ConflictAction" with confidence 0.99 returns true',
        () => {
          expect(shouldRequireApproval(state.config!, "ConflictAction", 0.99)).toBe(true);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: shouldRequireApproval edge cases
  // ===========================================================================

  Rule("shouldRequireApproval edge cases", ({ RuleScenario }) => {
    RuleScenario("Falls through to confidence check with empty lists", ({ Given, Then, And }) => {
      Given(
        "a config with confidenceThreshold 0.9 and empty requiresApproval and autoApprove",
        () => {
          state.config = createTestConfig({
            confidenceThreshold: 0.9,
            requiresApproval: [],
            autoApprove: [],
          });
        }
      );

      Then(
        'shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true',
        () => {
          expect(shouldRequireApproval(state.config!, "SomeAction", 0.85)).toBe(true);
        }
      );

      And(
        'shouldRequireApproval for action "SomeAction" with confidence 0.95 returns false',
        () => {
          expect(shouldRequireApproval(state.config!, "SomeAction", 0.95)).toBe(false);
        }
      );
    });

    RuleScenario("Falls through to confidence check with undefined lists", ({ Given, Then }) => {
      Given("a config with confidenceThreshold 0.9", () => {
        state.config = createTestConfig({ confidenceThreshold: 0.9 });
      });

      Then(
        'shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true',
        () => {
          expect(shouldRequireApproval(state.config!, "SomeAction", 0.85)).toBe(true);
        }
      );
    });

    RuleScenario("Handles confidence of 0", ({ Given, Then }) => {
      Given("a config with confidenceThreshold 0.9", () => {
        state.config = createTestConfig({ confidenceThreshold: 0.9 });
      });

      Then('shouldRequireApproval for action "SomeAction" with confidence 0 returns true', () => {
        expect(shouldRequireApproval(state.config!, "SomeAction", 0)).toBe(true);
      });
    });

    RuleScenario("Handles confidence of 1", ({ Given, Then }) => {
      Given("a config with confidenceThreshold 0.9", () => {
        state.config = createTestConfig({ confidenceThreshold: 0.9 });
      });

      Then('shouldRequireApproval for action "SomeAction" with confidence 1 returns false', () => {
        expect(shouldRequireApproval(state.config!, "SomeAction", 1)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: isAuthorizedReviewer checks agentIds restriction
  // ===========================================================================

  Rule("isAuthorizedReviewer checks agentIds restriction", ({ RuleScenario }) => {
    RuleScenario("Returns true when agentId is in authContext agentIds", ({ Given, And, Then }) => {
      Given('an approval with agentId "agent-1"', () => {
        state.approval = createTestApproval({ agentId: "agent-1" });
      });

      And('an auth context with agentIds "agent-1,agent-2"', () => {
        state.authContext = createTestAuthContext({
          agentIds: ["agent-1", "agent-2"],
        });
      });

      Then("isAuthorizedReviewer returns true", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(true);
      });
    });

    RuleScenario(
      "Returns false when agentId is not in authContext agentIds",
      ({ Given, And, Then }) => {
        Given('an approval with agentId "agent-3"', () => {
          state.approval = createTestApproval({ agentId: "agent-3" });
        });

        And('an auth context with agentIds "agent-1,agent-2"', () => {
          state.authContext = createTestAuthContext({
            agentIds: ["agent-1", "agent-2"],
          });
        });

        Then("isAuthorizedReviewer returns false", () => {
          expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
        });
      }
    );

    RuleScenario("Returns false when agentIds is undefined", ({ Given, And, Then }) => {
      Given('an approval with agentId "any-agent"', () => {
        state.approval = createTestApproval({ agentId: "any-agent" });
      });

      And("an auth context with no agentIds", () => {
        state.authContext = createTestAuthContext({
          agentIds: undefined,
        });
      });

      Then("isAuthorizedReviewer returns false", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
      });
    });

    RuleScenario("Returns false when agentIds is empty", ({ Given, And, Then }) => {
      Given('an approval with agentId "any-agent"', () => {
        state.approval = createTestApproval({ agentId: "any-agent" });
      });

      And("an auth context with empty agentIds", () => {
        state.authContext = createTestAuthContext({ agentIds: [] });
      });

      Then("isAuthorizedReviewer returns false", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: isAuthorizedReviewer checks roles
  // ===========================================================================

  Rule("isAuthorizedReviewer checks roles", ({ RuleScenario }) => {
    RuleScenario("Returns true when user has at least one role", ({ Given, And, Then }) => {
      Given("a default approval", () => {
        state.approval = createTestApproval();
      });

      And('an auth context with roles "reviewer"', () => {
        state.authContext = createTestAuthContext({ roles: ["reviewer"] });
      });

      Then("isAuthorizedReviewer returns true", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(true);
      });
    });

    RuleScenario("Returns false when roles is undefined", ({ Given, And, Then }) => {
      Given("a default approval", () => {
        state.approval = createTestApproval();
      });

      And("an auth context with no roles", () => {
        state.authContext = createTestAuthContext({ roles: undefined });
      });

      Then("isAuthorizedReviewer returns false", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
      });
    });

    RuleScenario("Returns false when roles is empty", ({ Given, And, Then }) => {
      Given("a default approval", () => {
        state.approval = createTestApproval();
      });

      And("an auth context with empty roles", () => {
        state.authContext = createTestAuthContext({ roles: [] });
      });

      Then("isAuthorizedReviewer returns false", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: isAuthorizedReviewer evaluates agentIds before roles
  // ===========================================================================

  Rule("isAuthorizedReviewer evaluates agentIds before roles", ({ RuleScenario }) => {
    RuleScenario("AgentIds check fails even with admin role", ({ Given, And, Then }) => {
      Given('an approval with agentId "restricted-agent"', () => {
        state.approval = createTestApproval({
          agentId: "restricted-agent",
        });
      });

      And('an auth context with agentIds "other-agent" and roles "admin"', () => {
        state.authContext = createTestAuthContext({
          agentIds: ["other-agent"],
          roles: ["admin"],
        });
      });

      Then("isAuthorizedReviewer returns false", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(false);
      });
    });

    RuleScenario("Both agentIds and roles pass", ({ Given, And, Then }) => {
      Given('an approval with agentId "allowed-agent"', () => {
        state.approval = createTestApproval({ agentId: "allowed-agent" });
      });

      And('an auth context with agentIds "allowed-agent" and roles "reviewer"', () => {
        state.authContext = createTestAuthContext({
          agentIds: ["allowed-agent"],
          roles: ["reviewer"],
        });
      });

      Then("isAuthorizedReviewer returns true", () => {
        expect(isAuthorizedReviewer(state.approval!, state.authContext!)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: generateApprovalId produces correctly formatted unique IDs
  // ===========================================================================

  Rule("generateApprovalId produces correctly formatted unique IDs", ({ RuleScenario }) => {
    RuleScenario("Generates ID with apr_ prefix and correct format", ({ When, Then, And }) => {
      When("I generate an approval ID", () => {
        state.approvalId = generateApprovalId();
      });

      Then('the approval ID starts with "apr_"', () => {
        expect(state.approvalId!.startsWith("apr_")).toBe(true);
      });

      And("the approval ID has 2 underscore-delimited parts", () => {
        const parts = state.approvalId!.split("_");
        expect(parts.length).toBe(2);
        expect(parts[0]).toBe("apr");
      });

      And("the second part has 36 characters", () => {
        const parts = state.approvalId!.split("_");
        expect(parts[1].length).toBe(36);
      });
    });

    RuleScenario("Generates unique IDs over multiple calls", ({ When, Then }) => {
      When("I generate 3 approval IDs with delay", async () => {
        vi.useRealTimers();
        state.approvalIds = new Set<string>();
        for (let i = 0; i < 3; i++) {
          state.approvalIds.add(generateApprovalId());
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
      });

      Then("all 3 IDs are unique", () => {
        expect(state.approvalIds.size).toBe(3);
      });
    });
  });

  // ===========================================================================
  // Rule: createPendingApproval builds approval with correct initial values
  // ===========================================================================

  Rule("createPendingApproval builds approval with correct initial values", ({ RuleScenario }) => {
    RuleScenario("Sets correct initial field values", ({ Given, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      When(
        'I create a pending approval for agent "test-agent" decision "dec_123" action "TestAction" confidence 0.75 reason "Test reason" timeout "24h"',
        () => {
          const config = createTestConfig({ approvalTimeout: "24h" });
          state.approval = createPendingApproval(
            "test-agent",
            "dec_123",
            { type: "TestAction", payload: {} },
            0.75,
            "Test reason",
            config
          );
        }
      );

      Then(
        "the approval has the following initial values:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            field: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            switch (row.field) {
              case "agentId":
                expect(state.approval!.agentId).toBe(row.value);
                break;
              case "decisionId":
                expect(state.approval!.decisionId).toBe(row.value);
                break;
              case "actionType":
                expect(state.approval!.action.type).toBe(row.value);
                break;
              case "confidence":
                expect(state.approval!.confidence).toBe(Number(row.value));
                break;
              case "reason":
                expect(state.approval!.reason).toBe(row.value);
                break;
              case "status":
                expect(state.approval!.status).toBe(row.value);
                break;
            }
          }
        }
      );
    });

    RuleScenario("Generates unique approvalIds over multiple calls", ({ When, Then }) => {
      When("I create 3 pending approvals with delay", async () => {
        vi.useRealTimers();
        const config = createTestConfig();
        state.approvalIds = new Set<string>();
        for (let i = 0; i < 3; i++) {
          const approval = createPendingApproval(
            "agent",
            `dec${i}`,
            { type: "A", payload: {} },
            0.5,
            "r",
            config
          );
          state.approvalIds.add(approval.approvalId);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      });

      Then("all 3 approval IDs are unique", () => {
        expect(state.approvalIds.size).toBe(3);
      });
    });

    RuleScenario("Sets requestedAt to current time", ({ Given, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      When("I create a pending approval with default values", () => {
        const config = createTestConfig();
        state.approval = createPendingApproval(
          "agent",
          "dec",
          { type: "A", payload: {} },
          0.5,
          "r",
          config
        );
      });

      Then("the approval requestedAt equals the current fake time", () => {
        expect(state.approval!.requestedAt).toBe(Date.now());
      });
    });

    RuleScenario("Calculates expiresAt based on config timeout", ({ Given, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      When('I create a pending approval with timeout "1h"', () => {
        const config = createTestConfig({ approvalTimeout: "1h" });
        state.approval = createPendingApproval(
          "agent",
          "dec",
          { type: "A", payload: {} },
          0.5,
          "r",
          config
        );
      });

      Then("the approval expiresAt equals requestedAt plus 3600000", () => {
        const expected = Date.now() + 60 * 60 * 1000;
        expect(state.approval!.expiresAt).toBe(expected);
      });
    });

    RuleScenario("Does not include optional fields initially", ({ Given, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      When("I create a pending approval with default values", () => {
        const config = createTestConfig();
        state.approval = createPendingApproval(
          "agent",
          "dec",
          { type: "A", payload: {} },
          0.5,
          "r",
          config
        );
      });

      Then(
        "the approval optional fields are all undefined:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string }>(dataTable);
          for (const row of rows) {
            expect((state.approval as Record<string, unknown>)[row.field]).toBeUndefined();
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: approveAction transitions pending to approved
  // ===========================================================================

  Rule("approveAction transitions pending to approved", ({ RuleScenario }) => {
    RuleScenario("Transitions pending approval to approved", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      When('I approve the approval with reviewer "reviewer-123"', () => {
        state.result = approveAction(state.approval!, "reviewer-123");
      });

      Then('the result status is "approved"', () => {
        expect(state.result!.status).toBe("approved");
      });

      And('the result reviewerId is "reviewer-123"', () => {
        expect(state.result!.reviewerId).toBe("reviewer-123");
      });

      And("the result reviewedAt equals the current fake time", () => {
        expect(state.result!.reviewedAt).toBe(Date.now());
      });
    });

    RuleScenario("Includes reviewNote when provided", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      When('I approve the approval with reviewer "reviewer-123" and note "Looks good!"', () => {
        state.result = approveAction(state.approval!, "reviewer-123", "Looks good!");
      });

      Then('the result reviewNote is "Looks good!"', () => {
        expect(state.result!.reviewNote).toBe("Looks good!");
      });
    });

    RuleScenario("Does not include reviewNote when not provided", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      When('I approve the approval with reviewer "reviewer-123"', () => {
        state.result = approveAction(state.approval!, "reviewer-123");
      });

      Then("the result reviewNote is undefined", () => {
        expect(state.result!.reviewNote).toBeUndefined();
      });
    });

    RuleScenario("Throws error for non-pending statuses", ({ Then }) => {
      Then(
        "approving a non-pending approval throws for statuses:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ status: string }>(dataTable);
          for (const row of rows) {
            const approval = createTestApproval({
              status: row.status as PendingApproval["status"],
            });
            expect(() => approveAction(approval, "reviewer")).toThrow('expected "pending"');
          }
        }
      );
    });

    RuleScenario("Throws error for expired pending approvals", ({ Given, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      When("I approve an expired pending approval", () => {
        const approval = createTestApproval({
          status: "pending",
          expiresAt: Date.now() - 1000,
        });
        state.error = null;
        try {
          approveAction(approval, "reviewer");
        } catch (error) {
          state.error = error as Error;
        }
      });

      Then('the approval action throws "approval has expired"', () => {
        expect(state.error?.message).toContain("approval has expired");
      });
    });

    RuleScenario("Preserves other fields after approval", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And(
        'a pending approval with agentId "my-agent" decisionId "my-decision" confidence 0.8',
        () => {
          state.approval = createTestApproval({
            status: "pending",
            agentId: "my-agent",
            decisionId: "my-decision",
            confidence: 0.8,
          });
        }
      );

      When('I approve the approval with reviewer "reviewer-123"', () => {
        state.result = approveAction(state.approval!, "reviewer-123");
      });

      Then(
        'the result preserves agentId "my-agent" decisionId "my-decision" confidence 0.8',
        () => {
          expect(state.result!.agentId).toBe("my-agent");
          expect(state.result!.decisionId).toBe("my-decision");
          expect(state.result!.confidence).toBe(0.8);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: rejectAction transitions pending to rejected
  // ===========================================================================

  Rule("rejectAction transitions pending to rejected", ({ RuleScenario }) => {
    RuleScenario(
      "Transitions pending approval to rejected with reason",
      ({ Given, And, When, Then }) => {
        Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          state.fakeTimeActive = true;
        });

        And("a pending approval", () => {
          state.approval = createTestApproval({ status: "pending" });
        });

        When(
          'I reject the approval with reviewer "reviewer-123" and reason "Not appropriate"',
          () => {
            state.result = rejectAction(
              state.approval!,
              "reviewer-123",
              "Customer already contacted"
            );
          }
        );

        Then('the result status is "rejected"', () => {
          expect(state.result!.status).toBe("rejected");
        });

        And('the result reviewerId is "reviewer-123"', () => {
          expect(state.result!.reviewerId).toBe("reviewer-123");
        });

        And('the result rejectionReason is "Customer already contacted"', () => {
          expect(state.result!.rejectionReason).toBe("Customer already contacted");
        });
      }
    );

    RuleScenario("Sets reviewedAt to current time on rejection", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      When('I reject the approval with reviewer "reviewer-123" and reason "Reason"', () => {
        state.result = rejectAction(state.approval!, "reviewer-123", "Reason");
      });

      Then("the result reviewedAt equals the current fake time", () => {
        expect(state.result!.reviewedAt).toBe(Date.now());
      });
    });

    RuleScenario("Throws error when rejecting non-pending approval", ({ Then }) => {
      Then('rejecting a non-pending approval throws for status "approved"', () => {
        const approval = createTestApproval({ status: "approved" });
        expect(() => rejectAction(approval, "reviewer", "reason")).toThrow('expected "pending"');
      });
    });

    RuleScenario(
      "Throws error when rejecting expired pending approval",
      ({ Given, When, Then }) => {
        Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
          state.fakeTimeActive = true;
        });

        When("I reject an expired pending approval", () => {
          const approval = createTestApproval({
            status: "pending",
            expiresAt: Date.now() - 1000,
          });
          state.error = null;
          try {
            rejectAction(approval, "reviewer", "reason");
          } catch (error) {
            state.error = error as Error;
          }
        });

        Then('the rejection action throws "approval has expired"', () => {
          expect(state.error?.message).toContain("approval has expired");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: expireAction transitions pending to expired
  // ===========================================================================

  Rule("expireAction transitions pending to expired", ({ RuleScenario }) => {
    RuleScenario("Transitions pending approval to expired", ({ Given, When, Then, And }) => {
      Given("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      When("I expire the approval", () => {
        state.result = expireAction(state.approval!);
      });

      Then('the result status is "expired"', () => {
        expect(state.result!.status).toBe("expired");
      });

      And("the result reviewerId is undefined", () => {
        expect(state.result!.reviewerId).toBeUndefined();
      });
    });

    RuleScenario("Throws error when expiring non-pending approval", ({ Then }) => {
      Then('expiring a non-pending approval throws for status "approved"', () => {
        const approval = createTestApproval({ status: "approved" });
        expect(() => expireAction(approval)).toThrow('expected "pending"');
      });
    });

    RuleScenario("Preserves original fields after expiration", ({ Given, When, Then, And }) => {
      Given("a pending approval with confidence 0.7", () => {
        state.approval = createTestApproval({
          status: "pending",
          confidence: 0.7,
        });
      });

      When("I expire the approval", () => {
        state.result = expireAction(state.approval!);
      });

      Then("the result confidence is 0.7", () => {
        expect(state.result!.confidence).toBe(0.7);
      });

      And("the result approvalId matches the original", () => {
        expect(state.result!.approvalId).toBe(state.approval!.approvalId);
      });
    });
  });

  // ===========================================================================
  // Rule: safeApproveAction returns result objects instead of throwing
  // ===========================================================================

  Rule("safeApproveAction returns result objects instead of throwing", ({ RuleScenario }) => {
    RuleScenario("Returns success for valid pending approval", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      And("a valid auth context", () => {
        state.authContext = createTestAuthContext({ roles: ["reviewer"] });
      });

      When('I safely approve the approval with note "Note"', () => {
        state.safeResult = safeApproveAction(
          state.approval!,
          state.authContext!,
          "Note"
        ) as typeof state.safeResult;
      });

      Then("the safe result is successful", () => {
        expect(state.safeResult!.success).toBe(true);
      });

      And('the safe result approval status is "approved"', () => {
        if (state.safeResult!.success) {
          expect(state.safeResult!.approval!.status).toBe("approved");
        }
      });
    });

    RuleScenario(
      "Returns UNAUTHORIZED_REVIEWER when not authorized",
      ({ Given, And, When, Then }) => {
        Given('an approval with agentId "restricted-agent"', () => {
          state.approval = createTestApproval({
            agentId: "restricted-agent",
          });
        });

        And('an auth context with agentIds "other-agent"', () => {
          state.authContext = createTestAuthContext({
            agentIds: ["other-agent"],
          });
        });

        When("I safely approve the approval", () => {
          state.safeResult = safeApproveAction(
            state.approval!,
            state.authContext!
          ) as typeof state.safeResult;
        });

        Then("the safe result is not successful", () => {
          expect(state.safeResult!.success).toBe(false);
        });

        And('the safe result error code is "UNAUTHORIZED_REVIEWER"', () => {
          if (!state.safeResult!.success) {
            expect(state.safeResult!.code).toBe(APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER);
          }
        });
      }
    );

    RuleScenario(
      "Returns INVALID_STATUS_TRANSITION when already processed",
      ({ Given, And, When, Then }) => {
        Given("an already approved approval", () => {
          state.approval = createTestApproval({ status: "approved" });
        });

        And("a valid auth context", () => {
          state.authContext = createTestAuthContext({ roles: ["reviewer"] });
        });

        When("I safely approve the approval", () => {
          state.safeResult = safeApproveAction(
            state.approval!,
            state.authContext!
          ) as typeof state.safeResult;
        });

        Then("the safe result is not successful", () => {
          expect(state.safeResult!.success).toBe(false);
        });

        And('the safe result error code is "INVALID_STATUS_TRANSITION"', () => {
          if (!state.safeResult!.success) {
            expect(state.safeResult!.code).toBe(APPROVAL_ERROR_CODES.INVALID_STATUS_TRANSITION);
          }
        });
      }
    );

    RuleScenario("Returns APPROVAL_EXPIRED when past expiration", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval that expired 1 second ago", () => {
        const now = Date.now();
        state.approval = createTestApproval({
          status: "pending",
          expiresAt: now - 1000,
        });
      });

      And("a valid auth context", () => {
        state.authContext = createTestAuthContext({ roles: ["reviewer"] });
      });

      When("I safely approve the approval", () => {
        state.safeResult = safeApproveAction(
          state.approval!,
          state.authContext!
        ) as typeof state.safeResult;
      });

      Then("the safe result is not successful", () => {
        expect(state.safeResult!.success).toBe(false);
      });

      And('the safe result error code is "APPROVAL_EXPIRED"', () => {
        if (!state.safeResult!.success) {
          expect(state.safeResult!.code).toBe(APPROVAL_ERROR_CODES.APPROVAL_EXPIRED);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: safeRejectAction returns result objects instead of throwing
  // ===========================================================================

  Rule("safeRejectAction returns result objects instead of throwing", ({ RuleScenario }) => {
    RuleScenario("Returns success for valid rejection", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval", () => {
        state.approval = createTestApproval({ status: "pending" });
      });

      And("a valid auth context", () => {
        state.authContext = createTestAuthContext({ roles: ["reviewer"] });
      });

      When('I safely reject the approval with reason "Reason"', () => {
        state.safeResult = safeRejectAction(
          state.approval!,
          state.authContext!,
          "Reason"
        ) as typeof state.safeResult;
      });

      Then("the safe result is successful", () => {
        expect(state.safeResult!.success).toBe(true);
      });

      And('the safe result approval status is "rejected"', () => {
        if (state.safeResult!.success) {
          expect(state.safeResult!.approval!.status).toBe("rejected");
        }
      });
    });

    RuleScenario("Returns UNAUTHORIZED_REVIEWER on safe reject", ({ Given, And, When, Then }) => {
      Given('an approval with agentId "restricted-agent"', () => {
        state.approval = createTestApproval({
          agentId: "restricted-agent",
        });
      });

      And('an auth context with agentIds "other-agent"', () => {
        state.authContext = createTestAuthContext({
          agentIds: ["other-agent"],
        });
      });

      When('I safely reject the approval with reason "Reason"', () => {
        state.safeResult = safeRejectAction(
          state.approval!,
          state.authContext!,
          "Reason"
        ) as typeof state.safeResult;
      });

      Then("the safe result is not successful", () => {
        expect(state.safeResult!.success).toBe(false);
      });

      And('the safe result error code is "UNAUTHORIZED_REVIEWER"', () => {
        if (!state.safeResult!.success) {
          expect(state.safeResult!.code).toBe(APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER);
        }
      });
    });

    RuleScenario("Returns APPROVAL_EXPIRED on safe reject", ({ Given, And, When, Then }) => {
      Given('fake time is set to "2024-01-15T12:00:00Z"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
        state.fakeTimeActive = true;
      });

      And("a pending approval that expired 1 second ago", () => {
        const now = Date.now();
        state.approval = createTestApproval({
          status: "pending",
          expiresAt: now - 1000,
        });
      });

      And("a valid auth context", () => {
        state.authContext = createTestAuthContext({ roles: ["reviewer"] });
      });

      When('I safely reject the approval with reason "Reason"', () => {
        state.safeResult = safeRejectAction(
          state.approval!,
          state.authContext!,
          "Reason"
        ) as typeof state.safeResult;
      });

      Then("the safe result is not successful", () => {
        expect(state.safeResult!.success).toBe(false);
      });

      And('the safe result error code is "APPROVAL_EXPIRED"', () => {
        if (!state.safeResult!.success) {
          expect(state.safeResult!.code).toBe(APPROVAL_ERROR_CODES.APPROVAL_EXPIRED);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: Type guards correctly identify approval statuses
  // ===========================================================================

  Rule("Type guards correctly identify approval statuses", ({ RuleScenario }) => {
    RuleScenario("isApprovalPending returns true only for pending", ({ Then, And }) => {
      Then('isApprovalPending returns true for status "pending"', () => {
        const approval = createTestApproval({ status: "pending" });
        expect(isApprovalPending(approval)).toBe(true);
      });

      And("isApprovalPending returns false for statuses:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ status: string }>(dataTable);
        for (const row of rows) {
          expect(
            isApprovalPending(
              createTestApproval({
                status: row.status as PendingApproval["status"],
              })
            )
          ).toBe(false);
        }
      });
    });

    RuleScenario("isApprovalApproved returns true only for approved", ({ Then, And }) => {
      Then('isApprovalApproved returns true for status "approved"', () => {
        const approval = createTestApproval({ status: "approved" });
        expect(isApprovalApproved(approval)).toBe(true);
      });

      And('isApprovalApproved returns false for status "pending"', () => {
        expect(isApprovalApproved(createTestApproval({ status: "pending" }))).toBe(false);
      });
    });

    RuleScenario("isApprovalRejected returns true only for rejected", ({ Then, And }) => {
      Then('isApprovalRejected returns true for status "rejected"', () => {
        const approval = createTestApproval({ status: "rejected" });
        expect(isApprovalRejected(approval)).toBe(true);
      });

      And('isApprovalRejected returns false for status "pending"', () => {
        expect(isApprovalRejected(createTestApproval({ status: "pending" }))).toBe(false);
      });
    });

    RuleScenario(
      "isApprovalExpired detects expired status and time-based expiration",
      ({ Then, And }) => {
        Then('isApprovalExpired returns true for status "expired"', () => {
          const approval = createTestApproval({ status: "expired" });
          expect(isApprovalExpired(approval)).toBe(true);
        });

        And("isApprovalExpired returns true for pending approval past expiration time", () => {
          const now = Date.now();
          const approval = createTestApproval({
            status: "pending",
            expiresAt: now - 1000,
          });
          expect(isApprovalExpired(approval, now)).toBe(true);
        });

        And("isApprovalExpired returns false for pending approval before expiration time", () => {
          const now = Date.now();
          const approval = createTestApproval({
            status: "pending",
            expiresAt: now + 1000,
          });
          expect(isApprovalExpired(approval, now)).toBe(false);
        });

        And('isApprovalExpired returns false for status "approved"', () => {
          const approval = createTestApproval({ status: "approved" });
          expect(isApprovalExpired(approval)).toBe(false);
        });
      }
    );

    RuleScenario("isApprovalActionable checks pending and not expired", ({ Then, And }) => {
      Then("isApprovalActionable returns true for pending approval before expiration", () => {
        const now = Date.now();
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now + 1000,
        });
        expect(isApprovalActionable(approval, now)).toBe(true);
      });

      And("isApprovalActionable returns false for pending approval at expiration", () => {
        const now = Date.now();
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now,
        });
        expect(isApprovalActionable(approval, now)).toBe(false);
      });

      And('isApprovalActionable returns false for status "approved"', () => {
        const approval = createTestApproval({ status: "approved" });
        expect(isApprovalActionable(approval)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: getRemainingApprovalTime returns milliseconds until expiration
  // ===========================================================================

  Rule("getRemainingApprovalTime returns milliseconds until expiration", ({ RuleScenario }) => {
    RuleScenario("Returns remaining time for pending approval", ({ Then }) => {
      Then("getRemainingApprovalTime returns 5000 for pending approval expiring in 5000ms", () => {
        const now = 1000000;
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now + 5000,
        });
        expect(getRemainingApprovalTime(approval, now)).toBe(5000);
      });
    });

    RuleScenario("Returns 0 for expired approval", ({ Then }) => {
      Then("getRemainingApprovalTime returns 0 for pending approval past expiration", () => {
        const now = 1000000;
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now - 1000,
        });
        expect(getRemainingApprovalTime(approval, now)).toBe(0);
      });
    });

    RuleScenario("Returns 0 for non-pending status", ({ Then }) => {
      Then("getRemainingApprovalTime returns 0 for approved status", () => {
        const approval = createTestApproval({ status: "approved" });
        expect(getRemainingApprovalTime(approval)).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Rule: formatRemainingApprovalTime returns human-readable duration
  // ===========================================================================

  Rule("formatRemainingApprovalTime returns human-readable duration", ({ RuleScenario }) => {
    RuleScenario("Formats hours and minutes", ({ Then }) => {
      Then('formatRemainingApprovalTime returns "2h 30m" for 2.5 hours remaining', () => {
        const now = 1000000;
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000,
        });
        expect(formatRemainingApprovalTime(approval, now)).toBe("2h 30m");
      });
    });

    RuleScenario("Formats minutes only", ({ Then }) => {
      Then('formatRemainingApprovalTime returns "45m" for 45 minutes remaining', () => {
        const now = 1000000;
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now + 45 * 60 * 1000,
        });
        expect(formatRemainingApprovalTime(approval, now)).toBe("45m");
      });
    });

    RuleScenario("Returns expired for past expiration", ({ Then }) => {
      Then('formatRemainingApprovalTime returns "expired" for past expiration', () => {
        const now = 1000000;
        const approval = createTestApproval({
          status: "pending",
          expiresAt: now - 1000,
        });
        expect(formatRemainingApprovalTime(approval, now)).toBe("expired");
      });
    });
  });

  // ===========================================================================
  // Rule: validatePendingApproval checks structural validity
  // ===========================================================================

  Rule("validatePendingApproval checks structural validity", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid approval", ({ Given, Then }) => {
      Given("a test approval with default values", () => {
        state.approval = createTestApproval();
      });

      Then("validatePendingApproval returns true", () => {
        expect(validatePendingApproval(state.approval)).toBe(true);
      });
    });

    RuleScenario("Returns false for invalid inputs", ({ Then }) => {
      Then("validatePendingApproval returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          let value: unknown;
          switch (row.input) {
            case "empty-object":
              value = {};
              break;
            case "null":
              value = null;
              break;
            case "not-an-object":
              value = "not an object";
              break;
            default:
              value = row.input;
          }
          expect(validatePendingApproval(value)).toBe(false);
        }
      });
    });

    RuleScenario("Returns false for invalid confidence", ({ Then }) => {
      Then("validatePendingApproval returns false for confidence 2.0", () => {
        const invalid = { ...createTestApproval(), confidence: 2.0 };
        expect(validatePendingApproval(invalid)).toBe(false);
      });
    });
  });
});
