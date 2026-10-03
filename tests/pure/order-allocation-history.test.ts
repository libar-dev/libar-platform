// The order allocation history's fold gives one row whatever the order in which the events of
// different streams arrive and however they are split between calls
// (spec:application.projection-contract, orderAllocationHistoryFold).
import { expect, test } from "vitest";
import {
  orderAllocationHistoryKeyOf,
  projectOrderAllocationHistory,
  type HistoryEvent,
  type OrderAllocationHistoryFields,
} from "../../example/domain/orderAllocationHistory.js";
import type { EventEnvelope } from "../../src/context/index.js";
// The rules take the envelope the adapter's streams entry and the history query carry.
const fromEnvelope = (event: EventEnvelope): HistoryEvent => event;
const tenantId = "t-1";
function envelope(
  contextId: string,
  streamType: string,
  streamId: string,
  streamVersion: number,
  eventType: string,
  payload: unknown,
  recordedAt: number,
  occurredAt?: number,
): EventEnvelope {
  return {
    eventId: `${streamId}-${streamVersion}`,
    tenantId,
    contextId,
    streamType,
    streamId,
    streamVersion,
    eventType,
    eventSchemaVersion: 1,
    operationId: `op-${recordedAt}`,
    causedBy: { kind: "command", commandType: "Test" },
    actor: { kind: "human", id: "u-1" },
    recordedAt,
    ...(occurredAt === undefined ? {} : { occurredAt }),
    payload,
  };
}
const order = (
  version: number,
  eventType: string,
  payload: unknown,
  at: number,
) =>
  envelope("orders", "order", "o-1", version, eventType, payload, at, at - 1);
const stock = (
  streamId: string,
  version: number,
  eventType: string,
  payload: unknown,
  at: number,
) =>
  envelope("inventory", "stockItem", streamId, version, eventType, payload, at);
// Three streams' histories, each in version order: the order's, and two stock items', one of which
// also allocates to another order and both of which received stock no order names.
const orderStream = [
  order(
    1,
    "OrderPlaced",
    {
      lines: [
        { stockItemId: "s-2", quantity: 1, unitPrice: 5 },
        { stockItemId: "s-1", quantity: 2, unitPrice: 3 },
        { stockItemId: "s-1", quantity: 1, unitPrice: 3 },
      ],
      total: 14,
    },
    101,
  ),
  order(2, "OrderCancelled", {}, 201),
];
const firstStock = [
  stock("s-1", 1, "StockReceived", { quantity: 10 }, 11),
  stock("s-1", 2, "StockAllocated", { orderId: "o-1", quantity: 3 }, 102),
  stock("s-1", 3, "AllocationReleased", { orderId: "o-1", quantity: 3 }, 202),
];
const secondStock = [
  stock("s-2", 1, "StockReceived", { quantity: 5 }, 12),
  stock("s-2", 2, "StockAllocated", { orderId: "o-1", quantity: 1 }, 103),
  stock("s-2", 3, "StockAllocated", { orderId: "o-2", quantity: 2 }, 150),
  stock("s-2", 4, "AllocationReleased", { orderId: "o-1", quantity: 1 }, 203),
];
// What applyHistoryProjection hands project: the events whose key is the order's.
const ofOrder = (events: readonly EventEnvelope[]) =>
  events.filter(
    (event) =>
      orderAllocationHistoryKeyOf(tenantId, fromEnvelope(event)) === "o-1",
  );
const streams = [
  ofOrder(orderStream),
  ofOrder(firstStock),
  ofOrder(secondStock),
];
// Every interleaving of the streams that keeps each stream's events in version order.
function interleavings(
  sequences: readonly (readonly EventEnvelope[])[],
): EventEnvelope[][] {
  if (sequences.every((sequence) => sequence.length === 0)) return [[]];
  const result: EventEnvelope[][] = [];
  sequences.forEach((sequence, index) => {
    const [head, ...rest] = sequence;
    if (head === undefined) return;
    const remaining = sequences.map((other, at) =>
      at === index ? rest : other,
    );
    for (const tail of interleavings(remaining)) result.push([head, ...tail]);
  });
  return result;
}
const expected: OrderAllocationHistoryFields = {
  orderId: "o-1",
  placedAt: 100,
  cancelledAt: 200,
  allocations: [
    { stockItemId: "s-1", quantity: 3, allocatedAt: 102, releasedAt: 202 },
    { stockItemId: "s-2", quantity: 1, allocatedAt: 103, releasedAt: 203 },
  ],
};

