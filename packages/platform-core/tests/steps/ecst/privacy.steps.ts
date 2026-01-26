/**
 * Privacy Markers (Crypto-Shredding) - Step Definitions
 *
 * @libar-docs
 * @libar-docs-pattern EcstFatEvents
 *
 * BDD step definitions for crypto-shredding behavior:
 * - PII field marking
 * - Shred marker detection
 * - Collection privacy
 * - Shredding execution
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  createFatEvent,
  embedEntity,
  embedCollection,
  findShreddableFields,
  shredEvent,
  isShreddableField,
  isRedactedValue,
  hasShreddableFields,
  countShreddableFields,
  type FatEvent,
  type ShreddableField,
  type ShredResult,
  type RedactedValue,
} from "../../../src/ecst/index.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Entities
  customer: Record<string, unknown>;
  addresses: Array<Record<string, unknown>>;

  // Outputs
  embeddedEntity: Record<string, unknown> | null;
  embeddedCollection: Array<Record<string, unknown>> | null;
  event: FatEvent<unknown> | null;
  shredResult: ShredResult | null;
  shreddableFields: string[];
  hasShreddableResult: boolean | null;
  countShreddableResult: number | null;
  error: Error | null;
}

let state: TestState = createInitialState();

function createInitialState(): TestState {
  return {
    customer: {
      id: "cust_123",
      name: "Alice Smith",
      email: "alice@example.com",
      phone: "+1-555-0123",
      address: "123 Main St",
    },
    addresses: [
      { street: "123 Main St", city: "Boston", postalCode: "02101" },
      { street: "456 Oak Ave", city: "Cambridge", postalCode: "02139" },
    ],
    embeddedEntity: null,
    embeddedCollection: null,
    event: null,
    shredResult: null,
    shreddableFields: [],
    hasShreddableResult: null,
    countShreddableResult: null,
    error: null,
  };
}

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Feature: Privacy Markers (Crypto-Shredding)
// =============================================================================

const feature = await loadFeature("tests/features/behavior/ecst/privacy-markers.feature");

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
    Given("the ECST module with privacy support is imported", () => {
      expect(embedEntity).toBeDefined();
      expect(findShreddableFields).toBeDefined();
      expect(shredEvent).toBeDefined();
    });

    And("sample entities with PII fields exist", () => {
      expect(state.customer).toBeDefined();
      expect(state.addresses).toBeDefined();
    });
  });

  // ===========================================================================
  // Rule: PII fields can be marked for crypto-shredding
  // ===========================================================================

  Rule("PII fields can be marked for crypto-shredding", ({ RuleScenario }) => {
    RuleScenario("Mark single field for shredding", ({ Given, When, Then, And }) => {
      Given('a customer entity with email "alice@example.com"', () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
        };
      });

      When("I call embedEntity(customer, ['id', 'name', 'email'], { shred: ['email'] })", () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "name", "email"], {
            shred: ["email"],
          }) as Record<string, unknown>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result includes email field", () => {
        expect(state.embeddedEntity).toHaveProperty("email");
      });

      And("email is marked with __shred: true metadata", () => {
        const emailField = state.embeddedEntity?.email as ShreddableField<unknown>;
        expect(isShreddableField(emailField)).toBe(true);
        expect(emailField.__shred).toBe(true);
        expect(emailField.value).toBe("alice@example.com");
      });
    });

    RuleScenario("Mark multiple fields for shredding", ({ Given, When, Then }) => {
      Given("a customer entity with email, phone, address", () => {
        state.customer = {
          id: "cust_123",
          email: "alice@example.com",
          phone: "+1-555-0123",
          address: "123 Main St",
        };
      });

      When(
        "I call embedEntity(customer, ['id', 'email', 'phone', 'address'], { shred: ['email', 'phone', 'address'] })",
        () => {
          try {
            state.embeddedEntity = embedEntity(
              state.customer,
              ["id", "email", "phone", "address"],
              { shred: ["email", "phone", "address"] }
            ) as Record<string, unknown>;
          } catch (e) {
            state.error = e as Error;
          }
        }
      );

      Then("email, phone, and address are all marked with __shred: true", () => {
        expect(isShreddableField(state.embeddedEntity?.email)).toBe(true);
        expect(isShreddableField(state.embeddedEntity?.phone)).toBe(true);
        expect(isShreddableField(state.embeddedEntity?.address)).toBe(true);
      });
    });

    RuleScenario("Non-PII fields are not marked", ({ Given, When, Then }) => {
      Given("a customer entity with id, name, email", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
        };
      });

      When("I call embedEntity(customer, ['id', 'name', 'email'], { shred: ['email'] })", () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "name", "email"], {
            shred: ["email"],
          }) as Record<string, unknown>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("id and name are NOT marked with __shred", () => {
        expect(isShreddableField(state.embeddedEntity?.id)).toBe(false);
        expect(isShreddableField(state.embeddedEntity?.name)).toBe(false);
        // Verify they're plain values
        expect(state.embeddedEntity?.id).toBe("cust_123");
        expect(state.embeddedEntity?.name).toBe("Alice");
      });
    });
  });

  // ===========================================================================
  // Rule: Shred markers can be detected in fat events
  // ===========================================================================

  Rule("Shred markers can be detected in fat events", ({ RuleScenario }) => {
    RuleScenario("Find all shreddable fields in event", ({ Given, When, Then, And }) => {
      Given("a fat event with marked email and phone fields", () => {
        const customer = embedEntity(
          { id: "cust_123", email: "alice@example.com", phone: "+1-555-0123" },
          ["id", "email", "phone"],
          { shred: ["email", "phone"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When("I call findShreddableFields(event)", () => {
        state.shreddableFields = findShreddableFields(state.event!);
      });

      Then('result includes "payload.customer.email"', () => {
        expect(state.shreddableFields).toContain("payload.customer.email");
      });

      And('result includes "payload.customer.phone"', () => {
        expect(state.shreddableFields).toContain("payload.customer.phone");
      });
    });

    RuleScenario("No shreddable fields returns empty", ({ Given, When, Then }) => {
      Given("a fat event with no marked fields", () => {
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          totalAmount: 150.0,
        });
      });

      When("I call findShreddableFields(event)", () => {
        state.shreddableFields = findShreddableFields(state.event!);
      });

      Then("result is an empty array", () => {
        expect(state.shreddableFields).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // Rule: Collections can have per-item privacy markers
  // ===========================================================================

  Rule("Collections can have per-item privacy markers", ({ RuleScenario }) => {
    RuleScenario("Mark fields in collection items", ({ Given, When, Then, And }) => {
      Given("2 shipping addresses with street, city, postalCode", () => {
        state.addresses = [
          { street: "123 Main St", city: "Boston", postalCode: "02101" },
          { street: "456 Oak Ave", city: "Cambridge", postalCode: "02139" },
        ];
      });

      When(
        "I call embedCollection(addresses, ['street', 'city', 'postalCode'], { shred: ['street', 'postalCode'] })",
        () => {
          try {
            state.embeddedCollection = embedCollection(
              state.addresses,
              ["street", "city", "postalCode"],
              { shred: ["street", "postalCode"] }
            ) as Array<Record<string, unknown>>;
          } catch (e) {
            state.error = e as Error;
          }
        }
      );

      Then("each item has street and postalCode marked with __shred: true", () => {
        for (const item of state.embeddedCollection!) {
          expect(isShreddableField(item.street)).toBe(true);
          expect(isShreddableField(item.postalCode)).toBe(true);
        }
      });

      And("city is not marked in any item", () => {
        for (const item of state.embeddedCollection!) {
          expect(isShreddableField(item.city)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: Marked fields can be shredded (replaced with tombstone)
  // ===========================================================================

  Rule("Marked fields can be shredded (replaced with RedactedValue)", ({ RuleScenario }) => {
    RuleScenario("Shred all marked fields", ({ Given, When, Then, And }) => {
      Given('a fat event with marked email "alice@example.com"', () => {
        const customer = embedEntity(
          { id: "cust_123", name: "Alice", email: "alice@example.com" },
          ["id", "name", "email"],
          { shred: ["email"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When("I call shredEvent(event)", () => {
        state.shredResult = shredEvent(state.event!);
      });

      Then("email field is a RedactedValue object", () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        expect(isRedactedValue(customer.email)).toBe(true);
      });

      And("RedactedValue has __redacted set to true", () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        const email = customer.email as RedactedValue;
        expect(email.__redacted).toBe(true);
      });

      And('RedactedValue has originalType "string"', () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        const email = customer.email as RedactedValue;
        expect(email.originalType).toBe("string");
      });

      And("RedactedValue has redactedAt timestamp", () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        const email = customer.email as RedactedValue;
        expect(typeof email.redactedAt).toBe("number");
        expect(email.redactedAt).toBeGreaterThan(0);
      });
    });

    RuleScenario("Non-marked fields are preserved", ({ Given, When, Then, And }) => {
      Given("a fat event with marked email and non-marked name", () => {
        const customer = embedEntity(
          { id: "cust_123", name: "Alice", email: "alice@example.com" },
          ["id", "name", "email"],
          { shred: ["email"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When("I call shredEvent(event)", () => {
        state.shredResult = shredEvent(state.event!);
      });

      Then("name field value is unchanged", () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        expect(customer.name).toBe("Alice");
      });

      And("email field is a RedactedValue object", () => {
        const payload = state.shredResult?.event.payload as Record<string, unknown>;
        const customer = payload.customer as Record<string, unknown>;
        expect(isRedactedValue(customer.email)).toBe(true);
      });
    });

    RuleScenario("Shred event returns audit trail", ({ Given, When, Then, And }) => {
      Given('a fat event with marked email "alice@example.com"', () => {
        const customer = embedEntity(
          { id: "cust_123", name: "Alice", email: "alice@example.com" },
          ["id", "name", "email"],
          { shred: ["email"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When('I call shredEvent(event) with correlationId "erasure-req-123"', () => {
        state.shredResult = shredEvent(state.event!, "erasure-req-123");
      });

      Then("the result includes an audit object", () => {
        expect(state.shredResult).toHaveProperty("audit");
        expect(state.shredResult?.audit).toBeDefined();
      });

      And('audit.correlationId equals "erasure-req-123"', () => {
        expect(state.shredResult?.audit.correlationId).toBe("erasure-req-123");
      });

      And("audit.fieldsShredded includes the shredded field paths", () => {
        expect(state.shredResult?.audit.fieldsShredded).toContain("payload.customer.email");
      });

      And("audit.shreddedAt is a timestamp", () => {
        expect(typeof state.shredResult?.audit.shreddedAt).toBe("number");
        expect(state.shredResult?.audit.shreddedAt).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // Rule: Utility functions for shreddable field detection
  // ===========================================================================

  Rule("Utility functions for shreddable field detection", ({ RuleScenario }) => {
    RuleScenario("Check if event has any shreddable fields", ({ Given, When, Then }) => {
      Given("a fat event with marked PII fields", () => {
        const customer = embedEntity(
          { id: "cust_123", email: "alice@example.com" },
          ["id", "email"],
          { shred: ["email"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When("I call hasShreddableFields(event)", () => {
        state.hasShreddableResult = hasShreddableFields(state.event!);
      });

      Then("the result is true", () => {
        expect(state.hasShreddableResult).toBe(true);
      });
    });

    RuleScenario("Check event without shreddable fields", ({ Given, When, Then }) => {
      Given("a fat event with no marked fields", () => {
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          totalAmount: 150.0,
        });
      });

      When("I call hasShreddableFields(event)", () => {
        state.hasShreddableResult = hasShreddableFields(state.event!);
      });

      Then("the result is false", () => {
        expect(state.hasShreddableResult).toBe(false);
      });
    });

    RuleScenario("Count shreddable fields", ({ Given, When, Then }) => {
      Given("a fat event with 2 marked PII fields", () => {
        const customer = embedEntity(
          { id: "cust_123", email: "alice@example.com", phone: "+1-555-0123" },
          ["id", "email", "phone"],
          { shred: ["email", "phone"] }
        );
        state.event = createFatEvent("OrderSubmitted", {
          orderId: "ord_123",
          customer,
        });
      });

      When("I call countShreddableFields(event)", () => {
        state.countShreddableResult = countShreddableFields(state.event!);
      });

      Then("the result is 2", () => {
        expect(state.countShreddableResult).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Rule: Required fields cannot be marked for shredding
  // ===========================================================================

  Rule("Required fields cannot be marked for shredding", ({ RuleScenario }) => {
    RuleScenario("Cannot shred required fields", ({ Given, When, Then }) => {
      Given("an entity with fields id, name, email", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
        };
      });

      When('I call embedEntity with shred ["email"] and required ["email"]', () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "name", "email"], {
            shred: ["email"],
            required: ["email"],
          }) as Record<string, unknown>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error is thrown with message containing "marked as required"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("marked as required");
      });
    });

    RuleScenario("Non-overlapping shred and required fields work", ({ Given, When, Then, And }) => {
      Given("an entity with fields id, name, email", () => {
        state.customer = {
          id: "cust_123",
          name: "Alice",
          email: "alice@example.com",
        };
      });

      When('I call embedEntity with shred ["email"] and required ["id"]', () => {
        try {
          state.embeddedEntity = embedEntity(state.customer, ["id", "name", "email"], {
            shred: ["email"],
            required: ["id"],
          }) as Record<string, unknown>;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("the result includes email marked with __shred", () => {
        expect(state.error).toBeNull();
        expect(isShreddableField(state.embeddedEntity?.email)).toBe(true);
      });

      And("the result includes id without __shred marker", () => {
        expect(isShreddableField(state.embeddedEntity?.id)).toBe(false);
        expect(state.embeddedEntity?.id).toBe("cust_123");
      });
    });
  });
});
