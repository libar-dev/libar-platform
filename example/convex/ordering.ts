// The ordering flow's two use cases, where the two contexts meet. PlaceOrder records the order in
// Orders and then allocates every line in Inventory; CancelOrder cancels the order in Orders and then
// releases its lines in Inventory. Each runs in one mutation with one receipt and one outcome, and
// calls Orders first: PlaceOrder because Orders creates the order, so a second submit of the same
// order is answered entityExists before Inventory decides, and CancelOrder because the order's own
// state refuses a cancel before Inventory decides. A rejection or a throw in Inventory rolls back the
// Orders call with the whole mutation, so neither executor catches anything.
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
export const cancelOrderPermission = "orders.cancel";
// The largest order PlaceOrder accepts: the example's promise, chosen under the adapter's ceilings.
export const maxOrderLines = 100;
const orderSource = { contextId: "orders", streamType: "order" };
const stockItemSource = { contextId: "inventory", streamType: "stockItem" };
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
  writes: [orderSource, stockItemSource],
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
const cancelOrderInput = v.object({ orderId: v.string() });
const quantity = v.object({ stockItemId: v.string(), quantity: v.number() });
const cancelOrderResult = v.object({
  orderId: v.string(),
  released: v.array(quantity),
});
// The input holds no list, so it declares no bounds: the streams it writes are its one order and the
// stock items of that order's lines, which PlaceOrder bounded, and the adapter bounds the order ID.
export const cancelOrderDeclaration: CommandDeclaration<
  Infer<typeof cancelOrderInput>,
  Infer<typeof cancelOrderResult>
> = {
  name: "CancelOrder",
  contractVersion: 1,
  input: cancelOrderInput,
  output: cancelOrderResult,
  permission: { permission: cancelOrderPermission },
  writes: [orderSource, stockItemSource],
  readModels: [{ readModel: orderSummary, source: orderSource }],
  rejections: [
    "orderNotFound",
    "orderAlreadyCancelled",
    "insufficientAllocation",
  ],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const { orderId } = input;
    const cancelled = await ctx.runMutation(
      components.orders.operations.cancel,
      { tenantId, actor, operation, input: { orders: [{ orderId }] } },
    );
    const [order] = cancelled.result.orders;
    if (order === undefined || cancelled.result.orders.length !== 1)
      throw new Error(
        `Orders answered ${cancelled.result.orders.length} orders for one`,
      );
    // The quantities released are the cancelled order's own lines, as Orders returned them in this
    // mutation: the stock item keeps totals only and remembers no order.
    const released = await ctx.runMutation(
      components.inventory.operations.release,
      {
        tenantId,
        actor,
        operation,
        input: {
          orderId,
          lines: order.lines.map(({ stockItemId, quantity }) => ({
            stockItemId,
            quantity,
          })),
        },
      },
    );
    // Neither context records a business failure, and CancelOrder declares none.
    if (cancelled.kind !== "applied" || released.kind !== "applied")
      throw new Error(
        `CancelOrder received a ${cancelled.kind} from Orders and a ${released.kind} from Inventory`,
      );
    return {
      kind: "applied",
      result: { orderId, released: released.result.lines },
      versions: [...cancelled.versions, ...released.versions],
      streams: [...cancelled.streams, ...released.streams],
    };
  },
};
export const cancelOrder = publicCommand(cancelOrderDeclaration);
export const cancelOrderInternal = internalCommand(cancelOrderDeclaration);
