/**
 * Idempotent Append - Step Definitions
 *
 * BDD step definitions for idempotent event append operations:
 * - Idempotency key builders (command, action, saga, scheduled job)
 * - Idempotent append function behavior
 * - OCC conflict handling
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  idempotentAppendEvent,
  buildCommandIdempotencyKey,
  buildActionIdempotencyKey,
  buildSagaStepIdempotencyKey,
  buildScheduledJobIdempotencyKey,
} from "../../../src/durability/idempotentAppend.js";
import type { IdempotentAppendResult } from "../../../src/durability/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  idempotencyKey: string | null;
  existingEvent: { eventId: string; version: number } | null;
  appendResult:
    | { status: "success"; newVersion: number }
    | { status: "conflict"; currentVersion: number }
    | null;
  recheckResult: { eventId: string; version: number } | null;
  appendCalled: boolean;
  getByKeyCallCount: number;
  result: IdempotentAppendResult | null;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    idempotencyKey: null,
    existingEvent: null,
    appendResult: null,
    recheckResult: null,
    appendCalled: false,
    getByKeyCallCount: 0,
    result: null,
    error: null,
  };
}

function createMockContext() {
  return {
    runQuery: vi.fn().mockImplementation(() => {
      state.getByKeyCallCount++;
      if (state.getByKeyCallCount === 1) {
        return Promise.resolve(state.existingEvent);
      }
      return Promise.resolve(state.recheckResult);
    }),
    runMutation: vi.fn().mockImplementation(() => {
      state.appendCalled = true;
      return Promise.resolve(state.appendResult);
    }),
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/idempotent-append.feature"
);

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Idempotency Key Builder Scenarios
  // ===========================================================================

  Scenario(
    "Command idempotency key uses commandType:entityId:commandId format",
    ({ When, Then }) => {
      When(
        'building command idempotency key with type "SubmitOrder", entity "ord-123", command "cmd-456"',
        () => {
          state.idempotencyKey = buildCommandIdempotencyKey("SubmitOrder", "ord-123", "cmd-456");
        }
      );

      Then('the idempotency key should be "SubmitOrder:ord-123:cmd-456"', () => {
        expect(state.idempotencyKey).toBe("SubmitOrder:ord-123:cmd-456");
      });
    }
  );

  Scenario("Action idempotency key uses actionType:entityId format", ({ When, Then }) => {
    When('building action idempotency key with type "payment" and entity "ord-123"', () => {
      state.idempotencyKey = buildActionIdempotencyKey("payment", "ord-123");
    });

    Then('the idempotency key should be "payment:ord-123"', () => {
      expect(state.idempotencyKey).toBe("payment:ord-123");
    });
  });

  Scenario("Saga step idempotency key uses sagaType:sagaId:step format", ({ When, Then }) => {
    When(
      'building saga step idempotency key with type "OrderFulfillment", id "saga-789", step "reserveStock"',
      () => {
        state.idempotencyKey = buildSagaStepIdempotencyKey(
          "OrderFulfillment",
          "saga-789",
          "reserveStock"
        );
      }
    );

    Then('the idempotency key should be "OrderFulfillment:saga-789:reserveStock"', () => {
      expect(state.idempotencyKey).toBe("OrderFulfillment:saga-789:reserveStock");
    });
  });

  Scenario(
    "Scheduled job idempotency key uses jobType:scheduleId:timestamp format",
    ({ When, Then }) => {
      When(
        'building scheduled job idempotency key with type "expireReservations", schedule "job-001", timestamp 1704067200',
        () => {
          state.idempotencyKey = buildScheduledJobIdempotencyKey(
            "expireReservations",
            "job-001",
            1704067200
          );
        }
      );

      Then('the idempotency key should be "expireReservations:job-001:1704067200"', () => {
        expect(state.idempotencyKey).toBe("expireReservations:job-001:1704067200");
      });
    }
  );

  // ===========================================================================
  // Idempotent Append Scenarios
  // ===========================================================================

  Scenario("First append with idempotency key succeeds", ({ Given, When, Then, And }) => {
    Given('no existing event for idempotency key "payment:ord-123"', () => {
      state.existingEvent = null;
      state.appendResult = { status: "success", newVersion: 1 };
    });

    When('calling idempotentAppendEvent with key "payment:ord-123"', async () => {
      const ctx = createMockContext();
      try {
        state.result = await idempotentAppendEvent(ctx, {
          event: {
            idempotencyKey: "payment:ord-123",
            streamType: "Order",
            streamId: "ord-123",
            eventType: "PaymentCompleted",
            eventData: { chargeId: "ch-456" },
            boundedContext: "orders",
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('the append result status should be "appended"', () => {
      expect(state.result?.status).toBe("appended");
    });

    And("a new event ID should be generated", () => {
      expect(state.result?.eventId).toBeDefined();
      expect(state.appendCalled).toBe(true);
    });
  });

  Scenario("Duplicate append returns existing event", ({ Given, When, Then, And }) => {
    Given('an existing event with idempotency key "payment:ord-123" and ID "evt-456"', () => {
      state.existingEvent = { eventId: "evt-456", version: 1 };
    });

    When('calling idempotentAppendEvent with key "payment:ord-123"', async () => {
      const ctx = createMockContext();
      try {
        state.result = await idempotentAppendEvent(ctx, {
          event: {
            idempotencyKey: "payment:ord-123",
            streamType: "Order",
            streamId: "ord-123",
            eventType: "PaymentCompleted",
            eventData: { chargeId: "ch-456" },
            boundedContext: "orders",
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('the append result status should be "duplicate"', () => {
      expect(state.result?.status).toBe("duplicate");
    });

    And('the result event ID should be "evt-456"', () => {
      expect(state.result?.eventId).toBe("evt-456");
    });
  });

  Scenario("Different idempotency keys create separate events", ({ Given, When, Then }) => {
    Given('no existing event for idempotency key "payment:ord-456"', () => {
      state.existingEvent = null;
      state.appendResult = { status: "success", newVersion: 1 };
    });

    When('calling idempotentAppendEvent with key "payment:ord-456"', async () => {
      const ctx = createMockContext();
      try {
        state.result = await idempotentAppendEvent(ctx, {
          event: {
            idempotencyKey: "payment:ord-456",
            streamType: "Order",
            streamId: "ord-456",
            eventType: "PaymentCompleted",
            eventData: { chargeId: "ch-789" },
            boundedContext: "orders",
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('the append result status should be "appended"', () => {
      expect(state.result?.status).toBe("appended");
    });
  });

  // ===========================================================================
  // OCC Conflict Scenarios
  // ===========================================================================

  Scenario("OCC conflict with duplicate on recheck returns duplicate", ({ Given, When, Then }) => {
    Given('no initial event but duplicate appears on recheck for key "payment:ord-123"', () => {
      state.existingEvent = null;
      state.appendResult = { status: "conflict", currentVersion: 5 };
      state.recheckResult = { eventId: "evt-concurrent", version: 5 };
    });

    When("calling idempotentAppendEvent with OCC conflict", async () => {
      const ctx = createMockContext();
      try {
        state.result = await idempotentAppendEvent(ctx, {
          event: {
            idempotencyKey: "payment:ord-123",
            streamType: "Order",
            streamId: "ord-123",
            eventType: "PaymentCompleted",
            eventData: { chargeId: "ch-456" },
            boundedContext: "orders",
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('the append result status should be "duplicate"', () => {
      expect(state.result?.status).toBe("duplicate");
    });
  });

  Scenario("True OCC conflict throws error", ({ Given, When, Then }) => {
    Given('no event exists and no duplicate on recheck for key "payment:ord-123"', () => {
      state.existingEvent = null;
      state.appendResult = { status: "conflict", currentVersion: 5 };
      state.recheckResult = null;
    });

    When("calling idempotentAppendEvent with true OCC conflict", async () => {
      const ctx = createMockContext();
      try {
        state.result = await idempotentAppendEvent(ctx, {
          event: {
            idempotencyKey: "payment:ord-123",
            streamType: "Order",
            streamId: "ord-123",
            eventType: "PaymentCompleted",
            eventData: { chargeId: "ch-456" },
            boundedContext: "orders",
            expectedVersion: 0,
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("an OCC conflict error should be thrown with version info", () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("OCC conflict");
      expect(state.error?.message).toContain("Expected version");
    });
  });
});
