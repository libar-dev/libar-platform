// The maintenance gate, its operator entries and their audit records, the tenant list, and the audit
// record of the pipeline's step 10, on convex-test over the fixture composition
// (spec:application.write-pause, spec:operations.baseline-operations, spec:command.actor-and-scope).
import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { ConvexError, v, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import schema from "../../fixture/convex/schema.js";
import {
  insertGrant,
  nextTenant,
  revokeGrant,
  runPipeline,
  type CommandDeclaration,
  type PipelineCall,
} from "../../src/command/index.js";
import { internal as productionInternal } from "../../example/convex/_generated/api.js";
import { gateAllows } from "../../src/gate/index.js";
import { productionTest } from "./production.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
const modules = import.meta.glob("../../fixture/convex/**/*.ts");
function app(appSchema: typeof schema = schema) {
  const t = convexTest(appSchema, modules);
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  t.registerComponent(
    "depot",
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
  return t;
}
type App = ReturnType<typeof app>;
// The fixture's schema with an operatorAudit table whose validator refuses every gate change's record.
const refusingAudit = defineSchema({
  ...schema.tables,
  operatorAudit: defineTable({ refused: v.literal(true) }),
}) as unknown as typeof schema;
const issuer = "https://fixture-issuer.test";
async function caller(t: App, subject: string, tenantId = "t-1") {
  await t.mutation(internal.grants.grant, {
    tenantId,
    principalKind: "human",
    principalId: `${issuer}|${subject}`,
    permission: permissions.documents,
    grantedBy: "operator",
  });
  return t.withIdentity({ issuer, subject });
}
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}
async function plainError(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).not.toBeInstanceOf(ConvexError);
  return String(error);
}
const gateDocuments = (t: App) =>
  t.run((ctx) => ctx.db.query("maintenanceGates").collect());
const operatorAudit = (t: App) =>
  t.run((ctx) => ctx.db.query("operatorAudit").collect());
const report = (documentId = "doc-1", tenantId = "t-1") => ({
  tenantId,
  input: { documentId, title: "Report" },
});
const close = (t: App, scopeKey: string, reason = "maintenance") =>
  t.mutation(internal.gate.closeGate, { scopeKey, reason, operator: "ops-1" });
