/**
 * DCB Execute - Step Definitions
 *
 * BDD step definitions for executeWithDCB behavior:
 * - Basic execution without OCC
 * - OCC pre-check (version validation)
 * - OCC commit (final check)
 * - Scope key validation
 * - Entity loading
 *
 * @since Phase 16 (DCB)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Import modules under test
import {
  executeWithDCB,
  createScopeKey,
  type DCBScopeKey,
  type DCBExecutionResult,
  type ScopeOperations,
  type ExecuteWithDCBConfig,
  type DCBAggregatedState,
  type DCBStateUpdates,
} from "../../../src/dcb/index.js";
import type { DeciderContext, DeciderOutput, DeciderEvent } from "@libar-dev/platform-decider";
import { success, rejected, failed } from "@libar-dev/platform-decider";
import type { EventCategory } from "../../../src/events/category.js";

// =============================================================================
// Test Types
// =============================================================================

interface MockCms {
  id: string;
  quantity: number;
}

interface MockCommand {
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
}

interface MockEvent extends DeciderEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

interface MockStateUpdate {
  quantityChange: number;
}

interface MockData {
  reservationId: string;
}

type MockDecider = (
  state: DCBAggregatedState<MockCms>,
  command: MockCommand,
  context: DeciderContext
) => DeciderOutput<MockEvent, MockData, DCBStateUpdates<MockStateUpdate>>;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Inputs
  scopeKey: DCBScopeKey | null;
  expectedVersion: number;
  schemaVersion: number;
  eventCategory: EventCategory;
  entityStreamIds: string[];
  entityExists: Map<string, boolean>;

  // Mock functions
  scopeOperations: ScopeOperations | undefined;
  mockGetScope: ReturnType<typeof vi.fn>;
  mockCommitScope: ReturnType<typeof vi.fn>;
  decider: MockDecider;

  // Decider behavior
  deciderBehavior:
    | { type: "success"; eventType: string; updateStreamIds?: string[] }
    | { type: "rejected"; code: string; message: string }
    | { type: "failed"; eventType: string; reason: string };

  // Outputs
  result: DCBExecutionResult<MockData> | null;
}

// Initialize state with default values immediately
let state: TestState = createInitialState();

function createInitialState(): TestState {
  return {
    scopeKey: createScopeKey("t1", "reservation", "res_123"),
    expectedVersion: 0,
    schemaVersion: 1,
    eventCategory: "domain",
    entityStreamIds: ["product_1", "product_2"],
    entityExists: new Map([
      ["product_1", true],
      ["product_2", true],
    ]),
    scopeOperations: undefined,
    mockGetScope: vi.fn(),
    mockCommitScope: vi.fn(),
    decider: () =>
      success({
        data: { reservationId: "res_001" },
        event: { eventType: "ItemsReserved", payload: {} },
        stateUpdate: new Map(),
      }),
    deciderBehavior: { type: "success", eventType: "ItemsReserved" },
    result: null,
  };
}

function resetState(): void {
  state = createInitialState();
}

function createDeciderForCurrentState(): MockDecider {
  // Capture current behavior in closure
  const behavior = state.deciderBehavior;
  const entityStreamIds = state.entityStreamIds;

  return (_aggregatedState, _command, _context) => {
    if (behavior.type === "rejected") {
      // rejected(code, message, context?)
      return rejected(behavior.code, behavior.message);
    }

    if (behavior.type === "failed") {
      // failed(reason, event, context?)
      return failed(behavior.reason, {
        eventType: behavior.eventType,
        payload: { reason: behavior.reason },
      });
    }

    // Success - uses object form: success({ data, event, stateUpdate })
    const updates: DCBStateUpdates<MockStateUpdate> = new Map();
    const updateStreamIds = behavior.updateStreamIds ?? entityStreamIds;
    for (const streamId of updateStreamIds) {
      updates.set(streamId, { quantityChange: -1 });
    }

    return success({
      data: { reservationId: "res_001" },
      event: { eventType: behavior.eventType, payload: { items: updateStreamIds } },
      stateUpdate: updates,
    });
  };
}

// Mock context with minimal interface
function createMockContext() {
  return {
    db: {
      query: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
    },
  };
}

// =============================================================================
// Execute Feature
// =============================================================================

const executeFeature = await loadFeature("tests/features/behavior/dcb/execute.feature");

describeFeature(
  executeFeature,
  ({ Scenario, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      vi.clearAllMocks();
    });

    // =========================================================================
    // Background
    // =========================================================================

    Background(({ Given, And }) => {
      Given("a mock mutation context", () => {
        // Context is created per execution
      });

      And('a scope key "tenant:t1:reservation:res_123"', () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_123");
      });

      And('entities with streamIds "product_1" and "product_2"', () => {
        state.entityStreamIds = ["product_1", "product_2"];
        state.entityExists = new Map([
          ["product_1", true],
          ["product_2", true],
        ]);
      });
    });

    // =========================================================================
    // Basic Execution (No OCC)
    // =========================================================================

    Scenario("Successful execution without scopeOperations", ({ Given, When, Then, And }) => {
      Given('a decider that succeeds with event type "ItemsReserved"', () => {
        state.deciderBehavior = { type: "success", eventType: "ItemsReserved" };
      });

      And("no scopeOperations are provided", () => {
        state.scopeOperations = undefined;
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "success"', () => {
        expect(state.result?.status).toBe("success");
      });

      And('the result contains event type "ItemsReserved"', () => {
        if (state.result?.status === "success") {
          expect(state.result.events[0].eventType).toBe("ItemsReserved");
        } else {
          throw new Error("Expected success result");
        }
      });

      And("the result scopeVersion is 1", () => {
        if (state.result?.status === "success") {
          expect(state.result.scopeVersion).toBe(1);
        } else {
          throw new Error("Expected success result");
        }
      });
    });

    Scenario(
      "Successful execution includes schemaVersion and category in events",
      ({ Given, And, When, Then }) => {
        Given('a decider that succeeds with event type "ItemsReserved"', () => {
          state.deciderBehavior = { type: "success", eventType: "ItemsReserved" };
        });

        And("schemaVersion is 2", () => {
          state.schemaVersion = 2;
        });

        And('eventCategory is "domain"', () => {
          state.eventCategory = "domain";
        });

        When("I execute the DCB operation", async () => {
          state.result = await executeOperation();
        });

        Then('the result status is "success"', () => {
          expect(state.result?.status).toBe("success");
        });

        And("the generated event has schemaVersion 2", () => {
          if (state.result?.status === "success") {
            expect(state.result.events[0].schemaVersion).toBe(2);
          } else {
            throw new Error("Expected success result");
          }
        });

        And('the generated event has category "domain"', () => {
          if (state.result?.status === "success") {
            expect(state.result.events[0].category).toBe("domain");
          } else {
            throw new Error("Expected success result");
          }
        });
      }
    );

    Scenario("Rejected decider result returns rejection", ({ Given, When, Then, And }) => {
      Given(
        'a decider that rejects with code "INSUFFICIENT_STOCK" and message "Not enough stock"',
        () => {
          state.deciderBehavior = {
            type: "rejected",
            code: "INSUFFICIENT_STOCK",
            message: "Not enough stock",
          };
        }
      );

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "rejected"', () => {
        expect(state.result?.status).toBe("rejected");
      });

      And('the rejection code is "INSUFFICIENT_STOCK"', () => {
        if (state.result?.status === "rejected") {
          expect(state.result.code).toBe("INSUFFICIENT_STOCK");
        } else {
          throw new Error("Expected rejected result");
        }
      });

      And('the rejection reason is "Not enough stock"', () => {
        if (state.result?.status === "rejected") {
          expect(state.result.reason).toBe("Not enough stock");
        } else {
          throw new Error("Expected rejected result");
        }
      });
    });

    Scenario("Failed decider result returns failure with event", ({ Given, When, Then, And }) => {
      Given(
        'a decider that fails with event type "ReservationFailed" and reason "Stock unavailable"',
        () => {
          state.deciderBehavior = {
            type: "failed",
            eventType: "ReservationFailed",
            reason: "Stock unavailable",
          };
        }
      );

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "failed"', () => {
        expect(state.result?.status).toBe("failed");
      });

      And('the failure reason is "Stock unavailable"', () => {
        if (state.result?.status === "failed") {
          expect(state.result.reason).toBe("Stock unavailable");
        } else {
          throw new Error("Expected failed result");
        }
      });

      And('the result contains event type "ReservationFailed"', () => {
        if (state.result?.status === "failed") {
          expect(state.result.events[0].eventType).toBe("ReservationFailed");
        } else {
          throw new Error("Expected failed result");
        }
      });
    });

    // =========================================================================
    // OCC Pre-Check
    // =========================================================================

    Scenario(
      "OCC pre-check passes when expectedVersion matches scope version",
      ({ Given, And, When, Then }) => {
        Given("scopeOperations that return scope with currentVersion 0", () => {
          state.mockGetScope.mockResolvedValue({
            currentVersion: 0,
            tenantId: "t1",
            scopeType: "reservation",
            scopeId: "res_123",
          });
        });

        And("expectedVersion is 0", () => {
          state.expectedVersion = 0;
        });

        And("a decider that succeeds", () => {
          state.deciderBehavior = { type: "success", eventType: "ItemsReserved" };
        });

        And("scopeOperations commitScope succeeds with newVersion 1", () => {
          state.mockCommitScope.mockResolvedValue({ status: "success", newVersion: 1 });
          state.scopeOperations = {
            getScope: state.mockGetScope,
            commitScope: state.mockCommitScope,
          };
        });

        When("I execute the DCB operation", async () => {
          state.result = await executeOperation();
        });

        Then('the result status is "success"', () => {
          expect(state.result?.status).toBe("success");
        });
      }
    );

    Scenario("OCC pre-check detects stale expectedVersion", ({ Given, And, When, Then }) => {
      Given("scopeOperations that return scope with currentVersion 5", () => {
        state.mockGetScope.mockResolvedValue({
          currentVersion: 5,
          tenantId: "t1",
          scopeType: "reservation",
          scopeId: "res_123",
        });
        state.scopeOperations = {
          getScope: state.mockGetScope,
          commitScope: state.mockCommitScope,
        };
      });

      And("expectedVersion is 3", () => {
        state.expectedVersion = 3;
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "conflict"', () => {
        expect(state.result?.status).toBe("conflict");
      });

      And("the conflict currentVersion is 5", () => {
        if (state.result?.status === "conflict") {
          expect(state.result.currentVersion).toBe(5);
        } else {
          throw new Error("Expected conflict result");
        }
      });
    });

    Scenario(
      "OCC pre-check detects scope not found when expectedVersion > 0",
      ({ Given, And, When, Then }) => {
        Given("scopeOperations that return null scope", () => {
          state.mockGetScope.mockResolvedValue(null);
          state.scopeOperations = {
            getScope: state.mockGetScope,
            commitScope: state.mockCommitScope,
          };
        });

        And("expectedVersion is 1", () => {
          state.expectedVersion = 1;
        });

        When("I execute the DCB operation", async () => {
          state.result = await executeOperation();
        });

        Then('the result status is "conflict"', () => {
          expect(state.result?.status).toBe("conflict");
        });

        And("the conflict currentVersion is 0", () => {
          if (state.result?.status === "conflict") {
            expect(state.result.currentVersion).toBe(0);
          } else {
            throw new Error("Expected conflict result");
          }
        });
      }
    );

    Scenario(
      "OCC pre-check allows new scope with expectedVersion 0",
      ({ Given, And, When, Then }) => {
        Given("scopeOperations that return null scope", () => {
          state.mockGetScope.mockResolvedValue(null);
        });

        And("expectedVersion is 0", () => {
          state.expectedVersion = 0;
        });

        And("a decider that succeeds", () => {
          state.deciderBehavior = { type: "success", eventType: "ItemsReserved" };
        });

        And("scopeOperations commitScope succeeds with newVersion 1", () => {
          state.mockCommitScope.mockResolvedValue({ status: "success", newVersion: 1 });
          state.scopeOperations = {
            getScope: state.mockGetScope,
            commitScope: state.mockCommitScope,
          };
        });

        When("I execute the DCB operation", async () => {
          state.result = await executeOperation();
        });

        Then('the result status is "success"', () => {
          expect(state.result?.status).toBe("success");
        });
      }
    );

    // =========================================================================
    // OCC Commit
    // =========================================================================

    Scenario("OCC commit detects concurrent modification", ({ Given, And, When, Then }) => {
      Given("scopeOperations that return scope with currentVersion 0", () => {
        state.mockGetScope.mockResolvedValue({
          currentVersion: 0,
          tenantId: "t1",
          scopeType: "reservation",
          scopeId: "res_123",
        });
      });

      And("expectedVersion is 0", () => {
        state.expectedVersion = 0;
      });

      And("a decider that succeeds", () => {
        state.deciderBehavior = { type: "success", eventType: "ItemsReserved" };
      });

      And("scopeOperations commitScope returns conflict with currentVersion 1", () => {
        state.mockCommitScope.mockResolvedValue({ status: "conflict", currentVersion: 1 });
        state.scopeOperations = {
          getScope: state.mockGetScope,
          commitScope: state.mockCommitScope,
        };
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "conflict"', () => {
        expect(state.result?.status).toBe("conflict");
      });

      And("the conflict currentVersion is 1", () => {
        if (state.result?.status === "conflict") {
          expect(state.result.currentVersion).toBe(1);
        } else {
          throw new Error("Expected conflict result");
        }
      });
    });

    Scenario("OCC commit tracks updated stream IDs", ({ Given, And, When, Then }) => {
      Given("scopeOperations that return scope with currentVersion 0", () => {
        state.mockGetScope.mockResolvedValue({
          currentVersion: 0,
          tenantId: "t1",
          scopeType: "reservation",
          scopeId: "res_123",
        });
      });

      And("expectedVersion is 0", () => {
        state.expectedVersion = 0;
      });

      And('a decider that succeeds with updates to "product_1" and "product_2"', () => {
        state.deciderBehavior = {
          type: "success",
          eventType: "ItemsReserved",
          updateStreamIds: ["product_1", "product_2"],
        };
      });

      And("scopeOperations commitScope is called", () => {
        state.mockCommitScope.mockResolvedValue({ status: "success", newVersion: 1 });
        state.scopeOperations = {
          getScope: state.mockGetScope,
          commitScope: state.mockCommitScope,
        };
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('commitScope was called with streamIds "product_1" and "product_2"', () => {
        expect(state.mockCommitScope).toHaveBeenCalledTimes(1);
        const callArgs = state.mockCommitScope.mock.calls[0][0];
        expect(callArgs).toContain("product_1");
        expect(callArgs).toContain("product_2");
      });
    });

    // =========================================================================
    // Scope Key Validation
    // =========================================================================

    Scenario("Invalid scope key returns rejection", ({ Given, When, Then, And }) => {
      Given('an invalid scope key "invalid_key"', () => {
        state.scopeKey = "invalid_key" as DCBScopeKey;
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "rejected"', () => {
        expect(state.result?.status).toBe("rejected");
      });

      And('the rejection code contains "INVALID_SCOPE_KEY_FORMAT"', () => {
        if (state.result?.status === "rejected") {
          expect(state.result.code).toContain("INVALID_SCOPE_KEY_FORMAT");
        } else {
          throw new Error("Expected rejected result");
        }
      });
    });

    // =========================================================================
    // Entity Loading
    // =========================================================================

    Scenario("Missing entities returns rejection", ({ Given, When, Then, And }) => {
      Given('entities where "product_1" exists but "product_2" does not', () => {
        state.entityExists = new Map([
          ["product_1", true],
          ["product_2", false],
        ]);
      });

      When("I execute the DCB operation", async () => {
        state.result = await executeOperation();
      });

      Then('the result status is "rejected"', () => {
        expect(state.result?.status).toBe("rejected");
      });

      And('the rejection code is "ENTITIES_NOT_FOUND"', () => {
        if (state.result?.status === "rejected") {
          expect(state.result.code).toBe("ENTITIES_NOT_FOUND");
        } else {
          throw new Error("Expected rejected result");
        }
      });

      And('the rejection reason contains "product_2"', () => {
        if (state.result?.status === "rejected") {
          expect(state.result.reason).toContain("product_2");
        } else {
          throw new Error("Expected rejected result");
        }
      });
    });
  }
);

// =============================================================================
// Helper Functions
// =============================================================================

async function executeOperation(): Promise<DCBExecutionResult<MockData>> {
  const ctx = createMockContext();

  // Create decider with current state captured
  const decider = createDeciderForCurrentState();

  const config: ExecuteWithDCBConfig<
    typeof ctx,
    MockCms,
    MockCommand,
    MockEvent,
    MockData,
    MockStateUpdate,
    string
  > = {
    scopeKey: state.scopeKey!,
    expectedVersion: state.expectedVersion,
    boundedContext: "inventory",
    streamType: "Reservation",
    schemaVersion: state.schemaVersion,
    eventCategory: state.eventCategory,
    scopeOperations: state.scopeOperations,
    entities: {
      streamIds: state.entityStreamIds,
      loadEntity: async (_ctx, streamId) => {
        if (state.entityExists.get(streamId)) {
          return {
            cms: { id: streamId, quantity: 100 },
            _id: streamId,
          };
        }
        return null;
      },
    },
    decider,
    command: { orderId: "ord_001", items: [] },
    applyUpdate: async () => {
      // No-op for unit test - we're testing the flow, not the persistence
    },
    commandId: "cmd_001",
    correlationId: "corr_001",
  };

  return executeWithDCB(ctx, config);
}
