import { afterEach, describe, expect, it } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { generateStreamId } from "./support/helpers";

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

describe("EventStore correctness migration", () => {
  let t: ConvexTestingHelper;

  afterEach(async () => {
    if (t) {
      await t.close();
    }
  });

  it("deduplicates same key plus same payload to the original event", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");
    const idempotencyKey = `payment:${streamId}`;

    const first = await testMutation<{
      result:
        | { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "duplicate"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "conflict"; currentVersion: number }
        | {
            status: "idempotency_conflict";
            existingEventId: string;
            auditId: string;
            currentVersion: number;
          };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "PaymentCompleted",
      eventData: { orderId: streamId, chargeId: "ch-1" },
      boundedContext: "orders",
      expectedVersion: 0,
      idempotencyKey,
    });

    const second = await testMutation<typeof first>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "PaymentCompleted",
      eventData: { orderId: streamId, chargeId: "ch-1" },
      boundedContext: "orders",
      expectedVersion: 0,
      idempotencyKey,
    });

    expect(first.result.status).toBe("success");
    expect(second.result.status).toBe("duplicate");

    if (first.result.status !== "success" || second.result.status !== "duplicate") {
      throw new Error("unexpected append result state in duplicate test");
    }

    expect(second.result.eventIds).toEqual(first.result.eventIds);
    expect(second.result.globalPositions).toEqual(first.result.globalPositions);
    expect(second.result.newVersion).toBe(first.result.newVersion);

    const events = await testQuery<
      Array<{
        eventId: string;
        eventType: string;
        globalPosition: bigint;
        payload: { orderId: string; chargeId: string };
      }>
    >(t, api.testing.idempotentAppendTest.readTestStream, {
      streamType: "Order",
      streamId,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe(first.result.eventIds[0]);
  });

  it("rejects same key plus different payload and records an audit entry", async () => {
    t = createTestHelper();
    const streamId = generateStreamId("Order");
    const idempotencyKey = `payment:${streamId}`;

    const first = await testMutation<{
      result: { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "PaymentCompleted",
      eventData: { orderId: streamId, chargeId: "ch-1" },
      boundedContext: "orders",
      expectedVersion: 0,
      idempotencyKey,
    });

    const second = await testMutation<{
      result:
        | { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "duplicate"; eventIds: string[]; globalPositions: bigint[]; newVersion: number }
        | { status: "conflict"; currentVersion: number }
        | {
            status: "idempotency_conflict";
            existingEventId: string;
            auditId: string;
            currentVersion: number;
          };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId,
      eventType: "PaymentCompleted",
      eventData: { orderId: streamId, chargeId: "ch-2" },
      boundedContext: "orders",
      expectedVersion: 0,
      idempotencyKey,
    });

    expect(second.result.status).toBe("idempotency_conflict");
    if (second.result.status !== "idempotency_conflict") {
      throw new Error("unexpected append result state in conflict test");
    }

    expect(second.result.existingEventId).toBe(first.result.eventIds[0]);

    const audits = await testQuery<
      Array<{
        auditId: string;
        existingEventId: string;
        conflictReason: string;
        incomingPayload: { orderId: string; chargeId: string };
        existingPayload: { orderId: string; chargeId: string };
      }>
    >(t, api.testing.idempotentAppendTest.getConflictAuditsByIdempotencyKey, {
      idempotencyKey,
    });

    expect(audits).toHaveLength(1);
    expect(audits[0]?.existingEventId).toBe(first.result.eventIds[0]);
    expect(audits[0]?.conflictReason).toBe("same_key_different_payload");
    expect(audits[0]?.incomingPayload.chargeId).toBe("ch-2");
    expect(audits[0]?.existingPayload.chargeId).toBe("ch-1");
  });

  it("returns strictly increasing bigint global positions for sequential appends", async () => {
    t = createTestHelper();

    const first = await testMutation<{
      result: { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: generateStreamId("Order"),
      eventType: "OrderCreated",
      eventData: { createdFrom: "first" },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    const second = await testMutation<{
      result: { status: "success"; eventIds: string[]; globalPositions: bigint[]; newVersion: number };
      eventId: string;
    }>(t, api.testing.idempotentAppendTest.appendTestEvent, {
      streamType: "Order",
      streamId: generateStreamId("Order"),
      eventType: "OrderCreated",
      eventData: { createdFrom: "second" },
      boundedContext: "orders",
      expectedVersion: 0,
    });

    expect(second.result.globalPositions[0]).toBeGreaterThan(first.result.globalPositions[0]);
  });
});
