// PlaceOrder, a fixture command whose use case calls two depot operations in order: it creates the
// order as a document under the client-generated order ID at expected version 0, then claims the
// order's stock lines. The creating call comes first, so a second submit of the same order is
// answered entityExists even when the first submit took the last units.
import { v, type Infer } from "convex/values";
import {
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
  rejections: ["titleRequired", "insufficientStock", "invalidQuantity"],
  admission: switchedAdmission("PlaceOrder"),
  bounds: { maxItems: 100 },
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const created = await ctx.runMutation(operations.createDocuments, {
      tenantId,
      actor,
      operation,
      input: { documents: [{ documentId: input.orderId, title: input.title }] },
    });
    const claimed = await ctx.runMutation(operations.claimStock, {
      tenantId,
      actor,
      operation,
      input: { lines: input.lines },
    });
    const versions = [...created.versions, ...claimed.versions];
    await failBeforeReceiptIfSwitched(ctx, tenantId, "PlaceOrder", versions);
    return {
      kind:
        created.kind === "businessFailure" || claimed.kind === "businessFailure"
          ? "businessFailure"
          : "applied",
      result: { orderId: input.orderId, lines: claimed.result.lines },
      versions,
      streams: [...created.streams, ...claimed.streams],
    };
  },
};
export const placeOrder = publicCommand(placeOrderDeclaration);