const resume = (t: App, scopeKey: string) =>
  t.mutation(internal.gate.resumeGate, { scopeKey, operator: "ops-2" });
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the gate read", () => {
  test(
    name(
      "MAINTENANCE_MODE exactly restore answers closed for all with the reason restore and reads no document; other values leave the answer to the document",
    ),
    async () => {
      const t = app();
      await close(t, "tenant:t-1", "move");
      vi.stubEnv("MAINTENANCE_MODE", "restore");
      // A database that throws on any use: under the door, no document is read.
      const untouchable = new Proxy(
        {},
        {
          get: () => {
            throw new Error("The gate read touched the database");
          },
        },
      ) as Parameters<typeof gateAllows>[0]["db"];
      expect(
        await gateAllows({ db: untouchable }, ["all", "tenant:t-2"]),
      ).toEqual({ allowed: false, scopeKey: "all", reason: "restore" });
      for (const value of ["Restore", "restore ", "", "off"]) {
        vi.stubEnv("MAINTENANCE_MODE", value);
        expect(
          await t.run((ctx) => gateAllows(ctx, ["all", "tenant:t-2"])),
        ).toEqual({ allowed: true });
        expect(
          await t.run((ctx) => gateAllows(ctx, ["all", "tenant:t-1"])),
        ).toEqual({ allowed: false, scopeKey: "tenant:t-1", reason: "move" });
      }
      vi.unstubAllEnvs();
      expect(await t.run((ctx) => gateAllows(ctx, ["all"]))).toEqual({
        allowed: true,
      });
    },
  );

  test(
    name(
      "an absent document is open and the read writes nothing; the first matching entry in array order answers",
    ),
    async () => {
      const t = app();
      expect(
        await t.run((ctx) => gateAllows(ctx, ["all", "tenant:t-1"])),
      ).toEqual({ allowed: true });
      expect(await gateDocuments(t)).toEqual([]);
      await close(t, "tenant:t-1", "first");
      await close(t, "all", "second");
      // The command's scopes are "all" before its tenant; the entry closed first answers.
      expect(
        await t.run((ctx) => gateAllows(ctx, ["all", "tenant:t-1"])),
      ).toEqual({ allowed: false, scopeKey: "tenant:t-1", reason: "first" });
    },
  );

  test(
    name(
      "an entry with no generation admits no one, and an entry naming a generation admits only a read stating that generation",
    ),
    async () => {
      const t = app();
      const [first, second] = await t.run(async (ctx) => {
        const row = {
          readModel: "documentSummary",
          projectionVersion: 1,
          state: "building" as const,
          pauseRequired: true,
          fence: 0,
          startedAt: 0,
          startedBy: "ops-1",
          changedAt: 0,
          changedBy: "ops-1",
        };
        return [
          await ctx.db.insert("generations", { ...row, generation: 1 }),
          await ctx.db.insert("generations", { ...row, generation: 2 }),
        ];
      });
      await t.run((ctx) =>
        ctx.db.insert("maintenanceGates", {
          key: "gates",
          closed: [
            {
              scopeKey: "source:depot:document",
              reason: "rebuild",
              generationId: first,
              changedAt: 0,
              changedBy: "ops-1",
            },
            {
              scopeKey: "tenant:t-1",
              reason: "hold",
              changedAt: 0,
              changedBy: "ops-1",
            },
          ],
          updatedAt: 0,
        }),
      );
      const source = ["source:depot:document"];
      expect(await t.run((ctx) => gateAllows(ctx, source, first))).toEqual({
        allowed: true,
      });
      expect(await t.run((ctx) => gateAllows(ctx, source, second))).toEqual({
        allowed: false,
        scopeKey: "source:depot:document",
        reason: "rebuild",
      });
      expect(await t.run((ctx) => gateAllows(ctx, source))).toMatchObject({
        allowed: false,
      });
      expect(
        await t.run((ctx) => gateAllows(ctx, ["tenant:t-1"], first)),
      ).toEqual({ allowed: false, scopeKey: "tenant:t-1", reason: "hold" });
    },
  );
});

describe("a command in a closed scope", () => {
  test(
    name(
      "a closed tenant refuses with exactly the writePaused data and stores nothing; another tenant writes; the same request key applies after the resume",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      const other = await caller(t, "user-2", "t-2");
      await close(t, "tenant:t-1", "move to the new region");
      const before = await t.run(async (ctx) => ({
        receipts: await ctx.db.query("receipts").collect(),
        summaries: await ctx.db.query("documentSummaries").collect(),
        audit: await ctx.db.query("auditRecords").collect(),
      }));
      const error = await failure(
        user.mutation(api.depotCommands.createDocument, {
          ...report(),
          requestKey: "k-1",
        }),
      );
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as ConvexError<Value>).data).toEqual({
        kind: "transient",
        code: "writePaused",
        message: "write paused for tenant:t-1: move to the new region",
      });
      expect(
        await t.run(async (ctx) => ({
          receipts: await ctx.db.query("receipts").collect(),
          summaries: await ctx.db.query("documentSummaries").collect(),
          audit: await ctx.db.query("auditRecords").collect(),
        })),
      ).toEqual(before);
      expect(
        await other.mutation(
          api.depotCommands.createDocument,
          report("doc-1", "t-2"),
        ),
      ).toMatchObject({ kind: "applied" });
      await resume(t, "tenant:t-1");
      // The document is created at expected version 0, so no event of the refused command exists.
      expect(
        await user.mutation(api.depotCommands.createDocument, {
          ...report(),
          requestKey: "k-1",
        }),
      ).toMatchObject({
        kind: "applied",
        replayed: false,
        versions: [expect.objectContaining({ streamId: "doc-1", version: 1 })],
      });
    },
  );

  test(
    name(
      "under the restore door every command is refused with write paused for all: restore",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1");
      vi.stubEnv("MAINTENANCE_MODE", "restore");
      const error = await failure(
        user.mutation(api.depotCommands.createDocument, report()),
      );
      expect((error as ConvexError<Value>).data).toEqual({
        kind: "transient",
        code: "writePaused",
        message: "write paused for all: restore",
      });
    },
  );
});

