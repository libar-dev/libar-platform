import { ConvexError, v } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { components } from "../../fixture/convex/_generated/api.js";
import {
  writeAudit,
  writeOperatorAudit,
  type AuditRecordInput,
} from "../../src/audit/index.js";
import {
  insertGrant,
  runPipeline,
  type CommandDeclaration,
  type PipelineCall,
  type SubjectRef,
} from "../../src/command/index.js";
import type { OperationRef } from "../../src/context/index.js";
import {
  gateApp,
  caught,
  generationIds,
  depotRows,
  type GateApp,
} from "./gate-support.js";

beforeEach(() => {
  vi.stubEnv("MAINTENANCE_MODE", undefined);
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const actor = {
  kind: "service",
  id: "service-id",
  issuer: "issuer",
  onBehalfOf: { kind: "human", id: "delegator" },
  delegationRef: "delegation",
} as const;
const explicitCause = {
  kind: "event",
  tenantId: "cause-tenant",
  contextId: "cause-context",
  eventId: "cause-event",
} as const;
const subject = { contextId: "depot", streamType: "document", streamId: "d" };
const auditInput: AuditRecordInput = {
  tenantId: "t",
  operationId: "operation",
  requestKey: "request",
  commandType: "AuditedDocument",
  actor,
  subject,
  kind: "security",
  decision: "applied",
  causedBy: explicitCause,
};
const call: PipelineCall<{ documentId: string; title: string }> = {
  tenantId: "t",
  namespace: "worker",
  actor,
  requestKey: "request-key",
  correlationId: "correlation-is-not-causation",
  causedBy: explicitCause,
  input: { documentId: "d", title: "Document" },
};
const grant = (t: GateApp) =>
  t.run((ctx) =>
    insertGrant(ctx, {
      tenantId: "t",
      principalKind: actor.kind,
      principalId: actor.id,
      permission: "documents",
      grantedBy: "admin",
    }),
  );
function declaration(
  options: {
    kind?: "security" | "business";
    decision?: "applied" | "businessFailure";
    subjectFrom?: (input: typeof call.input) => SubjectRef;
    versions?: boolean;
  } = {},
) {
  const seen: OperationRef[] = [];
  const decl: CommandDeclaration<typeof call.input, null> = {
    name: "AuditedDocument",
    contractVersion: 1,
    input: v.object({ documentId: v.string(), title: v.string() }),
    output: v.null(),
    permission: {
      permission: "documents",
      ...(options.subjectFrom ? { subjectFrom: options.subjectFrom } : {}),
    },
    audit: { kind: options.kind ?? "business" },
    writes: [{ contextId: "depot", streamType: "document" }],
    rejections: ["titleRequired"],
    executor: async (
      ctx,
      { tenantId, actor: established, operation, input },
    ) => {
      seen.push(operation);
      const result = await ctx.runMutation(
        components.depot.operations.createDocuments,
        {
          tenantId,
          actor: established,
          operation,
          input: {
            documents: [input, { documentId: "second", title: "Second" }],
          },
        },
      );
      return {
        ...result,
        kind: options.decision ?? "applied",
        result: null,
        versions: options.versions === false ? [] : result.versions,
      };
    },
  };
  return { decl, seen };
}

// spec:operations.baseline-operations fnWriteAudit, typeAuditRecordInput, tableAuditRecords.
test("convex-test: writeAudit preserves every input field and sets recordedAt to the mutation time", async () => {
  const t = gateApp();
  const result = await t.run(async (ctx) => ({
    at: Date.now(),
    id: await writeAudit(ctx, auditInput),
  }));
  expect(await t.run((ctx) => ctx.db.get(result.id))).toEqual({
    ...auditInput,
    _id: result.id,
    _creationTime: expect.any(Number),
    recordedAt: result.at,
  });
});

// spec:operations.baseline-operations fnWriteOperatorAudit, tableOperatorAudit.
test("convex-test: writeOperatorAudit preserves generation and kind and sets the mutation time", async () => {
  const t = gateApp();
  const [generationId] = await generationIds(t);
  for (const kind of ["gate.close", "gate.resume"] as const) {
    const record = {
      kind,
      scopeKey: "tenant:t",
      reason: "repair",
      generationId,
      operator: " stated operator ",
    };
    const result = await t.run(async (ctx) => ({
      at: Date.now(),
      id: await writeOperatorAudit(ctx, record),
    }));
    expect(await t.run((ctx) => ctx.db.get(result.id))).toEqual({
      ...record,
      _id: result.id,
      _creationTime: expect.any(Number),
      recordedAt: result.at,
    });
  }
});

for (const kind of ["security", "business"] as const) {
  for (const decision of ["applied", "businessFailure"] as const) {
    // spec:operations.baseline-operations auditRecordSources; spec:command.command-pipeline auditWrite; spec:command.command-declaration typeAudit.
    test(`convex-test: ${kind} audit of ${decision} takes every field from its specified source and uses subjectFrom`, async () => {
      const t = gateApp();
      await grant(t);
      const declaredSubject = {
        contextId: "permission-context",
        streamType: "permission-type",
        streamId: "permission-d",
      };
      const { decl, seen } = declaration({
        kind,
        decision,
        subjectFrom: (input) => ({
          ...declaredSubject,
          streamId: `permission-${input.documentId}`,
        }),
      });
      const { response, at } = await t.run(async (ctx) => ({
        at: Date.now(),
        response: await runPipeline(ctx, decl, call),
      }));
      expect(seen).toHaveLength(1);
      expect(
        await t.run((ctx) => ctx.db.query("auditRecords").collect()),
      ).toEqual([
        {
          _id: expect.any(String),
          _creationTime: expect.any(Number),
          tenantId: call.tenantId,
          requestKey: call.requestKey,
          actor,
          operationId: seen[0]!.operationId,
          causedBy: seen[0]!.causedBy,
          commandType: "AuditedDocument",
          kind,
          decision,
          subject: declaredSubject,
          recordedAt: at,
        },
      ]);
      expect(seen[0]!.operationId).toBe(response.operationId);
      expect(seen[0]!.causedBy).toEqual(explicitCause);
      expect(response.versions[0]?.streamId).toBe("d");
      const rows = await t.run((ctx) => ctx.db.query("auditRecords").collect());
      expect(await t.run((ctx) => runPipeline(ctx, decl, call))).toMatchObject({
        replayed: true,
        operationId: response.operationId,
      });
      expect(
        await t.run((ctx) => ctx.db.query("auditRecords").collect()),
      ).toEqual(rows);
    });
  }
}

// spec:operations.baseline-operations auditRecordSources; spec:command.command-pipeline Contract "Step 7, gate and mint the operation".
test("convex-test: absent subjectFrom uses the first version, with the default command cause and no request key", async () => {
  const t = gateApp();
  await grant(t);
  const { decl, seen } = declaration();
  const unreceipted: PipelineCall<typeof call.input> = {
    tenantId: "t",
    namespace: "public",
    actor,
    input: call.input,
  };
  const result = await t.run((ctx) => runPipeline(ctx, decl, unreceipted));
  expect(result.versions.map((version) => version.streamId)).toEqual([
    "d",
    "second",
  ]);
  expect(await t.run((ctx) => ctx.db.query("auditRecords").collect())).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "t",
      actor,
      operationId: result.operationId,
      causedBy: { kind: "command", commandType: "AuditedDocument" },
      commandType: "AuditedDocument",
      kind: "business",
      decision: "applied",
      subject,
      recordedAt: expect.any(Number),
    },
  ]);
  expect(seen[0]!.causedBy).toEqual({
    kind: "command",
    commandType: "AuditedDocument",
  });
  expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([]);
});

