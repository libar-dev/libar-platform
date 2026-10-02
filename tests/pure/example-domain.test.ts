import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { validate } from "convex-helpers/validators";
import { expect, test } from "vitest";
import {
  checkInvariants,
  fold,
  rebuild,
  type DecideResult,
  type DecisionContext,
  type DomainEvent,
} from "../../src/kernel/index.js";
import {
  orderDecider,
  orderTotal,
  stockItemDecider,
  type OrderEvent,
  type OrderLine,
  type OrderState,
  type StockItemCommand,
  type StockItemEvent,
  type StockItemState,
} from "../../example/domain/index.js";
import {
  orderDtoValidator,
  orderStream,
} from "../../example/convex/orders/streams.js";
import { orderSummary } from "../../example/convex/orderSummary.js";
import type { StreamMeta } from "../../src/context/index.js";
// Binds the production composition under example/ to the Spec of its domain. The composition is
// bundled into a deployment, so it carries no Protocol import itself; this test carries its anchor.
const anchor = codeAnchor({
  id: codeAnchorId("impl:application.orders-inventory-example"),
  label:
    "the order and stock item deciders, the Orders and Inventory contexts, PlaceOrder, CancelOrder, ReceiveStock and the order summary",
  satisfies: ref("spec:application.orders-inventory-example"),
});
void anchor;
const context: DecisionContext = {
  now: Date.UTC(2026, 9, 1, 12),
  actor: { kind: "human", id: "example-user" },
  facts: {},
};
function applied<E extends DomainEvent, R>(decision: DecideResult<E, R>) {
  if (decision.kind !== "applied")
    throw new Error(`Expected applied, got ${decision.kind}`);
  return decision;
}
function rejection<E extends DomainEvent, R>(decision: DecideResult<E, R>) {
  if (decision.kind !== "rejection")
    throw new Error(`Expected a rejection, got ${decision.kind}`);
  return decision.rejection;
}
const lines: OrderLine[] = [
  { stockItemId: "sku-1", quantity: 2, unitPrice: 150 },
  { stockItemId: "sku-2", quantity: 1, unitPrice: 0 },
  { stockItemId: "sku-1", quantity: 3, unitPrice: 99 },
];
const place = (orderLines: OrderLine[] = lines) =>
  orderDecider.decide(
    orderDecider.initial(),
    { commandType: "place", lines: orderLines },
    context,
  );
const placed = (): OrderState =>
  fold(orderDecider.evolve, orderDecider.initial(), applied(place()).events);

test("pure: an order is placed with one OrderPlaced event whose total is quantity times unit price over its lines", () => {
  expect(place()).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "OrderPlaced",
        eventSchemaVersion: 1,
        payload: { lines, total: 597 },
        occurredAt: context.now,
      },
    ],
    result: { lineCount: 3, total: 597 },
  });
  expect(orderTotal(lines)).toBe(2 * 150 + 0 + 3 * 99);
  expect(placed()).toStrictEqual({
    status: "placed",
    lines,
    total: 597,
    placedAt: context.now,
  });
  expect(checkInvariants(orderDecider.invariants ?? [], placed())).toEqual([]);
});

test("pure: an order is placed once", () => {
  expect(
    rejection(
      orderDecider.decide(placed(), { commandType: "place", lines }, context),
    ),
  ).toStrictEqual({
    code: "orderAlreadyPlaced",
    message: "The order is already placed",
  });
});

const cancelCommand = { commandType: "cancel" } as const;
const later: DecisionContext = { ...context, now: context.now + 60000 };
const cancelled = (): OrderState =>
  fold(
    orderDecider.evolve,
    placed(),
    applied(orderDecider.decide(placed(), cancelCommand, later)).events,
  );

test("pure: a placed order is cancelled with one OrderCancelled event, and keeps its lines, total and time", () => {
  expect(orderDecider.decide(placed(), cancelCommand, later)).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "OrderCancelled",
        eventSchemaVersion: 1,
        payload: {},
        occurredAt: later.now,
      },
    ],
    result: { lineCount: 3, total: 597 },
  });
  expect(cancelled()).toStrictEqual({
    status: "cancelled",
    lines,
    total: 597,
    placedAt: context.now,
  });
  expect(checkInvariants(orderDecider.invariants ?? [], cancelled())).toEqual(
    [],
  );
});