describe("the operator entries", () => {
  test(
    name(
      "close, double close, resume and resume of an open scope, each change with one operator audit record",
    ),
    async () => {
      const t = app();
      expect(await close(t, "all", "release")).toBeNull();
      expect(await plainError(close(t, "all", "again"))).toContain(
        "The scope all is already closed",
      );
      const [gate] = await gateDocuments(t);
      expect(gate?.closed).toEqual([
        {
          scopeKey: "all",
          reason: "release",
          changedAt: expect.any(Number),
          changedBy: "ops-1",
        },
      ]);
      expect(await resume(t, "all")).toBeNull();
      expect(await plainError(resume(t, "all"))).toContain(
        "The scope all is not closed",
      );
      expect(await t.query(internal.gate.getGate, {})).toEqual({
        restore: false,
        closed: [],
      });
      expect(
        (await operatorAudit(t)).map(
          ({ kind, scopeKey, reason, operator, generationId }) => ({
            kind,
            scopeKey,
            reason,
            operator,
            generationId,
          }),
        ),
      ).toEqual([
        {
          kind: "gate.close",
          scopeKey: "all",
          reason: "release",
          operator: "ops-1",
          generationId: undefined,
        },
        {
          kind: "gate.resume",
          scopeKey: "all",
          reason: "release",
          operator: "ops-2",
          generationId: undefined,
        },
      ]);
    },
  );

  test(
    name(
      "the 17th scope is refused, and closeGate and resumeGate take only all or a tenant scope",
    ),
    async () => {
      const t = app();
      for (let n = 1; n <= 16; n += 1) await close(t, `tenant:t-${n}`);
      expect(await plainError(close(t, "tenant:t-17"))).toContain(
        "The gate holds 16 closed scopes, its limit",
      );
      for (const scopeKey of [
        "source:depot:document",
        "tenant:",
        `tenant:${"x".repeat(257)}`,
        "read-model:documentSummary",
        "ALL",
      ]) {
        expect(await plainError(close(t, scopeKey))).toContain(
          `closeGate takes the scope all or a tenant scope, and ${scopeKey} is neither`,
        );
        expect(await plainError(resume(t, scopeKey))).toContain(
          `resumeGate takes the scope all or a tenant scope, and ${scopeKey} is neither`,
        );
      }
      expect(await close(t, "all").catch(String)).toContain("16 closed scopes");
      await resume(t, "tenant:t-16");
      expect(await close(t, `tenant:${"x".repeat(256)}`)).toBeNull();
    },
  );

  test(
    name(
      "the reason is 1 to 256 bytes, and the operator is required, not only whitespace and at most 512 bytes, all before any read or write",
    ),
    async () => {
      const t = app();
      for (const reason of ["", "é".repeat(129)])
        expect(await plainError(close(t, "all", reason))).toContain(
          "The reason must be between 1 and 256 bytes",
        );
      for (const operator of ["", "  \t"]) {
        expect(
          await plainError(
            t.mutation(internal.gate.closeGate, {
              scopeKey: "all",
              reason: "r",
              operator,
            }),
          ),
        ).toContain("An operator entry needs a stated operator");
        expect(
          await plainError(
            t.mutation(internal.gate.resumeGate, { scopeKey: "all", operator }),
          ),
        ).toContain("An operator entry needs a stated operator");
      }
      // 171 three-byte characters are 513 bytes.
      expect(
        await plainError(
          t.mutation(internal.gate.closeGate, {
            scopeKey: "source:x:y",
            reason: "",
            operator: "€".repeat(171),
          }),
        ),
      ).toContain("The stated operator is 513 bytes, above the limit of 512");
      expect(await gateDocuments(t)).toEqual([]);
      expect(await operatorAudit(t)).toEqual([]);
      expect(await close(t, "all", "é".repeat(128))).toBeNull();
      expect(
        await t.mutation(internal.gate.resumeGate, {
          scopeKey: "all",
          operator: "€".repeat(170) + "xx",
        }),
      ).toBeNull();
    },
  );

  test(
    name(
      "an operator audit insert that fails leaves the gate as it was on close and on resume, and no record",
    ),
    async () => {
      const broken = app(refusingAudit);
      expect(await plainError(close(broken, "all"))).not.toBe("");
      expect(await gateDocuments(broken)).toEqual([]);
      const t = app(refusingAudit);
      await t.run((ctx) =>
        ctx.db.insert("maintenanceGates", {
          key: "gates",
          closed: [
            {
              scopeKey: "all",
              reason: "release",
              changedAt: 1,
              changedBy: "ops-1",
            },
          ],
          updatedAt: 1,
        }),
      );
      const before = await gateDocuments(t);
      expect(await plainError(resume(t, "all"))).not.toBe("");
      expect(await gateDocuments(t)).toEqual(before);
      expect(
        await t.run((ctx) => ctx.db.query("operatorAudit").collect()),
      ).toEqual([]);
    },
  );

  test(
    name(
      "getGate answers restore and the closed entries, and getGateAudit pages one scope newest first at most 100 a page",
    ),
    async () => {
      const t = app();
      expect(await t.query(internal.gate.getGate, {})).toEqual({
        restore: false,
        closed: [],
      });
      vi.stubEnv("MAINTENANCE_MODE", "restore");
      expect(await t.query(internal.gate.getGate, {})).toEqual({
        restore: true,
        closed: [],
      });
      vi.unstubAllEnvs();
      for (let n = 0; n < 51; n += 1) {
        vi.setSystemTime(1_000 + n);
        await close(t, "tenant:t-1", `r-${n}`);
        await resume(t, "tenant:t-1");
      }
      vi.useRealTimers();
      await close(t, "tenant:t-2");
      const first = await t.query(internal.gate.getGateAudit, {
        scopeKey: "tenant:t-1",
        paginationOpts: { numItems: 500, cursor: null },
      });
      expect(first.page).toHaveLength(100);
      expect(first.isDone).toBe(false);
      expect(first.page[0]).toMatchObject({
        kind: "gate.resume",
        reason: "r-50",
        operator: "ops-2",
      });
      const rest = await t.query(internal.gate.getGateAudit, {
        scopeKey: "tenant:t-1",
        paginationOpts: { numItems: 100, cursor: first.continueCursor },
      });
      expect(rest.page).toHaveLength(2);
      expect(rest.page.at(-1)).toMatchObject({
        kind: "gate.close",
        reason: "r-0",
      });
    },
  );
});

