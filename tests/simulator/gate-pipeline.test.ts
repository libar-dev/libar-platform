import { v } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  api,
  components,
  internal,
} from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { documentSummary } from "../../fixture/convex/summaries.js";
import {
  insertGrant,
  runPipeline,
  type CommandDeclaration,
  type PipelineCall,
} from "../../src/command/index.js";
import {
  gateApp,
  depotRows,
  close,
  resume,
  refusal,
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
const issuer = "https://gate.test";
async function caller(t: GateApp) {
  await t.run((ctx) =>
    insertGrant(ctx, {
      tenantId: "t",
      principalKind: "human",
      principalId: `${issuer}|caller`,
      permission: permissions.documents,
      grantedBy: "admin",
    }),
  );
  return t.withIdentity({ issuer, subject: "caller" });
}
const call = {
  tenantId: "t",
  requestKey: "same-key",
  input: { documentId: "d", title: "Document" },
};
async function stored(t: GateApp) {
  const parent = await t.run(async (ctx) => ({
    receipts: await ctx.db.query("receipts").collect(),
    rows: await ctx.db.query("documentSummaries").collect(),
    audits: await ctx.db.query("auditRecords").collect(),
  }));
  const depot = await t.run(async (ctx) =>
    ctx.runQuery(components.depot.queries.document.get, {
      tenantId: "t",
      streamId: "d",
    }),
  );
  return { ...parent, depot, ...(await depotRows(t)) };
}

// spec:application.write-pause errorCodeWritePaused; spec:command.command-pipeline gateRead, auditWrite.
test("convex-test: a paused audited command stores no receipt, event, state, read-model row or audit and its key applies after resume", async () => {
  const t = gateApp();
  await caller(t);
  await t.mutation(internal.readModels.activate, {
    readModel: "documentSummary",
    startedBy: { kind: "operator", id: "admin" },
  });
  const declaration: CommandDeclaration<
    { documentId: string; title: string },
    null
  > = {
    name: "CreateAuditedDocument",
    contractVersion: 1,
    input: v.object({ documentId: v.string(), title: v.string() }),
    output: v.null(),
    permission: { permission: permissions.documents },
    writes: [{ contextId: "depot", streamType: "document" }],
    readModels: [
      {
        readModel: documentSummary,
        source: { contextId: "depot", streamType: "document" },
      },
    ],
    rejections: ["titleRequired"],
    audit: { kind: "business" },
    executor: async (ctx, { tenantId, actor, operation, input }) => {
      const outcome = await ctx.runMutation(
        components.depot.operations.createDocuments,
        { tenantId, actor, operation, input: { documents: [input] } },
      );
      return { ...outcome, result: null };
    },
  };
  const pipelineCall: PipelineCall<typeof call.input> = {
    ...call,
    namespace: "public",
    actor: { kind: "human", id: `${issuer}|caller` },
  };
  const before = await stored(t);
  await close(t);
  const execute = vi.fn(declaration.executor);
  declaration.executor = execute;
  const run = () => t.run((ctx) => runPipeline(ctx, declaration, pipelineCall));
  const mint = vi.spyOn(crypto, "randomUUID");
  await refusal(run(), "tenant:t", "repair");
  expect(mint).not.toHaveBeenCalled();
  expect(await stored(t)).toEqual(before);
  expect(before.receipts).toEqual([]);
  expect(before.rows).toEqual([]);
  expect(before.audits).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
  expect(before.depot).toBeNull();
  expect(before.events).toEqual([]);
  expect(before.streams).toEqual([]);
  mint.mockRestore();
  await resume(t);
  expect(await run()).toMatchObject({ kind: "applied", replayed: false });
  const after = await stored(t);
  expect(after.receipts).toHaveLength(1);
  expect(after.rows).toHaveLength(1);
  expect(after.audits).toHaveLength(1);
  expect(after.events).toHaveLength(1);
  expect(after.streams).toHaveLength(1);
});

// spec:command.command-pipeline Contract "Step 5, receipt lookup", "Step 6, admit", gateRead; spec:command.tenancy-and-authority rule "Authorization comes before execution".
test("convex-test: a duplicate in a closed tenant returns its receipt before admission and the gate", async () => {
  const t = gateApp();
  const user = await caller(t);
  const first = await user.mutation(api.depotCommands.createDocument, call);
  await close(t);
  await t.mutation(internal.switches.set, {
    tenantId: "t",
    commandType: "CreateDocument",
    name: "capacity",
    on: true,
  });
  const before = await stored(t);
  expect(
    await user.mutation(api.depotCommands.createDocument, call),
  ).toMatchObject({ replayed: true, operationId: first.operationId });
  expect(await stored(t)).toEqual(before);
  // A grant mutation is a writer the gate holds (spec:command.actor-and-scope fnRevokeGrant), so the
  // tenant is reopened for the revoke and closed again.
  await resume(t);
  await t.mutation(internal.grants.revoke, {
    tenantId: "t",
    principalKind: "human",
    principalId: `${issuer}|caller`,
    permission: permissions.documents,
  });
  await close(t);
  await expect(
    user.mutation(api.depotCommands.createDocument, call),
  ).rejects.toMatchObject({ data: { kind: "rejection", code: "forbidden" } });
});

// spec:command.command-pipeline Contract "Step 6, admit", gateRead.
test("convex-test: admission refuses new intent before the gate and no operation is minted", async () => {
  const t = gateApp();
  const user = await caller(t);
  await close(t);
  await t.mutation(internal.switches.set, {
    tenantId: "t",
    commandType: "CreateDocument",
    name: "capacity",
    on: true,
  });
  const mint = vi.spyOn(crypto, "randomUUID");
  await expect(
    user.mutation(api.depotCommands.createDocument, call),
  ).rejects.toMatchObject({
    data: {
      kind: "transient",
      code: "capacity",
      message: "CreateDocument is not admitted now",
    },
  });
  expect(mint).not.toHaveBeenCalled();
  expect((await stored(t)).receipts).toEqual([]);
});
