// The maintenance gate: its table, the writer check every command and background batch makes, the two
// gate writers and the four operator entries a composition re-exports from its gate module.
/**
 * @sdpAnchor component:platform.gate
 * @sdpLabel the maintenance gate: its table, the writer check, the two writers and the operator entries
 * @sdpReferences spec:application.write-pause
 * @sdpUses component:platform.command, component:platform.context, component:platform.audit, component:platform.read-model
 * @sdpLayer infrastructure
 * @sdpContext platform
 */
export {
  closeGate,
  getGate,
  getGateAudit,
  limitOperatorQuery,
  resumeGate,
} from "./entries.js";
export {
  assertWritable,
  closeScope,
  gateAllows,
  limitClosedScopes,
  limitGateReasonBytes,
  restoreDoorClosed,
  resumeScope,
  scopesOfUseCase,
  sourceScope,
  tenantScope,
} from "./gate.js";
export type { GateAnswer, ScopeKey } from "./gate.js";
export { closedEntryValidator, gateTables } from "./tables.js";
export type {
  ClosedEntry,
  GateChangeDataModel,
  GateDataModel,
  GateDocument,
} from "./tables.js";
