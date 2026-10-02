// The audit library: the audit record of a command and the operator audit record of a gate change.
export {
  auditDecisionValidator,
  auditKindValidator,
  auditTables,
  operatorAuditDoc,
  operatorAuditFields,
  operatorAuditKindValidator,
} from "./tables.js";
export type {
  AuditDataModel,
  AuditRecord,
  OperatorAuditRecord,
} from "./tables.js";
export { writeAudit, writeOperatorAudit } from "./write.js";
export type { AuditRecordInput, OperatorAuditInput } from "./write.js";