describe("the stated operator", () => {
  test(
    name(
      "a padded operator past 512 bytes whose text fits is stored trimmed on the closed entry and on both audit records",
    ),
    async () => {
      const t = app();
      const padded = " ".repeat(300) + "ops-1" + "\t".repeat(300);
      await t.mutation(internal.gate.closeGate, {
        scopeKey: "all",
        reason: "release",
        operator: padded,
      });
      expect((await gateDocuments(t))[0]?.closed).toMatchObject([
        { scopeKey: "all", changedBy: "ops-1" },
      ]);
      await t.mutation(internal.gate.resumeGate, {
        scopeKey: "all",
        operator: padded,
      });
      expect((await operatorAudit(t)).map(({ operator }) => operator)).toEqual([
        "ops-1",
        "ops-1",
      ]);
    },
  );
});

describe("a grant under the gate", () => {
  const grantArgs = (tenantId: string) => ({
    tenantId,
    principalKind: "human" as const,
    principalId: "user-1",
    permission: "documents.write",
  });
  const paused = (message: string) => ({
    kind: "transient",
    code: "writePaused",
    message,
  });
  async function pausedData(promise: Promise<unknown>) {
    const error = await failure(promise);
    expect(error).toBeInstanceOf(ConvexError);
    return (error as ConvexError<Value>).data;
  }

  test(
    name(
      "the fixture's grant and revoke mutations are refused with writePaused in a closed tenant and store nothing, and write in another tenant",
    ),
    async () => {
      const t = app();
      const stored = () =>
        t.run(async (ctx) => ({
          grants: await ctx.db.query("grants").collect(),
          tenants: await ctx.db.query("tenants").collect(),
        }));
      await t.mutation(internal.grants.grant, {
        ...grantArgs("t-1"),
        grantedBy: "operator",
      });
      await close(t, "tenant:t-1", "move");
      await close(t, "tenant:t-2", "hold");
      const before = await stored();
      // A first grant in a closed tenant: neither the grant nor the tenant row is written.
      expect(
        await pausedData(
          t.mutation(internal.grants.grant, {
            ...grantArgs("t-2"),
            grantedBy: "operator",
          }),
        ),
      ).toEqual(paused("write paused for tenant:t-2: hold"));
      expect(
        await pausedData(t.mutation(internal.grants.revoke, grantArgs("t-1"))),
      ).toEqual(paused("write paused for tenant:t-1: move"));
      expect(await stored()).toEqual(before);
      await t.mutation(internal.grants.grant, {
        ...grantArgs("t-3"),
        grantedBy: "operator",
      });
      expect((await stored()).tenants).toHaveLength(2);
    },
  );

  test(
    name(
      "the production composition's grant and revoke mutations are refused with writePaused in a closed tenant and under the restore door, and store nothing",
    ),
    async () => {
      const t = productionTest();
      const stored = () =>
        t.run(async (ctx) => ({
          grants: await ctx.db.query("grants").collect(),
          tenants: await ctx.db.query("tenants").collect(),
        }));
      await t.mutation(productionInternal.grants.grant, {
        ...grantArgs("t-1"),
        grantedBy: "operator",
      });
      await t.mutation(productionInternal.gate.closeGate, {
        scopeKey: "tenant:t-2",
        reason: "hold",
        operator: "ops-1",
      });
      const before = await stored();
      expect(
        await pausedData(
          t.mutation(productionInternal.grants.grant, {
            ...grantArgs("t-2"),
            grantedBy: "operator",
          }),
        ),
      ).toEqual(paused("write paused for tenant:t-2: hold"));
      vi.stubEnv("MAINTENANCE_MODE", "restore");
      expect(
        await pausedData(
          t.mutation(productionInternal.grants.revoke, grantArgs("t-1")),
        ),
      ).toEqual(paused("write paused for all: restore"));
      vi.unstubAllEnvs();
      expect(await stored()).toEqual(before);
    },
  );
});

