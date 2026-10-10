// The parent list over the document summary in its active generation. A read model is installed through its
// first rebuild, in rebuild.ts.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { paginator } from "convex-helpers/server/pagination";
import { authorizeQuery } from "../../src/command/index.js";
import { boundedPage } from "../../src/context/index.js";
import { streamVersionValidator } from "../../src/context/index.js";
import {
  activeGeneration,
  limitReadModelList,
  pageInGeneration,
  readModelView,
} from "../../src/read-model/index.js";
import { query } from "./_generated/server.js";
import schema from "./schema.js";
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
// The fields of the list's index, which tell a cursor that carries a document's system fields.
const byStatusFields = schema.tables.documentSummaries[" indexes"]().find(
  (index) => index.indexDescriptor === "by_status",
)!.fields.length;
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
    const result = await paginator(ctx.db, schema)
      .query("documentSummaries")
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
          limitReadModelList(documentSummary),
        ),
      );
    return { ...result, page: result.page.map(readModelView) };
  },
});
