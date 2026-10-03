// The maintenance gate: its table, the writer check every command and background batch makes, the two
// gate writers and the four operator entries a composition re-exports from its gate module.
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
