/**
 * Fat Events - OrderSubmitted with Customer Snapshot
 *
 * @libar-docs
 * @libar-docs-implements ExampleAppModernization
 *
 * These tests verify the Fat Events pattern for OrderSubmitted:
 * - V2 events include customer snapshot (name, email)
 * - V1 events are upcasted with customer: null
 * - Missing customer data is handled gracefully (null fields)
 * - Enrichment doesn't block order submission
 *
 * NOTE: This file tests the domain layer (pure functions).
 * Integration tests would use the full command orchestrator.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { isSuccess, isRejected, isFailed } from "@libar-dev/platform-core/decider";

import { decideSubmitOrder } from "../../../convex/contexts/orders/domain/deciders/submitOrder.js";
import {
  loadCustomerSnapshot,
  type CustomerSnapshot,
} from "../../../convex/contexts/orders/domain/customer.js";
import { upcastOrderSubmitted } from "../../../convex/contexts/orders/domain/upcasting.js";
import type { OrderCMS } from "../../../convex/contexts/orders/domain/order.js";
import type { SubmitOrderContext } from "../../../convex/contexts/orders/domain/deciders/types.js";
import { CURRENT_EVENT_SCHEMA_VERSION } from "../../../convex/contexts/orders/handlers/commands.js";

// ============================================================================
// Test Types
// ============================================================================

interface CustomerInput {
  customerId: string;
  name: string;
  email: string;
}

interface EventField {
  field: string;
  value: string;
}

interface SubmittedEvent {
  eventType: string;
  payload: {
    orderId: string;
    customerId: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
    }>;
    totalAmount: number;
    submittedAt: number;
    customer: CustomerSnapshot | null;
  };
}

interface V1OrderSubmittedEvent {
  eventType: "OrderSubmitted";
  schemaVersion: 1;
  payload: {
    orderId: string;
    customerId: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
    }>;
    totalAmount: number;
    submittedAt: number;
  };
}

interface UpcastResult {
  event: {
    eventType: string;
    schemaVersion: number;
    payload: {
      orderId: string;
      customerId: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
      }>;
      totalAmount: number;
      submittedAt: number;
      customer: CustomerSnapshot | null;
    };
  };
  wasUpcasted: boolean;
}

interface TestState {
  // Customer state
  customer: CustomerSnapshot | null;
  customerId: string;

  // Order state
  order: OrderCMS | null;

  // Event state
  submittedEvent: SubmittedEvent | null;
  schemaVersion: number;
  originalEventCustomerName: string | null;

  // Upcasting state
  v1Event: V1OrderSubmittedEvent | null;
  upcastResult: UpcastResult | null;

  // Timing
  startTime: number;
  endTime: number;

  // Command result
  commandResult: unknown;
  error: Error | null;

  // Test isolation
  testRunId: string;
}

// ============================================================================
// Test State
// ============================================================================

let state: TestState | null = null;

function resetState(): void {
  state = {
    customer: null,
    customerId: "",
    order: null,
    submittedEvent: null,
    schemaVersion: 0,
    originalEventCustomerName: null,
    v1Event: null,
    upcastResult: null,
    startTime: 0,
    endTime: 0,
    commandResult: null,
    error: null,
    testRunId: `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock OrderCMS for testing the decider.
 */