test("pure: a cancel of an order with no event is refused orderNotFound, and a second cancel orderAlreadyCancelled", () => {
  expect(
    rejection(
      orderDecider.decide(orderDecider.initial(), cancelCommand, context),
    ),
  ).toStrictEqual({
    code: "orderNotFound",
    message: "The order does not exist",
  });
  expect(
    rejection(orderDecider.decide(cancelled(), cancelCommand, later)),
  ).toStrictEqual({
    code: "orderAlreadyCancelled",
    message: "The order is already cancelled",
  });
  // A cancelled order is still one that was placed.
  expect(
    rejection(
      orderDecider.decide(cancelled(), { commandType: "place", lines }, later),
    ),
  ).toMatchObject({ code: "orderAlreadyPlaced" });
});

test("pure: an order rebuilt from OrderPlaced and OrderCancelled equals the state the two decisions folded", () => {
  const events: OrderEvent[] = [];
  let state = orderDecider.initial();
  for (const [command, at] of [
    [{ commandType: "place", lines }, context],
    [cancelCommand, later],
  ] as const) {
    const decision = applied(orderDecider.decide(state, command, at));
    state = fold(orderDecider.evolve, state, decision.events);
    events.push(...decision.events);
  }
  expect(events.map((event) => event.eventType)).toEqual([
    "OrderPlaced",
    "OrderCancelled",
  ]);
  // Written out, not folded: the status the cancel sets and what the order keeps.
  const expected: OrderState = {
    status: "cancelled",
    lines,
    total: 597,
    placedAt: context.now,
  };
  expect(state).toStrictEqual(expected);
  expect(rebuild(orderDecider, events)).toStrictEqual(expected);
});

test.each([
  ["a quantity of zero", { quantity: 0, unitPrice: 1 }],
  ["a fractional quantity", { quantity: 1.5, unitPrice: 1 }],
  ["a negative unit price", { quantity: 1, unitPrice: -1 }],
  ["a fractional unit price", { quantity: 1, unitPrice: 0.5 }],
])("pure: an order line with %s is refused invalidQuantity", (_, line) => {
  const orderLines = [
    { stockItemId: "sku-1", quantity: 1, unitPrice: 1 },
    { stockItemId: "sku-2", ...line },
  ];
  expect(rejection(place(orderLines))).toStrictEqual({
    code: "invalidQuantity",
    message:
      "Line 1 needs a quantity of at least 1 and a unit price of at least 0, each a whole number",
    details: { line: 1, stockItemId: "sku-2", ...line },
  });
});

test("pure: an order whose total passes the largest safe whole number is refused invalidQuantity", () => {
  const big = Number.MAX_SAFE_INTEGER;
  expect(
    rejection(
      place([
        { stockItemId: "sku-1", quantity: 1, unitPrice: big },
        { stockItemId: "sku-2", quantity: 1, unitPrice: 1 },
      ]),
    ),
  ).toMatchObject({ code: "invalidQuantity", details: { total: big + 1 } });
});

test("pure: the order invariant holds for no order, a placed order and a cancelled one, and fails for one with no line, no time or a wrong total", () => {
  const invariants = orderDecider.invariants ?? [];
  const name = "aPlacedOrderHasALineATimeAndItsTotal";
  expect(checkInvariants(invariants, orderDecider.initial())).toEqual([]);
  expect(checkInvariants(invariants, { ...placed(), lines: [] })).toEqual([
    name,
  ]);
  expect(checkInvariants(invariants, { ...placed(), placedAt: null })).toEqual([
    name,
  ]);
  expect(checkInvariants(invariants, { ...placed(), total: 596 })).toEqual([
    name,
  ]);
  expect(checkInvariants(invariants, cancelled())).toEqual([]);
  expect(
    checkInvariants(invariants, { ...cancelled(), lines: [], total: 0 }),
  ).toEqual([name]);
  // An empty order reaches the invariant only if nothing before the decider refused it.
  const empty = applied(place([]));
  expect(
    checkInvariants(
      invariants,
      fold(orderDecider.evolve, orderDecider.initial(), empty.events),
    ),
  ).toEqual([name]);
});

const meta = (streamId: string): StreamMeta => ({
  tenantId: "t-1",
  contextId: "orders",
  streamType: "order",
  streamId,
  streamVersion: 1,
  stateSchemaVersion: 1,
});

