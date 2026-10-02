// The Inventory context's journal and the registration of its one stream type, the stock item.
import { v, type Infer } from "convex/values";
import {
  createJournal,
  streamVersionValidator,
  type StreamRegistration,
} from "../../../src/context/index.js";
import {
  stockItemDecider,
  type StockItemCommand,
  type StockItemEvent,
  type StockItemResult,
  type StockItemState,
} from "../../domain/index.js";
export const journal = createJournal({
  contextId: "inventory",
  history: "rebuildable",
});
export const stockItemDtoValidator = v.object({
  stockItemId: v.string(),
  onHand: v.number(),
  allocated: v.number(),
  version: streamVersionValidator,
});
export type StockItemDto = Infer<typeof stockItemDtoValidator>;
export const stockItemStream: StreamRegistration<
  StockItemState,
  StockItemCommand,
  StockItemEvent,
  StockItemResult
> = {
  decider: stockItemDecider,
  // Declared small because the state is two quantities, so that an allocation of the largest order's
  // stock items fits the byte bound of one call.
  mapping: { kind: "single", budgetBytes: 16 * 1024, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: {
    StockReceived: v.object({ quantity: v.number() }),
    StockAllocated: v.object({ orderId: v.string(), quantity: v.number() }),
  },
  dto: stockItemDtoValidator,
  toDto: (state, meta): StockItemDto => ({
    stockItemId: meta.streamId,
    onHand: state.onHand,
    allocated: state.allocated,
    version: {
      tenantId: meta.tenantId,
      contextId: meta.contextId,
      streamType: meta.streamType,
      streamId: meta.streamId,
      version: meta.streamVersion,
    },
  }),
};
