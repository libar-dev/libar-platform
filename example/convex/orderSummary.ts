// The order summary, the essential summary of the Orders and Inventory application: a per-entity read
// model with the order's status, line count, total and the time it was placed, written at the
// pipeline's step 9 from the order's DTO by every command that writes the order.
import { v, type Infer } from "convex/values";
import {
  defaultRowBudgetBytes,
  type ReadModel,
} from "../../src/read-model/index.js";
import type { OrderDto } from "./orders/streams.js";
export const orderSummaryStatus = v.union(
  v.literal("placed"),
  v.literal("cancelled"),
);
// The projected fields, which the table and the list's view both spread.
export const orderSummaryFields = {
  orderId: v.string(),
  status: orderSummaryStatus,
  lineCount: v.number(),
  total: v.number(),
  placedAt: v.number(),
};
type OrderSummaryFields = {
  [Field in keyof typeof orderSummaryFields]: Infer<
    (typeof orderSummaryFields)[Field]
  >;
};
export const orderSummary: ReadModel<OrderDto, OrderSummaryFields> = {
  name: "orderSummary",
  table: "orderSummaries",
  rowBudgetBytes: defaultRowBudgetBytes,
  projection: {
    version: 1,
    keyOf: (_tenantId, order) => order.orderId,
    project: (_tenantId, { orderId, status, lines, total, placedAt }) => ({
      orderId,
      status,
      lineCount: lines.length,
      total,
      placedAt,
    }),
  },
};
