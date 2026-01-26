/**
 * Unit Tests for Event Store Client
 *
 * Tests the EventStore client class and type exports:
 * - EventStore class instantiation
 * - Type exports (EventCategory, StoredEvent, EventInput, etc.)
 * - Interface compliance
 *
 * Note: Actual mutation/query behavior is tested in integration tests
 * since they require Convex runtime.
 */
import { describe, it, expect } from "vitest";
import { EventStore } from "../../src/client/index";
import type {
  EventCategory,
  EventInput,
  StoredEvent,
  AppendArgs,
  AppendResult,
  ReadStreamArgs,
  ReadFromPositionArgs,
  GetStreamVersionArgs,
  GetByCorrelationArgs,
  EventStoreApi,
} from "../../src/client/index";

describe("EventStore Client", () => {
  describe("EventStore class", () => {
    it("can be instantiated with a component API", () => {
      // Create a mock component API (type-only check)
      const mockApi = {
        lib: {
          appendToStream: {} as EventStoreApi["lib"]["appendToStream"],
          readStream: {} as EventStoreApi["lib"]["readStream"],
          readFromPosition: {} as EventStoreApi["lib"]["readFromPosition"],
          getStreamVersion: {} as EventStoreApi["lib"]["getStreamVersion"],
          getByCorrelation: {} as EventStoreApi["lib"]["getByCorrelation"],
          getGlobalPosition: {} as EventStoreApi["lib"]["getGlobalPosition"],
        },
      };

      const eventStore = new EventStore(mockApi);

      expect(eventStore).toBeInstanceOf(EventStore);
      expect(eventStore.component).toBe(mockApi);
    });
  });

  describe("EventCategory type", () => {
    it("supports domain category", () => {
      const category: EventCategory = "domain";
      expect(category).toBe("domain");
    });

    it("supports integration category", () => {
      const category: EventCategory = "integration";
      expect(category).toBe("integration");
    });

    it("supports trigger category", () => {
      const category: EventCategory = "trigger";
      expect(category).toBe("trigger");
    });

    it("supports fat category", () => {
      const category: EventCategory = "fat";
      expect(category).toBe("fat");
    });
  });

  describe("EventInput interface", () => {
    it("requires eventId, eventType, and payload", () => {
      const event: EventInput = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        payload: { orderId: "ord_456" },
      };

      expect(event.eventId).toBe("evt_123");
      expect(event.eventType).toBe("OrderCreated");
      expect(event.payload).toEqual({ orderId: "ord_456" });
    });

    it("supports optional category", () => {
      const event: EventInput = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        payload: {},
        category: "domain",
      };

      expect(event.category).toBe("domain");
    });

    it("supports optional schemaVersion", () => {
      const event: EventInput = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        payload: {},
        schemaVersion: 2,
      };

      expect(event.schemaVersion).toBe(2);
    });

    it("supports optional metadata with correlationId", () => {
      const event: EventInput = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        payload: {},
        metadata: {
          correlationId: "corr_789",
          causationId: "cmd_101",
        },
      };

      expect(event.metadata?.correlationId).toBe("corr_789");
      expect(event.metadata?.causationId).toBe("cmd_101");
    });
  });

  describe("StoredEvent interface", () => {
    it("includes all required fields", () => {
      const storedEvent: StoredEvent = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        streamType: "Order",
        streamId: "ord_456",
        version: 1,
        globalPosition: 1703001234567001,
        boundedContext: "orders",
        category: "domain",
        schemaVersion: 1,
        correlationId: "corr_789",
        timestamp: 1703001234567,
        payload: { orderId: "ord_456" },
      };

      expect(storedEvent.eventId).toBe("evt_123");
      expect(storedEvent.streamType).toBe("Order");
      expect(storedEvent.version).toBe(1);
      expect(storedEvent.category).toBe("domain");
      expect(storedEvent.schemaVersion).toBe(1);
    });

    it("supports optional causationId", () => {
      const storedEvent: StoredEvent = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        streamType: "Order",
        streamId: "ord_456",
        version: 1,
        globalPosition: 1703001234567001,
        boundedContext: "orders",
        category: "domain",
        schemaVersion: 1,
        correlationId: "corr_789",
        causationId: "cmd_101",
        timestamp: 1703001234567,
        payload: { orderId: "ord_456" },
      };

      expect(storedEvent.causationId).toBe("cmd_101");
    });

    it("supports optional metadata", () => {
      const storedEvent: StoredEvent = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        streamType: "Order",
        streamId: "ord_456",
        version: 1,
        globalPosition: 1703001234567001,
        boundedContext: "orders",
        category: "domain",
        schemaVersion: 1,
        correlationId: "corr_789",
        timestamp: 1703001234567,
        payload: {},
        metadata: { extra: "data" },
      };

      expect(storedEvent.metadata).toEqual({ extra: "data" });
    });
  });

  describe("AppendArgs interface", () => {
    it("requires stream identity and events", () => {
      const args: AppendArgs = {
        streamType: "Order",
        streamId: "ord_123",
        expectedVersion: 0,
        boundedContext: "orders",
        events: [
          {
            eventId: "evt_456",
            eventType: "OrderCreated",
            payload: {},
          },
        ],
      };

      expect(args.streamType).toBe("Order");
      expect(args.expectedVersion).toBe(0);
      expect(args.events.length).toBe(1);
    });
  });

  describe("AppendResult type", () => {
    it("can be success with eventIds and globalPositions", () => {
      const result: AppendResult = {
        status: "success",
        eventIds: ["evt_123"],
        globalPositions: [1703001234567001],
        newVersion: 1,
      };

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.eventIds).toHaveLength(1);
        expect(result.globalPositions).toHaveLength(1);
        expect(result.newVersion).toBe(1);
      }
    });

    it("can be conflict with currentVersion", () => {
      const result: AppendResult = {
        status: "conflict",
        currentVersion: 5,
      };

      expect(result.status).toBe("conflict");
      if (result.status === "conflict") {
        expect(result.currentVersion).toBe(5);
      }
    });
  });

  describe("Query argument interfaces", () => {
    it("ReadStreamArgs supports optional filters", () => {
      const args: ReadStreamArgs = {
        streamType: "Order",
        streamId: "ord_123",
        fromVersion: 5,
        limit: 100,
      };

      expect(args.fromVersion).toBe(5);
      expect(args.limit).toBe(100);
    });

    it("ReadFromPositionArgs supports filters", () => {
      const args: ReadFromPositionArgs = {
        fromPosition: 1000,
        limit: 50,
        eventTypes: ["OrderCreated", "OrderSubmitted"],
        boundedContext: "orders",
      };

      expect(args.fromPosition).toBe(1000);
      expect(args.eventTypes).toContain("OrderCreated");
      expect(args.boundedContext).toBe("orders");
    });

    it("GetStreamVersionArgs requires stream identity", () => {
      const args: GetStreamVersionArgs = {
        streamType: "Order",
        streamId: "ord_123",
      };

      expect(args.streamType).toBe("Order");
    });

    it("GetByCorrelationArgs requires correlationId", () => {
      const args: GetByCorrelationArgs = {
        correlationId: "corr_789",
      };

      expect(args.correlationId).toBe("corr_789");
    });
  });
});
