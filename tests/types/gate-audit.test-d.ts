import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  FunctionArgs,
  FunctionReturnType,
  FunctionReference,
  paginationOptsValidator,
  PaginationResult,
  SchemaDefinition,
} from "convex/server";
import type { GenericId, Infer } from "convex/values";
import { expectTypeOf, test } from "vitest";
import { internal as fixtureInternal } from "../../fixture/convex/_generated/api.js";
import { internal as exampleInternal } from "../../example/convex/_generated/api.js";
import {
  auditTables,
  type AuditRecordInput,
  type OperatorAuditInput,
} from "../../src/audit/index.js";
import {
  operatorValidator,
  type Actor,
  type SubjectRef,
  type CommandDeclaration,
} from "../../src/command/index.js";
import type { CausedBy } from "../../src/context/index.js";

type AuditModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof auditTables, true>
>;
type AuditDoc = DocumentByName<AuditModel, "auditRecords">;
type OperatorDoc = DocumentByName<AuditModel, "operatorAudit">;
type ClosedEntry = {
  scopeKey: string;
  reason: string;
  generationId?: GenericId<"generations">;
  changedAt: number;
  changedBy: string;
};

// spec:operations.baseline-operations typeAuditRecordInput, tableAuditRecords.
test("compiled: AuditRecordInput is the stored data without recordedAt", () => {
  expectTypeOf<AuditRecordInput>().not.toBeAny();
  expectTypeOf<AuditDoc["recordedAt"]>().toEqualTypeOf<number>();
  expectTypeOf<AuditRecordInput>().toEqualTypeOf<
    Omit<AuditDoc, "_id" | "_creationTime" | "recordedAt">
  >();
  expectTypeOf<AuditRecordInput>().toEqualTypeOf<{
    tenantId: string;
    operationId: string;
    requestKey?: string;
    commandType: string;
    actor: Actor;
    subject: SubjectRef;
    kind: "security" | "business";
    decision: "applied" | "businessFailure";
    causedBy: CausedBy;
  }>();
});

// spec:operations.baseline-operations tableOperatorAudit, fnWriteOperatorAudit; spec:command.actor-and-scope validatorOperator.
test("compiled: operator audit uses kind and the operator validator is a string", () => {
  expectTypeOf<OperatorAuditInput>().not.toBeAny();
  expectTypeOf<OperatorDoc["recordedAt"]>().toEqualTypeOf<number>();
  expectTypeOf<OperatorAuditInput>().toEqualTypeOf<
    Omit<OperatorDoc, "_id" | "_creationTime" | "recordedAt">
  >();
  expectTypeOf<OperatorAuditInput>().toEqualTypeOf<{
    kind: "gate.close" | "gate.resume";
    scopeKey: string;
    reason: string;
    generationId?: GenericId<"generations">;
    operator: string;
  }>();
  expectTypeOf<Infer<typeof operatorValidator>>().toEqualTypeOf<string>();
});

// spec:command.command-declaration typeAudit.
test("compiled: a declaration opts into security or business audit", () => {
  expectTypeOf<CommandDeclaration<null, null>["audit"]>().toEqualTypeOf<
    { kind: "security" | "business" } | undefined
  >();
});

// spec:application.write-pause fnCloseGate, fnResumeGate, fnGetGate, fnGetGateAudit.
test("compiled: the fixture exposes the pinned internal gate entries", () => {
  const gate = fixtureInternal.gate;
  expectTypeOf(gate).not.toBeAny();
  expectTypeOf(gate.closeGate).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf(gate.resumeGate).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf(gate.getGate).toExtend<FunctionReference<"query", "internal">>();
  expectTypeOf(gate.getGateAudit).toExtend<
    FunctionReference<"query", "internal">
  >();
  expectTypeOf<FunctionArgs<typeof gate.closeGate>>().toEqualTypeOf<{
    scopeKey: string;
    reason: string;
    operator: string;
  }>();
  expectTypeOf<FunctionArgs<typeof gate.resumeGate>>().toEqualTypeOf<{
    scopeKey: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof gate.closeGate>
  >().toEqualTypeOf<null>();
  expectTypeOf<
    FunctionReturnType<typeof gate.resumeGate>
  >().toEqualTypeOf<null>();
  expectTypeOf<keyof FunctionArgs<typeof gate.getGate>>().toBeNever();
  expectTypeOf<FunctionReturnType<typeof gate.getGate>>().toEqualTypeOf<{
    restore: boolean;
    closed: ClosedEntry[];
  }>();
  expectTypeOf<FunctionArgs<typeof gate.getGateAudit>>().toEqualTypeOf<{
    scopeKey: string;
    paginationOpts: Infer<typeof paginationOptsValidator>;
  }>();
  expectTypeOf<FunctionReturnType<typeof gate.getGateAudit>>().toEqualTypeOf<
    PaginationResult<OperatorDoc>
  >();
});

// spec:application.write-pause fnCloseGate, fnResumeGate, fnGetGate, fnGetGateAudit.
test("compiled: the example exposes the pinned internal gate entries", () => {
  const gate = exampleInternal.gate;
  expectTypeOf(gate).not.toBeAny();
  expectTypeOf(gate.closeGate).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf(gate.resumeGate).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf(gate.getGate).toExtend<FunctionReference<"query", "internal">>();
  expectTypeOf(gate.getGateAudit).toExtend<
    FunctionReference<"query", "internal">
  >();
  expectTypeOf<FunctionArgs<typeof gate.closeGate>>().toEqualTypeOf<{
    scopeKey: string;
    reason: string;
    operator: string;
  }>();
  expectTypeOf<FunctionArgs<typeof gate.resumeGate>>().toEqualTypeOf<{
    scopeKey: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof gate.closeGate>
  >().toEqualTypeOf<null>();
  expectTypeOf<
    FunctionReturnType<typeof gate.resumeGate>
  >().toEqualTypeOf<null>();
  expectTypeOf<keyof FunctionArgs<typeof gate.getGate>>().toBeNever();
  expectTypeOf<FunctionReturnType<typeof gate.getGate>>().toEqualTypeOf<{
    restore: boolean;
    closed: ClosedEntry[];
  }>();
  expectTypeOf<FunctionArgs<typeof gate.getGateAudit>>().toEqualTypeOf<{
    scopeKey: string;
    paginationOpts: Infer<typeof paginationOptsValidator>;
  }>();
  expectTypeOf<FunctionReturnType<typeof gate.getGateAudit>>().toEqualTypeOf<
    PaginationResult<OperatorDoc>
  >();
});
