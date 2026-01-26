/**
 * Outbox Handler - Step Definitions
 *
 * BDD step definitions for outbox pattern operations:
 * - createOutboxHandler factory
 * - Event building from action results
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import { createOutboxHandler } from "../../../src/durability/outbox.js";
import type { ActionResult } from "../../../src/durability/types.js";

// =============================================================================
// Types
// =============================================================================

interface PaymentContext {
  orderId: string;
  customerId?: string;
  amount?: number;
}

interface PaymentResult {
  chargeId: string;
}

type OutboxHandler = (
  ctx: unknown,
  args: { result: ActionResult<PaymentResult>; context: PaymentContext }
) => Promise<void>;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  handler: OutboxHandler | null;
  appendedEvent: {
    idempotencyKey: string;
    eventType: string;
    eventData: Record<string, unknown>;
    boundedContext: string;
  } | null;
  idempotentAppendCalled: boolean;
  mockReturnsDuplicate: boolean;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    handler: null,
    appendedEvent: null,
    idempotentAppendCalled: false,
    mockReturnsDuplicate: false,
    error: null,
  };
}

const mockDependencies = {
  getByIdempotencyKey: "mockGetByIdempotencyKey",
  appendToStream: "mockAppendToStream",
};

function createMockContext() {
  return {
    runQuery: vi
      .fn()
      .mockResolvedValue(state.mockReturnsDuplicate ? { eventId: "existing", version: 1 } : null),
    runMutation: vi.fn().mockImplementation((_ref, args) => {
      state.idempotentAppendCalled = true;
      // idempotentAppendEvent calls runMutation with:
      // { streamType, streamId, expectedVersion, boundedContext, events: [{ eventId, eventType, payload, idempotencyKey, metadata }] }
      // Extract and map to our test state structure
      const event = args.events?.[0];
      if (event) {
        state.appendedEvent = {
          idempotencyKey: event.idempotencyKey,
          eventType: event.eventType,
          eventData: event.payload, // payload is the eventData in idempotentAppendEvent
          boundedContext: args.boundedContext,
        };
      }
      return Promise.resolve({ status: "success", newVersion: 1 });
    }),
  };
}

function createPaymentOutboxHandler(): OutboxHandler {
  return createOutboxHandler<PaymentContext, PaymentResult>({
    getIdempotencyKey: (ctx) => `payment:${ctx.orderId}`,
    buildEvent: (result, ctx) => ({
      eventType: result.kind === "success" ? "PaymentCompleted" : "PaymentFailed",
      eventData:
        result.kind === "success"
          ? { chargeId: result.returnValue.chargeId }
          : result.kind === "failed"
            ? { error: result.error }
            : {},
      streamType: "Order",
      streamId: ctx.orderId,
    }),
    dependencies: mockDependencies,
    boundedContext: "orders",
  });
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/outbox-handler.feature"
);

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Outbox Handler Factory Scenarios
  // ===========================================================================

  Scenario("createOutboxHandler returns a callable function", ({ When, Then }) => {
    When("creating an outbox handler with standard configuration", () => {
      state.handler = createPaymentOutboxHandler();
    });

    Then("the result should be a function", () => {
      expect(typeof state.handler).toBe("function");
    });
  });

  Scenario("Outbox handler extracts idempotency key from context", ({ Given, When, Then }) => {
    Given("an outbox handler configured to use orderId for idempotency key", () => {
      state.handler = createPaymentOutboxHandler();
    });

    When('processing a success result with orderId "ord-123"', async () => {
      const ctx = createMockContext();
      await state.handler!(ctx, {
        result: { kind: "success", returnValue: { chargeId: "ch-456" } },
        context: { orderId: "ord-123" },
      });
    });

    Then('the idempotency key should be "payment:ord-123"', () => {
      expect(state.appendedEvent?.idempotencyKey).toBe("payment:ord-123");
    });
  });

  Scenario(
    "Outbox handler builds PaymentCompleted event from success result",
    ({ Given, When, Then, And }) => {
      Given("an outbox handler for payment events", () => {
        state.handler = createPaymentOutboxHandler();
      });

      When('processing success result with chargeId "ch-456" and orderId "ord-123"', async () => {
        const ctx = createMockContext();
        await state.handler!(ctx, {
          result: { kind: "success", returnValue: { chargeId: "ch-456" } },
          context: { orderId: "ord-123" },
        });
      });

      Then('the event type should be "PaymentCompleted"', () => {
        expect(state.appendedEvent?.eventType).toBe("PaymentCompleted");
      });

      And('the event data should contain chargeId "ch-456"', () => {
        expect(state.appendedEvent?.eventData).toEqual({ chargeId: "ch-456" });
      });
    }
  );

  Scenario(
    "Outbox handler builds PaymentFailed event from failure result",
    ({ Given, When, Then, And }) => {
      Given("an outbox handler for payment events", () => {
        state.handler = createPaymentOutboxHandler();
      });

      When(
        'processing failure result with error "Card declined" and orderId "ord-123"',
        async () => {
          const ctx = createMockContext();
          await state.handler!(ctx, {
            result: { kind: "failed", error: "Card declined" },
            context: { orderId: "ord-123" },
          });
        }
      );

      Then('the event type should be "PaymentFailed"', () => {
        expect(state.appendedEvent?.eventType).toBe("PaymentFailed");
      });

      And('the event data should contain error "Card declined"', () => {
        expect(state.appendedEvent?.eventData).toEqual({ error: "Card declined" });
      });
    }
  );

  // ===========================================================================
  // Outbox Handler Integration Scenarios
  // ===========================================================================

  Scenario(
    "Outbox handler calls idempotentAppendEvent internally",
    ({ Given, When, Then, And }) => {
      Given("an outbox handler with mock event store", () => {
        state.handler = createPaymentOutboxHandler();
      });

      When('processing a result with orderId "ord-123"', async () => {
        const ctx = createMockContext();
        await state.handler!(ctx, {
          result: { kind: "success", returnValue: { chargeId: "ch-456" } },
          context: { orderId: "ord-123" },
        });
      });

      Then("idempotentAppendEvent should be invoked", () => {
        expect(state.idempotentAppendCalled).toBe(true);
      });

      And('the event should include bounded context "orders"', () => {
        expect(state.appendedEvent?.boundedContext).toBe("orders");
      });
    }
  );

  Scenario("Outbox handler completes without error for duplicates", ({ Given, When, Then }) => {
    Given("an outbox handler where idempotent append returns duplicate", () => {
      state.handler = createPaymentOutboxHandler();
      state.mockReturnsDuplicate = true;
    });

    When("processing a result with existing idempotency key", async () => {
      const ctx = createMockContext();
      try {
        await state.handler!(ctx, {
          result: { kind: "success", returnValue: { chargeId: "ch-456" } },
          context: { orderId: "ord-123" },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the handler should complete successfully", () => {
      expect(state.error).toBeNull();
    });
  });
});
