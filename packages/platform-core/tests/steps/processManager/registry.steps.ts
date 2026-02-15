/**
 * Process Manager Registry - Step Definitions
 *
 * BDD step definitions for ProcessManagerRegistry CRUD and lookup:
 * - register: single, multiple, duplicate detection
 * - get: by name, unknown name
 * - has: registered and unregistered checks
 * - list: empty and populated
 * - size: count verification
 * - getByTriggerEvent: event routing lookup
 * - getAllTriggerEvents: unique sorted event aggregation
 * - getAllEmittedCommands: unique sorted command aggregation
 * - getByContext: bounded context filtering
 * - getByTriggerType: trigger type filtering
 * - getTimeTriggeredPMs: time/hybrid PM retrieval
 * - Use cases: event routing, cron setup
 * - Edge cases: empty arrays, mixed PMs
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createProcessManagerRegistry } from "../../../src/processManager/registry";
import { defineProcessManager } from "@libar-dev/platform-bc";
import type { ProcessManagerDefinition } from "@libar-dev/platform-bc";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// PM Definitions (same as original test)
// =============================================================================

const orderNotificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  description: "Sends notification when order is confirmed",
  triggerType: "event",
  eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
  emitsCommands: ["SendNotification", "LogActivity"],
  context: "orders",
});

const reservationExpirationPM = defineProcessManager({
  processManagerName: "reservationExpiration",
  description: "Releases expired reservations on a schedule",
  triggerType: "time",
  eventSubscriptions: [] as const,
  emitsCommands: ["ReleaseReservation"],
  context: "inventory",
  cronConfig: {
    interval: { minutes: 5 },
    scheduleDescription: "Every 5 minutes",
  },
});

const orderFulfillmentPM = defineProcessManager({
  processManagerName: "orderFulfillment",
  description: "Handles order fulfillment with time and events",
  triggerType: "hybrid",
  eventSubscriptions: ["OrderPaid", "ShipmentReady"] as const,
  emitsCommands: ["CreateShipment", "NotifyWarehouse"],
  context: "orders",
  correlationStrategy: { correlationProperty: "orderId" },
  cronConfig: {
    interval: { hours: 1 },
    scheduleDescription: "Every hour",
  },
});

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  registry: ReturnType<typeof createProcessManagerRegistry>;
  gotPM: ProcessManagerDefinition | undefined;
  triggerEventResult: ProcessManagerDefinition[];
  contextResult: ProcessManagerDefinition[];
  triggerTypeResult: ProcessManagerDefinition[];
}

function createInitialState(): TestState {
  return {
    registry: createProcessManagerRegistry(),
    gotPM: undefined,
    triggerEventResult: [],
    contextResult: [],
    triggerTypeResult: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/processManager/registry.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: register
  // ==========================================================================

  Rule("register adds a process manager definition to the registry", ({ RuleScenario }) => {
    RuleScenario("Register a single process manager", ({ Given, When, Then, And }) => {
      Given("an empty registry", () => {
        // Already initialized in BeforeEachScenario
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      Then('the registry has "orderNotification"', () => {
        expect(state.registry.has("orderNotification")).toBe(true);
      });

      And("the registry size is 1", () => {
        expect(state.registry.size).toBe(1);
      });
    });

    RuleScenario("Register multiple process managers", ({ Given, When, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When("I register all three process managers", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      Then("the registry size is 3", () => {
        expect(state.registry.size).toBe(3);
      });
    });

    RuleScenario("Duplicate registration throws an error", ({ Given, When, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      Then('registering "orderNotification" again throws "is already registered"', () => {
        expect(() => state.registry.register(orderNotificationPM)).toThrow(
          'Process manager "orderNotification" is already registered'
        );
      });
    });
  });

  // ==========================================================================
  // Rule: get
  // ==========================================================================

  Rule("get retrieves a process manager by name", ({ RuleScenario }) => {
    RuleScenario("Get returns PM by name", ({ Given, When, Then, And }) => {
      Given("a registry with orderNotification and reservationExpiration", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
      });

      When('I get the process manager "orderNotification"', () => {
        state.gotPM = state.registry.get("orderNotification");
      });

      Then('the returned PM name is "orderNotification"', () => {
        expect(state.gotPM).toBeDefined();
        expect(state.gotPM?.processManagerName).toBe("orderNotification");
      });

      And('the returned PM trigger type is "event"', () => {
        expect(state.gotPM?.triggerType).toBe("event");
      });
    });

    RuleScenario("Get returns undefined for unknown PM", ({ Given, When, Then }) => {
      Given("a registry with orderNotification and reservationExpiration", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
      });

      When('I get the process manager "unknownPM"', () => {
        state.gotPM = state.registry.get("unknownPM");
      });

      Then("the returned PM is undefined", () => {
        expect(state.gotPM).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Rule: has
  // ==========================================================================

  Rule("has checks whether a process manager is registered", ({ RuleScenario }) => {
    RuleScenario("Has returns true for registered PM", ({ Given, When, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      Then('the registry has "orderNotification"', () => {
        expect(state.registry.has("orderNotification")).toBe(true);
      });
    });

    RuleScenario("Has returns false for unregistered PM", ({ Given, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      Then('the registry does not have "unknownPM"', () => {
        expect(state.registry.has("unknownPM")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: list
  // ==========================================================================

  Rule("list returns all registered process managers", ({ RuleScenario }) => {
    RuleScenario("List returns empty array for empty registry", ({ Given, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      Then("the list is empty", () => {
        expect(state.registry.list()).toEqual([]);
      });
    });

    RuleScenario("List returns all registered PMs", ({ Given, Then }) => {
      Given("a registry with orderNotification and reservationExpiration", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
      });

      Then("the list contains these PM names:", (...args: unknown[]) => {
        const rows = extractDataTable<{ name: string }>(...args);
        const all = state.registry.list();
        expect(all).toHaveLength(rows.length);
        const names = all.map((pm) => pm.processManagerName);
        for (const row of rows) {
          expect(names).toContain(row.name);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: size
  // ==========================================================================

  Rule("size returns the count of registered process managers", ({ RuleScenario }) => {
    RuleScenario("Size is 0 for empty registry", ({ Given, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      Then("the registry size is 0", () => {
        expect(state.registry.size).toBe(0);
      });
    });

    RuleScenario("Size reflects registration count", ({ Given, Then }) => {
      Given("a registry with orderNotification and reservationExpiration", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
      });

      Then("the registry size is 2", () => {
        expect(state.registry.size).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Rule: getByTriggerEvent
  // ==========================================================================

  Rule("getByTriggerEvent finds PMs subscribed to a given event type", ({ RuleScenario }) => {
    RuleScenario("Returns PM subscribed to a specific event", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger event "OrderConfirmed"', () => {
        state.triggerEventResult = state.registry.getByTriggerEvent("OrderConfirmed");
      });

      Then("the trigger event result contains 1 PM", () => {
        expect(state.triggerEventResult).toHaveLength(1);
      });

      And('the trigger event result includes "orderNotification"', () => {
        expect(state.triggerEventResult[0].processManagerName).toBe("orderNotification");
      });
    });

    RuleScenario("Returns PM for shared event across hybrid PM", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger event "OrderPaid"', () => {
        state.triggerEventResult = state.registry.getByTriggerEvent("OrderPaid");
      });

      Then("the trigger event result contains 1 PM", () => {
        expect(state.triggerEventResult).toHaveLength(1);
      });

      And('the trigger event result includes "orderFulfillment"', () => {
        expect(state.triggerEventResult.map((pm) => pm.processManagerName)).toContain(
          "orderFulfillment"
        );
      });
    });

    RuleScenario("Returns empty for unknown event type", ({ Given, When, Then }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger event "UnknownEvent"', () => {
        state.triggerEventResult = state.registry.getByTriggerEvent("UnknownEvent");
      });

      Then("the trigger event result is empty", () => {
        expect(state.triggerEventResult).toEqual([]);
      });
    });

    RuleScenario("Returns empty for event matching no subscriptions", ({ Given, When, Then }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger event "ReleaseReservation"', () => {
        state.triggerEventResult = state.registry.getByTriggerEvent("ReleaseReservation");
      });

      Then("the trigger event result is empty", () => {
        expect(state.triggerEventResult).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // Rule: getAllTriggerEvents
  // ==========================================================================

  Rule("getAllTriggerEvents returns unique sorted event types from all PMs", ({ RuleScenario }) => {
    RuleScenario("Returns empty array for empty registry", ({ Given, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      Then("getAllTriggerEvents returns an empty array", () => {
        expect(state.registry.getAllTriggerEvents()).toEqual([]);
      });
    });

    RuleScenario("Returns unique sorted event types", ({ Given, When, And, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      And('I also register the "orderFulfillment" process manager', () => {
        state.registry.register(orderFulfillmentPM);
      });

      Then("getAllTriggerEvents result is sorted and unique", () => {
        const eventTypes = state.registry.getAllTriggerEvents();
        const sorted = [...eventTypes].sort();
        expect(eventTypes).toEqual(sorted);
        expect(new Set(eventTypes).size).toBe(eventTypes.length);
      });

      And("getAllTriggerEvents contains all of:", (...args: unknown[]) => {
        const rows = extractDataTable<{ event: string }>(...args);
        const eventTypes = state.registry.getAllTriggerEvents();
        for (const row of rows) {
          expect(eventTypes).toContain(row.event);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: getAllEmittedCommands
  // ==========================================================================

  Rule(
    "getAllEmittedCommands returns unique sorted command types from all PMs",
    ({ RuleScenario }) => {
      RuleScenario("Returns empty array for empty registry for commands", ({ Given, Then }) => {
        Given("an empty registry", () => {
          // Already initialized
        });

        Then("getAllEmittedCommands returns an empty array", () => {
          expect(state.registry.getAllEmittedCommands()).toEqual([]);
        });
      });

      RuleScenario("Returns unique sorted command types", ({ Given, Then, And }) => {
        Given("a fully populated registry", () => {
          state.registry.register(orderNotificationPM);
          state.registry.register(reservationExpirationPM);
          state.registry.register(orderFulfillmentPM);
        });

        Then("getAllEmittedCommands result is sorted and unique", () => {
          const commandTypes = state.registry.getAllEmittedCommands();
          const sorted = [...commandTypes].sort();
          expect(commandTypes).toEqual(sorted);
          expect(new Set(commandTypes).size).toBe(commandTypes.length);
        });

        And("getAllEmittedCommands contains all of:", (...args: unknown[]) => {
          const rows = extractDataTable<{ command: string }>(...args);
          const commandTypes = state.registry.getAllEmittedCommands();
          for (const row of rows) {
            expect(commandTypes).toContain(row.command);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: getByContext
  // ==========================================================================

  Rule("getByContext filters process managers by bounded context", ({ RuleScenario }) => {
    RuleScenario("Filters by orders context", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by context "orders"', () => {
        state.contextResult = state.registry.getByContext("orders");
      });

      Then("the context result contains 2 PMs", () => {
        expect(state.contextResult).toHaveLength(2);
      });

      And("the context result includes these PM names:", (...args: unknown[]) => {
        const rows = extractDataTable<{ name: string }>(...args);
        const names = state.contextResult.map((pm) => pm.processManagerName);
        for (const row of rows) {
          expect(names).toContain(row.name);
        }
      });
    });

    RuleScenario("Filters by inventory context", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by context "inventory"', () => {
        state.contextResult = state.registry.getByContext("inventory");
      });

      Then("the context result contains 1 PM", () => {
        expect(state.contextResult).toHaveLength(1);
      });

      And('the context result first PM is "reservationExpiration"', () => {
        expect(state.contextResult[0].processManagerName).toBe("reservationExpiration");
      });
    });

    RuleScenario("Returns empty for unknown context", ({ Given, When, Then }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by context "unknown"', () => {
        state.contextResult = state.registry.getByContext("unknown");
      });

      Then("the context result is empty", () => {
        expect(state.contextResult).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // Rule: getByTriggerType
  // ==========================================================================

  Rule("getByTriggerType filters process managers by trigger type", ({ RuleScenario }) => {
    RuleScenario("Filters by event trigger type", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger type "event"', () => {
        state.triggerTypeResult = state.registry.getByTriggerType("event");
      });

      Then("the trigger type result contains 1 PM", () => {
        expect(state.triggerTypeResult).toHaveLength(1);
      });

      And('the trigger type result first PM is "orderNotification"', () => {
        expect(state.triggerTypeResult[0].processManagerName).toBe("orderNotification");
      });
    });

    RuleScenario("Filters by time trigger type", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger type "time"', () => {
        state.triggerTypeResult = state.registry.getByTriggerType("time");
      });

      Then("the trigger type result contains 1 PM", () => {
        expect(state.triggerTypeResult).toHaveLength(1);
      });

      And('the trigger type result first PM is "reservationExpiration"', () => {
        expect(state.triggerTypeResult[0].processManagerName).toBe("reservationExpiration");
      });
    });

    RuleScenario("Filters by hybrid trigger type", ({ Given, When, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      When('I query PMs by trigger type "hybrid"', () => {
        state.triggerTypeResult = state.registry.getByTriggerType("hybrid");
      });

      Then("the trigger type result contains 1 PM", () => {
        expect(state.triggerTypeResult).toHaveLength(1);
      });

      And('the trigger type result first PM is "orderFulfillment"', () => {
        expect(state.triggerTypeResult[0].processManagerName).toBe("orderFulfillment");
      });
    });
  });

  // ==========================================================================
  // Rule: getTimeTriggeredPMs
  // ==========================================================================

  Rule("getTimeTriggeredPMs returns time and hybrid triggered PMs", ({ RuleScenario }) => {
    RuleScenario("Returns time and hybrid triggered PMs", ({ Given, Then, And }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      Then("getTimeTriggeredPMs returns 2 PMs", () => {
        expect(state.registry.getTimeTriggeredPMs()).toHaveLength(2);
      });

      And("getTimeTriggeredPMs includes these PM names:", (...args: unknown[]) => {
        const rows = extractDataTable<{ name: string }>(...args);
        const names = state.registry.getTimeTriggeredPMs().map((pm) => pm.processManagerName);
        for (const row of rows) {
          expect(names).toContain(row.name);
        }
      });
    });

    RuleScenario("Excludes event-only triggered PMs", ({ Given, Then }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      Then('getTimeTriggeredPMs does not include "orderNotification"', () => {
        const names = state.registry.getTimeTriggeredPMs().map((pm) => pm.processManagerName);
        expect(names).not.toContain("orderNotification");
      });
    });

    RuleScenario("All time-triggered PMs have cronConfig", ({ Given, Then }) => {
      Given("a fully populated registry", () => {
        state.registry.register(orderNotificationPM);
        state.registry.register(reservationExpirationPM);
        state.registry.register(orderFulfillmentPM);
      });

      Then("all getTimeTriggeredPMs results have cronConfig with scheduleDescription", () => {
        const pms = state.registry.getTimeTriggeredPMs();
        pms.forEach((pm) => {
          expect(pm.cronConfig).toBeDefined();
          expect(pm.cronConfig?.scheduleDescription).toBeDefined();
        });
      });
    });
  });

  // ==========================================================================
  // Rule: Event routing use case
  // ==========================================================================

  Rule("Event routing use case finds all handlers for an event", ({ RuleScenario }) => {
    RuleScenario("Find all handlers for OrderShipped event", ({ Given, When, And, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      And('I also register the "orderFulfillment" process manager', () => {
        state.registry.register(orderFulfillmentPM);
      });

      And('I query PMs by trigger event "OrderShipped"', () => {
        state.triggerEventResult = state.registry.getByTriggerEvent("OrderShipped");
      });

      Then("the trigger event result contains 1 PM", () => {
        expect(state.triggerEventResult).toHaveLength(1);
      });

      And('the trigger event result includes "orderNotification"', () => {
        expect(state.triggerEventResult[0].processManagerName).toBe("orderNotification");
      });
    });
  });

  // ==========================================================================
  // Rule: Cron setup use case
  // ==========================================================================

  Rule(
    "Cron setup use case retrieves all time-triggered PMs for scheduling",
    ({ RuleScenario }) => {
      RuleScenario("Get all time-triggered PMs for cron scheduling", ({ Given, Then, And }) => {
        Given("a fully populated registry", () => {
          state.registry.register(orderNotificationPM);
          state.registry.register(reservationExpirationPM);
          state.registry.register(orderFulfillmentPM);
        });

        Then("getTimeTriggeredPMs returns 2 PMs", () => {
          expect(state.registry.getTimeTriggeredPMs()).toHaveLength(2);
        });

        And("all getTimeTriggeredPMs results have positive interval values", () => {
          const cronPMs = state.registry.getTimeTriggeredPMs();
          cronPMs.forEach((pm) => {
            expect(pm.cronConfig).toBeDefined();
            if (pm.cronConfig?.interval.minutes) {
              expect(pm.cronConfig.interval.minutes).toBeGreaterThan(0);
            }
            if (pm.cronConfig?.interval.hours) {
              expect(pm.cronConfig.interval.hours).toBeGreaterThan(0);
            }
          });
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Edge cases
  // ==========================================================================

  Rule("Registry handles PMs with empty event subscriptions and commands", ({ RuleScenario }) => {
    RuleScenario(
      "PM with empty subscriptions and commands is handled correctly",
      ({ Given, When, Then, And }) => {
        Given("an empty registry", () => {
          // Already initialized
        });

        When("I register a no-op time-triggered process manager", () => {
          const noopPM = defineProcessManager({
            processManagerName: "noopPM",
            description: "Does nothing - time-triggered with no subscriptions or commands",
            triggerType: "time",
            eventSubscriptions: [] as const,
            emitsCommands: [],
            context: "test",
            cronConfig: { interval: { hours: 1 }, scheduleDescription: "Hourly" },
          });
          state.registry.register(noopPM);
        });

        Then('the registry has "noopPM"', () => {
          expect(state.registry.has("noopPM")).toBe(true);
        });

        And("the registry size is 1", () => {
          expect(state.registry.size).toBe(1);
        });

        And("getAllTriggerEvents returns an empty array", () => {
          expect(state.registry.getAllTriggerEvents()).toEqual([]);
        });

        And("getAllEmittedCommands returns an empty array", () => {
          expect(state.registry.getAllEmittedCommands()).toEqual([]);
        });

        And('getByTriggerType "time" returns 1 PM named "noopPM"', () => {
          const timePMs = state.registry.getByTriggerType("time");
          expect(timePMs).toHaveLength(1);
          expect(timePMs[0].processManagerName).toBe("noopPM");
        });

        And("getTimeTriggeredPMs returns 1 PM", () => {
          expect(state.registry.getTimeTriggeredPMs()).toHaveLength(1);
        });

        And('querying by trigger event "SomeEvent" returns empty', () => {
          expect(state.registry.getByTriggerEvent("SomeEvent")).toEqual([]);
        });
      }
    );

    RuleScenario("Mixed PMs where some have empty arrays", ({ Given, When, And, Then }) => {
      Given("an empty registry", () => {
        // Already initialized
      });

      When('I register the "orderNotification" process manager', () => {
        state.registry.register(orderNotificationPM);
      });

      And("I register a no-op time-triggered process manager", () => {
        const noopPM = defineProcessManager({
          processManagerName: "noopPM",
          description: "No-op PM",
          triggerType: "time",
          eventSubscriptions: [] as const,
          emitsCommands: [],
          context: "test",
          cronConfig: { interval: { minutes: 30 }, scheduleDescription: "Every 30 minutes" },
        });
        state.registry.register(noopPM);
      });

      Then("getAllTriggerEvents contains exactly these events:", (...args: unknown[]) => {
        const rows = extractDataTable<{ event: string }>(...args);
        const events = state.registry.getAllTriggerEvents();
        expect(events).toHaveLength(rows.length);
        for (const row of rows) {
          expect(events).toContain(row.event);
        }
      });

      And("getAllEmittedCommands contains exactly these commands:", (...args: unknown[]) => {
        const rows = extractDataTable<{ command: string }>(...args);
        const commands = state.registry.getAllEmittedCommands();
        expect(commands).toHaveLength(rows.length);
        for (const row of rows) {
          expect(commands).toContain(row.command);
        }
      });
    });
  });
});
