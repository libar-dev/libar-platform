/**
 * Unit Tests for IntegrationEventPublisher
 *
 * Tests the IntegrationEventPublisher implementation:
 * - publish() - translation, routing, ID generation
 * - publish() returns null for unknown route
 * - IntegrationRouteBuilder fluent API
 * - IntegrationRouteBuilder.build() validation errors
 * - hasRouteFor() and getRoutes()
 * - IntegrationRouteError typed error class
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  IntegrationEventPublisher,
  IntegrationRouteBuilder,
  defineIntegrationRoute,
  createIntegrationPublisher,
  IntegrationRouteError,
} from "../../../src/integration/IntegrationEventPublisher";
import type { SourceEventInfo, IntegrationEventRoute } from "../../../src/integration/types";
import type { WorkpoolClient, MutationCtx } from "../../../src/orchestration/types";
import type { CorrelationChain } from "../../../src/correlation/types";
import type { FunctionReference, FunctionVisibility } from "convex/server";

// Mock workpool client
function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
  };
}

// Mock mutation context
function createMockCtx(): MutationCtx {
  return {} as MutationCtx;
}

// Mock handler for testing
const mockHandler = { name: "mockHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  Record<string, unknown>,
  unknown
>;

// Helper to create a test source event
function createSourceEvent(overrides: Partial<SourceEventInfo> = {}): SourceEventInfo {
  return {
    eventId: "evt_123",
    eventType: "OrderSubmitted",
    boundedContext: "orders",
    globalPosition: 1000,
    payload: {
      orderId: "order_456",
      customerId: "customer_789",
      totalAmount: 99.99,
    },
    correlation: {
      correlationId: "corr_abc",
      causationId: "cmd_def",
      userId: "user_123",
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

// Helper to create a test correlation chain
function createTestChain(overrides: Partial<CorrelationChain> = {}): CorrelationChain {
  return {
    commandId: "cmd_def",
    correlationId: "corr_abc",
    causationId: "cmd_def",
    initiatedAt: Date.now(),
    userId: "user_123",
    ...overrides,
  };
}

describe("IntegrationEventPublisher", () => {
  let mockWorkpool: WorkpoolClient & { calls: unknown[][] };
  let mockCtx: MutationCtx;

  beforeEach(() => {
    mockWorkpool = createMockWorkpool();
    mockCtx = createMockCtx();
  });

  describe("constructor", () => {
    it("creates publisher with empty routes", () => {
      const publisher = new IntegrationEventPublisher(mockWorkpool, []);

      expect(publisher.getRoutes()).toHaveLength(0);
    });

    it("creates publisher with routes", () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: (source) => ({ orderId: source.payload.orderId }),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);

      expect(publisher.getRoutes()).toHaveLength(1);
    });

    it("throws on duplicate sourceEventType routes", () => {
      const route1: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedV1",
        schemaVersion: 1,
        translator: (source) => ({ orderId: source.payload.orderId }),
        handlers: [mockHandler],
      };

      const route2: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted", // Duplicate
        targetEventType: "OrderPlacedV2",
        schemaVersion: 2,
        translator: (source) => ({ orderId: source.payload.orderId }),
        handlers: [mockHandler],
      };

      expect(() => new IntegrationEventPublisher(mockWorkpool, [route1, route2])).toThrow(
        IntegrationRouteError
      );
      expect(() => new IntegrationEventPublisher(mockWorkpool, [route1, route2])).toThrow(
        'Duplicate route for source event type: "OrderSubmitted"'
      );
    });
  });

  describe("hasRouteFor", () => {
    it("returns true when route exists", () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);

      expect(publisher.hasRouteFor("OrderSubmitted")).toBe(true);
    });

    it("returns false when route does not exist", () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);

      expect(publisher.hasRouteFor("OrderCancelled")).toBe(false);
      expect(publisher.hasRouteFor("InventoryReserved")).toBe(false);
    });
  });

  describe("getRoutes", () => {
    it("returns all registered routes", () => {
      const routes: IntegrationEventRoute[] = [
        {
          sourceEventType: "OrderSubmitted",
          targetEventType: "OrderPlacedIntegration",
          schemaVersion: 1,
          translator: () => ({}),
          handlers: [mockHandler],
        },
        {
          sourceEventType: "OrderCancelled",
          targetEventType: "OrderCancelledIntegration",
          schemaVersion: 1,
          translator: () => ({}),
          handlers: [mockHandler],
        },
      ];

      const publisher = new IntegrationEventPublisher(mockWorkpool, routes);
      const retrieved = publisher.getRoutes();

      expect(retrieved).toHaveLength(2);
      expect(retrieved.map((r) => r.sourceEventType)).toContain("OrderSubmitted");
      expect(retrieved.map((r) => r.sourceEventType)).toContain("OrderCancelled");
    });
  });

  describe("publish", () => {
    it("returns null when no route matches source event type", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent({ eventType: "DifferentEvent" });
      const chain = createTestChain();

      const result = await publisher.publish(mockCtx, sourceEvent, chain);

      expect(result).toBeNull();
      expect(mockWorkpool.calls).toHaveLength(0);
    });

    it("translates domain event to integration event", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: (source) => ({
          orderId: (source.payload as { orderId: string }).orderId,
          customerId: (source.payload as { customerId: string }).customerId,
          placedAt: source.timestamp,
        }),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      const result = await publisher.publish(mockCtx, sourceEvent, chain);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.handlersInvoked).toBe(1);
      expect(result!.integrationEventId).toBeDefined();
      expect(result!.integrationEventId).toMatch(/^int_/); // Integration event ID format
    });

    it("enqueues all handlers for a route", async () => {
      const handler1 = { name: "handler1" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        Record<string, unknown>,
        unknown
      >;
      const handler2 = { name: "handler2" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        Record<string, unknown>,
        unknown
      >;

      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({ orderId: "test" }),
        handlers: [handler1, handler2],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      const result = await publisher.publish(mockCtx, sourceEvent, chain);

      expect(result!.handlersInvoked).toBe(2);
      expect(mockWorkpool.calls).toHaveLength(2);
    });

    it("integration event includes correct metadata", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 2,
        translator: (source) => ({
          orderId: (source.payload as { orderId: string }).orderId,
        }),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      await publisher.publish(mockCtx, sourceEvent, chain);

      const [, , integrationEvent] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        {
          integrationEventId: string;
          eventType: string;
          schemaVersion: number;
          sourceEventId: string;
          sourceEventType: string;
          sourceBoundedContext: string;
          correlationId: string;
          causationId: string;
          sourceGlobalPosition: number;
          payload: unknown;
        },
      ];

      expect(integrationEvent.eventType).toBe("OrderPlacedIntegration");
      expect(integrationEvent.schemaVersion).toBe(2);
      expect(integrationEvent.sourceEventId).toBe("evt_123");
      expect(integrationEvent.sourceEventType).toBe("OrderSubmitted");
      expect(integrationEvent.sourceBoundedContext).toBe("orders");
      expect(integrationEvent.correlationId).toBe("corr_abc");
      expect(integrationEvent.causationId).toBe("evt_123"); // Domain event is causation
      expect(integrationEvent.sourceGlobalPosition).toBe(1000);
      expect(integrationEvent.payload).toEqual({ orderId: "order_456" });
    });

    it("propagates userId from chain when present", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain({ userId: "user_abc" });

      await publisher.publish(mockCtx, sourceEvent, chain);

      const [, , integrationEvent] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        { userId?: string },
      ];
      expect(integrationEvent.userId).toBe("user_abc");
    });

    it("does not include userId when not present in chain", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();
      delete chain.userId; // No userId

      await publisher.publish(mockCtx, sourceEvent, chain);

      const [, , integrationEvent] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        { userId?: string },
      ];
      expect(integrationEvent.userId).toBeUndefined();
    });

    it("includes onComplete in workpool options when configured", async () => {
      const onComplete = { name: "onComplete" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        unknown,
        unknown
      >;

      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route], {
        onComplete,
      });
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      await publisher.publish(mockCtx, sourceEvent, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { onComplete?: unknown },
      ];
      expect(options.onComplete).toBe(onComplete);
    });

    it("propagates translator errors to caller", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => {
          throw new Error("Translation failed: invalid payload structure");
        },
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      await expect(publisher.publish(mockCtx, sourceEvent, chain)).rejects.toThrow(
        "Translation failed: invalid payload structure"
      );
      // No handlers should be invoked when translation fails
      expect(mockWorkpool.calls).toHaveLength(0);
    });

    it("includes context in workpool options", async () => {
      const route: IntegrationEventRoute = {
        sourceEventType: "OrderSubmitted",
        targetEventType: "OrderPlacedIntegration",
        schemaVersion: 1,
        translator: () => ({}),
        handlers: [mockHandler],
      };

      const publisher = new IntegrationEventPublisher(mockWorkpool, [route]);
      const sourceEvent = createSourceEvent();
      const chain = createTestChain();

      await publisher.publish(mockCtx, sourceEvent, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { context: Record<string, unknown> },
      ];
      expect(options.context.integrationEventType).toBe("OrderPlacedIntegration");
      expect(options.context.sourceEventId).toBe("evt_123");
      expect(options.context.sourceEventType).toBe("OrderSubmitted");
      expect(options.context.correlationId).toBe("corr_abc");
    });
  });
});

describe("IntegrationRouteBuilder", () => {
  describe("fluent API", () => {
    it("builds route with all required fields", () => {
      const route = new IntegrationRouteBuilder()
        .from("OrderSubmitted")
        .to("OrderPlacedIntegration")
        .translate(() => ({ orderId: "test" }))
        .notify(mockHandler)
        .build();

      expect(route.sourceEventType).toBe("OrderSubmitted");
      expect(route.targetEventType).toBe("OrderPlacedIntegration");
      expect(route.schemaVersion).toBe(1); // Default
      expect(route.handlers).toHaveLength(1);
    });

    it("version() sets schema version", () => {
      const route = new IntegrationRouteBuilder()
        .from("OrderSubmitted")
        .to("OrderPlacedIntegration")
        .version(3)
        .translate(() => ({}))
        .notify(mockHandler)
        .build();

      expect(route.schemaVersion).toBe(3);
    });

    it("notify() accepts multiple handlers", () => {
      const handler1 = { name: "h1" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        Record<string, unknown>,
        unknown
      >;
      const handler2 = { name: "h2" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        Record<string, unknown>,
        unknown
      >;

      const route = new IntegrationRouteBuilder()
        .from("OrderSubmitted")
        .to("OrderPlacedIntegration")
        .translate(() => ({}))
        .notify(handler1, handler2)
        .build();

      expect(route.handlers).toHaveLength(2);
    });

    it("translate() sets translator function", () => {
      const route = new IntegrationRouteBuilder()
        .from("OrderSubmitted")
        .to("OrderPlacedIntegration")
        .translate((source) => ({
          id: source.eventId,
          type: source.eventType,
        }))
        .notify(mockHandler)
        .build();

      const result = route.translator({
        eventId: "evt_1",
        eventType: "OrderSubmitted",
        boundedContext: "orders",
        globalPosition: 100,
        payload: {},
        correlation: { correlationId: "c", causationId: "d" },
        timestamp: 123,
      });

      expect(result).toEqual({ id: "evt_1", type: "OrderSubmitted" });
    });
  });

  describe("build() validation", () => {
    it("throws MISSING_SOURCE_EVENT_TYPE when from() not called", () => {
      const builder = new IntegrationRouteBuilder()
        .to("Target")
        .translate(() => ({}))
        .notify(mockHandler);

      expect(() => builder.build()).toThrow(IntegrationRouteError);
      try {
        builder.build();
      } catch (e) {
        expect((e as IntegrationRouteError).code).toBe("MISSING_SOURCE_EVENT_TYPE");
      }
    });

    it("throws MISSING_TARGET_EVENT_TYPE when to() not called", () => {
      const builder = new IntegrationRouteBuilder()
        .from("Source")
        .translate(() => ({}))
        .notify(mockHandler);

      expect(() => builder.build()).toThrow(IntegrationRouteError);
      try {
        builder.build();
      } catch (e) {
        expect((e as IntegrationRouteError).code).toBe("MISSING_TARGET_EVENT_TYPE");
      }
    });

    it("throws MISSING_TRANSLATOR when translate() not called", () => {
      const builder = new IntegrationRouteBuilder().from("Source").to("Target").notify(mockHandler);

      expect(() => builder.build()).toThrow(IntegrationRouteError);
      try {
        builder.build();
      } catch (e) {
        expect((e as IntegrationRouteError).code).toBe("MISSING_TRANSLATOR");
      }
    });

    it("throws MISSING_HANDLERS when notify() not called", () => {
      const builder = new IntegrationRouteBuilder()
        .from("Source")
        .to("Target")
        .translate(() => ({}));

      expect(() => builder.build()).toThrow(IntegrationRouteError);
      try {
        builder.build();
      } catch (e) {
        expect((e as IntegrationRouteError).code).toBe("MISSING_HANDLERS");
      }
    });
  });
});

describe("defineIntegrationRoute", () => {
  it("returns builder for fluent construction", () => {
    const route = defineIntegrationRoute()
      .from("OrderSubmitted")
      .to("OrderPlacedIntegration")
      .translate(() => ({}))
      .notify(mockHandler)
      .build();

    expect(route.sourceEventType).toBe("OrderSubmitted");
    expect(route.targetEventType).toBe("OrderPlacedIntegration");
  });
});

describe("createIntegrationPublisher", () => {
  it("creates publisher instance", () => {
    const workpool = createMockWorkpool();
    const routes = [
      defineIntegrationRoute()
        .from("OrderSubmitted")
        .to("OrderPlacedIntegration")
        .translate(() => ({}))
        .notify(mockHandler)
        .build(),
    ];

    const publisher = createIntegrationPublisher(workpool, routes);

    expect(publisher.hasRouteFor("OrderSubmitted")).toBe(true);
    expect(publisher.getRoutes()).toHaveLength(1);
  });
});

describe("IntegrationRouteError", () => {
  it("has correct error name", () => {
    const error = new IntegrationRouteError("MISSING_TRANSLATOR", "Test message");

    expect(error.name).toBe("IntegrationRouteError");
  });

  it("includes code property", () => {
    const error = new IntegrationRouteError("DUPLICATE_SOURCE_EVENT_TYPE", "Test");

    expect(error.code).toBe("DUPLICATE_SOURCE_EVENT_TYPE");
  });

  it("includes optional context", () => {
    const error = new IntegrationRouteError("DUPLICATE_SOURCE_EVENT_TYPE", "Test", {
      sourceEventType: "OrderSubmitted",
    });

    expect(error.context).toEqual({ sourceEventType: "OrderSubmitted" });
  });

  it("is instanceof Error", () => {
    const error = new IntegrationRouteError("MISSING_HANDLERS", "Test");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(IntegrationRouteError);
  });
});
