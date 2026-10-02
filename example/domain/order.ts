// The Orders context's order stream: an order is placed once with its lines, its total is the sum of
// quantity times unit price over its lines, and a placed order is cancelled once.
import type {
  DecideResult,
  Decider,
  DecisionContext,
  DomainEvent,
  Rejection,
} from "../../src/kernel/index.js";
// unitPrice is in whole minor units, as the caller states it.
export type OrderLine = {
  stockItemId: string;
  quantity: number;
  unitPrice: number;
};
// none is a stream with no events yet, the status initial() returns. placedAt is the time the
// OrderPlaced event records, null before it. A cancelled order keeps its lines, total and placedAt.
export type OrderStatus = "none" | "placed" | "cancelled";
export type OrderState = {
  status: OrderStatus;
  lines: OrderLine[];
  total: number;
  placedAt: number | null;
};
export type OrderCommand =
  { commandType: "place"; lines: OrderLine[] } | { commandType: "cancel" };
export type OrderEvent =
  | DomainEvent<"OrderPlaced", { lines: OrderLine[]; total: number }>
  | DomainEvent<"OrderCancelled", Record<string, never>>;
// The line count and total of the order placed or cancelled.
export type OrderResult = { lineCount: number; total: number };
export const orderRejectionCodes = {
  // place with a quantity that is not a positive whole number, a unit price that is not a whole number
  // of at least zero, or lines whose total passes the largest safe whole number.
  invalidQuantity: "invalidQuantity",
  // place on an order that is already placed.
  orderAlreadyPlaced: "orderAlreadyPlaced",
  // cancel of an order with no event.
  orderNotFound: "orderNotFound",
  // cancel of an order that is already cancelled.
  orderAlreadyCancelled: "orderAlreadyCancelled",
} as const;
const isQuantity = (quantity: number) =>
  Number.isSafeInteger(quantity) && quantity >= 1;
const isUnitPrice = (unitPrice: number) =>
  Number.isSafeInteger(unitPrice) && unitPrice >= 0;
// The sum of quantity times unit price over the lines.
export const orderTotal = (lines: readonly OrderLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
const eventSchemaVersion = 1;
function reject(rejection: Rejection): DecideResult<OrderEvent, OrderResult> {
  return { kind: "rejection", rejection };
}
// A placed order records OrderCancelled; the order's own state refuses an order that has no event and
// one already cancelled, so a second cancel never reaches another context.
function cancel(
  state: OrderState,
  context: DecisionContext,
): DecideResult<OrderEvent, OrderResult> {
  if (state.status === "none")
    return reject({
      code: orderRejectionCodes.orderNotFound,
      message: "The order does not exist",
    });
  if (state.status === "cancelled")
    return reject({
      code: orderRejectionCodes.orderAlreadyCancelled,
      message: "The order is already cancelled",
    });
  return {
    kind: "applied",
    events: [
      {
        eventType: "OrderCancelled",
        eventSchemaVersion,
        payload: {},
        occurredAt: context.now,
      },
    ],
    result: { lineCount: state.lines.length, total: state.total },
  };
}
function decide(
  state: OrderState,
  command: OrderCommand,
  context: DecisionContext,
): DecideResult<OrderEvent, OrderResult> {
  if (command.commandType === "cancel") return cancel(state, context);
  if (state.status !== "none")
    return reject({
      code: orderRejectionCodes.orderAlreadyPlaced,
      message: "The order is already placed",
    });
  const { lines } = command;
  const invalid = lines.findIndex(
    (line) => !isQuantity(line.quantity) || !isUnitPrice(line.unitPrice),
  );
  if (invalid !== -1) {
    const { stockItemId, quantity, unitPrice } = lines[invalid] as OrderLine;
    return reject({
      code: orderRejectionCodes.invalidQuantity,
      message: `Line ${invalid} needs a quantity of at least 1 and a unit price of at least 0, each a whole number`,
      details: { line: invalid, stockItemId, quantity, unitPrice },
    });
  }
  const total = orderTotal(lines);
  if (!Number.isSafeInteger(total))
    return reject({
      code: orderRejectionCodes.invalidQuantity,
      message: "The order's total passes the largest safe whole number",
      details: { total },
    });
  return {
    kind: "applied",
    events: [
      {
        eventType: "OrderPlaced",
        eventSchemaVersion,
        payload: { lines, total },
        occurredAt: context.now,
      },
    ],
    result: { lineCount: lines.length, total },
  };
}
function evolve(state: OrderState, event: OrderEvent): OrderState {
  switch (event.eventType) {
    case "OrderPlaced":
      return {
        status: "placed",
        lines: event.payload.lines,
        total: event.payload.total,
        placedAt: event.occurredAt ?? null,
      };
    case "OrderCancelled":
      return { ...state, status: "cancelled" };
  }
}
export const orderDecider: Decider<
  OrderState,
  OrderCommand,
  OrderEvent,
  OrderResult
> = {
  streamType: "order",
  initial: () => ({ status: "none", lines: [], total: 0, placedAt: null }),
  decide,
  evolve,
  invariants: [
    {
      // An order with no line is refused before it reaches the decider, as invalid input. A cancelled
      // order was placed and keeps what it was placed with.
      name: "aPlacedOrderHasALineATimeAndItsTotal",
      holds: (state) =>
        state.status === "none" ||
        (state.lines.length >= 1 &&
          state.placedAt !== null &&
          state.total === orderTotal(state.lines)),
    },
  ],
};
