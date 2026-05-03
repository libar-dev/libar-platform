/**
 * EventStore Backend Integration Harness
 *
 * Integration tests for the platform-store EventStore component against a real
 * Convex backend. Exercises core store operations:
 * - appendToStream (new stream, versioned append, OCC conflict)
 * - readStream
 * - getStreamVersion
 *
 * Uses the order-management example app's testing API as the test surface,
 * since component functions can't be called directly from test clients.
 *
 * Port: 3215 (infrastructure tests) or 3210 (app tests)
 * Run via: just test-infrastructure-isolated
 */
import { describe, it, expect, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { testRunId, generateStreamId } from "./support/helpers";

/**
 * Type-safe wrapper for ConvexTestingHelper.mutation.
 * Avoids TS2589 with generated API types.
 */
interface TestableConvexHelper {
  mutation(fn: unknown, args: unknown): Promise<unknown>;
  query(fn: unknown, args: unknown): Promise<unknown>;
}

async function testMutation<T>(t: ConvexTestingHelper, fn: unknown, args: unknown): Promise<T> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.mutation(fn, args)) as T;
}

async function testQuery<T>(t: ConvexTestingHelper, fn: unknown, args: unknown): Promise<T> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.query(fn, args)) as T;
}

/**
 * Create a ConvexTestingHelper connected to the backend.
 */
function createTestHelper(): ConvexTestingHelper {
  const backendUrl = process.env.CONVEX_URL;
  if (!backendUrl) {
    throw new Error(
      "CONVEX_URL environment variable must be set. Run tests via: just test-infrastructure-isolated"
    );
  }
  return new ConvexTestingHelper({ backendUrl });
}

function makePayloadOfSize(bytes: number): { blob: string } {
  return { blob: "x".repeat(bytes) };
}

