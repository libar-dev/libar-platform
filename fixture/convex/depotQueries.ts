// Parent queries that relay the depot's queries for one tenant, so a client reads a context query
// across the component boundary. They name no actor: the subject here is the context side, and a
// composition's parent query authorizes before its component call.
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { v, type Value } from "convex/values";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";
const { document } = components.depot.queries;
export const getDocument = query({
  args: { tenantId: v.string(), documentId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: (ctx, { tenantId, documentId }): Promise<Value | null> =>
    ctx.runQuery(document.get, { tenantId, streamId: documentId }),
});
export const listDocuments = query({
  args: { tenantId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.any()),
  handler: (ctx, args): Promise<PaginationResult<Value>> =>
    ctx.runQuery(document.list, args),
});
