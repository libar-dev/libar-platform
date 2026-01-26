/**
 * Fat Event Builder - Step Definitions
 *
 * @libar-docs
 * @libar-docs-pattern EcstFatEvents
 *
 * BDD step definitions for fat event builder behavior:
 * - createFatEvent() creation
 * - embedEntity() field selection
 * - embedCollection() collection embedding
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  createFatEvent,
  embedEntity,
  embedCollection,
  type FatEvent,
  type FatEventSchema,
} from "../../../src/ecst/index.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Inputs
  eventType: string;
  payload: Record<string, unknown>;
  schema: FatEventSchema<unknown> | null;
  correlationId: string | undefined;

  // Sample entities
  customer: Record<string, unknown>;
  orderItems: Array<Record<string, unknown>>;

  // Outputs
  fatEvent: FatEvent<unknown> | null;
  embeddedEntity: Record<string, unknown> | null;
  embeddedCollection: Array<Record<string, unknown>> | null;
  error: Error | null;
}

let state: TestState = createInitialState();

function createInitialState(): TestState {
  return {
    eventType: "",
    payload: {},
    schema: null,
    correlationId: undefined,
    customer: {
      id: "cust_123",
      name: "Alice",
      email: "alice@example.com",
      internalNotes: "VIP customer",
    },
    orderItems: [
      { productId: "p1", name: "Widget", quantity: 2, internalSku: "SKU001" },
      { productId: "p2", name: "Gadget", quantity: 1, internalSku: "SKU002" },
      { productId: "p3", name: "Gizmo", quantity: 3, internalSku: "SKU003" },
    ],
    fatEvent: null,
    embeddedEntity: null,
    embeddedCollection: null,
    error: null,
  };
}

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Feature: Fat Event Builder
// =============================================================================

const feature = await loadFeature("tests/features/behavior/ecst/fat-event-builder.feature");

describeFeature(feature, ({ Background, Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given, And }) => {
    Given("the ECST module is imported from platform-core", () => {
      // Module is imported at the top of the file
      expect(createFatEvent).toBeDefined();
      expect(embedEntity).toBeDefined();
      expect(embedCollection).toBeDefined();
    });

    And("a sample customer entity exists", () => {
      expect(state.customer).toBeDefined();
      expect(state.customer.id).toBe("cust_123");
    });

    And("sample order items exist", () => {
      expect(state.orderItems).toBeDefined();
      expect(state.orderItems).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Rule: createFatEvent() creates properly structured fat events
  // ===========================================================================

  Rule("createFatEvent() creates properly structured fat events", ({ RuleScenario }) => {
    RuleScenario("Create basic fat event", ({ Given, And, When, Then }) => {
      Given('event type "OrderSubmitted"', () => {
        state.eventType = "OrderSubmitted";
      });

      And("payload with orderId and totalAmount", () => {
        state.payload = { orderId: "ord_123", totalAmount: 150.0 };
      });

      When("I call createFatEvent(type, payload)", () => {
        try {
          state.fatEvent = createFatEvent(state.eventType, state.payload);
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("I receive a FatEvent object", () => {
        expect(state.fatEvent).not.toBeNull();
        expect(state.fatEvent).toHaveProperty("type");
        expect(state.fatEvent).toHaveProperty("payload");
        expect(state.fatEvent).toHaveProperty("metadata");
      });

      And('event.type equals "OrderSubmitted"', () => {
        expect(state.fatEvent?.type).toBe("OrderSubmitted");
      });

      And("event.payload contains the provided data", () => {
        expect(state.fatEvent?.payload).toEqual({ orderId: "ord_123", totalAmount: 150.0 });
      });

      And("event.metadata.timestamp is set", () => {
        expect(state.fatEvent?.metadata.timestamp).toBeDefined();
        expect(typeof state.fatEvent?.metadata.timestamp).toBe("number");
      });

      And("event.metadata.schemaVersion is set", () => {
        expect(state.fatEvent?.metadata.schemaVersion).toBeDefined();
        expect(state.fatEvent?.metadata.schemaVersion).toBe("1.0.0");
      });
    });

    RuleScenario("Create fat event with schema definition", ({ Given, And, When, Then }) => {
      Given('event type "OrderSubmitted"', () => {
        state.eventType = "OrderSubmitted";
        state.payload = { orderId: "ord_123", totalAmount: 150.0 };
      });

      And('a schema with version "2.0.0"', () => {
        state.schema = {
          version: "2.0.0",
          validate: (payload): payload is unknown => {
            return typeof payload === "object" && payload !== null && "orderId" in payload;
          },
        };
      });

      When("I call createFatEvent(type, payload, { schema })", () => {
        try {
          state.fatEvent = createFatEvent(state.eventType, state.payload, {
            schema: state.schema!,
          });
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('event.metadata.schemaVersion equals "2.0.0"', () => {
        expect(state.fatEvent?.metadata.schemaVersion).toBe("2.0.0");
      });
    });

    RuleScenario("Schema validation failure", ({ Given, And, When, Then }) => {
      Given('event type "OrderSubmitted"', () => {
        state.eventType = "OrderSubmitted";
      });

      And("an invalid payload missing required fields", () => {
        state.payload = {};
      });

      And("a schema with validation rules", () => {
        state.schema = {
          version: "1.0.0",
          validate: (payload): payload is unknown => {
            // Requires orderId
            return typeof payload === "object" && payload !== null && "orderId" in payload;
          },
        };
      });

      When("I call createFatEvent(type, payload, { schema })", () => {
        try {
          state.fatEvent = createFatEvent(state.eventType, state.payload, {
            schema: state.schema!,
          });
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error is thrown with message "Schema validation failed"', () => {
        expect(state.error).not.toBeNull();
        // Error message now includes event type and schema version for better debugging
        expect(state.error?.message).toContain("Schema validation failed");
        expect(state.error?.message).toContain("OrderSubmitted");
      });
    });

    RuleScenario("Create fat event with correlation ID", ({ Given, And, When, Then }) => {
      Given('event type "OrderSubmitted"', () => {
        state.eventType = "OrderSubmitted";
      });

      And("payload with orderId and totalAmount", () => {
        state.payload = { orderId: "ord_123", totalAmount: 150.0 };
      });

      And('a correlationId "corr_abc123"', () => {
        state.correlationId = "corr_abc123";
      });

      When("I call createFatEvent(type, payload, { correlationId })", () => {
        try {
          state.fatEvent = createFatEvent(state.eventType, state.payload, {
            correlationId: state.correlationId,
          });
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('event.metadata.correlationId equals "corr_abc123"', () => {
        expect(state.fatEvent?.metadata.correlationId).toBe("corr_abc123");
      });
    });
  });

  // ===========================================================================
  // Rule: embedEntity() snapshots entity fields into event
  // ===========================================================================

  Rule("embedEntity() snapshots entity fields into event", ({ RuleScenario }) => {
    RuleScenario("Embed selected entity fields", ({ Given, When, Then, And }) => {
      Given("a customer entity with id, name, email, internalNotes", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
          internalNotes: "VIP customer",
        };
      });

      When("I call embedEntity(customer, ['id', 'name', 'email'])", () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "name", "email"]) as Record<
            string,
            unknown
          >;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result contains id, name, email", () => {
        expect(state.embeddedEntity).toHaveProperty("id");
        expect(state.embeddedEntity).toHaveProperty("name");
        expect(state.embeddedEntity).toHaveProperty("email");
      });

      And("the result does NOT contain internalNotes", () => {
        expect(state.embeddedEntity).not.toHaveProperty("internalNotes");
      });
    });

    RuleScenario("Embed all fields", ({ Given, When, Then }) => {
      Given("a customer entity with id, name, email", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
        };
      });

      When("I call embedEntity(customer) without field list", () => {
        try {
          state.embeddedEntity = embedEntity(state.customer) as Record<string, unknown>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result contains all entity fields", () => {
        expect(state.embeddedEntity).toHaveProperty("id", "cust_123");
        expect(state.embeddedEntity).toHaveProperty("name", "Alice");
        expect(state.embeddedEntity).toHaveProperty("email", "alice@example.com");
      });
    });

    RuleScenario("Embed non-existent field", ({ Given, When, Then }) => {
      Given("a customer entity without address field", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
        };
      });

      When("I call embedEntity(customer, ['id', 'address'])", () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "address"]) as Record<
            string,
            unknown
          >;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("an error is thrown with message \"Field 'address' not found\"", () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toBe("Field 'address' not found");
      });
    });
  });

  // ===========================================================================
  // Rule: embedCollection() snapshots related collections
  // ===========================================================================

  Rule("embedCollection() snapshots related collections", ({ RuleScenario }) => {
    RuleScenario("Embed collection of items", ({ Given, When, Then, And }) => {
      Given("3 order items with productId, name, quantity", () => {
        state.orderItems = [
          { productId: "p1", name: "Widget", quantity: 2 },
          { productId: "p2", name: "Gadget", quantity: 1 },
          { productId: "p3", name: "Gizmo", quantity: 3 },
        ];
      });

      When("I call embedCollection(items)", () => {
        try {
          state.embeddedCollection = embedCollection(state.orderItems) as Array<
            Record<string, unknown>
          >;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result is an array of 3 items", () => {
        expect(state.embeddedCollection).toHaveLength(3);
      });

      And("each item contains productId, name, quantity", () => {
        for (const item of state.embeddedCollection!) {
          expect(item).toHaveProperty("productId");
          expect(item).toHaveProperty("name");
          expect(item).toHaveProperty("quantity");
        }
      });
    });

    RuleScenario("Embed collection with field selection", ({ Given, When, Then, And }) => {
      Given("3 order items with productId, name, quantity, internalSku", () => {
        state.orderItems = [
          { productId: "p1", name: "Widget", quantity: 2, internalSku: "SKU001" },
          { productId: "p2", name: "Gadget", quantity: 1, internalSku: "SKU002" },
          { productId: "p3", name: "Gizmo", quantity: 3, internalSku: "SKU003" },
        ];
      });

      When("I call embedCollection(items, ['productId', 'name', 'quantity'])", () => {
        try {
          state.embeddedCollection = embedCollection(state.orderItems, [
            "productId",
            "name",
            "quantity",
          ]) as Array<Record<string, unknown>>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("each item contains productId, name, quantity", () => {
        for (const item of state.embeddedCollection!) {
          expect(item).toHaveProperty("productId");
          expect(item).toHaveProperty("name");
          expect(item).toHaveProperty("quantity");
        }
      });

      And("no item contains internalSku", () => {
        for (const item of state.embeddedCollection!) {
          expect(item).not.toHaveProperty("internalSku");
        }
      });
    });

    RuleScenario("Embed empty collection", ({ Given, When, Then }) => {
      Given("an empty array of items", () => {
        state.orderItems = [];
      });

      When("I call embedCollection(items)", () => {
        try {
          state.embeddedCollection = embedCollection(state.orderItems) as Array<
            Record<string, unknown>
          >;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result is an empty array", () => {
        expect(state.embeddedCollection).toEqual([]);
      });
    });
  });
});
