// ReceiveStock, the command that receives stock: one call to the Inventory context's receive operation,
// which creates a stock item that has no stream and adds to the quantity on hand. Every stock item
// comes to exist through it.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  utf8Length,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
export const receiveStockPermission = "inventory.receive";
// The longest stock item ID the example accepts, in UTF-8 bytes, checked by every command that names
// a stock item: the OrderPlaced of the largest order then fits the journal's payload bound, and no
// stock item is received that an order could never name.
export const maxStockItemIdBytes = 64;
// The first stock item ID longer than the bound, as step 1's refinement answers it.
export function stockItemIdRefusal(ids: readonly string[]) {
  for (const [line, id] of ids.entries()) {
    const length = utf8Length(id);
    if (length > maxStockItemIdBytes)
      return {
        message: `Line ${line} needs a stock item ID of at most ${maxStockItemIdBytes} bytes of UTF-8, not ${length}`,
        details: { line, length, limit: maxStockItemIdBytes },
      };
  }
  return null;
}
const items = v.object({
  items: v.array(v.object({ stockItemId: v.string(), quantity: v.number() })),
});
type Items = Infer<typeof items>;
export const receiveStockDeclaration: CommandDeclaration<Items, Items> = {
  name: "ReceiveStock",
  contractVersion: 1,
  input: items,
  refine: ({ items }) =>
    stockItemIdRefusal(items.map(({ stockItemId }) => stockItemId)),
  output: items,
  permission: { permission: receiveStockPermission },
  writes: [{ contextId: "inventory", streamType: "stockItem" }],
  rejections: ["invalidQuantity", "stockLimitExceeded"],
  bounds: { maxItems: 100 },
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const received = await ctx.runMutation(
      components.inventory.operations.receive,
      { tenantId, actor, operation, input },
    );
    return {
      kind: received.kind,
      result: received.result,
      versions: received.versions,
      streams: received.streams,
    };
  },
};
export const receiveStock = publicCommand(receiveStockDeclaration);
export const receiveStockInternal = internalCommand(receiveStockDeclaration);