test("pure: a placed order's DTO carries its lines, total, time and stream version, and an order with no event has none", () => {
  expect(orderStream.toDto(placed(), meta("order-1"))).toStrictEqual({
    orderId: "order-1",
    status: "placed",
    lines,
    total: 597,
    placedAt: context.now,
    version: {
      tenantId: "t-1",
      contextId: "orders",
      streamType: "order",
      streamId: "order-1",
      version: 1,
    },
  });
  expect(() =>
    orderStream.toDto(orderDecider.initial(), meta("order-2")),
  ).toThrow("Order order-2 is not placed and has no DTO");
  const cancelledDto = orderStream.toDto(cancelled(), {
    ...meta("order-1"),
    streamVersion: 2,
  });
  // The DTO's validator, which the context's queries and operations return through, admits both.
  expect(validate(orderDtoValidator, cancelledDto)).toBe(true);
  expect(
    validate(orderDtoValidator, orderStream.toDto(placed(), meta("order-1"))),
  ).toBe(true);
  expect(cancelledDto).toMatchObject({
    orderId: "order-1",
    status: "cancelled",
    lines,
    total: 597,
    placedAt: context.now,
    version: { streamId: "order-1", version: 2 },
  });
});

test("pure: the order summary projects the order's DTO to its status, line count, total and time, keyed by the order ID", () => {
  const dto = orderStream.toDto(placed(), meta("order-1")) as Parameters<
    typeof orderSummary.projection.project
  >[1];
  const { projection } = orderSummary;
  expect(projection.keyOf("t-1", dto)).toBe("order-1");
  const row = projection.project("t-1", dto, [dto.version]);
  expect(row).toStrictEqual({
    orderId: "order-1",
    status: "placed",
    lineCount: 3,
    total: 597,
    placedAt: context.now,
  });
  // Deterministic: the same DTO gives the same row.
  expect(projection.project("t-1", dto, [dto.version])).toStrictEqual(row);
  // A cancelled order's DTO gives the same row with the status cancelled.
  const cancelledDto = orderStream.toDto(cancelled(), {
    ...meta("order-1"),
    streamVersion: 2,
  }) as typeof dto;
  expect(
    projection.project("t-1", cancelledDto, [cancelledDto.version]),
  ).toStrictEqual({ ...row, status: "cancelled" });
  expect(orderSummary).toMatchObject({
    name: "orderSummary",
    table: "orderSummaries",
    rowBudgetBytes: 16384,
    projection: { version: 1 },
  });
});

const receive = (quantity: number): StockItemCommand => ({
  commandType: "receive",
  quantity,
});
const allocate = (quantity: number): StockItemCommand => ({
  commandType: "allocate",
  orderId: "order-1",
  quantity,
});
const release = (quantity: number): StockItemCommand => ({
  commandType: "release",
  orderId: "order-1",
  quantity,
});
function stockAfter(commands: readonly StockItemCommand[]): StockItemState {
  let state = stockItemDecider.initial();
  for (const command of commands)
    state = fold(
      stockItemDecider.evolve,
      state,
      applied(stockItemDecider.decide(state, command, context)).events,
    );
  return state;
}

test("pure: receive adds to the quantity on hand with one StockReceived event, and allocate adds to the quantity allocated with one StockAllocated event", () => {
  expect(
    stockItemDecider.decide(stockItemDecider.initial(), receive(5), context),
  ).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "StockReceived",
        eventSchemaVersion: 1,
        payload: { quantity: 5 },
        occurredAt: context.now,
      },
    ],
    result: { quantity: 5 },
  });
  expect(
    stockItemDecider.decide({ onHand: 5, allocated: 0 }, allocate(5), context),
  ).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "StockAllocated",
        eventSchemaVersion: 1,
        payload: { orderId: "order-1", quantity: 5 },
        occurredAt: context.now,
      },
    ],
    result: { quantity: 5 },
  });
  expect(
    stockAfter([receive(5), allocate(2), receive(3), allocate(4)]),
  ).toEqual({ onHand: 8, allocated: 6 });
});

test("pure: an allocation above the quantity available is refused insufficientStock with the requested and the available quantity, and a stock item with no stream has none available", () => {
  const state = stockAfter([receive(5), allocate(2)]);
  expect(
    rejection(stockItemDecider.decide(state, allocate(4), context)),
  ).toEqual({
    code: "insufficientStock",
    message: "Cannot allocate 4 when 3 are available",
    details: { requested: 4, available: 3 },
  });
  expect(
    rejection(
      stockItemDecider.decide(stockItemDecider.initial(), allocate(1), context),
    ),
  ).toMatchObject({
    code: "insufficientStock",
    details: { requested: 1, available: 0 },
  });
});