describe("the tenant list", () => {
  test(
    name(
      "a first grant inserts the tenant's row, a second does not, revoking every grant keeps it, and nextTenant walks the rows in tenant-ID order",
    ),
    async () => {
      const t = app();
      const grant = (tenantId: string, permission: string) =>
        t.run((ctx) =>
          insertGrant(ctx, {
            tenantId,
            principalKind: "service",
            principalId: "svc-1",
            permission,
            grantedBy: "operator",
          }),
        );
      await grant("t-b", "one");
      await grant("t-b", "two");
      await grant("t-a", "one");
      const tenants = () => t.run((ctx) => ctx.db.query("tenants").collect());
      expect((await tenants()).map(({ tenantId }) => tenantId).sort()).toEqual([
        "t-a",
        "t-b",
      ]);
      for (const permission of ["one", "two"])
        await t.run((ctx) =>
          revokeGrant(ctx, {
            tenantId: "t-b",
            principalKind: "service",
            principalId: "svc-1",
            permission,
          }),
        );
      expect(await tenants()).toHaveLength(2);
      expect(await t.run((ctx) => nextTenant(ctx, null))).toBe("t-a");
      expect(await t.run((ctx) => nextTenant(ctx, "t-a"))).toBe("t-b");
      expect(await t.run((ctx) => nextTenant(ctx, "t-b"))).toBeNull();
      expect(await t.run((ctx) => nextTenant(ctx, "t-"))).toBe("t-a");
    },
  );
});

