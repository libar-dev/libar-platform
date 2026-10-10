// The audit tables of spec:operations.baseline-operations, as a fragment the app's schema.ts spreads
// into defineSchema: the audit record a command's step 10 writes, and the operator audit record of a
// gate change. auditRecords leads every index with the tenant; operatorAudit is operational data of
// the deployment, so its index leads with the scope.
import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
  type SchemaDefinition,
} from "convex/server";
import { v } from "convex/values";
import {
  actorValidator,
  subjectRefValidator,
} from "../command/actor-and-scope.js";
import { causedByValidator } from "../context/envelope.js";
export const auditKindValidator = v.union(
  v.literal("security"),
  v.literal("business"),
);
export const auditDecisionValidator = v.union(
  v.literal("applied"),
  v.literal("businessFailure"),
);
export const operatorAuditKindValidator = v.union(
  v.literal("gate.close"),
  v.literal("gate.resume"),
);
export const operatorAuditFields = {
  kind: operatorAuditKindValidator,
  scopeKey: v.string(),
  reason: v.string(),
  generationId: v.optional(v.id("generations")),
  operator: v.string(),
  recordedAt: v.number(),
};
export const auditTables = {
  auditRecords: defineTable({
    tenantId: v.string(),
    operationId: v.string(),
    requestKey: v.optional(v.string()),
    commandType: v.string(),
    actor: actorValidator,
    subject: subjectRefValidator,
    kind: auditKindValidator,
    decision: auditDecisionValidator,
    causedBy: causedByValidator,
    recordedAt: v.number(),
  })
    .index("by_operation", ["tenantId", "operationId"])
    .index("by_subject", [
      "tenantId",
      "subject.contextId",
      "subject.streamType",
      "subject.streamId",
      "recordedAt",
    ])
    .index("by_request_key", ["tenantId", "requestKey"]),
  operatorAudit: defineTable(operatorAuditFields).index("by_scope", [
    "scopeKey",
    "recordedAt",
  ]),
};
// The operatorAudit table's document validator with its system fields, the item of getGateAudit's page.
export const operatorAuditDoc = v.object({
  _id: v.id("operatorAudit"),
  _creationTime: v.number(),
  ...operatorAuditFields,
});
export type AuditDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof auditTables, true>
>;
export type AuditRecord = DocumentByName<AuditDataModel, "auditRecords">;
export type OperatorAuditRecord = DocumentByName<
  AuditDataModel,
  "operatorAudit"
>;
