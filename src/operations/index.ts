// The operations library: the diagnostic record a command writes beside its outcome.
export {
  consoleSink,
  diagnosticGapLine,
  diagnosticLine,
  emitDiagnostic,
  limitDiagnosticBytes,
} from "./diagnostic.js";
export type { DiagnosticRecord, DiagnosticSink } from "./diagnostic.js";
