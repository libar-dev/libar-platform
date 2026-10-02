// The production composition's read-model functions: the first activation an operator runs with admin
// access, and the parent list over the order summary in its active generation.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { actorValidator, authorizeQuery } from "../../src/command/index.js";
import {
  boundedPage,
  streamVersionValidator,
} from "../../src/context/index.js";
import {
  activateFirstGeneration,
  activeGeneration,
  limitReadModelList,
  readModelView,
  type AnyReadModel,
} from "../../src/read-model/index.js";
import { internalMutation, query } from "./_generated/server.js";
import {
  orderSummary,
  orderSummaryFields,
  orderSummaryStatus,
} from "./orderSummary.js";
export const readOrdersPermission = "orders.read";
const readModels: readonly AnyReadModel[] = [orderSummary];
// Run once for each read model, before the first command that writes it.
export const activate = internalMutation({
  args: { readModel: v.string(), startedBy: actorValidator },
  returns: v.number(),
  handler: async (ctx, { readModel, startedBy }) => {
    const declared = readModels.find(({ name }) => name === readModel);
    if (declared === undefined)
      throw new Error(`This deployment declares no read model ${readModel}`);
    return activateFirstGeneration(ctx, declared, startedBy);
  },
});
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
