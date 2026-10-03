import { afterEach, expect, test, vi } from "vitest";
import {
  consoleSink,
  diagnosticLine,
  diagnosticGapLine,
  emitDiagnostic,
  limitDiagnosticBytes,
  type DiagnosticRecord,
  type DiagnosticSink,
} from "../../src/operations/diagnostic.js";
import * as operations from "../../src/operations/index.js";
import {
  fixtureDiagnosticSink,
  sinkFaultTenant,
  auditFaultOrderId,
} from "../../fixture/convex/orders.js";

afterEach(() => vi.restoreAllMocks());
const record: DiagnosticRecord = {
  tenantId: "tenant-ö",
  commandType: "Command",
  namespace: "worker",
  kind: "applied",
  replayed: false,
  operationId: "operation",
  requestKey: "request",
  correlationId: "correlation",
  actorKind: "service",
  actorId: "actor",
  causedBy: { kind: "command", commandType: "Cause" },
  eventsAppended: 2,
  readModelRows: 1,
  versions: [
    {
      tenantId: "tenant-ö",
      contextId: "context",
      streamType: "stream",
      streamId: "subject",
      version: 102,
    },
  ],
};
const bytes = (line: string) => new TextEncoder().encode(line).length;
// An independent byte oracle. Array.from iterates code points, including supplementary characters.
function prefix(line: string) {
  let result = "";
  for (const point of line) {
    if (bytes(result + point) > 4096) break;
    result += point;
  }
  return result;
}
test("pure: the diagnostic module exports the pinned API and 4096 byte bound", () => {
  expect(limitDiagnosticBytes).toBe(4096);
  expect(operations.consoleSink).toBe(consoleSink);
  expect(operations.diagnosticLine).toBe(diagnosticLine);
  expect(operations.diagnosticGapLine).toBe(diagnosticGapLine);
  expect(operations.emitDiagnostic).toBe(emitDiagnostic);
  expect(operations.limitDiagnosticBytes).toBe(4096);
  const sink: operations.DiagnosticSink = consoleSink;
  const typed: operations.DiagnosticRecord = record;
  expect(sink).toBe(consoleSink);
  expect(typed).toBe(record);
});
test("pure: diagnosticLine orders only declared keys, omits absent fields and never adds duration", () => {
  const full: DiagnosticRecord = {
    ...record,
    kind: "rejection",
    code: "forbidden",
  };
  const shuffled = Object.fromEntries(
    Object.entries(full).reverse(),
  ) as DiagnosticRecord;
  Object.assign(shuffled, { duration: 123, durationMs: 456, extra: "secret" });
  const ordered = {
    tenantId: record.tenantId,
    commandType: record.commandType,
    namespace: record.namespace,
    kind: "rejection",
    code: "forbidden",
    replayed: false,
    operationId: record.operationId,
    requestKey: record.requestKey,
    correlationId: record.correlationId,
    actorKind: record.actorKind,
    actorId: record.actorId,
    causedBy: record.causedBy,
    eventsAppended: 2,
    readModelRows: 1,
    versions: record.versions,
  };
  expect(diagnosticLine(shuffled)).toBe(
    `diagnostic ${JSON.stringify(ordered)}`,
  );
  const minimal: DiagnosticRecord = {
    tenantId: "t",
    commandType: "C",
    namespace: "public",
    kind: "technical",
    replayed: false,
    eventsAppended: 0,
    readModelRows: 0,
    versions: [],
  };
  expect(diagnosticLine(minimal)).toBe(`diagnostic ${JSON.stringify(minimal)}`);
});
test("pure: a line at 4096 bytes is retained and one byte above cuts versions with omission overhead", () => {
  const base = { ...record, versions: [] };
  const padding = 4096 - bytes(`diagnostic ${JSON.stringify(base)}`);
  const exact = { ...base, tenantId: base.tenantId + "a".repeat(padding) };
  expect(bytes(diagnosticLine(exact))).toBe(4096);
  expect(diagnosticLine(exact)).toBe(`diagnostic ${JSON.stringify(exact)}`);
  const larger = { ...exact, tenantId: exact.tenantId + "a" };
  const { versions, ...fields } = larger;
  expect(diagnosticLine(larger)).toBe(
    prefix(
      `diagnostic ${JSON.stringify({ ...fields, versionsOmitted: 0, versions })}`,
    ),
  );
});
test("pure: versions are cut to the longest fitting prefix with versionsOmitted immediately before versions", () => {
  const versions = Array.from({ length: 110 }, (_, i) => ({
    ...record.versions[0]!,
    streamId: `subject-${i}-🦊`,
    version: 100 + i,
  }));
  const input = { ...record, versions };
  const { versions: all, ...fields } = input;
  const candidate = (kept: number) =>
    `diagnostic ${JSON.stringify({ ...fields, versionsOmitted: all.length - kept, versions: all.slice(0, kept) })}`;
  const fitting = Array.from(
    { length: all.length + 1 },
    (_, kept) => kept,
  ).filter((kept) => bytes(candidate(kept)) <= 4096);
  const kept = fitting.at(-1)!;
  expect(kept).toBeGreaterThan(0);
  expect(kept).toBeLessThan(all.length);
  expect(diagnosticLine(input)).toBe(candidate(kept));
  expect(bytes(candidate(kept + 1))).toBeGreaterThan(4096);
});
test("pure: an oversized record is never dropped and the final cut preserves whole code points", () => {
  const input = { ...record, tenantId: "a🦊é".repeat(1600) };
  const { versions, ...fields } = input;
  const whole = `diagnostic ${JSON.stringify({ ...fields, versionsOmitted: versions.length, versions: [] })}`;
  const line = diagnosticLine(input);
  expect(line).toBe(prefix(whole));
  expect(bytes(line)).toBeLessThanOrEqual(4096);
  expect(
    bytes(line + Array.from(whole.slice(line.length))[0]!),
  ).toBeGreaterThan(4096);
  expect(line).not.toContain("�");
});
test("pure: diagnosticGapLine includes only its ordered identifiers with optional operationId and the same byte cut", () => {
  expect(diagnosticGapLine(record)).toBe(
    'diagnostic gap {"tenantId":"tenant-ö","commandType":"Command","kind":"applied","operationId":"operation"}',
  );
  const without = { ...record };
  delete without.operationId;
  expect(diagnosticGapLine(without)).toBe(
    'diagnostic gap {"tenantId":"tenant-ö","commandType":"Command","kind":"applied"}',
  );
  const huge = { ...record, tenantId: "🦊é".repeat(2000) };
  const whole = `diagnostic gap ${JSON.stringify({ tenantId: huge.tenantId, commandType: huge.commandType, kind: huge.kind, operationId: huge.operationId })}`;
  expect(diagnosticGapLine(huge)).toBe(prefix(whole));
});
test("pure: a working sink receives one line, with no second log or gap; the default is consoleSink", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const sink: DiagnosticSink = vi.fn();
  expect(emitDiagnostic(record, sink)).toBeUndefined();
  expect(sink).toHaveBeenCalledExactlyOnceWith(diagnosticLine(record));
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(emitDiagnostic(record)).toBeUndefined();
  expect(log).toHaveBeenCalledExactlyOnceWith(diagnosticLine(record));
  expect(error).not.toHaveBeenCalled();
});
for (const thrown of [
  new Error("sink broke"),
  "string",
  null,
  undefined,
  { broken: true },
]) {
  test(`pure: emitDiagnostic swallows ${String(thrown)} and writes one gap, even if console.error throws`, () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sink = vi.fn(() => {
      throw thrown;
    });
    expect(emitDiagnostic(record, sink)).toBeUndefined();
    expect(sink).toHaveBeenCalledExactlyOnceWith(diagnosticLine(record));
    expect(error).toHaveBeenCalledExactlyOnceWith(diagnosticGapLine(record));
    expect(log).not.toHaveBeenCalled();
    error.mockClear().mockImplementation(() => {
      throw new Error("gap sink broke");
    });
    sink.mockClear();
    expect(emitDiagnostic(record, sink)).toBeUndefined();
    expect(sink).toHaveBeenCalledExactlyOnceWith(diagnosticLine(record));
    expect(error).toHaveBeenCalledExactlyOnceWith(diagnosticGapLine(record));
    expect(log).not.toHaveBeenCalled();
  });
}
test("pure: the fixture sink faults only for the pinned tenant and otherwise uses consoleSink", () => {
  expect(auditFaultOrderId).toBe("order-audit-fault");
  expect(sinkFaultTenant).toBe("tenant-sink-fault");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const bad = diagnosticLine({ ...record, tenantId: sinkFaultTenant });
  expect(() => fixtureDiagnosticSink(bad)).toThrow(
    /^Fault injected: the diagnostic sink is broken$/,
  );
  expect(log).not.toHaveBeenCalled();
  const good = diagnosticLine({
    ...record,
    tenantId: `${sinkFaultTenant}-other`,
  });
  fixtureDiagnosticSink(good);
  expect(log).toHaveBeenCalledExactlyOnceWith(good);
});
