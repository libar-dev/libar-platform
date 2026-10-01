// The parent's tables of spec:command.receipt-table and spec:command.actor-and-scope, as a fragment the
// app's schema.ts spreads into defineSchema. Every index leads with tenantId.
import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type SchemaDefinition,
} from "convex/server";
import { v, type GenericId } from "convex/values";
import {
  affectedRefValidator,
  streamVersionValidator,
} from "../context/outcome.js";
import {
  actorKindValidator,
  callerNamespaceValidator,
  subjectRefValidator,
} from "./actor-and-scope.js";
export const commandTables = {
  // tombstone is always false: tombstones are a later slice's work, and an expired row is deleted.
  receipts: defineTable({
    tenantId: v.string(),
    namespace: callerNamespaceValidator,
    commandType: v.string(),
    requestKey: v.string(),
    fingerprint: v.string(),
    contractVersion: v.number(),
    outcome: v.union(v.literal("applied"), v.literal("businessFailure")),
    operationId: v.string(),
    affected: v.array(affectedRefValidator),
    versions: v.array(streamVersionValidator),
    actorId: v.string(),
    recordedAt: v.number(),
    expiresAt: v.number(),
    tombstone: v.boolean(),
  })
    .index("by_key", ["tenantId", "namespace", "commandType", "requestKey"])
    .index("by_operation", ["tenantId", "operationId"])
    .index("by_tenant_expiry", ["tenantId", "expiresAt"]),
  grants: defineTable({
    tenantId: v.string(),
    principalKind: actorKindValidator,
    principalId: v.string(),
    permission: v.string(),
    subject: v.optional(subjectRefValidator),
    grantedBy: v.string(),
    grantedAt: v.number(),
  })
    .index("by_principal", ["tenantId", "principalKind", "principalId"])
    .index("by_permission", ["tenantId", "permission"]),
};
// The data model the library reads and writes. The app's own data model holds these tables.
export type CommandDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof commandTables, true>
>;
export type MutationCtx = GenericMutationCtx<CommandDataModel>;
export type QueryCtx = GenericQueryCtx<CommandDataModel>;
export type Receipt = DocumentByName<CommandDataModel, "receipts">;
export type Grant = DocumentByName<CommandDataModel, "grants">;
export type GrantId = GenericId<"grants">;
