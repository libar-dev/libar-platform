// PlaceOrder, a fixture command whose use case makes one call to the depot's placeOrders operation,
// which creates the order as a document under the client-generated order ID at expected version 0
// and then claims the order's stock lines. The create comes first, so a second submit of the same
// order is answered entityExists even when the first submit took the last units.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { failBeforeReceiptIfSwitched, switchedAdmission } from "./switches.js";
const { operations } = components.depot;
export const orderPermission = "depot.orders";
const stockLine = v.object({ productId: v.string(), quantity: v.number() });
const placeOrderInput = v.object({
  orderId: v.string(),
  title: v.string(),
  lines: v.array(stockLine),
});
const placeOrderResult = v.object({
  orderId: v.string(),
  lines: v.array(stockLine),
});
const placeOrderDeclaration: CommandDeclaration<
  Infer<typeof placeOrderInput>,
  Infer<typeof placeOrderResult>
> = {
  name: "PlaceOrder",
  contractVersion: 1,
  input: placeOrderInput,
  output: placeOrderResult,
  permission: {
    permission: orderPermission,
    subjectFrom: ({ orderId }) => ({
      contextId: "depot",
      streamType: "document",
      streamId: orderId,
    }),
  },
  writes: [
    { contextId: "depot", streamType: "document" },
    { contextId: "depot", streamType: "stock" },
  ],
  rejections: ["titleRequired", "insufficientStock", "invalidQuantity"],
  admission: switchedAdmission("PlaceOrder"),
  bounds: { maxItems: 100 },
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const placed = await ctx.runMutation(operations.placeOrders, {
      tenantId,
      actor,
      operation,
      input: {
        documents: [{ documentId: input.orderId, title: input.title }],
        lines: input.lines,
      },
    });
    await failBeforeReceiptIfSwitched(
      ctx,
      tenantId,
      "PlaceOrder",
      placed.versions,
    );
    return {
      kind: placed.kind,
      result: { orderId: input.orderId, lines: placed.result.lines },
      versions: placed.versions,
      streams: placed.streams,
    };
  },
};
export const placeOrder = publicCommand(placeOrderDeclaration);
export const placeOrderInternal = internalCommand(placeOrderDeclaration);
