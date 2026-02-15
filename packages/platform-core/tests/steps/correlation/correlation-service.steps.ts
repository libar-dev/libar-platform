/**
 * CorrelationService - Step Definitions
 *
 * BDD step definitions for command-event correlation tracking:
 * - Recording correlations
 * - Querying by command ID and bounded context
 * - Existence checks and event counts
 * - Factory function
 *
 * Mechanical migration from tests/unit/correlation/CorrelationService.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  CorrelationService,
  createCorrelationService,
  type CorrelationCommandBusClient,
  type CommandEventCorrelation,
} from "../../../src/correlation/CorrelationService.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Client Factory
// =============================================================================

function createMockClient(
  data: Map<string, CommandEventCorrelation> = new Map()
): CorrelationCommandBusClient {
  return {
    recordCommandEventCorrelation: vi.fn(async (args) => {
      const existing = data.get(args.commandId);
      if (existing) {
        const existingIds = new Set(existing.eventIds);
        for (const id of args.eventIds) {
          existingIds.add(id);
        }
        existing.eventIds = Array.from(existingIds);
      } else {
        data.set(args.commandId, {
          commandId: args.commandId,
          eventIds: args.eventIds,
          commandType: args.commandType,
          boundedContext: args.boundedContext,
          createdAt: Date.now(),
        });
      }
      return true;
    }),

    getEventsByCommandId: vi.fn(async (args) => {
      return data.get(args.commandId) ?? null;
    }),

    getCorrelationsByContext: vi.fn(async (args) => {
      return Array.from(data.values())
        .filter((c) => c.boundedContext === args.boundedContext)
        .filter((c) => args.afterTimestamp === undefined || c.createdAt > args.afterTimestamp)
        .slice(0, args.limit ?? 100);
    }),
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  client: CorrelationCommandBusClient;
  service: CorrelationService;
  dataStore: Map<string, CommandEventCorrelation>;
  recordResult: boolean | null;
  queryResult: CommandEventCorrelation | null;
  contextResults: CommandEventCorrelation[];
  hasCorrelationResult: boolean | null;
  eventCount: number | null;
  factoryResult: unknown;
  thrownError: string | null;
}

function createInitialState(): TestState {
  const dataStore = new Map<string, CommandEventCorrelation>();
  const client = createMockClient(dataStore);
  const service = new CorrelationService(client);
  return {
    client,
    service,
    dataStore,
    recordResult: null,
    queryResult: null,
    contextResults: [],
    hasCorrelationResult: null,
    eventCount: null,
    factoryResult: null,
    thrownError: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/correlation/correlation-service.feature"
);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // recordCorrelation
  // ==========================================================================

  Rule("recordCorrelation persists a new command-event correlation", ({ RuleScenario }) => {
    RuleScenario("Record a new correlation", ({ When, Then, And }) => {
      When(
        'a correlation is recorded with commandId "cmd_123", eventIds "evt_456", commandType "CreateOrder", and boundedContext "orders"',
        async () => {
          state.recordResult = await state.service.recordCorrelation({
            commandId: "cmd_123",
            eventIds: ["evt_456"],
            commandType: "CreateOrder",
            boundedContext: "orders",
          });
        }
      );

      Then("the record result is true", () => {
        expect(state.recordResult).toBe(true);
      });

      And("the client was called with the correct arguments", () => {
        expect(state.client.recordCommandEventCorrelation).toHaveBeenCalledWith({
          commandId: "cmd_123",
          eventIds: ["evt_456"],
          commandType: "CreateOrder",
          boundedContext: "orders",
        });
      });
    });
  });

  Rule("recordCorrelation merges event IDs for duplicate command IDs", ({ RuleScenario }) => {
    RuleScenario("Merge event IDs for existing correlation", ({ Given, When, Then }) => {
      Given(
        'a correlation exists with commandId "cmd_123", eventId "evt_1", commandType "CreateOrder", and boundedContext "orders"',
        async () => {
          await state.service.recordCorrelation({
            commandId: "cmd_123",
            eventIds: ["evt_1"],
            commandType: "CreateOrder",
            boundedContext: "orders",
          });
        }
      );

      When(
        'a second correlation is recorded with commandId "cmd_123", eventId "evt_2", commandType "CreateOrder", and boundedContext "orders"',
        async () => {
          await state.service.recordCorrelation({
            commandId: "cmd_123",
            eventIds: ["evt_2"],
            commandType: "CreateOrder",
            boundedContext: "orders",
          });
        }
      );

      Then('the correlation for "cmd_123" contains event IDs:', async (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ eventId: string }>(dataTable);
        const correlation = await state.service.getEventsByCommand("cmd_123");
        for (const row of rows) {
          expect(correlation?.eventIds).toContain(row.eventId);
        }
      });
    });
  });

  // ==========================================================================
  // getEventsByCommand
  // ==========================================================================

  Rule("getEventsByCommand returns null for non-existent commands", ({ RuleScenario }) => {
    RuleScenario("Return null for non-existent command", ({ When, Then }) => {
      When('getEventsByCommand is called with "cmd_nonexistent"', async () => {
        state.queryResult = await state.service.getEventsByCommand("cmd_nonexistent");
      });

      Then("the result is null", () => {
        expect(state.queryResult).toBeNull();
      });
    });
  });

  Rule(
    "getEventsByCommand returns the full correlation for existing commands",
    ({ RuleScenario }) => {
      RuleScenario("Return correlation for existing command", ({ Given, When, Then, And }) => {
        Given(
          'a correlation exists with commandId "cmd_123", eventIds "evt_456,evt_789", commandType "CreateOrder", and boundedContext "orders"',
          async () => {
            await state.service.recordCorrelation({
              commandId: "cmd_123",
              eventIds: ["evt_456", "evt_789"],
              commandType: "CreateOrder",
              boundedContext: "orders",
            });
          }
        );

        When('getEventsByCommand is called with "cmd_123"', async () => {
          state.queryResult = await state.service.getEventsByCommand("cmd_123");
        });

        Then("the returned correlation has all properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
          for (const row of rows) {
            const actual = (state.queryResult as unknown as Record<string, unknown>)[row.property];
            expect(actual).toBe(row.value);
          }
        });

        And('the returned correlation has eventIds "evt_456" and "evt_789"', () => {
          expect(state.queryResult?.eventIds).toEqual(["evt_456", "evt_789"]);
        });
      });
    }
  );

  // ==========================================================================
  // getCorrelationsByContext
  // ==========================================================================

  Rule("getCorrelationsByContext filters correlations by bounded context", ({ RuleScenario }) => {
    RuleScenario("Filter by bounded context", ({ Given, When, Then }) => {
      Given("seeded correlations exist across contexts", async () => {
        await state.service.recordCorrelation({
          commandId: "cmd_1",
          eventIds: ["evt_1"],
          commandType: "CreateOrder",
          boundedContext: "orders",
        });
        await state.service.recordCorrelation({
          commandId: "cmd_2",
          eventIds: ["evt_2"],
          commandType: "ReserveStock",
          boundedContext: "inventory",
        });
        await state.service.recordCorrelation({
          commandId: "cmd_3",
          eventIds: ["evt_3"],
          commandType: "AddOrderItem",
          boundedContext: "orders",
        });
      });

      When('getCorrelationsByContext is called with boundedContext "orders"', async () => {
        state.contextResults = await state.service.getCorrelationsByContext({
          boundedContext: "orders",
        });
      });

      Then('the result has 2 correlations all with boundedContext "orders"', () => {
        expect(state.contextResults.length).toBe(2);
        expect(state.contextResults.every((c) => c.boundedContext === "orders")).toBe(true);
      });
    });
  });

  Rule("getCorrelationsByContext throws when boundedContext is missing", ({ RuleScenario }) => {
    RuleScenario("Throw when boundedContext is missing", ({ When, Then }) => {
      When("getCorrelationsByContext is called with an empty object", async () => {
        try {
          await state.service.getCorrelationsByContext({});
        } catch (e) {
          state.thrownError = (e as Error).message;
        }
      });

      Then('it throws "boundedContext is required for getCorrelationsByContext"', () => {
        expect(state.thrownError).toBe("boundedContext is required for getCorrelationsByContext");
      });
    });
  });

  Rule("getCorrelationsByContext respects the limit parameter", ({ RuleScenario }) => {
    RuleScenario("Respect limit parameter", ({ Given, When, Then }) => {
      Given("seeded correlations exist across contexts", async () => {
        await state.service.recordCorrelation({
          commandId: "cmd_1",
          eventIds: ["evt_1"],
          commandType: "CreateOrder",
          boundedContext: "orders",
        });
        await state.service.recordCorrelation({
          commandId: "cmd_2",
          eventIds: ["evt_2"],
          commandType: "ReserveStock",
          boundedContext: "inventory",
        });
        await state.service.recordCorrelation({
          commandId: "cmd_3",
          eventIds: ["evt_3"],
          commandType: "AddOrderItem",
          boundedContext: "orders",
        });
      });

      When(
        'getCorrelationsByContext is called with boundedContext "orders" and limit 1',
        async () => {
          state.contextResults = await state.service.getCorrelationsByContext({
            boundedContext: "orders",
            limit: 1,
          });
        }
      );

      Then("the result has 1 correlation", () => {
        expect(state.contextResults.length).toBe(1);
      });
    });
  });

  // ==========================================================================
  // hasCorrelation
  // ==========================================================================

  Rule(
    "hasCorrelation returns true when a correlation exists for the command",
    ({ RuleScenario }) => {
      RuleScenario("Return true for command with events", ({ Given, When, Then }) => {
        Given(
          'a correlation exists with commandId "cmd_123", eventId "evt_456", commandType "CreateOrder", and boundedContext "orders"',
          async () => {
            await state.service.recordCorrelation({
              commandId: "cmd_123",
              eventIds: ["evt_456"],
              commandType: "CreateOrder",
              boundedContext: "orders",
            });
          }
        );

        When('hasCorrelation is called with "cmd_123"', async () => {
          state.hasCorrelationResult = await state.service.hasCorrelation("cmd_123");
        });

        Then("the hasCorrelation result is true", () => {
          expect(state.hasCorrelationResult).toBe(true);
        });
      });
    }
  );

  Rule("hasCorrelation returns false for non-existent commands", ({ RuleScenario }) => {
    RuleScenario("Return false for non-existent command", ({ When, Then }) => {
      When('hasCorrelation is called with "cmd_nonexistent"', async () => {
        state.hasCorrelationResult = await state.service.hasCorrelation("cmd_nonexistent");
      });

      Then("the hasCorrelation result is false", () => {
        expect(state.hasCorrelationResult).toBe(false);
      });
    });
  });

  // ==========================================================================
  // getEventCount
  // ==========================================================================

  Rule("getEventCount returns the number of events for an existing command", ({ RuleScenario }) => {
    RuleScenario("Return event count for existing command", ({ Given, When, Then }) => {
      Given(
        'a correlation exists with commandId "cmd_123", eventIds "evt_1,evt_2,evt_3", commandType "CreateOrder", and boundedContext "orders"',
        async () => {
          await state.service.recordCorrelation({
            commandId: "cmd_123",
            eventIds: ["evt_1", "evt_2", "evt_3"],
            commandType: "CreateOrder",
            boundedContext: "orders",
          });
        }
      );

      When('getEventCount is called with "cmd_123"', async () => {
        state.eventCount = await state.service.getEventCount("cmd_123");
      });

      Then("the event count is 3", () => {
        expect(state.eventCount).toBe(3);
      });
    });
  });

  Rule("getEventCount returns 0 for non-existent commands", ({ RuleScenario }) => {
    RuleScenario("Return 0 for non-existent command", ({ When, Then }) => {
      When('getEventCount is called with "cmd_nonexistent"', async () => {
        state.eventCount = await state.service.getEventCount("cmd_nonexistent");
      });

      Then("the event count is 0", () => {
        expect(state.eventCount).toBe(0);
      });
    });
  });

  // ==========================================================================
  // createCorrelationService Factory
  // ==========================================================================

  Rule("createCorrelationService returns a CorrelationService instance", ({ RuleScenario }) => {
    RuleScenario("Create a CorrelationService instance", ({ When, Then }) => {
      When("createCorrelationService is called with a mock client", () => {
        const client = createMockClient();
        state.factoryResult = createCorrelationService(client);
      });

      Then("the result is an instance of CorrelationService", () => {
        expect(state.factoryResult).toBeInstanceOf(CorrelationService);
      });
    });
  });
});
