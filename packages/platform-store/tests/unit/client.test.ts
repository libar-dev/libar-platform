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
import { describe, it, expect, vi } from "vitest";
import { createVerificationProof } from "@libar-dev/platform-core/security";
import { EventStore } from "../../src/client/index";
import type {
  EventCategory,
  EventInput,
  StoredEvent,
  AppendArgs,
  AppendResult,
  ReadStreamArgs,
  ReadFromPositionArgs,
  ReadFromPositionResult,
  GetStreamVersionArgs,
  GetByCorrelationArgs,
  GetByCorrelationResult,
  EventStoreApi,
} from "../../src/client/index";

vi.mock("@libar-dev/platform-core/security", () => ({
  createVerificationProof: vi.fn(),
}));

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
          getIdempotencyConflictAudits: {} as EventStoreApi["lib"]["getIdempotencyConflictAudits"],
        },
      };

      const eventStore = new EventStore(mockApi);

      expect(eventStore).toBeInstanceOf(EventStore);
      expect(eventStore.component).toBe(mockApi);
    });

    it("delegates appendToStream and attaches a verification proof", async () => {
      vi.mocked(createVerificationProof).mockResolvedValue("proof-token" as never);

      const appendToStream = {} as EventStoreApi["lib"]["appendToStream"];
      const eventStore = new EventStore({
        lib: {
          appendToStream,
          readStream: {} as EventStoreApi["lib"]["readStream"],
          readFromPosition: {} as EventStoreApi["lib"]["readFromPosition"],
          getStreamVersion: {} as EventStoreApi["lib"]["getStreamVersion"],
          getByCorrelation: {} as EventStoreApi["lib"]["getByCorrelation"],
          getGlobalPosition: {} as EventStoreApi["lib"]["getGlobalPosition"],
          getIdempotencyConflictAudits: {} as EventStoreApi["lib"]["getIdempotencyConflictAudits"],
        },
      });
      const mutationCtx = {
        runMutation: vi.fn().mockResolvedValue({
          status: "success",
          eventIds: ["evt_123"],
          globalPositions: [1703001234567001n],
          newVersion: 1,
        }),
      };
      const args: AppendArgs = {
        streamType: "Order",
        streamId: "ord_123",
        expectedVersion: 0,
        boundedContext: "orders",
        tenantId: "tenant-1",
        events: [
          {
            eventId: "evt_123",
            eventType: "OrderCreated",
            payload: { orderId: "ord_123" },
            metadata: { correlationId: "corr_123" },
          },
        ],
      };

      await expect(eventStore.appendToStream(mutationCtx as never, args)).resolves.toEqual({
        status: "success",
        eventIds: ["evt_123"],
        globalPositions: [1703001234567001n],
        newVersion: 1,
      });

      expect(createVerificationProof).toHaveBeenCalledWith({
        target: "eventStore",
        issuer: "platform-store:EventStore.appendToStream",
        subjectId: "orders",
        subjectType: "boundedContext",
        boundedContext: "orders",
        tenantId: "tenant-1",
      });
      expect(mutationCtx.runMutation).toHaveBeenCalledWith(appendToStream, {
        ...args,
        verificationProof: "proof-token",
      });
    });

    it("throws on idempotency conflicts with audit context", async () => {
      vi.mocked(createVerificationProof).mockResolvedValue("proof-token" as never);

      const eventStore = new EventStore({
        lib: {
          appendToStream: {} as EventStoreApi["lib"]["appendToStream"],
          readStream: {} as EventStoreApi["lib"]["readStream"],
          readFromPosition: {} as EventStoreApi["lib"]["readFromPosition"],
          getStreamVersion: {} as EventStoreApi["lib"]["getStreamVersion"],
          getByCorrelation: {} as EventStoreApi["lib"]["getByCorrelation"],
          getGlobalPosition: {} as EventStoreApi["lib"]["getGlobalPosition"],
          getIdempotencyConflictAudits: {} as EventStoreApi["lib"]["getIdempotencyConflictAudits"],
        },
      });
      const mutationCtx = {
        runMutation: vi.fn().mockResolvedValue({
          status: "idempotency_conflict",
          existingEventId: "evt_existing",
          auditId: "audit_123",
          currentVersion: 5,
        }),
      };

      await expect(
        eventStore.appendToStream(mutationCtx as never, {
          streamType: "Order",
          streamId: "ord_123",
          expectedVersion: 3,
          boundedContext: "orders",
          events: [
            {
              eventId: "evt_123",
              eventType: "OrderCreated",
              payload: {},
              metadata: { correlationId: "corr_123" },
            },
          ],
        })
      ).rejects.toThrow(
        "appendToStream rejected idempotency key reuse with different payload. existingEventId=evt_existing auditId=audit_123"
      );
    });

    it("delegates query methods to the component API", async () => {
      const readStream = {} as EventStoreApi["lib"]["readStream"];
      const readFromPosition = {} as EventStoreApi["lib"]["readFromPosition"];
      const getStreamVersion = {} as EventStoreApi["lib"]["getStreamVersion"];
      const getByCorrelation = {} as EventStoreApi["lib"]["getByCorrelation"];
      const getGlobalPosition = {} as EventStoreApi["lib"]["getGlobalPosition"];
      const getIdempotencyConflictAudits =
        {} as EventStoreApi["lib"]["getIdempotencyConflictAudits"];
      const eventStore = new EventStore({
        lib: {
          appendToStream: {} as EventStoreApi["lib"]["appendToStream"],
          readStream,
          readFromPosition,
          getStreamVersion,
          getByCorrelation,
          getGlobalPosition,
          getIdempotencyConflictAudits,
        },
      });
      const queryCtx = {
        runQuery: vi
          .fn()
          .mockResolvedValueOnce([{ eventId: "evt_1" }])
          .mockResolvedValueOnce({
            events: [{ eventId: "evt_2" }],
            nextPosition: 9n,
            hasMore: false,
          })
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce({ events: [], nextCursor: null, hasMore: false })
          .mockResolvedValueOnce(12n)
          .mockResolvedValueOnce([{ auditId: "audit_1" }]),
      };

      await expect(
        eventStore.readStream(queryCtx as never, { streamType: "Order", streamId: "ord_1" })
      ).resolves.toEqual([{ eventId: "evt_1" }]);
      await expect(
        eventStore.readFromPosition(queryCtx as never, { fromPosition: 0n, limit: 10 })
      ).resolves.toEqual({
        events: [{ eventId: "evt_2" }],
        nextPosition: 9n,
        hasMore: false,
      });
      await expect(
        eventStore.getStreamVersion(queryCtx as never, { streamType: "Order", streamId: "ord_1" })
      ).resolves.toBe(3);
      await expect(
        eventStore.getByCorrelation(queryCtx as never, { correlationId: "corr_1" })
      ).resolves.toEqual({ events: [], nextCursor: null, hasMore: false });
      await expect(eventStore.getGlobalPosition(queryCtx as never)).resolves.toBe(12n);
      await expect(
        eventStore.getIdempotencyConflictAudits(queryCtx as never, "idem_1")
      ).resolves.toEqual([{ auditId: "audit_1" }]);

      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(1, readStream, {
        streamType: "Order",
        streamId: "ord_1",
      });
      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(2, readFromPosition, {
        fromPosition: 0n,
        limit: 10,
      });
      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(3, getStreamVersion, {
        streamType: "Order",
        streamId: "ord_1",
      });
      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(4, getByCorrelation, {
        correlationId: "corr_1",
      });
      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(5, getGlobalPosition, {});
      expect(queryCtx.runQuery).toHaveBeenNthCalledWith(6, getIdempotencyConflictAudits, {
        idempotencyKey: "idem_1",
      });
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
        scopeKey: "tenant:t1:order:ord_456",
        payload: { orderId: "ord_456" },
        metadata: { correlationId: "corr_123" },
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
        metadata: { correlationId: "corr_789" },
      };

      expect(event.category).toBe("domain");
    });

    it("supports optional schemaVersion", () => {
      const event: EventInput = {
        eventId: "evt_123",
        eventType: "OrderCreated",
        payload: {},
        schemaVersion: 2,
        metadata: { correlationId: "corr_789" },
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
        globalPosition: 1703001234567001n,
        boundedContext: "orders",
        scopeKey: "tenant:t1:order:ord_456",
        category: "domain",
        schemaVersion: 1,
        correlationId: "corr_789",
        timestamp: 1703001234567,
        payload: { orderId: "ord_456" },
      };

      expect(storedEvent.eventId).toBe("evt_123");
      expect(storedEvent.streamType).toBe("Order");
      expect(storedEvent.scopeKey).toBe("tenant:t1:order:ord_456");
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
        globalPosition: 1703001234567001n,
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
        globalPosition: 1703001234567001n,
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
            metadata: { correlationId: "corr_456" },
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
        globalPositions: [1703001234567001n],
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
        fromPosition: 1000n,
        limit: 50,
        eventTypes: ["OrderCreated", "OrderSubmitted"],
        boundedContext: "orders",
      };

      expect(args.fromPosition).toBe(1000n);
      expect(args.eventTypes).toContain("OrderCreated");
      expect(args.boundedContext).toBe("orders");
    });

    it("ReadFromPositionResult includes pagination metadata", () => {
      const result: ReadFromPositionResult = {
        events: [
          {
            eventId: "evt_123",
            eventType: "OrderCreated",
            streamType: "Order",
            streamId: "ord_456",
            version: 1,
            globalPosition: 1703001234567001n,
            boundedContext: "orders",
            category: "domain",
            schemaVersion: 1,
            correlationId: "corr_789",
            timestamp: 1703001234567,
            payload: { orderId: "ord_456" },
          },
        ],
        nextPosition: 1703001234567001n,
        hasMore: false,
      };

      expect(result.events).toHaveLength(1);
      expect(result.nextPosition).toBe(1703001234567001n);
      expect(result.hasMore).toBe(false);
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
        limit: 25,
        cursor: 1703001234567001n,
      };

      expect(args.correlationId).toBe("corr_789");
      expect(args.limit).toBe(25);
      expect(args.cursor).toBe(1703001234567001n);
    });

    it("GetByCorrelationResult includes pagination metadata", () => {
      const result: GetByCorrelationResult = {
        events: [
          {
            eventId: "evt_123",
            eventType: "OrderCreated",
            streamType: "Order",
            streamId: "ord_456",
            version: 1,
            globalPosition: 1703001234567001n,
            boundedContext: "orders",
            scopeKey: "tenant:t1:order:ord_456",
            category: "domain",
            schemaVersion: 1,
            correlationId: "corr_789",
            timestamp: 1703001234567,
          },
        ],
        nextCursor: 1703001234567001n,
        hasMore: true,
      };

      expect(result.events).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(1703001234567001n);
    });
  });
});
