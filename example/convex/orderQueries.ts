// The parent queries over the Orders context: each authorizes its caller for the tenant before it calls
// the context's query with the tenant as its one scope argument.
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { v } from "convex/values";
import { authorizeQuery } from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";
import { orderDtoValidator, type OrderDto } from "./orders/streams.js";
import { readOrdersPermission } from "./readModels.js";
// The context's queries are typed as returning a Value. Their returns validators are built from the
// order's DTO validator, so what they answer has that shape.
const { order } = components.orders.queries;
// One order's DTO, or null when the tenant has no such order.
export const getOrder = query({
  args: { tenantId: v.string(), orderId: v.string() },
  returns: v.union(orderDtoValidator, v.null()),
  handler: async (ctx, { tenantId, orderId }): Promise<OrderDto | null> => {
    await authorizeQuery(ctx, {
      name: "getOrder",
      tenantId,
      permission: readOrdersPermission,
    });
    return (await ctx.runQuery(order.get, {
      tenantId,
      streamId: orderId,
    })) as OrderDto | null;
  },
});
// A tenant's orders in order ID order, a page at a time by the cursor pair.
export const listOrders = query({
  args: { tenantId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(orderDtoValidator),
  handler: async (ctx, args): Promise<PaginationResult<OrderDto>> => {
    await authorizeQuery(ctx, {
      name: "listOrders",
      tenantId: args.tenantId,
      permission: readOrdersPermission,
    });
    return (await ctx.runQuery(order.list, args)) as PaginationResult<OrderDto>;
  },
});
