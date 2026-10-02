// Parent queries that relay the depot's queries for one tenant, so a client reads a context query
// across the component boundary. Each authorizes its caller for the tenant before it calls the
// context's query with the tenant as its one scope argument.
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { v, type Value } from "convex/values";
import { authorizeQuery } from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";
import { readPermission } from "./readModels.js";
const { document } = components.depot.queries;
export const getDocument = query({
  args: { tenantId: v.string(), documentId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { tenantId, documentId }): Promise<Value | null> => {
    await authorizeQuery(ctx, {
      name: "getDocument",
      tenantId,
      permission: readPermission,
    });
    return ctx.runQuery(document.get, { tenantId, streamId: documentId });
  },
});
export const listDocuments = query({
  args: { tenantId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.any()),
  handler: async (ctx, args): Promise<PaginationResult<Value>> => {
    await authorizeQuery(ctx, {
      name: "listDocuments",
      tenantId: args.tenantId,
      permission: readPermission,
    });
    return ctx.runQuery(document.list, args);
  },
});
