/**
 * Step Definitions for Event Store Type Contracts Feature
 *
 * Unit-level BDD tests for type contracts in @libar-dev/platform-store.
 *
 * This is a Layer 1 package (Convex component), but these tests focus on
 * type contracts which are pure TypeScript - no Convex runtime required.
 *
 * @libar-docs-event-sourcing
 * @libar-docs-pattern BddTestingInfrastructure
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type {
  EventCategory,
  EventInput,
  StoredEvent,
  AppendResult,
} from "../../src/client/index.js";

// ============================================================================
// Test State
// ============================================================================

interface ScenarioState {
  eventInput: EventInput | null;
  storedEvent: StoredEvent | null;
  appendResult: AppendResult | null;
  validCategories: EventCategory[];
}

let state: ScenarioState | null = null;

function initState(): ScenarioState {
  return {
    eventInput: null,
    storedEvent: null,
    appendResult: null,
    validCategories: [],
  };
}

// ============================================================================
// Feature Tests
// ============================================================================

const feature = await loadFeature("tests/features/behavior/event-store-types.feature");

describeFeature(feature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  // ==========================================================================
  // Background
  // ==========================================================================

  Background(({ Given }) => {
    Given("the event store type definitions are available", async () => {
      state = initState();
      // Types are imported at module level - this step documents availability
    });
  });

  // ==========================================================================
  // EventCategory Type Scenarios
  // ==========================================================================

  Scenario("EventCategory supports all taxonomy values", ({ When, Then }) => {
    When("validating EventCategory type values", async () => {
      // All valid EventCategory values per Phase 9 taxonomy
      state!.validCategories = ["domain", "integration", "trigger", "fat"];
    });

    Then(
      "all Phase 9 taxonomy values should be valid:",
      async (_ctx: unknown, table: Array<{ category: string }>) => {
        for (const row of table) {
          const category: EventCategory = row.category as EventCategory;
          expect(state!.validCategories).toContain(category);
        }
        // Ensure we tested all expected categories
        expect(table.length).toBe(4);
      }
    );
  });

  // ==========================================================================
  // EventInput Interface Scenarios
  // ==========================================================================

  Scenario("EventInput requires core event fields", ({ Given, When, Then, And }) => {
    Given(
      "an EventInput with required fields:",
      async (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
        const data: Record<string, unknown> = {};
        for (const row of table) {
          if (row.field === "payload") {
            data[row.field] = JSON.parse(row.value);
          } else {
            data[row.field] = row.value;
          }
        }
        state!.eventInput = data as unknown as EventInput;
      }
    );

    When("the EventInput structure is validated", async () => {
      expect(state!.eventInput).toBeDefined();
    });

    Then("the EventInput should have eventId {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.eventInput!.eventId).toBe(expected);
    });

    And(
      "the EventInput should have eventType {string}",
      async (_ctx: unknown, expected: string) => {
        expect(state!.eventInput!.eventType).toBe(expected);
      }
    );

    And("the EventInput should have a payload object", async () => {
      expect(state!.eventInput!.payload).toBeDefined();
      expect(typeof state!.eventInput!.payload).toBe("object");
    });
  });

  Scenario(
    "EventInput supports optional category and schemaVersion",
    ({ Given, When, Then, And }) => {
      Given(
        "an EventInput with optional Phase 9 fields:",
        async (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          const data: Record<string, unknown> = {};
          for (const row of table) {
            if (row.field === "payload") {
              data[row.field] = JSON.parse(row.value);
            } else if (row.field === "schemaVersion") {
              data[row.field] = parseInt(row.value, 10);
            } else {
              data[row.field] = row.value;
            }
          }
          state!.eventInput = data as unknown as EventInput;
        }
      );

      When("the EventInput structure is validated", async () => {
        expect(state!.eventInput).toBeDefined();
      });

      Then(
        "the EventInput should have category {string}",
        async (_ctx: unknown, expected: string) => {
          expect(state!.eventInput!.category).toBe(expected);
        }
      );

      And(
        "the EventInput should have schemaVersion {int}",
        async (_ctx: unknown, expected: number) => {
          expect(state!.eventInput!.schemaVersion).toBe(expected);
        }
      );
    }
  );

  Scenario(
    "EventInput supports metadata with correlation tracking",
    ({ Given, When, Then, And }) => {
      Given(
        "an EventInput with metadata:",
        async (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          const data: Record<string, unknown> = {
            payload: {},
          };
          const metadata: Record<string, string> = {};

          for (const row of table) {
            if (["correlationId", "causationId", "userId"].includes(row.field)) {
              metadata[row.field] = row.value;
            } else {
              data[row.field] = row.value;
            }
          }
          data.metadata = metadata;
          state!.eventInput = data as unknown as EventInput;
        }
      );

      When("the EventInput structure is validated", async () => {
        expect(state!.eventInput).toBeDefined();
        expect(state!.eventInput!.metadata).toBeDefined();
      });

      Then(
        "the EventInput metadata should have correlationId {string}",
        async (_ctx: unknown, expected: string) => {
          expect(state!.eventInput!.metadata?.correlationId).toBe(expected);
        }
      );

      And(
        "the EventInput metadata should have causationId {string}",
        async (_ctx: unknown, expected: string) => {
          expect(state!.eventInput!.metadata?.causationId).toBe(expected);
        }
      );

      And(
        "the EventInput metadata should have userId {string}",
        async (_ctx: unknown, expected: string) => {
          expect(state!.eventInput!.metadata?.userId).toBe(expected);
        }
      );
    }
  );

  // ==========================================================================
  // StoredEvent Interface Scenarios
  // ==========================================================================

  Scenario("StoredEvent includes all required storage fields", ({ Given, When, Then, And }) => {
    Given("a StoredEvent with all required fields", async () => {
      state!.storedEvent = {
        eventId: "evt-stored-123",
        eventType: "OrderCreated",
        streamType: "Order",
        streamId: "order-456",
        version: 1,
        globalPosition: 1000001,
        boundedContext: "orders",
        category: "domain",
        schemaVersion: 1,
        correlationId: "corr-789",
        timestamp: Date.now(),
        payload: { orderId: "order-456" },
      };
    });

    When("the StoredEvent structure is validated", async () => {
      expect(state!.storedEvent).toBeDefined();
    });

    Then(
      "the StoredEvent should have stream identity fields:",
      async (_ctx: unknown, table: Array<{ field: string }>) => {
        for (const row of table) {
          expect(state!.storedEvent).toHaveProperty(row.field);
          expect(state!.storedEvent![row.field as keyof StoredEvent]).toBeDefined();
        }
      }
    );

    And(
      "the StoredEvent should have version tracking fields:",
      async (_ctx: unknown, table: Array<{ field: string }>) => {
        for (const row of table) {
          expect(state!.storedEvent).toHaveProperty(row.field);
          expect(typeof state!.storedEvent![row.field as keyof StoredEvent]).toBe("number");
        }
      }
    );

    And(
      "the StoredEvent should have Phase 9 taxonomy fields:",
      async (_ctx: unknown, table: Array<{ field: string }>) => {
        for (const row of table) {
          expect(state!.storedEvent).toHaveProperty(row.field);
        }
        // Verify category is valid
        expect(["domain", "integration", "trigger", "fat"]).toContain(state!.storedEvent!.category);
        // Verify schemaVersion is a number
        expect(typeof state!.storedEvent!.schemaVersion).toBe("number");
      }
    );

    And(
      "the StoredEvent should have correlation tracking:",
      async (_ctx: unknown, table: Array<{ field: string }>) => {
        for (const row of table) {
          expect(state!.storedEvent).toHaveProperty(row.field);
          expect(state!.storedEvent![row.field as keyof StoredEvent]).toBeDefined();
        }
      }
    );
  });

  // ==========================================================================
  // AppendResult Discriminated Union Scenarios
  // ==========================================================================

  Scenario("AppendResult success includes event positions", ({ Given, When, Then, And }) => {
    Given("an AppendResult with status {string}", async (_ctx: unknown, status: string) => {
      if (status === "success") {
        state!.appendResult = {
          status: "success",
          eventIds: ["evt-001", "evt-002"],
          globalPositions: [1000001, 1000002],
          newVersion: 2,
        };
      }
    });

    When("the AppendResult structure is validated", async () => {
      expect(state!.appendResult).toBeDefined();
      expect(state!.appendResult!.status).toBe("success");
    });

    Then("the result should have eventIds array", async () => {
      if (state!.appendResult!.status === "success") {
        expect(Array.isArray(state!.appendResult.eventIds)).toBe(true);
        expect(state!.appendResult.eventIds.length).toBeGreaterThan(0);
      }
    });

    And("the result should have globalPositions array", async () => {
      if (state!.appendResult!.status === "success") {
        expect(Array.isArray(state!.appendResult.globalPositions)).toBe(true);
        expect(state!.appendResult.globalPositions.length).toBeGreaterThan(0);
      }
    });

    And("the result should have newVersion number", async () => {
      if (state!.appendResult!.status === "success") {
        expect(typeof state!.appendResult.newVersion).toBe("number");
      }
    });
  });

  Scenario("AppendResult conflict includes current version", ({ Given, When, Then, And }) => {
    Given("an AppendResult with status {string}", async (_ctx: unknown, status: string) => {
      if (status === "conflict") {
        state!.appendResult = {
          status: "conflict",
          currentVersion: 5,
        };
      }
    });

    When("the AppendResult structure is validated", async () => {
      expect(state!.appendResult).toBeDefined();
      expect(state!.appendResult!.status).toBe("conflict");
    });

    Then("the result should have currentVersion number", async () => {
      if (state!.appendResult!.status === "conflict") {
        expect(typeof state!.appendResult.currentVersion).toBe("number");
      }
    });

    And("the result should not have eventIds", async () => {
      if (state!.appendResult!.status === "conflict") {
        // Type narrowing ensures eventIds is not accessible
        expect("eventIds" in state!.appendResult).toBe(false);
      }
    });
  });
});
