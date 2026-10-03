// The parent list over the read model in its active generation.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { authorizeQuery } from "../../src/command/index.js";
import { boundedPage } from "../../src/context/index.js";
import { streamVersionValidator } from "../../src/context/index.js";
import {
  activeGeneration,
  limitReadModelList,
  readModelView,
} from "../../src/read-model/index.js";
import { query } from "./_generated/server.js";
import {
  documentSummary,
  documentSummaryFields,
  documentSummaryStatus,
} from "./summaries.js";
export const readPermission = "depot.read";
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
