// The parent list over the read model in its active generation.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { authorizeQuery } from "../../src/command/index.js";
import {
  boundedPage,
  streamVersionValidator,
} from "../../src/context/index.js";
import {
  activeGeneration,
  limitReadModelList,
  readModelView,
} from "../../src/read-model/index.js";
import { query } from "./_generated/server.js";
import {
  orderSummary,
  orderSummaryFields,
  orderSummaryStatus,
} from "./orderSummary.js";
export const readOrdersPermission = "orders.read";
const orderSummaryView = v.object({
  tenantId: v.string(),
  key: v.string(),
  projectionVersion: v.number(),
  sourceVersions: v.array(streamVersionValidator),
  ...orderSummaryFields,
});
// A tenant's order summaries of one status, in the order they were placed.
export const listOrderSummaries = query({
  args: {
    tenantId: v.string(),
    status: orderSummaryStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(orderSummaryView),
  handler: async (ctx, { tenantId, status, paginationOpts }) => {
    await authorizeQuery(ctx, {
      name: "listOrderSummaries",
      tenantId,
      permission: readOrdersPermission,
    });
    const generation = await activeGeneration(ctx, orderSummary.name);
    if (generation === undefined)
      throw new Error(
        `The read model ${orderSummary.name} has no active generation`,
      );
    const result = await ctx.db
      .query("orderSummaries")
      .withIndex("by_status", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("generation", generation)
          .eq("status", status),
      )
      .paginate(boundedPage(paginationOpts, limitReadModelList(orderSummary)));
    return { ...result, page: result.page.map(readModelView) };
  },
});
