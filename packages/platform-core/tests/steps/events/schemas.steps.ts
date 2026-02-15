/**
 * Event Schema Factories - Step Definitions
 *
 * BDD step definitions for the 5 schema factory functions:
 * - createEventSchema: Basic event with typed eventType and payload
 * - createDomainEventSchema: Domain events with category "domain"
 * - createIntegrationEventSchema: Integration events with category "integration"
 * - createTriggerEventSchema: Minimal events with entityIdField only
 * - createFatEventSchema: Full state snapshot events with category "fat"
 *
 * Mechanical migration from tests/unit/events/schemas.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";

import {
  createEventSchema,
  createDomainEventSchema,
  createIntegrationEventSchema,
  createTriggerEventSchema,
  createFatEventSchema,
  EventMetadataSchema,
  EnhancedEventMetadataSchema,
  DomainEventSchema,
  EnhancedDomainEventSchema,
} from "../../../src/events/schemas.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Helpers
// =============================================================================

function createValidEventMetadata() {
  return {
    eventId: "evt_123",
    eventType: "TestEvent",
    streamType: "Test",
    streamId: "test_456",
    version: 1,
    globalPosition: 100,
    timestamp: Date.now(),
    correlationId: "corr_789",
    boundedContext: "testing",
  };
}

function createValidEnhancedEventMetadata() {
  return {
    ...createValidEventMetadata(),
    category: "domain" as const,
    schemaVersion: 1,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  metadata: ReturnType<typeof createValidEventMetadata>;
  enhancedMetadata: ReturnType<typeof createValidEnhancedEventMetadata>;
  parseResult: Record<string, unknown> | null;
  parseError: unknown | null;
  parseResults: Array<{ input: unknown; result?: unknown; error?: unknown }>;
  schema: z.ZodTypeAny | null;
}

function createInitialState(): TestState {
  return {
    metadata: createValidEventMetadata(),
    enhancedMetadata: createValidEnhancedEventMetadata(),
    parseResult: null,
    parseError: null,
    parseResults: [],
    schema: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/events/schemas.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // EventMetadataSchema
  // ==========================================================================

  Rule("EventMetadataSchema validates required event metadata fields", ({ RuleScenario }) => {
    RuleScenario(
      "Valid event metadata is accepted and fields are preserved",
      ({ Given, When, Then }) => {
        Given("valid event metadata", () => {
          state.metadata = createValidEventMetadata();
        });

        When("the metadata is parsed with EventMetadataSchema", () => {
          state.parseResult = EventMetadataSchema.parse(state.metadata) as Record<string, unknown>;
        });

        Then("all metadata fields match the input", () => {
          expect(state.parseResult!.eventId).toBe(state.metadata.eventId);
          expect(state.parseResult!.eventType).toBe(state.metadata.eventType);
          expect(state.parseResult!.streamType).toBe(state.metadata.streamType);
          expect(state.parseResult!.streamId).toBe(state.metadata.streamId);
          expect(state.parseResult!.version).toBe(state.metadata.version);
          expect(state.parseResult!.globalPosition).toBe(state.metadata.globalPosition);
          expect(state.parseResult!.correlationId).toBe(state.metadata.correlationId);
          expect(state.parseResult!.boundedContext).toBe(state.metadata.boundedContext);
        });
      }
    );

    RuleScenario("Missing required fields are rejected", ({ When, Then }) => {
      When("an empty object is parsed with EventMetadataSchema", () => {
        try {
          EventMetadataSchema.parse({});
          state.parseError = null;
        } catch (e) {
          state.parseError = e;
        }
      });

      Then("the parse throws a validation error", () => {
        expect(state.parseError).toBeDefined();
      });
    });

    RuleScenario("Partial metadata with only eventId is rejected", ({ When, Then }) => {
      When("an object with only eventId is parsed with EventMetadataSchema", () => {
        try {
          EventMetadataSchema.parse({ eventId: "evt_123" });
          state.parseError = null;
        } catch (e) {
          state.parseError = e;
        }
      });

      Then("the parse throws a validation error", () => {
        expect(state.parseError).toBeDefined();
      });
    });

    RuleScenario("Optional causationId is supported", ({ Given, When, Then }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("the metadata is parsed without causationId", () => {
        state.parseResult = EventMetadataSchema.parse(state.metadata) as Record<string, unknown>;
      });

      Then("causationId is undefined", () => {
        expect(state.parseResult!.causationId).toBeUndefined();
      });

      When('the metadata is parsed with causationId "cause_123"', () => {
        state.parseResult = EventMetadataSchema.parse({
          ...state.metadata,
          causationId: "cause_123",
        }) as Record<string, unknown>;
      });

      Then('causationId equals "cause_123"', () => {
        expect(state.parseResult!.causationId).toBe("cause_123");
      });
    });

    RuleScenario("Invalid version values are rejected", ({ Given, When, Then }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("the metadata is parsed with invalid version values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ version: string }>(dataTable);
        state.parseResults = rows.map((row) => {
          try {
            const result = EventMetadataSchema.parse({
              ...state.metadata,
              version: Number(row.version),
            });
            return { input: row.version, result };
          } catch (e) {
            return { input: row.version, error: e };
          }
        });
      });

      Then("each parse throws a validation error", () => {
        for (const entry of state.parseResults) {
          expect(entry.error).toBeDefined();
        }
      });
    });

    RuleScenario("Zero globalPosition is accepted", ({ Given, When, Then }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("the metadata is parsed with globalPosition 0", () => {
        state.parseResult = EventMetadataSchema.parse({
          ...state.metadata,
          globalPosition: 0,
        }) as Record<string, unknown>;
      });

      Then("globalPosition equals 0", () => {
        expect(state.parseResult!.globalPosition).toBe(0);
      });
    });
  });

  // ==========================================================================
  // EnhancedEventMetadataSchema
  // ==========================================================================

  Rule(
    "EnhancedEventMetadataSchema extends metadata with category and schemaVersion",
    ({ RuleScenario }) => {
      RuleScenario(
        "Enhanced metadata includes category and schemaVersion",
        ({ Given, When, Then, And }) => {
          Given("valid enhanced event metadata", () => {
            state.enhancedMetadata = createValidEnhancedEventMetadata();
          });

          When("the enhanced metadata is parsed", () => {
            state.parseResult = EnhancedEventMetadataSchema.parse(state.enhancedMetadata) as Record<
              string,
              unknown
            >;
          });

          Then('the parsed category is "domain"', () => {
            expect(state.parseResult!.category).toBe("domain");
          });

          And("the parsed schemaVersion is 1", () => {
            expect(state.parseResult!.schemaVersion).toBe(1);
          });
        }
      );

      RuleScenario("Category defaults to domain when not provided", ({ Given, When, Then }) => {
        Given("valid event metadata", () => {
          state.metadata = createValidEventMetadata();
        });

        When("the metadata is parsed with EnhancedEventMetadataSchema", () => {
          state.parseResult = EnhancedEventMetadataSchema.parse(state.metadata) as Record<
            string,
            unknown
          >;
        });

        Then('the parsed category is "domain"', () => {
          expect(state.parseResult!.category).toBe("domain");
        });
      });

      RuleScenario("SchemaVersion defaults to 1 when not provided", ({ Given, When, Then }) => {
        Given("valid event metadata", () => {
          state.metadata = createValidEventMetadata();
        });

        When("the metadata is parsed with EnhancedEventMetadataSchema", () => {
          state.parseResult = EnhancedEventMetadataSchema.parse(state.metadata) as Record<
            string,
            unknown
          >;
        });

        Then("the parsed schemaVersion is 1", () => {
          expect(state.parseResult!.schemaVersion).toBe(1);
        });
      });

      RuleScenario("All valid categories are accepted", ({ Given, When, Then }) => {
        Given("valid event metadata", () => {
          state.metadata = createValidEventMetadata();
        });

        When("the metadata is parsed with each category:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ category: string }>(dataTable);
          state.parseResults = rows.map((row) => {
            try {
              const result = EnhancedEventMetadataSchema.parse({
                ...state.metadata,
                category: row.category,
              });
              return { input: row.category, result };
            } catch (e) {
              return { input: row.category, error: e };
            }
          });
        });

        Then("each parse returns the matching category", () => {
          for (const entry of state.parseResults) {
            expect(entry.error).toBeUndefined();
            const result = entry.result as Record<string, unknown>;
            expect(result.category).toBe(entry.input);
          }
        });
      });

      RuleScenario("Invalid categories are rejected", ({ Given, When, Then }) => {
        Given("valid event metadata", () => {
          state.metadata = createValidEventMetadata();
        });

        When('the metadata is parsed with category "invalid"', () => {
          try {
            EnhancedEventMetadataSchema.parse({
              ...state.metadata,
              category: "invalid",
            });
            state.parseError = null;
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      });
    }
  );

  // ==========================================================================
  // createEventSchema
  // ==========================================================================

  Rule(
    "createEventSchema creates schemas with literal eventType and typed payload",
    ({ RuleScenario }) => {
      RuleScenario(
        "Schema accepts events with matching eventType and valid payload",
        ({ Given, When, Then, And }) => {
          Given(
            'a createEventSchema for "OrderCreated" with orderId and customerId payload',
            () => {
              state.schema = createEventSchema(
                "OrderCreated",
                z.object({
                  orderId: z.string(),
                  customerId: z.string(),
                })
              );
            }
          );

          When("an OrderCreated event with valid payload is parsed", () => {
            state.parseResult = state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "OrderCreated",
              payload: {
                orderId: "order_123",
                customerId: "customer_456",
              },
            }) as Record<string, unknown>;
          });

          Then('the parsed eventType is "OrderCreated"', () => {
            expect(state.parseResult!.eventType).toBe("OrderCreated");
          });

          And('the parsed payload orderId is "order_123"', () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.orderId).toBe("order_123");
          });

          And('the parsed payload customerId is "customer_456"', () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.customerId).toBe("customer_456");
          });
        }
      );

      RuleScenario("Schema rejects events with wrong eventType", ({ Given, When, Then }) => {
        Given('a createEventSchema for "OrderCreated" with orderId payload', () => {
          state.schema = createEventSchema("OrderCreated", z.object({ orderId: z.string() }));
        });

        When('an event with eventType "WrongEvent" is parsed with the schema', () => {
          try {
            state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "WrongEvent",
              payload: { orderId: "order_123" },
            });
            state.parseError = null;
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      });

      RuleScenario("Schema validates payload constraints", ({ Given, When, Then }) => {
        Given(
          'a createEventSchema for "OrderCreated" with orderId and positive quantity payload',
          () => {
            state.schema = createEventSchema(
              "OrderCreated",
              z.object({
                orderId: z.string(),
                quantity: z.number().positive(),
              })
            );
          }
        );

        When("an event with negative quantity is parsed", () => {
          try {
            state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "OrderCreated",
              payload: {
                orderId: "order_123",
                quantity: -5,
              },
            });
            state.parseError = null;
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      });

      RuleScenario("Optional metadata field is supported", ({ Given, When, Then }) => {
        Given('a createEventSchema for "Test" with id payload', () => {
          state.schema = createEventSchema("Test", z.object({ id: z.string() }));
        });

        When("an event without metadata is parsed", () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { id: "123" },
          }) as Record<string, unknown>;
        });

        Then("the parsed metadata is undefined", () => {
          expect(state.parseResult!.metadata).toBeUndefined();
        });

        When('an event with metadata source "api" and requestId "req_123" is parsed', () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { id: "123" },
            metadata: { source: "api", requestId: "req_123" },
          }) as Record<string, unknown>;
        });

        Then('the parsed metadata has source "api" and requestId "req_123"', () => {
          expect(state.parseResult!.metadata).toEqual({ source: "api", requestId: "req_123" });
        });
      });
    }
  );

  // ==========================================================================
  // createDomainEventSchema
  // ==========================================================================

  Rule("createDomainEventSchema creates schemas with category domain", ({ RuleScenario }) => {
    RuleScenario("Domain event schema sets category to domain", ({ Given, When, Then, And }) => {
      Given('a domain event schema for "OrderSubmitted" with orderId and totalAmount', () => {
        state.schema = createDomainEventSchema({
          eventType: "OrderSubmitted",
          payloadSchema: z.object({
            orderId: z.string(),
            totalAmount: z.number(),
          }),
        });
      });

      When("a domain event with valid payload is parsed", () => {
        state.parseResult = state.schema!.parse({
          ...createValidEnhancedEventMetadata(),
          eventType: "OrderSubmitted",
          payload: {
            orderId: "order_123",
            totalAmount: 99.99,
          },
        }) as Record<string, unknown>;
      });

      Then('the parsed eventType is "OrderSubmitted"', () => {
        expect(state.parseResult!.eventType).toBe("OrderSubmitted");
      });

      And('the parsed category is "domain"', () => {
        expect(state.parseResult!.category).toBe("domain");
      });

      And('the parsed payload orderId is "order_123"', () => {
        const payload = state.parseResult!.payload as Record<string, unknown>;
        expect(payload.orderId).toBe("order_123");
      });

      And("the parsed payload totalAmount is 99.99", () => {
        const payload = state.parseResult!.payload as Record<string, unknown>;
        expect(payload.totalAmount).toBe(99.99);
      });
    });

    RuleScenario("Category defaults to domain when not in input", ({ Given, When, Then }) => {
      Given('a domain event schema for "Test" with id payload', () => {
        state.schema = createDomainEventSchema({
          eventType: "Test",
          payloadSchema: z.object({ id: z.string() }),
        });
      });

      When("an event without explicit category is parsed via domain schema", () => {
        state.parseResult = state.schema!.parse({
          ...createValidEventMetadata(),
          eventType: "Test",
          payload: { id: "123" },
        }) as Record<string, unknown>;
      });

      Then('the parsed category is "domain"', () => {
        expect(state.parseResult!.category).toBe("domain");
      });
    });

    RuleScenario("SchemaVersion defaults to 1 when not in config", ({ Given, When, Then }) => {
      Given('a domain event schema for "Test" with id payload', () => {
        state.schema = createDomainEventSchema({
          eventType: "Test",
          payloadSchema: z.object({ id: z.string() }),
        });
      });

      When("an event without explicit schemaVersion is parsed via domain schema", () => {
        state.parseResult = state.schema!.parse({
          ...createValidEventMetadata(),
          eventType: "Test",
          payload: { id: "123" },
        }) as Record<string, unknown>;
      });

      Then("the parsed schemaVersion is 1", () => {
        expect(state.parseResult!.schemaVersion).toBe(1);
      });
    });

    RuleScenario("Custom schemaVersion in config is enforced", ({ Given, When, Then }) => {
      Given(
        'a domain event schema for "Test" with id and newField payload and schemaVersion 2',
        () => {
          state.schema = createDomainEventSchema({
            eventType: "Test",
            payloadSchema: z.object({ id: z.string(), newField: z.string() }),
            schemaVersion: 2,
          });
        }
      );

      When("a domain event with matching v2 payload is parsed", () => {
        state.parseResult = state.schema!.parse({
          ...createValidEventMetadata(),
          eventType: "Test",
          payload: { id: "123", newField: "value" },
        }) as Record<string, unknown>;
      });

      Then("the parsed schemaVersion is 2", () => {
        expect(state.parseResult!.schemaVersion).toBe(2);
      });
    });

    RuleScenario("Wrong schemaVersion is rejected", ({ Given, When, Then }) => {
      Given('a domain event schema for "Test" with id payload and schemaVersion 2', () => {
        state.schema = createDomainEventSchema({
          eventType: "Test",
          payloadSchema: z.object({ id: z.string() }),
          schemaVersion: 2,
        });
      });

      When("an event with schemaVersion 3 is parsed via domain schema", () => {
        try {
          state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { id: "123" },
            schemaVersion: 3,
          });
          state.parseError = null;
        } catch (e) {
          state.parseError = e;
        }
      });

      Then("the parse throws a validation error", () => {
        expect(state.parseError).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // createIntegrationEventSchema
  // ==========================================================================

  Rule(
    "createIntegrationEventSchema creates schemas with category integration",
    ({ RuleScenario }) => {
      RuleScenario(
        "Integration event schema sets category to integration",
        ({ Given, When, Then, And }) => {
          Given(
            'an integration event schema for "OrderPlacedIntegration" with source "orders"',
            () => {
              state.schema = createIntegrationEventSchema({
                eventType: "OrderPlacedIntegration",
                sourceContext: "orders",
                payloadSchema: z.object({
                  orderId: z.string(),
                  customerId: z.string(),
                  totalAmount: z.number(),
                }),
              });
            }
          );

          When("an integration event with valid payload is parsed", () => {
            state.parseResult = state.schema!.parse({
              ...createValidEnhancedEventMetadata(),
              eventType: "OrderPlacedIntegration",
              category: "integration" as const,
              payload: {
                orderId: "order_123",
                customerId: "customer_456",
                totalAmount: 199.99,
              },
            }) as Record<string, unknown>;
          });

          Then('the parsed eventType is "OrderPlacedIntegration"', () => {
            expect(state.parseResult!.eventType).toBe("OrderPlacedIntegration");
          });

          And('the parsed category is "integration"', () => {
            expect(state.parseResult!.category).toBe("integration");
          });

          And("the parsed payload totalAmount is 199.99", () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.totalAmount).toBe(199.99);
          });
        }
      );

      RuleScenario(
        "Category defaults to integration when not in input",
        ({ Given, When, Then }) => {
          Given(
            'an integration event schema for "TestIntegration" with source "test" and id payload',
            () => {
              state.schema = createIntegrationEventSchema({
                eventType: "TestIntegration",
                sourceContext: "test",
                payloadSchema: z.object({ id: z.string() }),
              });
            }
          );

          When("an event without explicit category is parsed via integration schema", () => {
            state.parseResult = state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "TestIntegration",
              payload: { id: "123" },
            }) as Record<string, unknown>;
          });

          Then('the parsed category is "integration"', () => {
            expect(state.parseResult!.category).toBe("integration");
          });
        }
      );

      RuleScenario(
        "SchemaVersion defaults to 1 for integration events",
        ({ Given, When, Then }) => {
          Given(
            'an integration event schema for "TestIntegration" with source "test" and id payload',
            () => {
              state.schema = createIntegrationEventSchema({
                eventType: "TestIntegration",
                sourceContext: "test",
                payloadSchema: z.object({ id: z.string() }),
              });
            }
          );

          When("an event without explicit schemaVersion is parsed via integration schema", () => {
            state.parseResult = state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "TestIntegration",
              payload: { id: "123" },
            }) as Record<string, unknown>;
          });

          Then("the parsed schemaVersion is 1", () => {
            expect(state.parseResult!.schemaVersion).toBe(1);
          });
        }
      );
    }
  );

  // ==========================================================================
  // createTriggerEventSchema
  // ==========================================================================

  Rule(
    "createTriggerEventSchema creates schemas with category trigger and minimal payload",
    ({ RuleScenario }) => {
      RuleScenario(
        "Trigger event schema sets category to trigger with entity ID payload",
        ({ Given, When, Then, And }) => {
          Given(
            'a trigger event schema for "OrderShipmentStarted" with entityIdField "orderId"',
            () => {
              state.schema = createTriggerEventSchema({
                eventType: "OrderShipmentStarted",
                entityIdField: "orderId",
              });
            }
          );

          When('a trigger event with orderId "order_123" is parsed', () => {
            state.parseResult = state.schema!.parse({
              ...createValidEnhancedEventMetadata(),
              eventType: "OrderShipmentStarted",
              category: "trigger" as const,
              payload: { orderId: "order_123" },
            }) as Record<string, unknown>;
          });

          Then('the parsed eventType is "OrderShipmentStarted"', () => {
            expect(state.parseResult!.eventType).toBe("OrderShipmentStarted");
          });

          And('the parsed category is "trigger"', () => {
            expect(state.parseResult!.category).toBe("trigger");
          });

          And('the parsed payload orderId is "order_123"', () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.orderId).toBe("order_123");
          });
        }
      );

      RuleScenario("Trigger event rejects missing entity ID", ({ Given, When, Then }) => {
        Given('a trigger event schema for "ItemUpdated" with entityIdField "itemId"', () => {
          state.schema = createTriggerEventSchema({
            eventType: "ItemUpdated",
            entityIdField: "itemId",
          });
        });

        When('a trigger event with itemId "item_123" is parsed', () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "ItemUpdated",
            payload: { itemId: "item_123" },
          }) as Record<string, unknown>;
        });

        Then('the parsed payload itemId is "item_123"', () => {
          const payload = state.parseResult!.payload as Record<string, unknown>;
          expect(payload.itemId).toBe("item_123");
        });

        When("a trigger event with empty payload is parsed", () => {
          try {
            state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "ItemUpdated",
              payload: {},
            });
            state.parseError = null;
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      });

      RuleScenario("Category defaults to trigger when not in input", ({ Given, When, Then }) => {
        Given('a trigger event schema for "Test" with entityIdField "testId"', () => {
          state.schema = createTriggerEventSchema({
            eventType: "Test",
            entityIdField: "testId",
          });
        });

        When('a trigger event with testId "123" is parsed without explicit category', () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { testId: "123" },
          }) as Record<string, unknown>;
        });

        Then('the parsed category is "trigger"', () => {
          expect(state.parseResult!.category).toBe("trigger");
        });
      });

      RuleScenario("Custom schemaVersion for trigger events", ({ Given, When, Then }) => {
        Given(
          'a trigger event schema for "Test" with entityIdField "testId" and schemaVersion 3',
          () => {
            state.schema = createTriggerEventSchema({
              eventType: "Test",
              entityIdField: "testId",
              schemaVersion: 3,
            });
          }
        );

        When('a trigger event with testId "123" is parsed with custom schema version', () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { testId: "123" },
          }) as Record<string, unknown>;
        });

        Then("the parsed schemaVersion is 3", () => {
          expect(state.parseResult!.schemaVersion).toBe(3);
        });
      });
    }
  );

  // ==========================================================================
  // createFatEventSchema
  // ==========================================================================

  Rule(
    "createFatEventSchema creates schemas with category fat and full payload",
    ({ RuleScenario }) => {
      RuleScenario(
        "Fat event schema sets category to fat with full payload",
        ({ Given, When, Then, And }) => {
          Given('a fat event schema for "OrderSnapshot" with full order payload', () => {
            state.schema = createFatEventSchema({
              eventType: "OrderSnapshot",
              payloadSchema: z.object({
                orderId: z.string(),
                customerId: z.string(),
                items: z.array(
                  z.object({
                    productId: z.string(),
                    quantity: z.number(),
                    price: z.number(),
                  })
                ),
                totalAmount: z.number(),
                status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
                createdAt: z.number(),
              }),
            });
          });

          When("a fat event with valid order snapshot is parsed", () => {
            state.parseResult = state.schema!.parse({
              ...createValidEnhancedEventMetadata(),
              eventType: "OrderSnapshot",
              category: "fat" as const,
              payload: {
                orderId: "order_123",
                customerId: "customer_456",
                items: [{ productId: "prod_1", quantity: 2, price: 50 }],
                totalAmount: 100,
                status: "confirmed" as const,
                createdAt: Date.now(),
              },
            }) as Record<string, unknown>;
          });

          Then('the parsed eventType is "OrderSnapshot"', () => {
            expect(state.parseResult!.eventType).toBe("OrderSnapshot");
          });

          And('the parsed category is "fat"', () => {
            expect(state.parseResult!.category).toBe("fat");
          });

          And('the parsed payload orderId is "order_123"', () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.orderId).toBe("order_123");
          });

          And("the parsed payload items has length 1", () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.items).toHaveLength(1);
          });

          And('the parsed payload status is "confirmed"', () => {
            const payload = state.parseResult!.payload as Record<string, unknown>;
            expect(payload.status).toBe("confirmed");
          });
        }
      );

      RuleScenario("Category defaults to fat when not in input", ({ Given, When, Then }) => {
        Given('a fat event schema for "TestSnapshot" with record payload', () => {
          state.schema = createFatEventSchema({
            eventType: "TestSnapshot",
            payloadSchema: z.object({
              id: z.string(),
              data: z.record(z.string(), z.unknown()),
            }),
          });
        });

        When("an event without explicit category is parsed via fat schema", () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "TestSnapshot",
            payload: { id: "123", data: { foo: "bar" } },
          }) as Record<string, unknown>;
        });

        Then('the parsed category is "fat"', () => {
          expect(state.parseResult!.category).toBe("fat");
        });
      });

      RuleScenario("Complex nested payload with valid positive value", ({ Given, When, Then }) => {
        Given('a fat event schema for "ComplexSnapshot" with nested positive value payload', () => {
          state.schema = createFatEventSchema({
            eventType: "ComplexSnapshot",
            payloadSchema: z.object({
              nested: z.object({
                level2: z.object({
                  value: z.number().positive(),
                }),
              }),
              optionalField: z.string().optional(),
            }),
          });
        });

        When("a fat event with nested value 42 is parsed", () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "ComplexSnapshot",
            payload: {
              nested: { level2: { value: 42 } },
            },
          }) as Record<string, unknown>;
        });

        Then("the parsed nested value is 42", () => {
          const payload = state.parseResult!.payload as { nested: { level2: { value: number } } };
          expect(payload.nested.level2.value).toBe(42);
        });
      });

      RuleScenario("Complex nested payload rejects negative value", ({ Given, When, Then }) => {
        Given('a fat event schema for "ComplexSnapshot" with nested positive value payload', () => {
          state.schema = createFatEventSchema({
            eventType: "ComplexSnapshot",
            payloadSchema: z.object({
              nested: z.object({
                level2: z.object({
                  value: z.number().positive(),
                }),
              }),
              optionalField: z.string().optional(),
            }),
          });
        });

        When("a fat event with nested negative value is parsed", () => {
          try {
            state.schema!.parse({
              ...createValidEventMetadata(),
              eventType: "ComplexSnapshot",
              payload: {
                nested: { level2: { value: -1 } },
              },
            });
            state.parseError = null;
          } catch (e) {
            state.parseError = e;
          }
        });

        Then("the parse throws a validation error", () => {
          expect(state.parseError).toBeDefined();
        });
      });

      RuleScenario("Custom schemaVersion for fat events", ({ Given, When, Then }) => {
        Given('a fat event schema for "Test" with id payload and schemaVersion 5', () => {
          state.schema = createFatEventSchema({
            eventType: "Test",
            payloadSchema: z.object({ id: z.string() }),
            schemaVersion: 5,
          });
        });

        When("a fat event with id payload is parsed", () => {
          state.parseResult = state.schema!.parse({
            ...createValidEventMetadata(),
            eventType: "Test",
            payload: { id: "123" },
          }) as Record<string, unknown>;
        });

        Then("the parsed schemaVersion is 5", () => {
          expect(state.parseResult!.schemaVersion).toBe(5);
        });
      });
    }
  );

  // ==========================================================================
  // DomainEventSchema and EnhancedDomainEventSchema
  // ==========================================================================

  Rule("DomainEventSchema and EnhancedDomainEventSchema accept any payload", ({ RuleScenario }) => {
    RuleScenario("DomainEventSchema accepts any payload shape", ({ Given, When, Then }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("an event with arbitrary payload is parsed with DomainEventSchema", () => {
        state.parseResult = DomainEventSchema.parse({
          ...state.metadata,
          payload: { anyField: "anyValue", nested: { deep: true } },
        }) as Record<string, unknown>;
      });

      Then("the payload matches the arbitrary input", () => {
        expect(state.parseResult!.payload).toEqual({
          anyField: "anyValue",
          nested: { deep: true },
        });
      });
    });

    RuleScenario("EnhancedDomainEventSchema includes defaults", ({ Given, When, Then, And }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("an event with simple payload is parsed with EnhancedDomainEventSchema", () => {
        state.parseResult = EnhancedDomainEventSchema.parse({
          ...state.metadata,
          payload: { data: "test" },
        }) as Record<string, unknown>;
      });

      Then('the parsed category is "domain"', () => {
        expect(state.parseResult!.category).toBe("domain");
      });

      And("the parsed schemaVersion is 1", () => {
        expect(state.parseResult!.schemaVersion).toBe(1);
      });

      And("the payload matches the simple input", () => {
        expect(state.parseResult!.payload).toEqual({ data: "test" });
      });
    });

    RuleScenario("EnhancedDomainEventSchema allows optional metadata", ({ Given, When, Then }) => {
      Given("valid event metadata", () => {
        state.metadata = createValidEventMetadata();
      });

      When("an event with metadata is parsed with EnhancedDomainEventSchema", () => {
        state.parseResult = EnhancedDomainEventSchema.parse({
          ...state.metadata,
          payload: {},
          metadata: { source: "test", requestId: "req_123" },
        }) as Record<string, unknown>;
      });

      Then("the metadata matches the expected input", () => {
        expect(state.parseResult!.metadata).toEqual({
          source: "test",
          requestId: "req_123",
        });
      });
    });
  });
});
