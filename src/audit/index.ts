// The audit library: the audit record of a command and the operator audit record of a gate change.
/**
 * @sdpAnchor component:platform.audit
 * @sdpLabel the audit library: the audit record of a command and of a gate change
 * @sdpReferences spec:operations.baseline-operations
 * @sdpUses component:platform.command, component:platform.context
 * @sdpLayer infrastructure
 * @sdpContext platform
 */
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