test("pure: the order allocation history keys an order's events by its stream, a stock item's allocation events by their order, and every other event to none", () => {
  const [placed] = orderStream;
  const [received, allocated] = firstStock;
  expect(orderAllocationHistoryKeyOf(tenantId, placed!)).toBe("o-1");
  expect(orderAllocationHistoryKeyOf(tenantId, allocated!)).toBe("o-1");
  expect(orderAllocationHistoryKeyOf(tenantId, secondStock[2]!)).toBe("o-2");
  expect(orderAllocationHistoryKeyOf(tenantId, received!)).toBeNull();
  const baseline = stock(
    "s-1",
    4,
    "baseline",
    { state: {}, stateSchemaVersion: 2 },
    300,
  );
  expect(orderAllocationHistoryKeyOf(tenantId, baseline)).toBeNull();
  expect(streams.map((events) => events.length)).toStrictEqual([2, 2, 2]);
});

test("pure: folding one order's events in every interleaving of its three streams, a stock event before OrderPlaced among them, gives one row", () => {
  const orders = interleavings(streams);
  // 6! / (2! 2! 2!) interleavings, of which those that start with a stock event fold an allocation
  // into a row that has no placedAt yet.
  expect(orders).toHaveLength(90);
  expect(
    orders.filter((events) => events[0]?.streamType === "stockItem"),
  ).toHaveLength(60);
  for (const events of orders)
    expect(projectOrderAllocationHistory(tenantId, null, events)).toStrictEqual(
      expected,
    );
});

// Every way to cut a sequence into contiguous calls: one split per subset of the gaps between events.
function splits<T>(events: readonly T[]): T[][][] {
  const gaps = events.length - 1;
  const result: T[][][] = [];
  for (let mask = 0; mask < 2 ** Math.max(gaps, 0); mask += 1) {
    const calls: T[][] = [[]];
    events.forEach((event, at) => {
      calls.at(-1)!.push(event);
      if (at < gaps && (mask >> at) & 1) calls.push([]);
    });
    result.push(calls);
  }
  return result;
}

test("pure: folding one order's events split into contiguous calls in every way gives the same row", () => {
  for (const events of interleavings(streams)) {
    const ways = splits(events);
    // 2 ** 5 ways to cut six events, from one call to one call per event.
    expect(ways).toHaveLength(32);
    for (const calls of ways) {
      expect(calls.flat()).toStrictEqual(events);
      expect(
        calls.reduce<OrderAllocationHistoryFields | null>(
          (row, call) => projectOrderAllocationHistory(tenantId, row, call),
          null,
        ),
      ).toStrictEqual(expected);
    }
  }
});

test("pure: a second StockAllocated from the same stock item replaces that stock item's allocation", () => {
  const reallocated = stock(
    "s-1",
    4,
    "StockAllocated",
    { orderId: "o-1", quantity: 4 },
    300,
  );
  const replaced: OrderAllocationHistoryFields = {
    ...expected,
    allocations: [
      { stockItemId: "s-1", quantity: 4, allocatedAt: 300 },
      expected.allocations[1]!,
    ],
  };
  expect(
    projectOrderAllocationHistory(tenantId, expected, [reallocated]),
  ).toStrictEqual(replaced);
  expect(
    projectOrderAllocationHistory(tenantId, null, [
      ...orderStream,
      ...ofOrder(firstStock),
      reallocated,
      ...ofOrder(secondStock),
    ]),
  ).toStrictEqual(replaced);
});

test("pure: an event the fold does not name, folded into a prior row, changes nothing", () => {
  const unrelated = [
    firstStock[0]!,
    stock("s-1", 4, "baseline", { state: {}, stateSchemaVersion: 2 }, 300),
    order(3, "OrderNoted", { note: "n" }, 301),
    stock("s-3", 2, "AllocationReleased", { orderId: "o-1", quantity: 1 }, 302),
  ];
  for (const event of unrelated)
    expect(
      projectOrderAllocationHistory(tenantId, expected, [event]),
    ).toStrictEqual(expected);
  expect(
    projectOrderAllocationHistory(tenantId, expected, unrelated),
  ).toStrictEqual(expected);
});

test("pure: a cancelled order keeps its row, and a release after the cancel folds into it", () => {
  const [placed, cancelled] = orderStream;
  const [, allocated, released] = firstStock;
  const cancelledRow = projectOrderAllocationHistory(tenantId, null, [
    placed!,
    allocated!,
    cancelled!,
  ]);
  expect(cancelledRow).toStrictEqual({
    orderId: "o-1",
    placedAt: 100,
    cancelledAt: 200,
    allocations: [{ stockItemId: "s-1", quantity: 3, allocatedAt: 102 }],
  });
  expect(
    projectOrderAllocationHistory(tenantId, cancelledRow, [released!]),
  ).toStrictEqual({
    ...cancelledRow,
    allocations: [
      { stockItemId: "s-1", quantity: 3, allocatedAt: 102, releasedAt: 202 },
    ],
  });
});

test("pure: the fold refuses to start a row with no event of an order", () => {
  expect(() =>
    projectOrderAllocationHistory(tenantId, null, [firstStock[0]!]),
  ).toThrow(
    "The order allocation history needs a prior row or an event of an order",
  );
});
