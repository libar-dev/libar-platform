// The fixture composition's read-model functions: the first activation an operator runs with admin
// access, and the parent list over the document summary in its active generation.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { actorValidator, authorizeQuery } from "../../src/command/index.js";
import { boundedPage } from "../../src/context/index.js";
import { streamVersionValidator } from "../../src/context/index.js";
import {
  activateFirstGeneration,
  activeGeneration,
  limitReadModelList,
  readModelView,
  type AnyReadModel,
} from "../../src/read-model/index.js";
import { internalMutation, query } from "./_generated/server.js";
import {
  documentSummary,
  documentSummaryFields,
  documentSummaryStatus,
} from "./summaries.js";
export const readPermission = "depot.read";
const readModels: readonly AnyReadModel[] = [documentSummary];
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
const documentSummaryView = v.object({
  tenantId: v.string(),
  key: v.string(),
  projectionVersion: v.number(),
  sourceVersions: v.array(streamVersionValidator),
  ...documentSummaryFields,
});
// A tenant's document summaries of one status, in document ID order.
export const listDocumentSummaries = query({
  args: {
    tenantId: v.string(),
    status: documentSummaryStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(documentSummaryView),
  handler: async (ctx, { tenantId, status, paginationOpts }) => {
    await authorizeQuery(ctx, {
      name: "listDocumentSummaries",
      tenantId,
      permission: readPermission,
    });
    const generation = await activeGeneration(ctx, documentSummary.name);
    if (generation === undefined)
      throw new Error(
        `The read model ${documentSummary.name} has no active generation`,
      );
    const result = await ctx.db
      .query("documentSummaries")
      .withIndex("by_status", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("generation", generation)
          .eq("status", status),
      )
      .paginate(
        boundedPage(paginationOpts, limitReadModelList(documentSummary)),
      );
    return { ...result, page: result.page.map(readModelView) };
  },
});
