// ReceiveStock, the command that receives stock: one call to the Inventory context's receive operation,
// which creates a stock item that has no stream and adds to the quantity on hand. Every stock item
// comes to exist through it.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
export const receiveStockPermission = "inventory.receive";
const items = v.object({
  items: v.array(v.object({ stockItemId: v.string(), quantity: v.number() })),
});
type Items = Infer<typeof items>;
export const receiveStockDeclaration: CommandDeclaration<Items, Items> = {
  name: "ReceiveStock",
  contractVersion: 1,
  input: items,
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
