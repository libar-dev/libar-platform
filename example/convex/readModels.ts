// The parent list over the order summary in its active generation. A read model is installed through its
// first rebuild, in rebuild.ts.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { paginator } from "convex-helpers/server/pagination";
import { authorizeQuery } from "../../src/command/index.js";
import {
  boundedPage,
  streamVersionValidator,
} from "../../src/context/index.js";
import {
  activeGeneration,
  limitReadModelList,
  pageInGeneration,
  readModelView,
} from "../../src/read-model/index.js";
import { query } from "./_generated/server.js";
import schema from "./schema.js";
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
// The fields of the list's index, which tell a cursor that carries a document's system fields.
const byStatusFields = schema.tables.orderSummaries[" indexes"]().find(
  (index) => index.indexDescriptor === "by_status",
)!.fields.length;
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
    const result = await paginator(ctx.db, schema)
      .query("orderSummaries")
      .withIndex("by_status", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("generation", generation)
          .eq("status", status),
      )
      .paginate(
        boundedPage(
          pageInGeneration(
            paginationOpts,
            [tenantId, generation, status],
            byStatusFields,
          ),
          limitReadModelList(orderSummary),
        ),
      );
    return { ...result, page: result.page.map(readModelView) };
  },
});
