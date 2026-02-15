/**
 * Event Data Builder Utilities - Step Definitions
 *
 * BDD step definitions for event builder functions:
 * - createEventData: Creates event data with auto-generated eventId
 * - createEventDataWithId: Creates event data with pre-generated eventId
 *
 * Mechanical migration from tests/unit/events/builder.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import { createEventData, createEventDataWithId } from "../../../src/events/builder.js";

// Mock the generateEventId function
import { getDataTableRows } from "../_helpers/data-table.js";

vi.mock("../../../src/ids/index.js", () => ({
  generateEventId: vi.fn((context: string) => `${context}_event_mock-uuid-v7`),
}));

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // createEventData
  input: {
    eventType: string;
    streamType: string;
    streamId: string;
    boundedContext: string;
    payload: Record<string, unknown>;
    correlationId: string;
    causationId: string;
  } | null;
  result: Record<string, unknown> | null;
  complexPayload: Record<string, unknown> | null;

  // createEventDataWithId
  preGeneratedId: string | null;
  withIdInput: {
    eventType: string;
    streamType: string;
    streamId: string;
    payload: Record<string, unknown>;
    correlationId: string;
    causationId: string;
    boundedContext?: string;
  } | null;
  withIdResult: Record<string, unknown> | null;

  // Multiple calls tracking
  multiCallResults: Array<Record<string, unknown>>;
}

function createInitialState(): TestState {
  return {
    input: null,
    result: null,
    complexPayload: null,
    preGeneratedId: null,
    withIdInput: null,
    withIdResult: null,
    multiCallResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/events/builder.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createEventData
  // ==========================================================================

  Rule(
    "createEventData generates a complete NewEventData with auto-generated eventId",
    ({ RuleScenario }) => {
      RuleScenario("Generates eventId with bounded context prefix", ({ Given, When, Then }) => {
        Given('a createEventData input with bounded context "orders"', () => {
          state.input = {
            eventType: "OrderCreated",
            streamType: "Order",
            streamId: "order_123",
            boundedContext: "orders",
            payload: { orderId: "order_123", customerId: "cust_456" },
            correlationId: "corr_789",
            causationId: "cmd_001",
          };
        });

        When("createEventData is called", () => {
          state.result = createEventData(state.input!) as unknown as Record<string, unknown>;
        });

        Then('the result eventId is "orders_event_mock-uuid-v7"', () => {
          expect(state.result!.eventId).toBe("orders_event_mock-uuid-v7");
        });
      });

      RuleScenario("Copies all core fields correctly", ({ Given, When, Then }) => {
        Given("a createEventData input with:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
          const input: Record<string, unknown> = {
            payload: { productId: "prod_456" },
            correlationId: "corr_789",
            causationId: "cmd_001",
          };
          for (const row of rows) {
            input[row.field] = row.value;
          }
          state.input = input as TestState["input"];
        });

        When("createEventData is called", () => {
          state.result = createEventData(state.input!) as unknown as Record<string, unknown>;
        });

        Then("the result has fields:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ field: string; expected: string }>(dataTable);
          for (const row of rows) {
            expect(state.result![row.field]).toBe(row.expected);
          }
        });
      });

      RuleScenario("Copies payload correctly", ({ Given, When, Then }) => {
        Given("a createEventData input with a complex payload", () => {
          state.complexPayload = {
            orderId: "order_123",
            customerId: "cust_456",
            items: [{ productId: "prod_1", quantity: 2 }],
            totalAmount: 99.99,
          };
          state.input = {
            eventType: "OrderCreated",
            streamType: "Order",
            streamId: "order_123",
            boundedContext: "orders",
            payload: state.complexPayload,
            correlationId: "corr_789",
            causationId: "cmd_001",
          };
        });

        When("createEventData is called", () => {
          state.result = createEventData(state.input!) as unknown as Record<string, unknown>;
        });

        Then("the result payload matches the input payload", () => {
          expect(state.result!.payload).toEqual(state.complexPayload);
        });
      });

      RuleScenario(
        "Includes correlationId and causationId in metadata",
        ({ Given, When, Then }) => {
          Given(
            'a createEventData input with correlationId "corr_unique_123" and causationId "cmd_unique_456"',
            () => {
              state.input = {
                eventType: "OrderCreated",
                streamType: "Order",
                streamId: "order_123",
                boundedContext: "orders",
                payload: { orderId: "order_123" },
                correlationId: "corr_unique_123",
                causationId: "cmd_unique_456",
              };
            }
          );

          When("createEventData is called", () => {
            state.result = createEventData(state.input!) as unknown as Record<string, unknown>;
          });

          Then("the result metadata has:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; expected: string }>(dataTable);
            const metadata = state.result!.metadata as Record<string, unknown>;
            for (const row of rows) {
              expect(metadata[row.field]).toBe(row.expected);
            }
          });
        }
      );

      RuleScenario(
        "Generates different eventIds for different bounded contexts",
        ({ When, Then, And }) => {
          When('createEventData is called with bounded context "orders"', () => {
            createEventData({
              eventType: "OrderCreated",
              streamType: "Order",
              streamId: "order_123",
              boundedContext: "orders",
              payload: {},
              correlationId: "corr_1",
              causationId: "cmd_1",
            });
          });

          And('createEventData is called with bounded context "inventory"', () => {
            createEventData({
              eventType: "ProductCreated",
              streamType: "Product",
              streamId: "prod_456",
              boundedContext: "inventory",
              payload: {},
              correlationId: "corr_2",
              causationId: "cmd_2",
            });
          });

          Then('generateEventId was called with "orders" and "inventory"', async () => {
            const { generateEventId } = await vi.importMock<{
              generateEventId: (context: string) => string;
            }>("../../../src/ids/index.js");
            expect(generateEventId).toHaveBeenCalledWith("orders");
            expect(generateEventId).toHaveBeenCalledWith("inventory");
          });
        }
      );

      RuleScenario("Returns complete NewEventData structure", ({ Given, When, Then, And }) => {
        Given('a createEventData input with bounded context "orders"', () => {
          state.input = {
            eventType: "OrderCancelled",
            streamType: "Order",
            streamId: "order_999",
            boundedContext: "orders",
            payload: { orderId: "order_999", reason: "Customer request" },
            correlationId: "corr_cancel",
            causationId: "cmd_cancel",
          };
        });

        When("createEventData is called", () => {
          state.result = createEventData(state.input!) as unknown as Record<string, unknown>;
        });

        Then("the result has all required properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string }>(dataTable);
          for (const row of rows) {
            expect(state.result).toHaveProperty(row.property);
          }
        });

        And(
          "the result metadata has all required properties:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ property: string }>(dataTable);
            const metadata = state.result!.metadata as Record<string, unknown>;
            for (const row of rows) {
              expect(metadata).toHaveProperty(row.property);
            }
          }
        );
      });
    }
  );

  // ==========================================================================
  // createEventDataWithId
  // ==========================================================================

  Rule(
    "createEventDataWithId uses a pre-generated eventId and infers boundedContext",
    ({ RuleScenario }) => {
      RuleScenario(
        "Uses provided eventId without generating a new one",
        ({ Given, When, Then }) => {
          Given('a pre-generated eventId "orders_event_pre-generated-uuid"', () => {
            state.preGeneratedId = "orders_event_pre-generated-uuid";
            state.withIdInput = {
              eventType: "OrderCreated",
              streamType: "Order",
              streamId: "order_123",
              payload: { orderId: "order_123" },
              correlationId: "corr_789",
              causationId: "cmd_001",
            };
          });

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then('the result eventId is "orders_event_pre-generated-uuid"', () => {
            expect(state.withIdResult!.eventId).toBe("orders_event_pre-generated-uuid");
          });
        }
      );

      RuleScenario(
        "Extracts boundedContext from eventId when not provided",
        ({ Given, When, Then }) => {
          Given(
            'a pre-generated eventId "inventory_event_some-uuid" without explicit boundedContext',
            () => {
              state.preGeneratedId = "inventory_event_some-uuid";
              state.withIdInput = {
                eventType: "ProductCreated",
                streamType: "Product",
                streamId: "prod_123",
                payload: { productId: "prod_123" },
                correlationId: "corr_789",
                causationId: "cmd_001",
              };
            }
          );

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then('the result boundedContext is "inventory"', () => {
            expect(state.withIdResult!.boundedContext).toBe("inventory");
          });
        }
      );

      RuleScenario("Uses provided boundedContext when explicitly set", ({ Given, When, Then }) => {
        Given(
          'a pre-generated eventId "orders_event_some-uuid" with explicit boundedContext "custom-context"',
          () => {
            state.preGeneratedId = "orders_event_some-uuid";
            state.withIdInput = {
              eventType: "OrderCreated",
              streamType: "Order",
              streamId: "order_123",
              payload: { orderId: "order_123" },
              correlationId: "corr_789",
              causationId: "cmd_001",
              boundedContext: "custom-context",
            };
          }
        );

        When("createEventDataWithId is called", () => {
          state.withIdResult = createEventDataWithId(
            state.preGeneratedId! as never,
            state.withIdInput!
          ) as unknown as Record<string, unknown>;
        });

        Then('the result boundedContext is "custom-context"', () => {
          expect(state.withIdResult!.boundedContext).toBe("custom-context");
        });
      });

      RuleScenario(
        "Uses full eventId as boundedContext when no underscore present",
        ({ Given, When, Then }) => {
          Given(
            'a pre-generated eventId "malformed-event-id" without explicit boundedContext',
            () => {
              state.preGeneratedId = "malformed-event-id";
              state.withIdInput = {
                eventType: "TestEvent",
                streamType: "Test",
                streamId: "test_123",
                payload: {},
                correlationId: "corr_789",
                causationId: "cmd_001",
              };
            }
          );

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then('the result boundedContext is "malformed-event-id"', () => {
            expect(state.withIdResult!.boundedContext).toBe("malformed-event-id");
          });
        }
      );

      RuleScenario(
        "Copies all other fields correctly with pre-generated eventId",
        ({ Given, When, Then }) => {
          Given('a pre-generated eventId "orders_event_custom-uuid" with full input', () => {
            state.preGeneratedId = "orders_event_custom-uuid";
            state.withIdInput = {
              eventType: "OrderItemAdded",
              streamType: "Order",
              streamId: "order_123",
              payload: {
                orderId: "order_123",
                items: [{ productId: "prod_1", quantity: 3 }],
              },
              correlationId: "corr_add_item",
              causationId: "cmd_add_item",
            };
          });

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then("the withId result has fields:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string; expected: string }>(dataTable);
            const metadata = state.withIdResult!.metadata as Record<string, unknown>;
            for (const row of rows) {
              if (row.field === "correlationId" || row.field === "causationId") {
                expect(metadata[row.field]).toBe(row.expected);
              } else {
                expect(state.withIdResult![row.field]).toBe(row.expected);
              }
            }
            // Also verify payload
            expect(state.withIdResult!.payload).toEqual({
              orderId: "order_123",
              items: [{ productId: "prod_1", quantity: 3 }],
            });
          });
        }
      );

      RuleScenario(
        "Handles eventId with multiple underscores correctly",
        ({ Given, When, Then }) => {
          Given(
            'a pre-generated eventId "my_bounded_context_event_uuid-v7" without explicit boundedContext',
            () => {
              state.preGeneratedId = "my_bounded_context_event_uuid-v7";
              state.withIdInput = {
                eventType: "TestEvent",
                streamType: "Test",
                streamId: "test_123",
                payload: {},
                correlationId: "corr_789",
                causationId: "cmd_001",
              };
            }
          );

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then('the result boundedContext is "my"', () => {
            expect(state.withIdResult!.boundedContext).toBe("my");
          });
        }
      );

      RuleScenario(
        "Returns complete NewEventData structure with pre-generated eventId",
        ({ Given, When, Then, And }) => {
          Given('a pre-generated eventId "orders_event_test-uuid"', () => {
            state.preGeneratedId = "orders_event_test-uuid";
            state.withIdInput = {
              eventType: "OrderConfirmed",
              streamType: "Order",
              streamId: "order_999",
              payload: { orderId: "order_999" },
              correlationId: "corr_confirm",
              causationId: "cmd_confirm",
            };
          });

          When("createEventDataWithId is called", () => {
            state.withIdResult = createEventDataWithId(
              state.preGeneratedId! as never,
              state.withIdInput!
            ) as unknown as Record<string, unknown>;
          });

          Then("the result has all required properties:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ property: string }>(dataTable);
            for (const row of rows) {
              expect(state.withIdResult).toHaveProperty(row.property);
            }
          });

          And(
            "the result metadata has all required properties:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ property: string }>(dataTable);
              const metadata = state.withIdResult!.metadata as Record<string, unknown>;
              for (const row of rows) {
                expect(metadata).toHaveProperty(row.property);
              }
            }
          );
        }
      );
    }
  );
});
