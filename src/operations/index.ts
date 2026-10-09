// The operations library: the diagnostic record a command writes beside its outcome.
/**
 * @sdpAnchor component:platform.operations
 * @sdpLabel the operations library: the diagnostic record a command writes
 * @sdpReferences spec:operations.baseline-operations
 * @sdpUses component:platform.kernel, component:platform.context, component:platform.command
 * @sdpLayer infrastructure
 * @sdpContext platform
 */
export {
  consoleSink,
  diagnosticGapLine,
  diagnosticLine,
  emitDiagnostic,
  limitDiagnosticBytes,
} from "./diagnostic.js";
export type { DiagnosticRecord, DiagnosticSink } from "./diagnostic.js";