describe("the audit record of step 10", () => {
  const audited = (
    subjectFrom: boolean,
    streamId: string | null,
  ): CommandDeclaration<{ n: number }, { n: number }> => ({
    name: "Audited",
    contractVersion: 1,
    input: v.object({ n: v.number() }),
    output: v.object({ n: v.number() }),
    permission: {
      permission: "probe",
      ...(subjectFrom
        ? {
            subjectFrom: ({ n }) => ({
              contextId: "depot",
              streamType: "document",
              streamId: `from-input-${n}`,
            }),
          }
        : {}),
    },
    writes: [],
    rejections: [],
    audit: { kind: "security" },
    executor: async (_ctx, { tenantId, input }) => ({
      kind: "businessFailure",
      result: input,
      versions:
        streamId === null
          ? []
          : [
              {
                tenantId,
                contextId: "depot",
                streamType: "document",
                streamId,
                version: 3,
              },
            ],
      streams: [],
    }),
  });
  const call: PipelineCall<{ n: number }> = {
    tenantId: "t-1",
    namespace: "worker",
    actor: { kind: "service", id: "svc-1" },
    requestKey: "k-1",
    causedBy: {
      kind: "event",
      tenantId: "t-1",
      contextId: "depot",
      eventId: "e-1",
    },
    input: { n: 7 },
  };
  const grantProbe = (t: App) =>
    t.run((ctx) =>
      insertGrant(ctx, {
        tenantId: "t-1",
        principalKind: "service",
        principalId: "svc-1",
        permission: "probe",
        grantedBy: "operator",
      }),
    );

  test(
    name(
      "each field comes from its source, the subject from subjectFrom when declared and from the first version otherwise",
    ),
    async () => {
      const t = app();
      await grantProbe(t);
      const response = await t.run((ctx) =>
        runPipeline(ctx, audited(true, "from-version"), call),
      );
      await t.run((ctx) =>
        runPipeline(ctx, audited(false, "from-version"), {
          ...call,
          requestKey: "k-2",
        }),
      );
      const records = await t.run((ctx) =>
        ctx.db.query("auditRecords").collect(),
      );
      expect(records).toEqual([
        {
          _id: expect.any(String),
          _creationTime: expect.any(Number),
          tenantId: "t-1",
          operationId: response.operationId,
          requestKey: "k-1",
          commandType: "Audited",
          actor: { kind: "service", id: "svc-1" },
          subject: {
            contextId: "depot",
            streamType: "document",
            streamId: "from-input-7",
          },
          kind: "security",
          decision: "businessFailure",
          causedBy: call.causedBy,
          recordedAt: expect.any(Number),
        },
        expect.objectContaining({
          requestKey: "k-2",
          subject: {
            contextId: "depot",
            streamType: "document",
            streamId: "from-version",
          },
        }),
      ]);
    },
  );

  test(
    name(
      "a declaration that sets audit with no subjectFrom and no version fails closed, leaving no receipt",
    ),
    async () => {
      const t = app();
      await grantProbe(t);
      expect(
        await plainError(
          t.run((ctx) => runPipeline(ctx, audited(false, null), call)),
        ),
      ).toContain("its audit record has no subject");
      expect(
        await t.run(async (ctx) => [
          ...(await ctx.db.query("receipts").collect()),
          ...(await ctx.db.query("auditRecords").collect()),
        ]),
      ).toEqual([]);
    },
  );
});
