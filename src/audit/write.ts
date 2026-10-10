// The two audit writers of spec:operations.baseline-operations. Each inserts one record inside the
// caller's mutation and lets every failure propagate, a validator refusal or a document too large
// among them, so the caller's mutation rolls back: audit fails closed. No catch surrounds either.
import type { GenericDatabaseWriter } from "convex/server";
import type { GenericId } from "convex/values";
import type { Actor, SubjectRef } from "../command/actor-and-scope.js";
import type { CausedBy } from "../context/envelope.js";
import type { AuditDataModel } from "./tables.js";
// The auditRecords document without recordedAt, which writeAudit sets.
export type AuditRecordInput = {
  tenantId: string;
  operationId: string;
  requestKey?: string;
  commandType: string;
  actor: Actor;
  subject: SubjectRef;
  kind: "security" | "business";
  decision: "applied" | "businessFailure";
  causedBy: CausedBy;
};
export type OperatorAuditInput = {
  kind: "gate.close" | "gate.resume";
  scopeKey: string;
  reason: string;
  generationId?: GenericId<"generations">;
  operator: string;
};
export async function writeAudit(
  ctx: { db: GenericDatabaseWriter<AuditDataModel> },
  record: AuditRecordInput,
): Promise<GenericId<"auditRecords">> {
  return ctx.db.insert("auditRecords", { ...record, recordedAt: Date.now() });
}
// Called by the write pause's closeScope and resumeScope and by nothing else.
export async function writeOperatorAudit(
  ctx: { db: GenericDatabaseWriter<AuditDataModel> },
  record: OperatorAuditInput,
): Promise<GenericId<"operatorAudit">> {
  return ctx.db.insert("operatorAudit", { ...record, recordedAt: Date.now() });
}
