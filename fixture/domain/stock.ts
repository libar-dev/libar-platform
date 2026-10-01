// The fixture's stock stream: an on-hand count that a claim may not take below zero.
import type {
  DecideResult,
  Decider,
  DecisionContext,
  DomainEvent,
  Rejection,
} from "../../src/kernel/index.js";
export type StockState = { onHand: number };
export type StockCommand =
  | { commandType: "addStock"; quantity: number }
  | { commandType: "claim"; quantity: number };
export type StockEvent =
  | DomainEvent<"stockAdded", { quantity: number }>
  | DomainEvent<"claimed", { quantity: number }>;
// The quantity the command added or claimed.
export type StockResult = { quantity: number };
export const stockRejectionCodes = {
  // claim of more units than are on hand.
  insufficientStock: "insufficientStock",
  // addStock or claim with a quantity that is not a positive whole number.
  invalidQuantity: "invalidQuantity",
} as const;
const eventSchemaVersion = 1;
function reject(rejection: Rejection): DecideResult<StockEvent, StockResult> {
  return { kind: "rejection", rejection };
}
function decide(
  state: StockState,
  command: StockCommand,
  context: DecisionContext,
): DecideResult<StockEvent, StockResult> {
  const { quantity } = command;
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    return reject({
      code: stockRejectionCodes.invalidQuantity,
      message: `A quantity must be a positive whole number, not ${quantity}`,
      details: { quantity },
    });
  if (command.commandType === "claim" && quantity > state.onHand)
    return reject({
      code: stockRejectionCodes.insufficientStock,
      message: `Cannot claim ${quantity} when ${state.onHand} are on hand`,
      details: { requested: quantity, onHand: state.onHand },
    });
  const eventType = command.commandType === "claim" ? "claimed" : "stockAdded";
  return {
    kind: "applied",
    events: [
      {
        eventType,
        eventSchemaVersion,
        payload: { quantity },
        occurredAt: context.now,
      },
    ],
    result: { quantity },
  };
}
function evolve(state: StockState, event: StockEvent): StockState {
  switch (event.eventType) {
    case "stockAdded":
      return { onHand: state.onHand + event.payload.quantity };
    case "claimed":
      return { onHand: state.onHand - event.payload.quantity };
  }
}
export const stockDecider: Decider<
  StockState,
  StockCommand,
  StockEvent,
  StockResult
> = {
  streamType: "stock",
  initial: () => ({ onHand: 0 }),
  decide,
  evolve,
  invariants: [
    {
      name: "onHandIsAWholeNumberNotBelowZero",
      holds: (state) => Number.isSafeInteger(state.onHand) && state.onHand >= 0,
    },
  ],
};
