// The Inventory context's stock item stream: the quantity on hand and the quantity allocated to
// orders. The quantity available is the first less the second, and an allocation never passes it.
import type {
  DecideResult,
  Decider,
  DecisionContext,
  DomainEvent,
  Rejection,
} from "../../src/kernel/index.js";
export type StockItemState = { onHand: number; allocated: number };
export type StockItemCommand =
  | { commandType: "receive"; quantity: number }
  | { commandType: "allocate"; orderId: string; quantity: number };
export type StockItemEvent =
  | DomainEvent<"StockReceived", { quantity: number }>
  | DomainEvent<"StockAllocated", { orderId: string; quantity: number }>;
// The quantity the command received or allocated.
export type StockItemResult = { quantity: number };
export const stockItemRejectionCodes = {
  // allocate of more than the quantity available.
  insufficientStock: "insufficientStock",
  // receive or allocate with a quantity that is not a positive whole number.
  invalidQuantity: "invalidQuantity",
  // receive that would take the quantity on hand past the largest safe whole number.
  stockLimitExceeded: "stockLimitExceeded",
} as const;
// What invalidQuantity refuses is a quantity for which this is false.
export const isQuantity = (quantity: number) =>
  Number.isSafeInteger(quantity) && quantity >= 1;
export const available = (state: StockItemState) =>
  state.onHand - state.allocated;
const eventSchemaVersion = 1;
function reject(
  rejection: Rejection,
): DecideResult<StockItemEvent, StockItemResult> {
  return { kind: "rejection", rejection };
}
// A stock item with no stream decides against initial(), so an allocation of one is short of stock.
function decide(
  state: StockItemState,
  command: StockItemCommand,
  context: DecisionContext,
): DecideResult<StockItemEvent, StockItemResult> {
  const { quantity } = command;
  if (!isQuantity(quantity))
    return reject({
      code: stockItemRejectionCodes.invalidQuantity,
      message: `A quantity must be a positive whole number, not ${quantity}`,
      details: { quantity },
    });
  if (command.commandType === "allocate") {
    if (quantity > available(state))
      return reject({
        code: stockItemRejectionCodes.insufficientStock,
        message: `Cannot allocate ${quantity} when ${available(state)} are available`,
        details: { requested: quantity, available: available(state) },
      });
    return {
      kind: "applied",
      events: [
        {
          eventType: "StockAllocated",
          eventSchemaVersion,
          payload: { orderId: command.orderId, quantity },
          occurredAt: context.now,
        },
      ],
      result: { quantity },
    };
  }
  if (!Number.isSafeInteger(state.onHand + quantity))
    return reject({
      code: stockItemRejectionCodes.stockLimitExceeded,
      message: `Cannot receive ${quantity} on top of the ${state.onHand} on hand`,
      details: { quantity, onHand: state.onHand },
    });
  return {
    kind: "applied",
    events: [
      {
        eventType: "StockReceived",
        eventSchemaVersion,
        payload: { quantity },
        occurredAt: context.now,
      },
    ],
    result: { quantity },
  };
}
function evolve(state: StockItemState, event: StockItemEvent): StockItemState {
  switch (event.eventType) {
    case "StockReceived":
      return { ...state, onHand: state.onHand + event.payload.quantity };
    case "StockAllocated":
      return { ...state, allocated: state.allocated + event.payload.quantity };
  }
}
export const stockItemDecider: Decider<
  StockItemState,
  StockItemCommand,
  StockItemEvent,
  StockItemResult
> = {
  streamType: "stockItem",
  initial: () => ({ onHand: 0, allocated: 0 }),
  decide,
  evolve,
  invariants: [
    {
      name: "allocatedIsAWholeNumberBetweenZeroAndOnHand",
      holds: (state) =>
        Number.isSafeInteger(state.onHand) &&
        Number.isSafeInteger(state.allocated) &&
        state.allocated >= 0 &&
        state.allocated <= state.onHand,
    },
  ],
};