test("pure: release subtracts from the quantity allocated with one AllocationReleased event and leaves the quantity on hand", () => {
  expect(
    stockItemDecider.decide({ onHand: 5, allocated: 3 }, release(3), context),
  ).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "AllocationReleased",
        eventSchemaVersion: 1,
        payload: { orderId: "order-1", quantity: 3 },
        occurredAt: context.now,
      },
    ],
    result: { quantity: 3 },
  });
  // The totals are back to what they were before the allocation.
  expect(stockAfter([receive(5), allocate(3), release(3)])).toEqual(
    stockAfter([receive(5)]),
  );
  expect(
    stockAfter([receive(5), allocate(3), allocate(1), release(3)]),
  ).toEqual({ onHand: 5, allocated: 1 });
});

test("pure: a release above the quantity allocated is refused insufficientAllocation with the requested and the allocated quantity", () => {
  const state = stockAfter([receive(5), allocate(2)]);
  expect(
    rejection(stockItemDecider.decide(state, release(3), context)),
  ).toStrictEqual({
    code: "insufficientAllocation",
    message: "Cannot release 3 when 2 are allocated",
    details: { requested: 3, allocated: 2 },
  });
  // A release of exactly the quantity allocated is applied.
  expect(stockItemDecider.decide(state, release(2), context).kind).toBe(
    "applied",
  );
  expect(
    rejection(
      stockItemDecider.decide(stockItemDecider.initial(), release(1), context),
    ),
  ).toMatchObject({
    code: "insufficientAllocation",
    details: { requested: 1, allocated: 0 },
  });
});

test("pure: a stock item rebuilt from its received, allocated and released events equals the state the decisions folded", () => {
  const events: StockItemEvent[] = [];
  let state = stockItemDecider.initial();
  for (const command of [receive(5), allocate(3), receive(2), release(3)]) {
    const decision = applied(stockItemDecider.decide(state, command, context));
    state = fold(stockItemDecider.evolve, state, decision.events);
    events.push(...decision.events);
  }
  expect(events.map((event) => event.eventType)).toEqual([
    "StockReceived",
    "StockAllocated",
    "StockReceived",
    "AllocationReleased",
  ]);
  expect(state).toEqual({ onHand: 7, allocated: 0 });
  expect(rebuild(stockItemDecider, events)).toStrictEqual(state);
});

test.each([0, -1, 1.5])(
  "pure: receive, allocate and release refuse a quantity of %s as invalidQuantity",
  (quantity) => {
    const state = stockAfter([receive(5), allocate(5)]);
    for (const command of [
      receive(quantity),
      allocate(quantity),
      release(quantity),
    ])
      expect(
        rejection(stockItemDecider.decide(state, command, context)),
      ).toEqual({
        code: "invalidQuantity",
        message: `A quantity must be a positive whole number, not ${quantity}`,
        details: { quantity },
      });
  },
);

test("pure: a receive that would take the quantity on hand past the largest safe whole number is refused stockLimitExceeded", () => {
  const state = { onHand: Number.MAX_SAFE_INTEGER, allocated: 0 };
  expect(
    rejection(stockItemDecider.decide(state, receive(1), context)),
  ).toEqual({
    code: "stockLimitExceeded",
    message: `Cannot receive 1 on top of the ${Number.MAX_SAFE_INTEGER} on hand`,
    details: { quantity: 1, onHand: Number.MAX_SAFE_INTEGER },
  });
});

test("pure: the stock item invariant holds while the quantity allocated is a whole number between zero and the quantity on hand", () => {
  const invariants = stockItemDecider.invariants ?? [];
  const name = "allocatedIsAWholeNumberBetweenZeroAndOnHand";
  expect(
    checkInvariants(invariants, stockAfter([receive(5), allocate(5)])),
  ).toEqual([]);
  for (const state of [
    { onHand: 1, allocated: 2 },
    { onHand: 1, allocated: -1 },
    { onHand: 1.5, allocated: 0 },
    { onHand: 2, allocated: 0.5 },
  ])
    expect(checkInvariants(invariants, state)).toEqual([name]);
});
