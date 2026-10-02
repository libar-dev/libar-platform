// PlaceOrder, the use case that makes the two contexts meet: it records the order in Orders and then
// allocates every line in Inventory, in one mutation with one receipt and one outcome. Orders comes
// first because it creates the order, so a second submit of the same order is answered entityExists
// before Inventory decides. A rejection or a throw in Inventory rolls back the Orders call with the
// whole mutation, so the executor catches nothing.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { orderSummary } from "./orderSummary.js";
import { orderLineValidator } from "./orders/streams.js";
export const placeOrderPermission = "orders.place";
// The largest order PlaceOrder accepts, provisional for measurement.
export const maxOrderLines = 100;
const orderSource = { contextId: "orders", streamType: "order" };
const placeOrderInput = v.object({
  orderId: v.string(),
  lines: v.array(orderLineValidator),
});
const placeOrderResult = v.object({
  orderId: v.string(),
  lineCount: v.number(),
  total: v.number(),
});
export const placeOrderDeclaration: CommandDeclaration<
  Infer<typeof placeOrderInput>,
  Infer<typeof placeOrderResult>
> = {
  name: "PlaceOrder",
  contractVersion: 1,
  input: placeOrderInput,
  refine: ({ lines }) =>
    lines.length === 0 ? { message: "An order needs at least one line" } : null,
  output: placeOrderResult,
  permission: { permission: placeOrderPermission },
  writes: [orderSource, { contextId: "inventory", streamType: "stockItem" }],
  readModels: [{ readModel: orderSummary, source: orderSource }],
  rejections: ["insufficientStock", "invalidQuantity"],
  bounds: { maxItems: maxOrderLines },
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const { orderId, lines } = input;
    const placed = await ctx.runMutation(components.orders.operations.place, {
      tenantId,
      actor,
      operation,
      input: { orders: [{ orderId, lines }] },
    });
    const allocated = await ctx.runMutation(
      components.inventory.operations.allocate,
      {
        tenantId,
        actor,
        operation,
        input: {
          orderId,
          lines: lines.map(({ stockItemId, quantity }) => ({
            stockItemId,
            quantity,
          })),
        },
      },
    );
    // Neither context records a business failure, and PlaceOrder declares none.
    if (placed.kind !== "applied" || allocated.kind !== "applied")
      throw new Error(
        `PlaceOrder received a ${placed.kind} from Orders and a ${allocated.kind} from Inventory`,
      );
    const [order] = placed.result.orders;
    if (order === undefined || placed.result.orders.length !== 1)
      throw new Error(
        `Orders answered ${placed.result.orders.length} orders for one`,
      );
    return {
      kind: "applied",
      result: order,
      versions: [...placed.versions, ...allocated.versions],
      streams: [...placed.streams, ...allocated.streams],
    };
  },
};
export const placeOrder = publicCommand(placeOrderDeclaration);
export const placeOrderInternal = internalCommand(placeOrderDeclaration);
