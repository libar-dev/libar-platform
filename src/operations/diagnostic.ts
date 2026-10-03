// The diagnostic record of spec:operations.baseline-operations: one bounded line per execution of a
// command entry's handler, written through a sink. emitDiagnostic never throws: an error the sink
// throws is swallowed and counted by one gap line, so no diagnostic failure reaches the mutation.
import type { ActorKind, CallerNamespace } from "../command/actor-and-scope.js";
import type { CausedBy } from "../context/envelope.js";
import { utf8Length } from "../context/text.js";
import type { StreamVersion } from "../kernel/index.js";
// kind is the outcome, written technical for a technical failure, or transient for a transient
// refusal, which is not an outcome, as classifyThrown names those two.
export type DiagnosticRecord = {
  tenantId: string;
  commandType: string;
  namespace: CallerNamespace;
  kind: "applied" | "businessFailure" | "rejection" | "transient" | "technical";
  code?: string;
  replayed: boolean;
  operationId?: string;
  requestKey?: string;
  correlationId?: string;
  actorKind?: ActorKind;
  actorId?: string;
  causedBy?: CausedBy;
  eventsAppended: number;
  readModelRows: number;
  versions: StreamVersion[];
};
export type DiagnosticSink = (line: string) => void;
export const consoleSink: DiagnosticSink = (line) => console.log(line);
// Bytes of UTF-8 per line diagnosticLine or diagnosticGapLine returns.
export const limitDiagnosticBytes = 4096;
const recordPrefix = "diagnostic ";
const gapPrefix = "diagnostic gap ";
// The keys a line holds, in the order of the record's type; versionsOmitted goes just before versions.
const recordKeys = [
  "tenantId",
  "commandType",
  "namespace",
  "kind",
  "code",
  "replayed",
  "operationId",
  "requestKey",
  "correlationId",
  "actorKind",
  "actorId",
  "causedBy",
  "eventsAppended",
  "readModelRows",
] as const;
// kept is undefined for the whole line. A cut line always carries versionsOmitted, 0 when versions
// is empty.
function recordLine(
  record: DiagnosticRecord,
  kept?: number,
): { line: string; bytes: number } {
  const fields: Record<string, unknown> = {};
  for (const key of recordKeys)
    if (record[key] !== undefined) fields[key] = record[key];
  if (kept !== undefined)
    fields.versionsOmitted = record.versions.length - kept;
  fields.versions = record.versions.slice(0, kept);
  const line = recordPrefix + JSON.stringify(fields);
  return { line, bytes: utf8Length(line) };
}
// The longest prefix of whole code points that measures at most the bound.
function cutLine(line: string): string {
  if (utf8Length(line) <= limitDiagnosticBytes) return line;
  let bytes = 0;
  let end = 0;
  for (const point of line) {
    const size = utf8Length(point);
    if (bytes + size > limitDiagnosticBytes) break;
    bytes += size;
    end += point.length;
  }
  return line.slice(0, end);
}
export function diagnosticLine(record: DiagnosticRecord): string {
  const whole = recordLine(record);
  if (whole.bytes <= limitDiagnosticBytes) return whole.line;
  // Keep the longest prefix of versions for which the line, versionsOmitted counted, fits.
  for (let kept = record.versions.length - 1; kept >= 0; kept--) {
    const cut = recordLine(record, kept);
    if (cut.bytes <= limitDiagnosticBytes) return cut.line;
  }
  return cutLine(recordLine(record, 0).line);
}
export function diagnosticGapLine(record: DiagnosticRecord): string {
  const fields: Record<string, unknown> = {
    tenantId: record.tenantId,
    commandType: record.commandType,
    kind: record.kind,
  };
  if (record.operationId !== undefined) fields.operationId = record.operationId;
  return cutLine(gapPrefix + JSON.stringify(fields));
}
// Reads and writes no table. Each error the sink throws, whatever is thrown, is counted by one gap line.
export function emitDiagnostic(
  record: DiagnosticRecord,
  sink: DiagnosticSink = consoleSink,
): void {
  try {
    sink(diagnosticLine(record));
  } catch {
    try {
      console.error(diagnosticGapLine(record));
    } catch {
      // Nothing: a diagnostic failure never reaches the mutation.
    }
  }
}
