// The Inventory context's sanctioned operations. Each takes a list, so a parent use case makes one call.
import { v, type Infer, type ObjectType } from "convex/values";
import {
  defineOperation,
  planned,
  type StreamResult,
} from "../../../src/context/index.js";
import {
  isQuantity,
  type StockItemCommand,
  type StockItemResult,
} from "../../domain/index.js";
import { journal, stockItemStream } from "./streams.js";
// The largest order's distinct stock items.
const maxStreams = 100;
const quantities = v.array(
  v.object({ stockItemId: v.string(), quantity: v.number() }),
);
type Quantity = { stockItemId: string; quantity: number };
// Quantities of one stock item become one command on its stream, in the order stock items first
// appear. Each quantity is checked before the sum: one the decider would refuse is planned alone, so
// the call is refused with the decider's invalidQuantity, and the decider checks each sum again.
function byStockItem(items: readonly Quantity[]): Quantity[] {
  const invalid = items.find(({ quantity }) => !isQuantity(quantity));
  if (invalid !== undefined) return [invalid];
  const totals = new Map<string, number>();
  for (const { stockItemId, quantity } of items)
    totals.set(stockItemId, (totals.get(stockItemId) ?? 0) + quantity);
  return [...totals].map(([stockItemId, quantity]) => ({
    stockItemId,
    quantity,
  }));
}
const plans = (
  items: readonly Quantity[],
  command: (quantity: number) => StockItemCommand,
) =>
  byStockItem(items).map(({ stockItemId, quantity }) =>
    planned(stockItemStream, stockItemId, command(quantity)),
  );
const quantitiesOf = (results: readonly StreamResult<unknown>[]) =>
  results.map((result) => ({
    stockItemId: result.version.streamId,
    quantity: (result.result as StockItemResult).quantity,
  }));
const receiveInput = { items: quantities };
const receiveResult = v.object({ items: quantities });
// Creates the stream of a stock item that has none and adds the quantity to the quantity on hand: the
// only way a stock item comes to exist.
export const receive = defineOperation<
  ObjectType<typeof receiveInput>,
  Infer<typeof receiveResult>
>(journal, {
  name: "receive",
  streams: [stockItemStream],
  input: receiveInput,
  returns: receiveResult,
  plan: ({ items }) =>
    plans(items, (quantity) => ({ commandType: "receive", quantity })),
  combine: (results) => ({ items: quantitiesOf(results) }),
  maxStreams,
});
const allocateInput = { orderId: v.string(), lines: quantities };
const allocateResult = v.object({ lines: quantities });
// Allocates each stock item's summed quantity to the order.
export const allocate = defineOperation<
  ObjectType<typeof allocateInput>,
  Infer<typeof allocateResult>
>(journal, {
  name: "allocate",
  streams: [stockItemStream],
  input: allocateInput,
  returns: allocateResult,
  plan: ({ orderId, lines }) =>
    plans(lines, (quantity) => ({
      commandType: "allocate",
      orderId,
      quantity,
    })),
  combine: (results) => ({ lines: quantitiesOf(results) }),
  maxStreams,
});
