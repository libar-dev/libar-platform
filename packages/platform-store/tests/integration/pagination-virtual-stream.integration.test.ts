import { afterEach, describe, expect, it } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";

import { api } from "../../../../examples/order-management/convex/_generated/api";
import { generateCorrelationId, generateStreamId } from "./support/helpers";

declare const process: {
  env: Record<string, string | undefined>;
};

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

function createTestHelper(): ConvexTestingHelper {
  const backendUrl = process.env.CONVEX_URL;
  if (!backendUrl) {
    throw new Error(
      "CONVEX_URL environment variable must be set. Run tests via: just test-infrastructure-isolated"
    );
  }

  return new ConvexTestingHelper({ backendUrl });
}

describe("EventStore pagination and virtual streams", () => {
  let t: ConvexTestingHelper;

  afterEach(async () => {
    if (t) {
      await t.close();
    }
  });

  it("paginates correlation reads with a bounded cursor", async () => {
    t = createTestHelper();
    const correlationId = generateCorrelationId();
    const streamIds = Array.from({ length: 3 }, () => generateStreamId("Order"));

    for (const [index, streamId] of streamIds.entries()) {
      await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
        streamType: "Order",
        streamId,
        eventType: "OrderCreated",
        eventData: { orderId: streamId, index },
        boundedContext: "orders",
        expectedVersion: 0,
        correlationId,
      });
    }

    const firstPage = await testQuery<{
      events: Array<{ eventId: string; globalPosition: bigint }>;
      nextCursor: bigint | null;
      hasMore: boolean;
    }>(t, api.testingFunctions.getEventsByCorrelation, {
      correlationId,
      limit: 2,
    });

    expect(firstPage.events).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await testQuery<typeof firstPage>(
      t,
      api.testingFunctions.getEventsByCorrelation,
      {
        correlationId,
        limit: 2,
        cursor: firstPage.nextCursor ?? undefined,
      }
    );

    expect(secondPage.events).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects append batches larger than 100 events", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");

    const result = await testMutation<{
      success: boolean;
      error?: string;
    }>(t, api.testingFunctions.testComponentAppendToStreamWithProof, {
      streamType: "Order",
      streamId,
      expectedVersion: 0,
      boundedContext: "orders",
      events: Array.from({ length: 101 }, (_, index) => ({
        eventId: `evt_batch_${index}`,
        eventType: "OrderCreated",
        payload: { orderId: streamId, index },
        metadata: { correlationId: `corr_batch_${index}` },
      })),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at most 100 events per batch/);
  });

  it("reads virtual streams from denormalized scopeKey and legacy backfill", async () => {
    t = createTestHelper();
    const scopeKey = `tenant:test:reservation:${generateStreamId("scope")}`;
    const otherScopeKey = `tenant:test:reservation:${generateStreamId("other_scope")}`;
    const streamId = generateStreamId("Reservation");
    const foreignStreamId = generateStreamId("Order");

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Reservation",
      streamId,
      eventType: "ReservationCreated",
      eventData: { reservationId: streamId, stage: "legacy" },
      boundedContext: "inventory",
      expectedVersion: 0,
    });

    await testMutation(t, api.testingFunctions.commitTestScope, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [streamId],
    });

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: foreignStreamId,
      eventType: "OrderCreated",
      eventData: { orderId: foreignStreamId, stage: "foreign" },
      boundedContext: "orders",
      tenantId: "test",
      expectedVersion: 0,
    });

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Reservation",
      streamId,
      eventType: "ReservationConfirmed",
      scopeKey,
      eventData: { reservationId: streamId, stage: "denormalized" },
      boundedContext: "inventory",
      expectedVersion: 1,
    });

    await testMutation(t, api.testingFunctions.commitTestScope, {
      scopeKey: otherScopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [streamId],
    });

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Reservation",
      streamId,
      eventType: "ReservationAdjusted",
      scopeKey: otherScopeKey,
      eventData: { reservationId: streamId, stage: "other-scope" },
      boundedContext: "inventory",
      expectedVersion: 2,
    });

    const events = await testQuery<
      Array<{
        eventType: string;
        scopeKey?: string;
        globalPosition: bigint;
        payload: { stage: string };
      }>
    >(t, api.testingFunctions.readEventsForScope, {
      scopeKey,
      limit: 10,
    });

    const latestPosition = await testQuery<bigint>(t, api.testingFunctions.getScopeLatestPosition, {
      scopeKey,
    });

    expect(events.map((event) => event.eventType)).toEqual([
      "ReservationCreated",
      "ReservationConfirmed",
    ]);
    expect(events[0]?.scopeKey).toBeUndefined();
    expect(events[1]?.scopeKey).toBe(scopeKey);
    expect(events[0]?.payload.stage).toBe("legacy");
    expect(events[1]?.payload.stage).toBe("denormalized");
    expect(events.map((event) => event.payload.stage)).not.toContain("foreign");
    expect(events.map((event) => event.payload.stage)).not.toContain("other-scope");
    expect(latestPosition).toBe(events[1]?.globalPosition);
  });

  it("does not expose foreign legacy events from caller-provided scope streamIds", async () => {
    t = createTestHelper();
    const scopeKey = `tenant:test:reservation:${generateStreamId("scope_guarded")}`;
    const foreignStreamId = generateStreamId("Order");

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: foreignStreamId,
      eventType: "OrderCreated",
      eventData: { orderId: foreignStreamId, stage: "foreign-associated" },
      boundedContext: "orders",
      tenantId: "foreign-tenant",
      expectedVersion: 0,
    });

    await expect(
      testMutation(t, api.testingFunctions.commitTestScope, {
        scopeKey,
        expectedVersion: 0,
        boundedContext: "inventory",
        streamIds: [foreignStreamId],
      })
    ).rejects.toThrow(/Cannot associate legacy stream .* bounded context orders/i);

    const scope = await testQuery<null | { scopeKey: string }>(
      t,
      api.testingFunctions.getScopeByKey,
      {
        scopeKey,
      }
    );
    expect(scope).toBeNull();
  });

  it("reports latest position for scoped events without legacy streamIds", async () => {
    t = createTestHelper();
    const scopeKey = `tenant:test:reservation:${generateStreamId("scope_no_legacy")}`;
    const streamId = generateStreamId("Reservation");

    await testMutation(t, api.testingFunctions.commitTestScope, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
    });

    await testMutation(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Reservation",
      streamId,
      eventType: "ReservationConfirmed",
      scopeKey,
      eventData: { reservationId: streamId, stage: "scoped-only" },
      boundedContext: "inventory",
      expectedVersion: 0,
    });

    const events = await testQuery<Array<{ globalPosition: bigint; payload: { stage: string } }>>(
      t,
      api.testingFunctions.readEventsForScope,
      {
        scopeKey,
        limit: 10,
      }
    );

    const latestPosition = await testQuery<bigint>(t, api.testingFunctions.getScopeLatestPosition, {
      scopeKey,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.payload.stage).toBe("scoped-only");
    expect(latestPosition).toBe(events[0]?.globalPosition);
  });
});
