// The compiled shapes of the audit record input and of the gate's operator entries
// (spec:operations.baseline-operations, spec:application.write-pause).
import type {
  FunctionArgs,
  FunctionReturnType,
  WithoutSystemFields,
} from "convex/server";
import { expectTypeOf, test } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import type {
  AuditRecord,
  AuditRecordInput,
  OperatorAuditInput,
  OperatorAuditRecord,
} from "../../src/audit/index.js";
import type { ClosedEntry } from "../../src/gate/index.js";

test("AuditRecordInput is the auditRecords document without recordedAt", () => {
  expectTypeOf<AuditRecordInput>().toEqualTypeOf<
    Omit<WithoutSystemFields<AuditRecord>, "recordedAt">
  >();
  expectTypeOf<OperatorAuditInput>().toEqualTypeOf<
    Omit<WithoutSystemFields<OperatorAuditRecord>, "recordedAt">
  >();
});

test("the operator entries take and return what the write pause pins", () => {
  expectTypeOf<FunctionArgs<typeof internal.gate.closeGate>>().toEqualTypeOf<{
    scopeKey: string;
    reason: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof internal.gate.closeGate>
  >().toEqualTypeOf<null>();
  expectTypeOf<FunctionArgs<typeof internal.gate.resumeGate>>().toEqualTypeOf<{
    scopeKey: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof internal.gate.resumeGate>
  >().toEqualTypeOf<null>();
  // getGate takes no argument: its args validator is the empty object.
  expectTypeOf<keyof FunctionArgs<typeof internal.gate.getGate>>().toBeNever();
  expectTypeOf<
    FunctionReturnType<typeof internal.gate.getGate>
  >().toEqualTypeOf<{ restore: boolean; closed: ClosedEntry[] }>();
  expectTypeOf<
    FunctionReturnType<typeof internal.gate.getGateAudit>["page"][number]
  >().toEqualTypeOf<OperatorAuditRecord>();
});
