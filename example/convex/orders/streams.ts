// The Orders context's journal and the registration of its one stream type, the order. The parent
// reads the order's DTO validator from here: a DTO's shape belongs to the context that returns it.
import { v, type Infer } from "convex/values";
import {
  createJournal,
  streamVersionValidator,
  type StreamRegistration,
} from "../../../src/context/index.js";
import {
  orderDecider,
  type OrderCommand,
  type OrderEvent,
  type OrderResult,
  type OrderState,
} from "../../domain/index.js";
export const journal = createJournal({
  contextId: "orders",
  history: "rebuildable",
});
export const orderLineValidator = v.object({
  stockItemId: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
});
export const orderDtoValidator = v.object({
  orderId: v.string(),
  status: v.literal("placed"),
  lines: v.array(orderLineValidator),
  total: v.number(),
  placedAt: v.number(),
  version: streamVersionValidator,
});
export type OrderDto = Infer<typeof orderDtoValidator>;
export const orderStream: StreamRegistration<
  OrderState,
  OrderCommand,
  OrderEvent,
  OrderResult
> = {
  decider: orderDecider,
  // The default budget of a stream row, which holds an order of the largest size.
  mapping: { kind: "single", budgetBytes: 256 * 1024, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: {
    OrderPlaced: v.object({
      lines: v.array(orderLineValidator),
      total: v.number(),
    }),
  },
  dto: orderDtoValidator,
  // A stream row exists only once its order is placed, so an order with no event has no DTO.
  toDto: (state, meta): OrderDto => {
    if (state.status === "none" || state.placedAt === null)
      throw new Error(`Order ${meta.streamId} is not placed and has no DTO`);
    return {
      orderId: meta.streamId,
      status: state.status,
      lines: state.lines,
      total: state.total,
      placedAt: state.placedAt,
      version: {
        tenantId: meta.tenantId,
        contextId: meta.contextId,
        streamType: meta.streamType,
        streamId: meta.streamId,
        version: meta.streamVersion,
      },
    };
  },
};
