/**
 * Event Upcaster Utilities - Step Definitions
 *
 * BDD step definitions for event schema evolution utilities:
 * - createEventUpcaster: Chain-based migration for events
 * - createUpcasterRegistry: Centralized upcaster management
 * - Helper migrations: addFieldMigration, renameFieldMigration
 * - EventUpcasterError: Error handling
 *
 * Mechanical migration from tests/unit/events/upcaster.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  createEventUpcaster,
  createUpcasterRegistry,
  addFieldMigration,
  renameFieldMigration,
  EventUpcasterError,
} from "../../../src/events/upcaster.js";
import type { EnhancedDomainEvent } from "../../../src/events/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Event Types
// =============================================================================

interface OrderCreatedV1Payload {
  orderId: string;
  customerId: string;
}

interface OrderCreatedV2Payload extends OrderCreatedV1Payload {
  createdAt: number;
}

interface OrderCreatedV3Payload extends OrderCreatedV2Payload {
  priority: "low" | "medium" | "high";
}

function createTestEvent<T>(payload: T, schemaVersion: number = 1): EnhancedDomainEvent<T> {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCreated",
    streamType: "Order",
    streamId: "order_456",
    version: 1,
    globalPosition: 1000,
    timestamp: Date.now(),
    correlationId: "corr_789",
    boundedContext: "orders",
    payload,
    category: "domain",
    schemaVersion,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Upcaster function
  upcaster:
    | ((event: EnhancedDomainEvent<unknown>) => {
        wasUpcasted: boolean;
        originalSchemaVersion: number;
        currentSchemaVersion: number;
        event: EnhancedDomainEvent<unknown>;
      })
    | null;
  // Input event
  inputEvent: EnhancedDomainEvent<unknown> | null;
  // Upcaster result
  result: {
    wasUpcasted: boolean;
    originalSchemaVersion: number;
    currentSchemaVersion: number;
    event: EnhancedDomainEvent<unknown>;
  } | null;
  // Error captured
  caughtError: unknown;
  // Registry
  registry: ReturnType<typeof createUpcasterRegistry> | null;
  // Migration function
  migration: ((event: EnhancedDomainEvent<unknown>) => EnhancedDomainEvent<unknown>) | null;
  // Migration result
  migrationResult: EnhancedDomainEvent<unknown> | null;
  // Error instance
  errorInstance: EventUpcasterError | null;
}

function createInitialState(): TestState {
  return {
    upcaster: null,
    inputEvent: null,
    result: null,
    caughtError: null,
    registry: null,
    migration: null,
    migrationResult: null,
    errorInstance: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/events/upcaster.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // createEventUpcaster — current version
  // ==========================================================================

  Rule(
    "createEventUpcaster returns events at current version without migration",
    ({ RuleScenario }) => {
      RuleScenario("Event at current version is returned as-is", ({ Given, When, Then, And }) => {
        Given("an upcaster from version 1 to version 2", () => {
          state.upcaster = createEventUpcaster<OrderCreatedV2Payload>({
            currentVersion: 2,
            migrations: {
              1: (event) => ({
                ...event,
                payload: {
                  ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                  createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
                },
                schemaVersion: 2,
              }),
            },
          }) as TestState["upcaster"];
        });

        And(
          'a v2 event with orderId "order_1" and customerId "cust_1" and createdAt 1234567890',
          () => {
            state.inputEvent = createTestEvent<OrderCreatedV2Payload>(
              {
                orderId: "order_1",
                customerId: "cust_1",
                createdAt: 1234567890,
              },
              2
            );
          }
        );

        When("the upcaster is applied", () => {
          state.result = state.upcaster!(state.inputEvent!);
        });

        Then("the result was not upcasted", () => {
          expect(state.result!.wasUpcasted).toBe(false);
        });

        And("the original schema version is 2", () => {
          expect(state.result!.originalSchemaVersion).toBe(2);
        });

        And("the current schema version is 2", () => {
          expect(state.result!.currentSchemaVersion).toBe(2);
        });

        And("the event payload matches the input payload", () => {
          expect(state.result!.event.payload).toEqual(state.inputEvent!.payload);
        });
      });
    }
  );

  // ==========================================================================
  // createEventUpcaster — single migration
  // ==========================================================================

  Rule("createEventUpcaster applies a single migration step", ({ RuleScenario }) => {
    RuleScenario("Event is migrated from v1 to v2", ({ Given, And, When, Then }) => {
      Given("an upcaster from version 1 to version 2", () => {
        state.upcaster = createEventUpcaster<OrderCreatedV2Payload>({
          currentVersion: 2,
          migrations: {
            1: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
              },
              schemaVersion: 2,
            }),
          },
        }) as TestState["upcaster"];
      });

      And('a v1 event with orderId "order_1" and customerId "cust_1"', () => {
        state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
          { orderId: "order_1", customerId: "cust_1" },
          1
        );
      });

      When("the upcaster is applied", () => {
        state.result = state.upcaster!(state.inputEvent!);
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original schema version is 1", () => {
        expect(state.result!.originalSchemaVersion).toBe(1);
      });

      And("the current schema version is 2", () => {
        expect(state.result!.currentSchemaVersion).toBe(2);
      });

      And("the event payload has a defined createdAt field", () => {
        expect((state.result!.event.payload as OrderCreatedV2Payload).createdAt).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // createEventUpcaster — multiple migrations
  // ==========================================================================

  Rule("createEventUpcaster applies multiple migration steps in order", ({ RuleScenario }) => {
    RuleScenario("Event is migrated from v1 to v3", ({ Given, And, When, Then }) => {
      Given("an upcaster from version 1 to version 3", () => {
        state.upcaster = createEventUpcaster<OrderCreatedV3Payload>({
          currentVersion: 3,
          migrations: {
            1: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                createdAt: (event as EnhancedDomainEvent<OrderCreatedV1Payload>).timestamp,
              },
              schemaVersion: 2,
            }),
            2: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload,
                priority: "medium" as const,
              },
              schemaVersion: 3,
            }),
          },
        }) as TestState["upcaster"];
      });

      And('a v1 event with orderId "order_1" and customerId "cust_1"', () => {
        state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
          { orderId: "order_1", customerId: "cust_1" },
          1
        );
      });

      When("the upcaster is applied", () => {
        state.result = state.upcaster!(state.inputEvent!);
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original schema version is 1", () => {
        expect(state.result!.originalSchemaVersion).toBe(1);
      });

      And("the current schema version is 3", () => {
        expect(state.result!.currentSchemaVersion).toBe(3);
      });

      And("the event payload has a defined createdAt field", () => {
        expect((state.result!.event.payload as OrderCreatedV3Payload).createdAt).toBeDefined();
      });

      And('the event payload priority is "medium"', () => {
        expect((state.result!.event.payload as OrderCreatedV3Payload).priority).toBe("medium");
      });
    });
  });

  // ==========================================================================
  // createEventUpcaster — error cases
  // ==========================================================================

  Rule(
    "createEventUpcaster rejects invalid configurations and future versions",
    ({ RuleScenario }) => {
      RuleScenario("Incomplete migration chain throws at creation time", ({ When, Then }) => {
        When("an upcaster is created with current version 3 but only a v1 migration", () => {
          state.caughtError = null;
          try {
            createEventUpcaster<OrderCreatedV3Payload>({
              currentVersion: 3,
              migrations: {
                1: (event) => ({
                  ...event,
                  schemaVersion: 2,
                }),
              },
            });
          } catch (e) {
            state.caughtError = e;
          }
        });

        Then('it throws an error containing "Missing migration for version 2"', () => {
          expect(state.caughtError).toBeDefined();
          expect((state.caughtError as Error).message).toContain("Missing migration for version 2");
        });
      });

      RuleScenario(
        "Future schema version throws FUTURE_VERSION error",
        ({ Given, And, When, Then }) => {
          Given("an upcaster from version 1 to version 2", () => {
            state.upcaster = createEventUpcaster<OrderCreatedV2Payload>({
              currentVersion: 2,
              migrations: {
                1: (event) => ({ ...event, schemaVersion: 2 }),
              },
            }) as TestState["upcaster"];
          });

          And('a v5 event with orderId "order_1" and customerId "cust_1"', () => {
            state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
              { orderId: "order_1", customerId: "cust_1" },
              5
            );
          });

          When("the upcaster is applied expecting an error", () => {
            state.caughtError = null;
            try {
              state.upcaster!(state.inputEvent!);
            } catch (e) {
              state.caughtError = e;
            }
          });

          Then("it throws an EventUpcasterError", () => {
            expect(state.caughtError).toBeInstanceOf(EventUpcasterError);
          });

          And('the error message contains "is newer than current version"', () => {
            expect((state.caughtError as Error).message).toContain("is newer than current version");
          });
        }
      );
    }
  );

  // ==========================================================================
  // createEventUpcaster — validation
  // ==========================================================================

  Rule("createEventUpcaster supports post-migration validation", ({ RuleScenario }) => {
    RuleScenario("Validation passes after migration", ({ Given, And, When, Then }) => {
      Given(
        "an upcaster from version 1 to version 2 with a validator that checks createdAt is a number",
        () => {
          const isValid = (event: unknown): event is EnhancedDomainEvent<OrderCreatedV2Payload> =>
            event !== null &&
            typeof event === "object" &&
            "payload" in event &&
            typeof (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt ===
              "number";

          state.upcaster = createEventUpcaster<OrderCreatedV2Payload>({
            currentVersion: 2,
            migrations: {
              1: (event) => ({
                ...event,
                payload: {
                  ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                  createdAt: Date.now(),
                },
                schemaVersion: 2,
              }),
            },
            validate: isValid,
          }) as TestState["upcaster"];
        }
      );

      And('a v1 event with orderId "order_1" and customerId "cust_1"', () => {
        state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
          { orderId: "order_1", customerId: "cust_1" },
          1
        );
      });

      When("the upcaster is applied", () => {
        state.result = state.upcaster!(state.inputEvent!);
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the event payload has a defined createdAt field", () => {
        expect((state.result!.event.payload as OrderCreatedV2Payload).createdAt).toBeDefined();
      });
    });

    RuleScenario("Validation fails after migration", ({ Given, And, When, Then }) => {
      Given(
        "an upcaster from version 1 to version 2 with a validator that checks createdAt is positive",
        () => {
          const isValid = (event: unknown): event is EnhancedDomainEvent<OrderCreatedV2Payload> =>
            event !== null &&
            typeof event === "object" &&
            "payload" in event &&
            typeof (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt ===
              "number" &&
            (event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload.createdAt > 0;

          state.upcaster = createEventUpcaster<OrderCreatedV2Payload>({
            currentVersion: 2,
            migrations: {
              1: (event) => ({
                ...event,
                payload: {
                  ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                  createdAt: -1, // Invalid: negative timestamp
                },
                schemaVersion: 2,
              }),
            },
            validate: isValid,
          }) as TestState["upcaster"];
        }
      );

      And('a v1 event with orderId "order_1" and customerId "cust_1"', () => {
        state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
          { orderId: "order_1", customerId: "cust_1" },
          1
        );
      });

      When("the upcaster is applied expecting an error", () => {
        state.caughtError = null;
        try {
          state.upcaster!(state.inputEvent!);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("it throws an EventUpcasterError", () => {
        expect(state.caughtError).toBeInstanceOf(EventUpcasterError);
      });

      And('the error message contains "failed validation"', () => {
        expect((state.caughtError as Error).message).toContain("failed validation");
      });
    });
  });

  // ==========================================================================
  // createUpcasterRegistry — register and has
  // ==========================================================================

  Rule("createUpcasterRegistry tracks upcasters by event type", ({ RuleScenario }) => {
    RuleScenario(
      "Registry reports registered and unregistered event types",
      ({ Given, Then, And }) => {
        Given('an upcaster registry with "OrderCreated" registered', () => {
          state.registry = createUpcasterRegistry();
          const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
            currentVersion: 2,
            migrations: {
              1: (event) => ({ ...event, schemaVersion: 2 }),
            },
          });
          state.registry.register("OrderCreated", upcaster);
        });

        Then('the registry has "OrderCreated"', () => {
          expect(state.registry!.has("OrderCreated")).toBe(true);
        });

        And('the registry does not have "UnregisteredEvent"', () => {
          expect(state.registry!.has("UnregisteredEvent")).toBe(false);
        });
      }
    );

    RuleScenario("Registry returns all registered event types", ({ Given, Then, And }) => {
      Given("an upcaster registry with types:", (_ctx: unknown, dataTable: unknown) => {
        state.registry = createUpcasterRegistry();
        const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
          currentVersion: 2,
          migrations: {
            1: (event) => ({ ...event, schemaVersion: 2 }),
          },
        });
        const rows = getDataTableRows<{ eventType: string }>(dataTable);
        for (const row of rows) {
          state.registry!.register(row.eventType, upcaster);
        }
      });

      Then("getRegisteredTypes contains all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ type: string }>(dataTable);
        const types = state.registry!.getRegisteredTypes();
        for (const row of rows) {
          expect(types).toContain(row.type);
        }
      });

      And("getRegisteredTypes has length 2", () => {
        expect(state.registry!.getRegisteredTypes()).toHaveLength(2);
      });
    });
  });

  // ==========================================================================
  // createUpcasterRegistry — override behavior
  // ==========================================================================

  Rule("createUpcasterRegistry overwrites previously registered upcasters", ({ RuleScenario }) => {
    RuleScenario("Second registration overrides the first", ({ Given, And, When, Then }) => {
      Given('an upcaster registry where "OrderCreated" is registered twice', () => {
        state.registry = createUpcasterRegistry();
      });

      And("the first upcaster migrates to v2 with createdAt 1000", () => {
        const upcaster1 = createEventUpcaster<OrderCreatedV2Payload>({
          currentVersion: 2,
          migrations: {
            1: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                createdAt: 1000,
              },
              schemaVersion: 2,
            }),
          },
        });
        state.registry!.register("OrderCreated", upcaster1);
      });

      And('the second upcaster migrates to v3 with createdAt 2000 and priority "high"', () => {
        const upcaster2 = createEventUpcaster<OrderCreatedV3Payload>({
          currentVersion: 3,
          migrations: {
            1: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                createdAt: 2000,
              },
              schemaVersion: 2,
            }),
            2: (event) => ({
              ...event,
              payload: {
                ...(event as EnhancedDomainEvent<OrderCreatedV2Payload>).payload,
                priority: "high" as const,
              },
              schemaVersion: 3,
            }),
          },
        });
        state.registry!.register("OrderCreated", upcaster2);
      });

      When("a v1 OrderCreated event is upcasted via the registry", () => {
        const event = createTestEvent<OrderCreatedV1Payload>(
          { orderId: "order_1", customerId: "cust_1" },
          1
        );
        state.result = state.registry!.upcast(event) as TestState["result"];
      });

      Then("the current schema version is 3", () => {
        expect(state.result!.currentSchemaVersion).toBe(3);
      });

      And("the upcasted createdAt is 2000", () => {
        expect((state.result!.event.payload as OrderCreatedV2Payload).createdAt).toBe(2000);
      });

      And('the upcasted priority is "high"', () => {
        expect((state.result!.event.payload as OrderCreatedV3Payload).priority).toBe("high");
      });
    });
  });

  // ==========================================================================
  // createUpcasterRegistry — upcast
  // ==========================================================================

  Rule(
    "createUpcasterRegistry upcasts events using the correct registered upcaster",
    ({ RuleScenario }) => {
      RuleScenario("Registered event type is upcasted", ({ Given, And, When, Then }) => {
        Given('an upcaster registry with "OrderCreated" registered for v1 to v2', () => {
          state.registry = createUpcasterRegistry();
          const upcaster = createEventUpcaster<OrderCreatedV2Payload>({
            currentVersion: 2,
            migrations: {
              1: (event) => ({
                ...event,
                payload: {
                  ...(event as EnhancedDomainEvent<OrderCreatedV1Payload>).payload,
                  createdAt: Date.now(),
                },
                schemaVersion: 2,
              }),
            },
          });
          state.registry.register("OrderCreated", upcaster);
        });

        And("a v1 OrderCreated event", () => {
          state.inputEvent = createTestEvent<OrderCreatedV1Payload>(
            { orderId: "order_1", customerId: "cust_1" },
            1
          );
        });

        When("the event is upcasted via the registry", () => {
          state.result = state.registry!.upcast(state.inputEvent!) as TestState["result"];
        });

        Then("the result was upcasted", () => {
          expect(state.result!.wasUpcasted).toBe(true);
        });

        And("the current schema version is 2", () => {
          expect(state.result!.currentSchemaVersion).toBe(2);
        });
      });

      RuleScenario("Unregistered event type is returned as-is", ({ Given, And, When, Then }) => {
        Given("an empty upcaster registry", () => {
          state.registry = createUpcasterRegistry();
        });

        And('an unregistered event with eventType "UnregisteredEvent"', () => {
          state.inputEvent = {
            eventId: "evt_1",
            eventType: "UnregisteredEvent",
            streamType: "Test",
            streamId: "test_1",
            version: 1,
            globalPosition: 1000,
            timestamp: Date.now(),
            correlationId: "corr_1",
            boundedContext: "test",
            category: "domain",
            schemaVersion: 1,
            payload: { data: "test" },
          };
        });

        When("the event is upcasted via the registry", () => {
          state.result = state.registry!.upcast(state.inputEvent!) as TestState["result"];
        });

        Then("the result was not upcasted", () => {
          expect(state.result!.wasUpcasted).toBe(false);
        });

        And('the event category is "domain"', () => {
          expect(state.result!.event.category).toBe("domain");
        });

        And("the event schema version is 1", () => {
          expect(state.result!.event.schemaVersion).toBe(1);
        });
      });
    }
  );

  // ==========================================================================
  // addFieldMigration
  // ==========================================================================

  Rule("addFieldMigration adds a field with a static or computed default", ({ RuleScenario }) => {
    RuleScenario("Static default value is added", ({ Given, And, When, Then }) => {
      Given('an addFieldMigration for "priority" with default "medium" to version 2', () => {
        state.migration = addFieldMigration("priority", "medium", 2) as TestState["migration"];
      });

      And('an event with payload orderId "order_1"', () => {
        state.inputEvent = {
          eventId: "evt_1",
          eventType: "OrderCreated",
          streamType: "Order",
          streamId: "order_1",
          version: 1,
          globalPosition: 1000,
          timestamp: Date.now(),
          correlationId: "corr_1",
          boundedContext: "orders",
          category: "domain",
          schemaVersion: 1,
          payload: { orderId: "order_1" },
        };
      });

      When("the migration is applied", () => {
        state.migrationResult = state.migration!(state.inputEvent!);
      });

      Then('the payload field "priority" is "medium"', () => {
        expect((state.migrationResult!.payload as Record<string, unknown>).priority).toBe("medium");
      });

      And("the schema version is 2", () => {
        expect(state.migrationResult!.schemaVersion).toBe(2);
      });
    });

    RuleScenario(
      "Computed default value is added from event timestamp",
      ({ Given, And, When, Then }) => {
        Given('an addFieldMigration for "createdAt" computed from timestamp to version 2', () => {
          state.migration = addFieldMigration(
            "createdAt",
            (e) => e.timestamp,
            2
          ) as TestState["migration"];
        });

        And('an event with payload orderId "order_1" and timestamp 1234567890', () => {
          state.inputEvent = {
            eventId: "evt_1",
            eventType: "OrderCreated",
            streamType: "Order",
            streamId: "order_1",
            version: 1,
            globalPosition: 1000,
            timestamp: 1234567890,
            correlationId: "corr_1",
            boundedContext: "orders",
            category: "domain",
            schemaVersion: 1,
            payload: { orderId: "order_1" },
          };
        });

        When("the migration is applied", () => {
          state.migrationResult = state.migration!(state.inputEvent!);
        });

        Then('the payload field "createdAt" is 1234567890', () => {
          expect((state.migrationResult!.payload as Record<string, unknown>).createdAt).toBe(
            1234567890
          );
        });

        And("the schema version is 2", () => {
          expect(state.migrationResult!.schemaVersion).toBe(2);
        });
      }
    );
  });

  // ==========================================================================
  // renameFieldMigration
  // ==========================================================================

  Rule("renameFieldMigration renames a field in the payload", ({ RuleScenario }) => {
    RuleScenario("Field is renamed in the payload", ({ Given, And, When, Then }) => {
      Given('a renameFieldMigration from "userId" to "customerId" at version 2', () => {
        state.migration = renameFieldMigration("userId", "customerId", 2) as TestState["migration"];
      });

      And('an event with payload userId "user_123"', () => {
        state.inputEvent = {
          eventId: "evt_1",
          eventType: "OrderCreated",
          streamType: "Order",
          streamId: "order_1",
          version: 1,
          globalPosition: 1000,
          timestamp: Date.now(),
          correlationId: "corr_1",
          boundedContext: "orders",
          category: "domain",
          schemaVersion: 1,
          payload: { userId: "user_123" },
        };
      });

      When("the rename migration is applied", () => {
        state.migrationResult = state.migration!(state.inputEvent!);
      });

      Then('the payload field "customerId" is "user_123"', () => {
        expect((state.migrationResult!.payload as Record<string, unknown>).customerId).toBe(
          "user_123"
        );
      });

      And('the payload field "userId" is undefined', () => {
        expect((state.migrationResult!.payload as Record<string, unknown>).userId).toBeUndefined();
      });

      And("the schema version is 2", () => {
        expect(state.migrationResult!.schemaVersion).toBe(2);
      });
    });
  });

  // ==========================================================================
  // EventUpcasterError
  // ==========================================================================

  Rule("EventUpcasterError captures error metadata", ({ RuleScenario }) => {
    RuleScenario("Error has correct name, code, and message", ({ Given, Then, And }) => {
      Given('an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Test error"', () => {
        state.errorInstance = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Test error");
      });

      Then('the error name is "EventUpcasterError"', () => {
        expect(state.errorInstance!.name).toBe("EventUpcasterError");
      });

      And('the error code is "UNKNOWN_EVENT_TYPE"', () => {
        expect(state.errorInstance!.code).toBe("UNKNOWN_EVENT_TYPE");
      });
    });

    RuleScenario("Error stores context when provided", ({ Given, Then }) => {
      Given(
        'an EventUpcasterError with code "INVALID_EVENT" and message "Error" and context:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
          const context: Record<string, unknown> = {};
          for (const row of rows) {
            // Parse numeric values
            const numVal = Number(row.value);
            context[row.key] = isNaN(numVal) ? row.value : numVal;
          }
          state.errorInstance = new EventUpcasterError("INVALID_EVENT", "Error", context);
        }
      );

      Then("the error context matches:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
        for (const row of rows) {
          const numVal = Number(row.value);
          const expected = isNaN(numVal) ? row.value : numVal;
          expect((state.errorInstance!.context as Record<string, unknown>)[row.key]).toEqual(
            expected
          );
        }
      });
    });

    RuleScenario("Error has undefined context when not provided", ({ Given, Then }) => {
      Given('an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Error"', () => {
        state.errorInstance = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Error");
      });

      Then("the error context is undefined", () => {
        expect(state.errorInstance!.context).toBeUndefined();
      });
    });

    RuleScenario("Error is instanceof Error", ({ Given, Then }) => {
      Given('an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Error"', () => {
        state.errorInstance = new EventUpcasterError("UNKNOWN_EVENT_TYPE", "Error");
      });

      Then("the error is an instance of Error", () => {
        expect(state.errorInstance).toBeInstanceOf(Error);
      });
    });

    RuleScenario("Error preserves specific code values", ({ Given, Then }) => {
      Given('an EventUpcasterError with code "MISSING_MIGRATION" and message "Test error"', () => {
        state.errorInstance = new EventUpcasterError("MISSING_MIGRATION", "Test error");
      });

      Then('the error code is "MISSING_MIGRATION"', () => {
        expect(state.errorInstance!.code).toBe("MISSING_MIGRATION");
      });
    });

    RuleScenario("Error preserves custom message", ({ Given, Then }) => {
      Given('an EventUpcasterError with code "INVALID_EVENT" and message "Custom message"', () => {
        state.errorInstance = new EventUpcasterError("INVALID_EVENT", "Custom message");
      });

      Then('the error message is "Custom message"', () => {
        expect(state.errorInstance!.message).toBe("Custom message");
      });
    });
  });
});