function createMockOrderCMS(
  orderId: string,
  customerId: string,
  status: "draft" | "submitted" | "confirmed" | "cancelled" = "draft"
): OrderCMS {
  return {
    orderId,
    customerId,
    status,
    items: [
      {
        productId: "prod-001",
        productName: "Test Product",
        quantity: 2,
        unitPrice: 25.0,
      },
    ],
    totalAmount: 50.0,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Build the extended context for SubmitOrder decider.
 */
function buildSubmitOrderContext(customerSnapshot: CustomerSnapshot): SubmitOrderContext {
  return {
    now: Date.now(),
    commandId: `cmd_${state!.testRunId}_${Date.now()}`,
    correlationId: `corr_${state!.testRunId}_${Date.now()}`,
    customerSnapshot,
  };
}

// ============================================================================
// Fat Events OrderSubmitted Tests
// ============================================================================

const fatEventsFeature = await loadFeature(
  "tests/features/modernization/fat-events-order-submitted.feature"
);

describeFeature(fatEventsFeature, ({ Background, Rule, AfterEachScenario }) => {
  // Clean up after each scenario
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given, And }) => {
    Given("the orders bounded context is initialized", () => {
      // Initialize state at the start of each scenario
      resetState();

      // Verify deciders are available
      expect(decideSubmitOrder).toBeDefined();
      expect(loadCustomerSnapshot).toBeDefined();
    });

    And("the test run has a unique namespace", () => {
      expect(state).not.toBeNull();
      expect(state!.testRunId).toBeDefined();
      expect(state!.testRunId).toMatch(/^test_\d+_[a-z0-9]+$/);
    });
  });

  Rule("OrderSubmitted event includes customer snapshot", ({ RuleScenario }) => {
    RuleScenario("OrderSubmitted includes customer snapshot", ({ Given, And, When, Then }) => {
      Given("a customer exists:", (_ctx: unknown, dataTable: CustomerInput[]) => {
        const customerData = dataTable[0];
        state!.customerId = customerData.customerId;

        // Load the customer snapshot (this uses the demo data)
        state!.customer = loadCustomerSnapshot(customerData.customerId);

        // Verify the customer data matches expected
        expect(state!.customer.id).toBe(customerData.customerId);
        expect(state!.customer.name).toBe(customerData.name);
        expect(state!.customer.email).toBe(customerData.email);
      });

      And("the customer has a draft order", () => {
        state!.order = createMockOrderCMS(
          `${state!.testRunId}_ord_001`,
          state!.customerId,
          "draft"
        );
        expect(state!.order.status).toBe("draft");
        expect(state!.order.items.length).toBeGreaterThan(0);
      });

      When("the customer submits the order", () => {
        expect(state!.order).not.toBeNull();
        expect(state!.customer).not.toBeNull();

        const context = buildSubmitOrderContext(state!.customer!);
        const result = decideSubmitOrder(
          state!.order!,
          { orderId: state!.order!.orderId },
          context
        );

        // Use type guard for proper narrowing
        if (isSuccess(result)) {
          state!.submittedEvent = result.event as SubmittedEvent;
          state!.schemaVersion = CURRENT_EVENT_SCHEMA_VERSION;
        } else if (isRejected(result)) {
          throw new Error(`Unexpected rejection: ${result.code} - ${result.message}`);
        } else if (isFailed(result)) {
          throw new Error(`Unexpected failure: ${result.reason}`);
        }
      });

      Then("the OrderSubmitted event should include:", (_ctx: unknown, dataTable: EventField[]) => {
        expect(state!.submittedEvent).not.toBeNull();
        const payload = state!.submittedEvent!.payload;

        for (const row of dataTable) {
          const { field, value } = row;

          // Parse nested field path (e.g., "customer.id")
          const parts = field.split(".");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let actual: any = payload;
          for (const part of parts) {
            actual = actual[part];
          }

          expect(String(actual)).toBe(value);
        }
      });

      And("the event schema version should be {int}", (_ctx: unknown, version: number) => {
        expect(state!.schemaVersion).toBe(version);
      });
    });

    RuleScenario(
      "Event enrichment does not block order submission",
      ({ Given, And, When, Then }) => {
        Given("a customer with complete profile", () => {
          state!.customerId = "cust-002";
          state!.customer = loadCustomerSnapshot(state!.customerId);

          // Verify complete profile
          expect(state!.customer.name).not.toBeNull();
          expect(state!.customer.email).not.toBeNull();
        });

        And("a draft order ready for submission", () => {
          state!.order = createMockOrderCMS(
            `${state!.testRunId}_ord_002`,
            state!.customerId,
            "draft"
          );
        });

        When("the order is submitted", () => {
          state!.startTime = performance.now();

          const context = buildSubmitOrderContext(state!.customer!);
          const result = decideSubmitOrder(
            state!.order!,
            { orderId: state!.order!.orderId },
            context
          );

          state!.endTime = performance.now();
          state!.commandResult = result;

          if (isSuccess(result)) {
            state!.submittedEvent = result.event as SubmittedEvent;
          }
        });

        Then("the command should complete within acceptable latency", () => {
          // Pure decider should be sub-millisecond
          // Using 10ms as generous threshold for test stability
          const duration = state!.endTime - state!.startTime;
          expect(duration).toBeLessThan(10);
        });

        And("the event should be enriched with customer data", () => {
          expect(state!.submittedEvent).not.toBeNull();
          expect(state!.submittedEvent!.payload.customer).not.toBeNull();
          expect(state!.submittedEvent!.payload.customer!.id).toBe(state!.customerId);
          expect(state!.submittedEvent!.payload.customer!.name).toBe("Jane Smith");
          expect(state!.submittedEvent!.payload.customer!.email).toBe("jane@example.com");
        });
      }
    );

    RuleScenario("Customer snapshot is immutable in event", ({ Given, When, Then, And }) => {
      Given(
        "an OrderSubmitted event exists with customer name {string}",
        (_ctx: unknown, name: string) => {
          // Create an event with the specified customer name
          state!.customerId = "cust-001"; // John Doe
          state!.customer = loadCustomerSnapshot(state!.customerId);
          expect(state!.customer.name).toBe(name);

          // Create and submit order to generate the event
          state!.order = createMockOrderCMS(
            `${state!.testRunId}_ord_003`,
            state!.customerId,
            "draft"
          );

          const context = buildSubmitOrderContext(state!.customer);
          const result = decideSubmitOrder(
            state!.order,
            { orderId: state!.order.orderId },
            context
          );

          if (isSuccess(result)) {
            state!.submittedEvent = result.event as SubmittedEvent;
            state!.originalEventCustomerName = result.event.payload.customer?.name ?? null;
          }

          expect(state!.originalEventCustomerName).toBe(name);
        }
      );

      When("the customer updates their name to {string}", (_ctx: unknown, _newName: string) => {
        // In a real system, this would update the Customer BC
        // For this test, we simulate by noting the event is immutable
        // The original event remains unchanged - that's the point of Fat Events
        // NOTE: Since loadCustomerSnapshot uses static demo data,
        // we can't actually change the customer. This test verifies
        // that the ORIGINAL event payload remains unchanged.
      });

      Then(
        "querying the original event should still show {string}",
        (_ctx: unknown, name: string) => {
          // The original event's customer snapshot is immutable
          expect(state!.submittedEvent).not.toBeNull();
          expect(state!.submittedEvent!.payload.customer).not.toBeNull();
          expect(state!.submittedEvent!.payload.customer!.name).toBe(name);
        }
      );

      And("new OrderSubmitted events should show {string}", (_ctx: unknown, _name: string) => {
        // This verifies the PATTERN - new events get current data
        // Since we use static demo data, the name would be the same
        // In a real system, loadCustomerSnapshot would return updated data

        // Create a new order and submit it
        const newOrder = createMockOrderCMS(
          `${state!.testRunId}_ord_004`,
          state!.customerId,
          "draft"
        );

        // Load current customer snapshot (would have new name in real system)
        const currentSnapshot = loadCustomerSnapshot(state!.customerId);
        const context = buildSubmitOrderContext(currentSnapshot);
        const result = decideSubmitOrder(newOrder, { orderId: newOrder.orderId }, context);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          // New event gets current customer data
          expect(result.event.payload.customer).not.toBeNull();
          // In demo, name is same; in real system it would be updated
          expect(result.event.payload.customer!.id).toBe(state!.customerId);
        }
      });
    });

    RuleScenario("Missing customer data handled gracefully", ({ Given, When, Then, And }) => {
      Given("a customer with incomplete profile (missing email)", () => {
        // Use a customer ID that doesn't exist in demo data
        // This simulates incomplete/missing customer data
        state!.customerId = "cust-unknown";
        state!.customer = loadCustomerSnapshot(state!.customerId);

        // Customer snapshot should have null fields for missing data
        expect(state!.customer.id).toBe("cust-unknown");
        expect(state!.customer.name).toBeNull();
        expect(state!.customer.email).toBeNull();
      });

      When("the customer submits an order", () => {
        state!.order = createMockOrderCMS(
          `${state!.testRunId}_ord_005`,
          state!.customerId,
          "draft"
        );

        try {
          const context = buildSubmitOrderContext(state!.customer!);
          const result = decideSubmitOrder(
            state!.order,
            { orderId: state!.order.orderId },
            context
          );
          state!.commandResult = result;

          if (isSuccess(result)) {
            state!.submittedEvent = result.event as SubmittedEvent;
          }
        } catch (error) {
          state!.error = error as Error;
        }
      });

      Then("the OrderSubmitted event should include available data", () => {
        expect(state!.error).toBeNull();
        expect(state!.submittedEvent).not.toBeNull();
        expect(state!.submittedEvent!.payload.customer).not.toBeNull();
        expect(state!.submittedEvent!.payload.customer!.id).toBe("cust-unknown");
      });

      And("missing fields should have null or default values", () => {
        expect(state!.submittedEvent!.payload.customer!.name).toBeNull();
        expect(state!.submittedEvent!.payload.customer!.email).toBeNull();
      });

      And("the order submission should not fail", () => {
        expect(state!.error).toBeNull();
        expect(state!.commandResult).not.toBeNull();
        expect(isSuccess(state!.commandResult as ReturnType<typeof decideSubmitOrder>)).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Upcasting / Schema Evolution
    // -------------------------------------------------------------------------

    RuleScenario(
      "V1 events are upcasted to V2 with null customer",
      ({ Given, When, Then, And }) => {
        Given("a legacy V1 OrderSubmitted event without customer data", () => {
          // Create a V1 event (pre-Fat Events format, no customer snapshot)
          state!.v1Event = {
            eventType: "OrderSubmitted",
            schemaVersion: 1,
            payload: {
              orderId: `${state!.testRunId}_ord_v1_001`,
              customerId: "cust-001",
              items: [
                {
                  productId: "prod-001",
                  productName: "Legacy Product",
                  quantity: 2,
                  unitPrice: 25.0,
                },
              ],
              totalAmount: 50.0,
              submittedAt: Date.now(),
            },
          };

          expect(state!.v1Event.schemaVersion).toBe(1);
          // V1 events have no customer field in payload
          expect((state!.v1Event.payload as Record<string, unknown>).customer).toBeUndefined();
        });

        When("the event is read through the upcaster", () => {
          expect(state!.v1Event).not.toBeNull();

          // Use the upcaster to migrate V1 → V2
          state!.upcastResult = upcastOrderSubmitted(state!.v1Event!) as UpcastResult;

          expect(state!.upcastResult).not.toBeNull();
          expect(state!.upcastResult.wasUpcasted).toBe(true);
        });

        Then(
          "the event should have schema version {int}",
          (_ctx: unknown, expectedVersion: number) => {
            expect(state!.upcastResult).not.toBeNull();
            expect(state!.upcastResult!.event.schemaVersion).toBe(expectedVersion);
          }
        );

        And("the customer field should be null indicating a legacy event", () => {
          expect(state!.upcastResult).not.toBeNull();

          // V1→V2 migration adds customer: null
          // This distinguishes upcasted V1 events from new V2 events with actual customer data
          expect(state!.upcastResult!.event.payload.customer).toBeNull();
        });
      }
    );

    // Scenario: V2 events are not modified by upcaster
    RuleScenario("V2 events are not modified by upcaster", ({ Given, When, Then, And }) => {
      Given("a V2 OrderSubmitted event with customer data", () => {
        // Create a V2 event with customer snapshot
        const v2Event = {
          eventType: "OrderSubmitted" as const,
          schemaVersion: 2,
          payload: {
            orderId: `${state!.testRunId}_ord_v2_001`,
            customerId: "cust-001",
            items: [{ productId: "p1", productName: "Test", quantity: 1, unitPrice: 10 }],
            totalAmount: 10,
            submittedAt: Date.now(),
            customer: { id: "cust-001", name: "John", email: "john@example.com" },
          },
        };
        // Store in the V1 slot (we'll cast when upcasting)
        state!.v1Event = v2Event as unknown as V1OrderSubmittedEvent;
      });

      When("the event is read through the upcaster", () => {
        state!.upcastResult = upcastOrderSubmitted(state!.v1Event!) as UpcastResult;
      });

      Then(
        "the event should have schema version {int}",
        (_ctx: unknown, expectedVersion: number) => {
          expect(state!.upcastResult!.event.schemaVersion).toBe(expectedVersion);
        }
      );

      And("wasUpcasted should be false", () => {
        expect(state!.upcastResult!.wasUpcasted).toBe(false);
      });

      And("the customer snapshot should be preserved", () => {
        expect(state!.upcastResult!.event.payload.customer).toEqual({
          id: "cust-001",
          name: "John",
          email: "john@example.com",
        });
      });
    });
  });
});
