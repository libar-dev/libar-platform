/**
 * Poison Event - Step Definitions
 *
 * BDD step definitions for poison event handling:
 * - withPoisonEventHandling wrapper
 * - isEventQuarantined query
 * - getPoisonEventRecord query
 * - unquarantineEvent mutation
 * - listQuarantinedEvents query
 * - getPoisonEventStats query
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  withPoisonEventHandling,
  isEventQuarantined,
  getPoisonEventRecord,
  unquarantineEvent,
  listQuarantinedEvents,
  getPoisonEventStats,
} from "../../../src/durability/poisonEvent.js";
import type { PoisonEventRecord } from "../../../src/durability/types.js";

// =============================================================================
// Types
// =============================================================================

interface MockPoisonRecord {
  eventId: string;
  eventType: string;
  projectionName: string;
  status: "pending" | "quarantined" | "replayed";
  attemptCount: number;
  error: string;
  updatedAt: number;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockPoisonRecord: MockPoisonRecord | null;
  mockQuarantinedRecords: MockPoisonRecord[];
  mockPoisonStats: {
    totalQuarantined: number;
    byProjection: Record<string, number>;
  };
  projectionHandlerCalled: boolean;
  projectionHandlerError: Error | null;
  onQuarantineCalled: boolean;
  onQuarantineArgs: {
    eventId: string;
    projectionName: string;
    attempts: number;
    error: string;
  } | null;
  upsertPoisonRecordCalls: MockPoisonRecord[];
  capturedFilterProjection: string | null;
  isQuarantinedResult: boolean | null;
  poisonRecordResult: PoisonEventRecord | null;
  unquarantineResult: { status: string } | null;
  listQuarantinedResult: PoisonEventRecord[] | null;
  poisonStatsResult: { totalQuarantined: number; byProjection: Record<string, number> } | null;
  thrownError: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    mockPoisonRecord: null,
    mockQuarantinedRecords: [],
    mockPoisonStats: { totalQuarantined: 0, byProjection: {} },
    projectionHandlerCalled: false,
    projectionHandlerError: null,
    onQuarantineCalled: false,
    onQuarantineArgs: null,
    upsertPoisonRecordCalls: [],
    capturedFilterProjection: null,
    isQuarantinedResult: null,
    poisonRecordResult: null,
    unquarantineResult: null,
    listQuarantinedResult: null,
    poisonStatsResult: null,
    thrownError: null,
  };
}

function createMockDependencies() {
  return {
    getPoisonRecord: "mockGetPoisonRecord",
    upsertPoisonRecord: "mockUpsertPoisonRecord",
    listQuarantinedRecords: "mockListQuarantinedRecords",
    getPoisonStats: "mockGetPoisonStats",
  };
}

function createMockContext() {
  return {
    runQuery: vi.fn().mockImplementation((_ref, args) => {
      if (args?.eventId && args?.projectionName) {
        return Promise.resolve(state.mockPoisonRecord);
      }
      if (args?.limit !== undefined || args?.projectionName !== undefined) {
        if (args?.projectionName) {
          state.capturedFilterProjection = args.projectionName;
        }
        return Promise.resolve(state.mockQuarantinedRecords);
      }
      return Promise.resolve(state.mockPoisonStats);
    }),
    runMutation: vi.fn().mockImplementation((_ref, args) => {
      state.upsertPoisonRecordCalls.push(args);
      return Promise.resolve();
    }),
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/poison-event.feature"
);

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Poison Event Wrapper - Success Path
  // ===========================================================================

  Scenario("Successful processing creates no poison record", ({ Given, When, Then, And }) => {
    Given("a poison event handler wrapping a successful projection", () => {
      state.projectionHandlerError = null;
      state.mockPoisonRecord = null;
    });

    When("processing an event", async () => {
      const handler = withPoisonEventHandling(
        async () => {
          state.projectionHandlerCalled = true;
        },
        {
          projectionName: "orderSummary",
          maxAttempts: 3,
          alertOnQuarantine: false,
          dependencies: createMockDependencies(),
        }
      );

      const ctx = createMockContext();
      try {
        await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
      } catch (e) {
        state.thrownError = e as Error;
      }
    });

    Then("no poison record should be created", () => {
      expect(state.upsertPoisonRecordCalls.length).toBe(0);
    });

    And("the handler should complete successfully", () => {
      expect(state.thrownError).toBeNull();
      expect(state.projectionHandlerCalled).toBe(true);
    });
  });

  // ===========================================================================
  // Poison Event Wrapper - Failure Tracking
  // ===========================================================================

  Scenario(
    "First failure records attempt but does not quarantine",
    ({ Given, When, Then, And }) => {
      Given("a poison event handler with maxAttempts 3 and no existing record", () => {
        state.mockPoisonRecord = null;
        state.projectionHandlerError = new Error("Processing failed");
      });

      When("processing an event that throws an error", async () => {
        const handler = withPoisonEventHandling(
          async () => {
            state.projectionHandlerCalled = true;
            throw state.projectionHandlerError;
          },
          {
            projectionName: "orderSummary",
            maxAttempts: 3,
            alertOnQuarantine: false,
            dependencies: createMockDependencies(),
          }
        );

        const ctx = createMockContext();
        try {
          await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
        } catch (e) {
          state.thrownError = e as Error;
        }
      });

      Then("a poison record should be created with attemptCount 1", () => {
        expect(state.upsertPoisonRecordCalls.length).toBe(1);
        expect(state.upsertPoisonRecordCalls[0].attemptCount).toBe(1);
      });

      And('the record status should be "pending"', () => {
        expect(state.upsertPoisonRecordCalls[0].status).toBe("pending");
      });

      And("the original error should be re-thrown", () => {
        expect(state.thrownError).not.toBeNull();
        expect(state.thrownError?.message).toBe("Processing failed");
      });
    }
  );

  Scenario("Event becomes quarantined after max retries", ({ Given, When, Then, And }) => {
    Given("a poison event handler with maxAttempts 3 and existing record with 2 attempts", () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "pending",
        attemptCount: 2,
        error: "Previous error",
        updatedAt: Date.now(),
      };
      state.projectionHandlerError = new Error("Processing failed again");
    });

    When("processing an event that throws an error", async () => {
      const handler = withPoisonEventHandling(
        async () => {
          state.projectionHandlerCalled = true;
          throw state.projectionHandlerError;
        },
        {
          projectionName: "orderSummary",
          maxAttempts: 3,
          alertOnQuarantine: false,
          dependencies: createMockDependencies(),
        }
      );

      const ctx = createMockContext();
      try {
        await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
      } catch (e) {
        state.thrownError = e as Error;
      }
    });

    Then('the poison record should be updated to status "quarantined"', () => {
      expect(state.upsertPoisonRecordCalls.length).toBe(1);
      expect(state.upsertPoisonRecordCalls[0].status).toBe("quarantined");
    });

    And("the error should NOT be re-thrown", () => {
      expect(state.thrownError).toBeNull();
    });
  });

  Scenario("Quarantined event is silently skipped", ({ Given, When, Then, And }) => {
    Given("a poison event handler with a quarantined record for the event", () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "quarantined",
        attemptCount: 3,
        error: "Fatal error",
        updatedAt: Date.now(),
      };
    });

    When("processing the quarantined event", async () => {
      const handler = withPoisonEventHandling(
        async () => {
          state.projectionHandlerCalled = true;
        },
        {
          projectionName: "orderSummary",
          maxAttempts: 3,
          alertOnQuarantine: false,
          dependencies: createMockDependencies(),
        }
      );

      const ctx = createMockContext();
      try {
        await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
      } catch (e) {
        state.thrownError = e as Error;
      }
    });

    Then("the projection handler should NOT be called", () => {
      expect(state.projectionHandlerCalled).toBe(false);
    });

    And("no error should be thrown", () => {
      expect(state.thrownError).toBeNull();
    });
  });

  // ===========================================================================
  // Alert Callback
  // ===========================================================================

  Scenario(
    "onQuarantine callback invoked when alertOnQuarantine is true",
    ({ Given, When, Then }) => {
      Given("a poison handler with alertOnQuarantine true and onQuarantine callback", () => {
        state.mockPoisonRecord = {
          eventId: "evt-123",
          eventType: "OrderCreated",
          projectionName: "orderSummary",
          status: "pending",
          attemptCount: 2,
          error: "Previous error",
          updatedAt: Date.now(),
        };
        state.projectionHandlerError = new Error("Processing failed");
      });

      When("an event becomes quarantined", async () => {
        const onQuarantine = (args: {
          eventId: string;
          projectionName: string;
          attempts: number;
          error: string;
        }) => {
          state.onQuarantineCalled = true;
          state.onQuarantineArgs = args;
        };

        const handler = withPoisonEventHandling(
          async () => {
            throw state.projectionHandlerError;
          },
          {
            projectionName: "orderSummary",
            maxAttempts: 3,
            alertOnQuarantine: true,
            dependencies: createMockDependencies(),
            onQuarantine,
          }
        );

        const ctx = createMockContext();
        try {
          await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
        } catch (e) {
          state.thrownError = e as Error;
        }
      });

      Then("the onQuarantine callback should be invoked with event details", () => {
        expect(state.onQuarantineCalled).toBe(true);
        expect(state.onQuarantineArgs?.eventId).toBe("evt-123");
        expect(state.onQuarantineArgs?.projectionName).toBe("orderSummary");
        expect(state.onQuarantineArgs?.attempts).toBe(3);
      });
    }
  );

  Scenario("onQuarantine NOT invoked when alertOnQuarantine is false", ({ Given, When, Then }) => {
    Given("a poison handler with alertOnQuarantine false", () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "pending",
        attemptCount: 2,
        error: "Previous error",
        updatedAt: Date.now(),
      };
      state.projectionHandlerError = new Error("Processing failed");
    });

    When("an event becomes quarantined", async () => {
      const onQuarantine = () => {
        state.onQuarantineCalled = true;
      };

      const handler = withPoisonEventHandling(
        async () => {
          throw state.projectionHandlerError;
        },
        {
          projectionName: "orderSummary",
          maxAttempts: 3,
          alertOnQuarantine: false,
          dependencies: createMockDependencies(),
          onQuarantine,
        }
      );

      const ctx = createMockContext();
      try {
        await handler(ctx, { eventId: "evt-123", eventType: "OrderCreated" });
      } catch (e) {
        state.thrownError = e as Error;
      }
    });

    Then("the onQuarantine callback should NOT be invoked", () => {
      expect(state.onQuarantineCalled).toBe(false);
    });
  });

  // ===========================================================================
  // Query Functions
  // ===========================================================================

  Scenario("isEventQuarantined returns true for quarantined event", ({ Given, When, Then }) => {
    Given('a quarantined poison record for event "evt-123"', () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "quarantined",
        attemptCount: 3,
        error: "Fatal error",
        updatedAt: Date.now(),
      };
    });

    When('checking if event "evt-123" is quarantined for projection "orderSummary"', async () => {
      const ctx = createMockContext();
      state.isQuarantinedResult = await isEventQuarantined(ctx, {
        eventId: "evt-123",
        projectionName: "orderSummary",
        dependencies: { getPoisonRecord: "mock" },
      });
    });

    Then("the result should be true", () => {
      expect(state.isQuarantinedResult).toBe(true);
    });
  });

  Scenario(
    "isEventQuarantined returns false for non-quarantined event",
    ({ Given, When, Then }) => {
      Given('a pending poison record for event "evt-123"', () => {
        state.mockPoisonRecord = {
          eventId: "evt-123",
          eventType: "OrderCreated",
          projectionName: "orderSummary",
          status: "pending",
          attemptCount: 1,
          error: "Error",
          updatedAt: Date.now(),
        };
      });

      When('checking if event "evt-123" is quarantined for projection "orderSummary"', async () => {
        const ctx = createMockContext();
        state.isQuarantinedResult = await isEventQuarantined(ctx, {
          eventId: "evt-123",
          projectionName: "orderSummary",
          dependencies: { getPoisonRecord: "mock" },
        });
      });

      Then("the result should be false", () => {
        expect(state.isQuarantinedResult).toBe(false);
      });
    }
  );

  Scenario("getPoisonEventRecord returns normalized record", ({ Given, When, Then }) => {
    Given('a poison record with attemptCount 3 and error "Test error"', () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "quarantined",
        attemptCount: 3,
        error: "Test error",
        updatedAt: Date.now(),
      };
    });

    When("getting poison record for the event", async () => {
      const ctx = createMockContext();
      state.poisonRecordResult = await getPoisonEventRecord(ctx, {
        eventId: "evt-123",
        projectionName: "orderSummary",
        dependencies: { getPoisonRecord: "mock" },
      });
    });

    Then('the result should have attempts 3 and lastError "Test error"', () => {
      expect(state.poisonRecordResult?.attempts).toBe(3);
      expect(state.poisonRecordResult?.lastError).toBe("Test error");
    });
  });

  Scenario("getPoisonEventRecord returns null for non-existent event", ({ Given, When, Then }) => {
    Given('no poison record exists for event "evt-999"', () => {
      state.mockPoisonRecord = null;
    });

    When('getting poison record for event "evt-999"', async () => {
      const ctx = createMockContext();
      state.poisonRecordResult = await getPoisonEventRecord(ctx, {
        eventId: "evt-999",
        projectionName: "orderSummary",
        dependencies: { getPoisonRecord: "mock" },
      });
    });

    Then("the result should be null", () => {
      expect(state.poisonRecordResult).toBeNull();
    });
  });

  // ===========================================================================
  // Unquarantine
  // ===========================================================================

  Scenario("unquarantineEvent clears quarantine status", ({ Given, When, Then, And }) => {
    Given('a quarantined poison record for event "evt-123"', () => {
      state.mockPoisonRecord = {
        eventId: "evt-123",
        eventType: "OrderCreated",
        projectionName: "orderSummary",
        status: "quarantined",
        attemptCount: 3,
        error: "Fatal error",
        updatedAt: Date.now(),
      };
    });

    When("calling unquarantineEvent", async () => {
      const ctx = createMockContext();
      state.unquarantineResult = await unquarantineEvent(ctx, {
        eventId: "evt-123",
        projectionName: "orderSummary",
        dependencies: {
          getPoisonRecord: "mock",
          upsertPoisonRecord: "mock",
        },
      });
    });

    Then('the result status should be "unquarantined"', () => {
      expect(state.unquarantineResult?.status).toBe("unquarantined");
    });

    And('the record should be updated to status "replayed" with attemptCount 0', () => {
      expect(state.upsertPoisonRecordCalls.length).toBe(1);
      expect(state.upsertPoisonRecordCalls[0].status).toBe("replayed");
      expect(state.upsertPoisonRecordCalls[0].attemptCount).toBe(0);
    });
  });

  Scenario("unquarantineEvent returns not_found for missing event", ({ Given, When, Then }) => {
    Given('no poison record exists for event "evt-999"', () => {
      state.mockPoisonRecord = null;
    });

    When('calling unquarantineEvent for event "evt-999"', async () => {
      const ctx = createMockContext();
      state.unquarantineResult = await unquarantineEvent(ctx, {
        eventId: "evt-999",
        projectionName: "orderSummary",
        dependencies: {
          getPoisonRecord: "mock",
          upsertPoisonRecord: "mock",
        },
      });
    });

    Then('the result status should be "not_found"', () => {
      expect(state.unquarantineResult?.status).toBe("not_found");
    });
  });

  Scenario(
    "unquarantineEvent returns not_quarantined for pending event",
    ({ Given, When, Then }) => {
      Given('a pending poison record for event "evt-123"', () => {
        state.mockPoisonRecord = {
          eventId: "evt-123",
          eventType: "OrderCreated",
          projectionName: "orderSummary",
          status: "pending",
          attemptCount: 1,
          error: "Error",
          updatedAt: Date.now(),
        };
      });

      When("calling unquarantineEvent", async () => {
        const ctx = createMockContext();
        state.unquarantineResult = await unquarantineEvent(ctx, {
          eventId: "evt-123",
          projectionName: "orderSummary",
          dependencies: {
            getPoisonRecord: "mock",
            upsertPoisonRecord: "mock",
          },
        });
      });

      Then('the result status should be "not_quarantined"', () => {
        expect(state.unquarantineResult?.status).toBe("not_quarantined");
      });
    }
  );

  // ===========================================================================
  // List and Stats
  // ===========================================================================

  Scenario("listQuarantinedEvents returns quarantined records", ({ Given, When, Then }) => {
    Given("3 quarantined poison records", () => {
      state.mockQuarantinedRecords = [
        {
          eventId: "evt-1",
          eventType: "OrderCreated",
          projectionName: "orderSummary",
          status: "quarantined",
          attemptCount: 3,
          error: "Error 1",
          updatedAt: Date.now(),
        },
        {
          eventId: "evt-2",
          eventType: "OrderUpdated",
          projectionName: "orderSummary",
          status: "quarantined",
          attemptCount: 3,
          error: "Error 2",
          updatedAt: Date.now(),
        },
        {
          eventId: "evt-3",
          eventType: "OrderDeleted",
          projectionName: "inventory",
          status: "quarantined",
          attemptCount: 3,
          error: "Error 3",
          updatedAt: Date.now(),
        },
      ];
    });

    When("listing quarantined events", async () => {
      const ctx = createMockContext();
      state.listQuarantinedResult = await listQuarantinedEvents(ctx, {
        dependencies: { listQuarantinedRecords: "mock" },
      });
    });

    Then("the result should contain 3 records with eventId, projectionName, and attempts", () => {
      expect(state.listQuarantinedResult?.length).toBe(3);
      for (const record of state.listQuarantinedResult ?? []) {
        expect(record).toHaveProperty("eventId");
        expect(record).toHaveProperty("projectionName");
        expect(record).toHaveProperty("attempts");
      }
    });
  });

  Scenario("listQuarantinedEvents filters by projection", ({ Given, When, Then }) => {
    Given("quarantined records for multiple projections", () => {
      state.mockQuarantinedRecords = [
        {
          eventId: "evt-1",
          eventType: "OrderCreated",
          projectionName: "orderSummary",
          status: "quarantined",
          attemptCount: 3,
          error: "Error",
          updatedAt: Date.now(),
        },
      ];
    });

    When('listing quarantined events with projectionName "orderSummary"', async () => {
      const ctx = createMockContext();
      state.listQuarantinedResult = await listQuarantinedEvents(ctx, {
        projectionName: "orderSummary",
        dependencies: { listQuarantinedRecords: "mock" },
      });
    });

    Then("the query should filter by projection name", () => {
      expect(state.capturedFilterProjection).toBe("orderSummary");
    });
  });

  Scenario("getPoisonEventStats returns aggregated statistics", ({ Given, When, Then, And }) => {
    Given(
      "poison stats with totalQuarantined 10 and byProjection orderSummary:7, inventory:3",
      () => {
        state.mockPoisonStats = {
          totalQuarantined: 10,
          byProjection: { orderSummary: 7, inventory: 3 },
        };
      }
    );

    When("getting poison event stats", async () => {
      const ctx = createMockContext();
      state.poisonStatsResult = await getPoisonEventStats(ctx, {
        dependencies: { getPoisonStats: "mock" },
      });
    });

    Then("the result totalQuarantined should be 10", () => {
      expect(state.poisonStatsResult?.totalQuarantined).toBe(10);
    });

    And("byProjection should contain orderSummary:7 and inventory:3", () => {
      expect(state.poisonStatsResult?.byProjection?.orderSummary).toBe(7);
      expect(state.poisonStatsResult?.byProjection?.inventory).toBe(3);
    });
  });
});