// spec:operations.baseline-operations auditRecordSources.
test("convex-test: subjectFrom supplies audit even when the outcome has no version", async () => {
  const t = gateApp();
  await grant(t);
  const { decl } = declaration({ subjectFrom: () => subject, versions: false });
  await t.run((ctx) => runPipeline(ctx, decl, call));
  expect(await t.run((ctx) => ctx.db.query("auditRecords").collect())).toEqual([
    expect.objectContaining({ subject }),
  ]);
});

// spec:operations.baseline-operations auditRecordSources; spec:command.command-pipeline auditWrite.
test("convex-test: an audited declaration without either subject source throws a plain error and rolls back", async () => {
  const t = gateApp();
  await grant(t);
  const { decl, seen } = declaration({ versions: false });
  const error = await caught(t.run((ctx) => runPipeline(ctx, decl, call)));
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(seen).toHaveLength(1);
  expect(await depotRows(t)).toEqual({ events: [], streams: [] });
  expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("auditRecords").collect())).toEqual(
    [],
  );
  expect(
    await t.run((ctx) =>
      ctx.runQuery(components.depot.queries.document.get, {
        tenantId: "t",
        streamId: "d",
      }),
    ),
  ).toBeNull();
});

// spec:operations.baseline-operations fnWriteAudit, faultInjection; spec:command.command-pipeline auditWrite.
test("convex-test: a rejecting audit validator rolls back the receipt and context writes", async () => {
  const t = gateApp("auditRecords");
  await grant(t);
  const { decl, seen } = declaration();
  await expect(t.run((ctx) => runPipeline(ctx, decl, call))).rejects.toThrow();
  expect(seen).toHaveLength(1);
  expect(await depotRows(t)).toEqual({ events: [], streams: [] });
  expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("auditRecords").collect())).toEqual(
    [],
  );
  expect(
    await t.run((ctx) =>
      ctx.runQuery(components.depot.queries.document.get, {
        tenantId: "t",
        streamId: "d",
      }),
    ),
  ).toBeNull();
});

// spec:command.command-declaration typeAudit; spec:command.command-pipeline auditWrite.
test("convex-test: a declaration without audit writes no audit record", async () => {
  const t = gateApp();
  await grant(t);
  const { decl } = declaration();
  delete decl.audit;
  expect(await t.run((ctx) => runPipeline(ctx, decl, call))).toMatchObject({
    kind: "applied",
  });
  expect(await t.run((ctx) => ctx.db.query("auditRecords").collect())).toEqual(
    [],
  );
});