describe("EventStore Backend Integration", () => {
  let t: ConvexTestingHelper;

  afterEach(async () => {
    if (t) {
      try {
        await Promise.race([
          t.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Cleanup timeout")), 5000)),
        ]);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("appends an event to a new stream", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    const result = await testMutation<{
      result:
        | { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "duplicate"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "conflict"; currentVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId, testRunId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    expect(result.result.status).toBe("success");
    if (result.result.status === "success") {
      expect(result.result.newVersion).toBe(1);
      expect(result.result.eventIds).toHaveLength(1);
      expect(result.result.globalPositions).toHaveLength(1);
    }
  });

  it("accepts append payloads below the 64KiB boundary cap", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    const result = await testMutation<{
      result: {
        status: "success";
        eventIds: string[];
        globalPositions: bigint[];
        newVersion: number;
      };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderPayloadAccepted",
      eventData: makePayloadOfSize(60 * 1024),
      boundedContext: "orders",
      expectedVersion: 0,
    });

    expect(result.result.status).toBe("success");
  });

  it("rejects append payloads above the component boundary cap", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    await expect(
      testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
        streamType: "Order",
        streamId,
        eventType: "OrderPayloadRejected",
        eventData: makePayloadOfSize(1024 * 1024),
        boundedContext: "orders",
        expectedVersion: 0,
      })
    ).rejects.toThrow(/PAYLOAD_TOO_LARGE|appendToStream\.events\[0\]\.payload/);
  });

  it("reads events from a stream", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    // Append an event first
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId, testRunId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    // Read the stream
    const events = await testQuery<
      Array<{
        eventId: string;
        eventType: string;
        streamType: string;
        streamId: string;
        version: number;
        globalPosition: bigint;
        boundedContext: string;
        category: string;
        schemaVersion: number;
        correlationId: string;
        timestamp: number;
        payload: unknown;
      }>
    >(t, api.testing.idempotentAppendTest.readTestStream, {
      streamType: "Order",
      streamId,
    });

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("OrderCreated");
    expect(events[0].streamId).toBe(streamId);
    expect(events[0].streamType).toBe("Order");
    expect(events[0].version).toBe(1);
    expect(events[0].boundedContext).toBe("orders");
  });

  it("appends to existing stream with correct expectedVersion", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    // Append first event (version 0 -> 1)
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    // Append second event (version 1 -> 2)
    const result = await testMutation<{
      result:
        | { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "duplicate"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "conflict"; currentVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderSubmitted",
      eventData: { orderId: streamId, submittedAt: Date.now() },
      boundedContext: "orders",
      expectedVersion: 1,
    });

    expect(result.result.status).toBe("success");
    if (result.result.status === "success") {
      expect(result.result.newVersion).toBe(2);
    }
  });

  it("rejects append with wrong expectedVersion (OCC conflict)", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    // Append first event (version 0 -> 1)
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    // Try to append with wrong expectedVersion (0 instead of 1)
    const result = await testMutation<{
      result:
        | { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "duplicate"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "conflict"; currentVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderSubmitted",
      eventData: { orderId: streamId },
      boundedContext: "orders",
      expectedVersion: 0, // Wrong: should be 1
    });

    expect(result.result.status).toBe("conflict");
    if (result.result.status === "conflict") {
      expect(result.result.currentVersion).toBe(1);
    }
  });

  it("gets the current stream version", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    // Append two events
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderSubmitted",
      eventData: { orderId: streamId },
      boundedContext: "orders",
      expectedVersion: 1,
    });

    // Get version
    const version = await testQuery<number>(
      t,
      api.testing.idempotentAppendTest.getTestStreamVersion,
      {
        streamType: "Order",
        streamId,
      }
    );

    expect(version).toBe(2);
  });

  it("returns events, nextPosition, and hasMore from readFromPosition", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");
    const eventType = `ReadFromPosition_${testRunId}_${Date.now()}`;

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType,
      eventData: { orderId: streamId, step: 1 },
      boundedContext: "orders",
      expectedVersion: 0,
    });
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType,
      eventData: { orderId: streamId, step: 2 },
      boundedContext: "orders",
      expectedVersion: 1,
    });
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType,
      eventData: { orderId: streamId, step: 3 },
      boundedContext: "orders",
      expectedVersion: 2,
    });

    const firstPage = await testQuery<{
      events: Array<{ eventType: string; globalPosition: bigint }>;
      nextPosition: bigint;
      hasMore: boolean;
    }>(t, api.testingFunctions.readEventsFromPosition, {
      limit: 2,
      eventTypes: [eventType],
      boundedContext: "orders",
    });

    expect(firstPage.events).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextPosition).toBe(firstPage.events[1]!.globalPosition);

    const secondPage = await testQuery<{
      events: Array<{ eventType: string; globalPosition: bigint }>;
      nextPosition: bigint;
      hasMore: boolean;
    }>(t, api.testingFunctions.readEventsFromPosition, {
      fromPosition: firstPage.nextPosition,
      limit: 2,
      eventTypes: [eventType],
      boundedContext: "orders",
    });

    expect(secondPage.events).toHaveLength(1);
    expect(secondPage.events[0]!.eventType).toBe(eventType);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextPosition).toBe(secondPage.events[0]!.globalPosition);
  });

  it("fills bounded-context pages across sparse interleaved global events", async () => {
    t = createTestHelper();
    const ordersEventType = `SparseOrders_${testRunId}_${Date.now()}`;
    const inventoryEventType = `SparseInventory_${testRunId}_${Date.now()}`;
    const sparseOrdersContext = `orders_sparse_${testRunId}_${Date.now()}`;
    const sparseInventoryContext = `inventory_sparse_${testRunId}_${Date.now()}`;
    const orderStreamA = generateStreamId("Order");
    const orderStreamB = generateStreamId("Order");
    const inventoryStreamA = generateStreamId("Inventory");
    const inventoryStreamB = generateStreamId("Inventory");

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: orderStreamA,
      eventType: ordersEventType,
      eventData: { orderId: orderStreamA, step: 1 },
      boundedContext: sparseOrdersContext,
      expectedVersion: 0,
    });
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "InventoryItem",
      streamId: inventoryStreamA,
      eventType: inventoryEventType,
      eventData: { productId: inventoryStreamA, step: 1 },
      boundedContext: sparseInventoryContext,
      expectedVersion: 0,
    });
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "InventoryItem",
      streamId: inventoryStreamB,
      eventType: inventoryEventType,
      eventData: { productId: inventoryStreamB, step: 2 },
      boundedContext: sparseInventoryContext,
      expectedVersion: 0,
    });
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: orderStreamB,
      eventType: ordersEventType,
      eventData: { orderId: orderStreamB, step: 2 },
      boundedContext: sparseOrdersContext,
      expectedVersion: 0,
    });

    const firstPage = await testQuery<{
      events: Array<{ boundedContext: string; globalPosition: bigint }>;
      nextPosition: bigint;
      hasMore: boolean;
    }>(t, api.testingFunctions.readEventsFromPosition, {
      limit: 1,
      boundedContext: sparseOrdersContext,
    });

    expect(firstPage.events).toHaveLength(1);
    expect(firstPage.events[0]!.boundedContext).toBe(sparseOrdersContext);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await testQuery<{
      events: Array<{ boundedContext: string; globalPosition: bigint }>;
      nextPosition: bigint;
      hasMore: boolean;
    }>(t, api.testingFunctions.readEventsFromPosition, {
      fromPosition: firstPage.nextPosition,
      limit: 1,
      boundedContext: sparseOrdersContext,
    });

    expect(secondPage.events).toHaveLength(1);
    expect(secondPage.events[0]!.boundedContext).toBe(sparseOrdersContext);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.events[0]!.globalPosition).toBeGreaterThan(firstPage.nextPosition);
  });

  it("rejects append requests that omit metadata.correlationId", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    await expect(
      testMutation(t, api.testingFunctions.testComponentAppendToStreamWithProof, {
        streamType: "Order",
        streamId,
        expectedVersion: 0,
        boundedContext: "orders",
        events: [
          {
            eventId: `evt_missing_corr_${testRunId}`,
            eventType: "OrderCreated",
            payload: { orderId: streamId },
          },
        ],
      })
    ).rejects.toThrow(/metadata|correlationId/);
  });

  it("gets events for stream via testingFunctions", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    // Append an event
    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "OrderCreated",
      eventData: { orderId: streamId, testRunId },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    // Read via testingFunctions.getEventsForStream
    const events = await testQuery<
      Array<{
        eventId: string;
        eventType: string;
        streamType: string;
        streamId: string;
        version: number;
        globalPosition: bigint;
        boundedContext: string;
        category: string;
        schemaVersion: number;
        correlationId: string;
        timestamp: number;
        payload: unknown;
      }>
    >(t, api.testingFunctions.getEventsForStream, {
      streamType: "Order",
      streamId,
    });

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("OrderCreated");
    expect(events[0].streamId).toBe(streamId);
  });
});
