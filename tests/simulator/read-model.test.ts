import { convexTest } from "convex-test";
import { ConvexError, getConvexSize, v, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { readPermission } from "../../fixture/convex/readModels.js";
import { documentSummary } from "../../fixture/convex/summaries.js";
import schema from "../../fixture/convex/schema.js";
import {
  authorizeQuery,
  insertGrant,
  runPipeline,
  type CommandDeclaration,
} from "../../src/command/index.js";
import type { StreamDto } from "../../src/context/index.js";
import type { StreamVersion } from "../../src/kernel/index.js";
import {
  activeGeneration,
  applyProjection,
  generationsToWrite,
  limitReadModelWritesPerCommand,
  type ReadModel,
  type ReadModelBinding,
  type WritableGeneration,
} from "../../src/read-model/index.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
// The fixture composition with its two components, as the native backend deploys it.
function app() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
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
const issuer = "https://fixture-issuer.test";
const operator = { kind: "operator", id: "operator-1" } as const;
async function caller(t: App, subject: string, permission: string) {
  await t.mutation(internal.grants.grant, {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${issuer}|${subject}`,
    permission,
    grantedBy: "operator",
  });
  return t.withIdentity({ issuer, subject });
}
const activate = (t: App, readModel = "documentSummary") =>
  t.mutation(internal.readModels.activate, { readModel, startedBy: operator });
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}
async function technicalFailure(promise: Promise<unknown>, text: string) {
  const error = await failure(promise);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toContain(text);
}
async function errorData(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Record<string, Value>>).data;
}
const summaries = (t: App) =>
  t.run((ctx) => ctx.db.query("documentSummaries").collect());
const generations = (t: App) =>
  t.run((ctx) => ctx.db.query("generations").collect());
const documentVersion = (streamId: string, version: number) => ({
  tenantId: "t-1",
  contextId: "depot",
  streamType: "document",
  streamId,
  version,
});
// A streams entry for a document, as the depot returns one, with no context call behind it.
function documentEntry(
  documentId: string,
  version = 1,
  title = `Report ${documentId}`,
  streamType = "document",
): StreamDto {
  const streamVersion = { ...documentVersion(documentId, version), streamType };
  return {
    dto: {
      documentId,
      status: "draft",
      title,
      amendments: 0,
      version: streamVersion,
    },
    version: streamVersion,
    appended: 1,
    created: version === 1,
    events: [],
  };
}
const documentSource = { contextId: "depot", streamType: "document" };
// A command whose executor returns the entries it is given and calls no context.
function returning(
  entries: StreamDto[],
  readModels: readonly ReadModelBinding[],
  writes = [documentSource],
): CommandDeclaration<{ n: number }, null> {
  return {
    name: "Returning",
    contractVersion: 1,
    input: v.object({ n: v.number() }),
    output: v.null(),
    permission: { permission: "probe" },
    writes,
    readModels,
    rejections: [],
    executor: async () => ({
      kind: "applied",
      result: null,
      versions: entries.map((entry) => entry.version),
      streams: entries,
    }),
  };
}
let calls = 0;
// Runs the declaration's pipeline in one mutation, as its internal entry would, each run under a
// request key of its own.
function run(t: App, declaration: CommandDeclaration<{ n: number }, null>) {
  calls += 1;
  return t.run(async (ctx) => {
    await insertGrant(ctx, {
      tenantId: "t-1",
      principalKind: "service",
      principalId: "svc-1",
      permission: "probe",
      grantedBy: "operator",
    });
    return runPipeline(ctx, declaration, {
      tenantId: "t-1",
      namespace: "worker",
      actor: { kind: "service", id: "svc-1" },
      requestKey: `k-${calls}`,
      input: { n: 1 },
    });
  });
}
// The fixture's read model over the same table, with another budget or projection.
function variant(
  change: Partial<ReadModel<Record<string, Value>, Record<string, Value>>>,
): ReadModel<Record<string, Value>, Record<string, Value>> {
  return {
    ...(documentSummary as unknown as ReadModel<
      Record<string, Value>,
      Record<string, Value>
    >),
    ...change,
  };
}
type GenerationState =
  | "building"
  | "verifying"
  | "verified"
  | "active"
  | "retired"
  | "aborted"
  | "purged";
// A registry row in the given state, written directly: only the first activation exists as a
// transition, and the reads must be shown against every state.
const generationRow = (generation: number, state: GenerationState) =>
  ({
    readModel: "documentSummary",
    generation,
    projectionVersion: 1,
    state,
    pauseRequired: false,
    batchSize: 0,
    fence: 0,
    batchesDone: 0,
    rowsWritten: 0,
    rowsSkipped: 0,
    misses: 0,
    startedAt: 0,
    startedBy: operator,
    updatedAt: 0,
  }) as const;
async function registry(t: App, rows: [number, GenerationState][]) {
  await t.run(async (ctx) => {
    for (const [generation, state] of rows)
      await ctx.db.insert("generations", generationRow(generation, state));
  });
}

describe("the first activation", () => {
  test(
    name(
      "inserts generation 1 as active with the projection's version, and a second activation is refused with the generation and its state",
    ),
    async () => {
      const t = app();
      expect(await activate(t)).toBe(1);
      expect(await generations(t)).toMatchObject([
        {
          readModel: "documentSummary",
          generation: 1,
          projectionVersion: 1,
          state: "active",
          pauseRequired: false,
          startedBy: operator,
          batchesDone: 0,
          rowsWritten: 0,
        },
      ]);
      await technicalFailure(
        activate(t),
        "Read model documentSummary already has generation 1, which is active",
      );
      expect(await generations(t)).toHaveLength(1);
    },
  );

  test(
    name(
      "is refused for a read model with a row in any other state, and for a name the composition does not declare",
    ),
    async () => {
      const t = app();
      await registry(t, [[3, "aborted"]]);
      await technicalFailure(
        activate(t),
        "Read model documentSummary already has generation 3, which is aborted",
      );
      await technicalFailure(
        activate(t, "nope"),
        "This deployment declares no read model nope",
      );
    },
  );
});

describe("the registry's reads", () => {
  const read = (t: App) =>
    t.run(async (ctx) => ({
      write: await generationsToWrite(ctx, "documentSummary"),
      query: await activeGeneration(ctx, "documentSummary"),
    }));
  const writable = (
    role: WritableGeneration["role"],
    generation: number,
  ): WritableGeneration => ({ role, generation, projectionVersion: 1 });

  test(
    name(
      "a command writes the active generation first and the one in building, verifying or verified second; a query reads the active one",
    ),
    async () => {
      const t = app();
      expect(await read(t)).toEqual({ write: [], query: undefined });
      await registry(t, [
        [1, "retired"],
        [2, "aborted"],
        [3, "purged"],
      ]);
      expect(await read(t)).toEqual({ write: [], query: undefined });
      for (const state of ["building", "verifying", "verified"] as const) {
        const other = app();
        await registry(other, [
          [4, state],
          [3, "active"],
        ]);
        expect(await read(other)).toEqual({
          write: [writable("active", 3), writable("building", 4)],
          query: 3,
        });
      }
      await registry(t, [[4, "building"]]);
      expect(await read(t)).toEqual({
        write: [writable("building", 4)],
        query: undefined,
      });
    },
  );

  test(
    name(
      "two active generations, or two in building, verifying or verified, are a plain Error",
    ),
    async () => {
      for (const states of [
        ["active", "active"],
        ["building", "verified"],
        ["verifying", "verified"],
      ] as const) {
        const t = app();
        await registry(t, [
          [1, states[0]],
          [2, states[1]],
        ]);
        await technicalFailure(
          t.run((ctx) => generationsToWrite(ctx, "documentSummary")),
          "Read model documentSummary has",
        );
      }
    },
  );
});

describe("step 9", () => {
  test(
    name(
      "CreateSummarizedDocument writes the document's summary row in generation 1, with the row conventions and the command's versions",
    ),
    async () => {
      const t = app();
      await activate(t);
      const user = await caller(t, "user-1", permissions.documents);
      const response = await user.mutation(
        api.depotCommands.createSummarizedDocument,
        { tenantId: "t-1", input: { documentId: "doc-1", title: "Report" } },
      );
      expect(response.versions).toEqual([documentVersion("doc-1", 1)]);
      const [row, ...others] = await summaries(t);
      expect(others).toEqual([]);
      expect(row).toEqual({
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        tenantId: "t-1",
        generation: 1,
        key: "doc-1",
        projectionVersion: 1,
        sourceVersions: response.versions,
        documentId: "doc-1",
        status: "draft",
        title: "Report",
      });
    },
  );

  test(
    name(
      "a command whose read model has no generation to write is a plain Error that names the command and the read model, and nothing is stored",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1", permissions.documents);
      const call = {
        tenantId: "t-1",
        requestKey: "k-1",
        input: { documentId: "doc-1", title: "Report" },
      };
      await technicalFailure(
        user.mutation(api.depotCommands.createSummarizedDocument, call),
        "CreateSummarizedDocument writes the read model documentSummary, which has no generation to write",
      );
      const reader = await caller(t, "user-1", readPermission);
      expect(
        await reader.query(api.depotQueries.getDocument, {
          tenantId: "t-1",
          documentId: "doc-1",
        }),
      ).toBeNull();
      expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
        [],
      );
      expect(await summaries(t)).toEqual([]);
      // A retired generation is not written either.
      await registry(t, [[1, "retired"]]);
      await technicalFailure(
        user.mutation(api.depotCommands.createSummarizedDocument, call),
        "which has no generation to write",
      );
    },
  );

  test(
    name(
      "a streams entry of a pair the declaration does not list in writes is a plain Error, with or without a read model",
    ),
    async () => {
      const t = app();
      await activate(t);
      const stock = documentEntry("p-1", 1, "x", "stock");
      for (const readModels of [
        [],
        [{ readModel: documentSummary, source: documentSource }],
      ])
        await technicalFailure(
          run(t, returning([documentEntry("doc-1"), stock], readModels)),
          "Returning wrote depot/stock, which its declaration does not list in writes",
        );
      expect(
        await run(
          t,
          returning(
            [documentEntry("doc-1"), stock],
            [],
            [documentSource, { contextId: "depot", streamType: "stock" }],
          ),
        ),
      ).toMatchObject({ kind: "applied" });
    },
  );

  test(
    name(
      "a command writes at most 4 read-model rows: a fifth is a plain Error, and an entry the projection writes no row for is not counted",
    ),
    async () => {
      const t = app();
      await activate(t);
      const entries = (count: number) =>
        Array.from({ length: count }, (_, i) => documentEntry(`doc-${i}`));
      const binding = { readModel: documentSummary, source: documentSource };
      expect(limitReadModelWritesPerCommand).toBe(4);
      await technicalFailure(
        run(t, returning(entries(5), [binding])),
        "Returning writes more than 4 read-model rows",
      );
      expect(await summaries(t)).toEqual([]);
      // A projection that answers no row for one of five entries writes four rows.
      const skipping = variant({
        projection: {
          ...documentSummary.projection,
          project: (tenantId, dto, versions) =>
            dto["documentId"] === "doc-0"
              ? null
              : documentSummary.projection.project(
                  tenantId,
                  dto as never,
                  versions,
                ),
        },
      });
      await run(
        t,
        returning(entries(5), [
          { readModel: skipping, source: documentSource },
        ]),
      );
      expect((await summaries(t)).map((row) => row.key)).toEqual([
        "doc-1",
        "doc-2",
        "doc-3",
        "doc-4",
      ]);
    },
  );

  test(
    name(
      "a row above its read model's budget is a plain Error, a row at it is written, and a budget above 65,536 bytes is refused",
    ),
    async () => {
      const t = app();
      await activate(t);
      const entry = documentEntry("doc-1", 1, "x".repeat(300));
      const bytes = getConvexSize({
        documentId: "doc-1",
        status: "draft",
        title: "x".repeat(300),
        tenantId: "t-1",
        generation: 1,
        key: "doc-1",
        projectionVersion: 1,
        sourceVersions: [entry.version],
      });
      const bound = (rowBudgetBytes: number) => [
        { readModel: variant({ rowBudgetBytes }), source: documentSource },
      ];
      await technicalFailure(
        run(t, returning([entry], bound(bytes - 1))),
        `Row doc-1 of read model documentSummary would be saved at ${bytes} bytes, above its budget of ${bytes - 1}`,
      );
      expect(await summaries(t)).toEqual([]);
      await run(t, returning([entry], bound(bytes)));
      expect(await summaries(t)).toHaveLength(1);
      await technicalFailure(
        run(t, returning([entry], bound(65537))),
        "Read model documentSummary declares a row budget of 65537 bytes, above 65536",
      );
    },
  );

  test(
    name(
      "the entry's created flag picks the mode: a created entry is live-created and a later one live-updated",
    ),
    async () => {
      const t = app();
      await registry(t, [
        [1, "active"],
        [2, "building"],
      ]);
      const binding = { readModel: documentSummary, source: documentSource };
      // Created: inserted in both generations.
      await run(t, returning([documentEntry("doc-1")], [binding]));
      // Updated, for a subject the building generation has no row of: written in the active one only.
      await run(t, returning([documentEntry("doc-2", 2)], [binding]));
      expect(
        (await summaries(t)).map(({ key, generation }) => [key, generation]),
      ).toEqual([
        ["doc-1", 1],
        ["doc-1", 2],
        ["doc-2", 1],
      ]);
    },
  );
});

describe("applyProjection", () => {
  const apply = (
    t: App,
    dto: Value,
    mode: "live-created" | "live-updated",
    generations: WritableGeneration[],
    readModel = variant({}),
  ) =>
    t.run((ctx) =>
      applyProjection(ctx, readModel, {
        tenantId: "t-1",
        dto: dto as Record<string, Value>,
        versions: [(dto as { version: StreamVersion }).version],
        mode,
        generations,
      }),
    );
  const active = { role: "active", generation: 1, projectionVersion: 1 };
  const building = { role: "building", generation: 2, projectionVersion: 1 };

  test(
    name(
      "in the active generation a live write always lands; in a building one live-updated replaces a row and skips a missing one",
    ),
    async () => {
      const t = app();
      const first = documentEntry("doc-1").dto;
      const second = documentEntry("doc-1", 2, "Amended").dto;
      expect(
        await apply(t, second, "live-updated", [
          active as WritableGeneration,
          building as WritableGeneration,
        ]),
      ).toEqual(["inserted", "skipped-missing"]);
      expect(
        await apply(t, first, "live-created", [
          active as WritableGeneration,
          building as WritableGeneration,
        ]),
      ).toEqual(["updated", "inserted"]);
      expect(
        await apply(t, second, "live-updated", [
          building as WritableGeneration,
          active as WritableGeneration,
        ]),
      ).toEqual(["updated", "updated"]);
      expect(
        (await summaries(t)).map(({ generation, title, sourceVersions }) => [
          generation,
          title,
          sourceVersions[0]?.version,
        ]),
      ).toEqual([
        [1, "Amended", 2],
        [2, "Amended", 2],
      ]);
    },
  );

  test(
    name(
      "a projection that answers no row deletes the row where it exists and leaves the generation unchanged where it does not",
    ),
    async () => {
      const t = app();
      const none = variant({
        projection: { ...documentSummary.projection, project: () => null },
      });
      await apply(t, documentEntry("doc-1").dto, "live-created", [
        active as WritableGeneration,
      ]);
      expect(
        await apply(
          t,
          documentEntry("doc-1", 2).dto,
          "live-updated",
          [active as WritableGeneration, building as WritableGeneration],
          none,
        ),
      ).toEqual(["deleted", "unchanged"]);
      expect(await summaries(t)).toEqual([]);
    },
  );

  test(
    name(
      "a generation is written with the declared projection whatever projection version it records, and the row records the projection's",
    ),
    async () => {
      const t = app();
      await apply(t, documentEntry("doc-1").dto, "live-created", [
        { role: "active", generation: 1, projectionVersion: 7 },
      ]);
      expect(await summaries(t)).toMatchObject([
        { generation: 1, projectionVersion: 1 },
      ]);
    },
  );
});

describe("step 1", () => {
  test(
    name(
      "a tenant ID or request key above 256 bytes is invalidInput naming the field, and a declaration name above it a plain Error",
    ),
    async () => {
      const t = app();
      const user = await caller(t, "user-1", permissions.documents);
      const create = (tenantId: string, requestKey?: string) =>
        user.mutation(api.depotCommands.createDocument, {
          tenantId,
          ...(requestKey === undefined ? {} : { requestKey }),
          input: { documentId: "doc-1", title: "Report" },
        });
      for (const [field, tenantId, requestKey] of [
        ["tenantId", "t".repeat(257), undefined],
        ["requestKey", "t-1", "k".repeat(257)],
      ] as const)
        expect(await errorData(create(tenantId, requestKey))).toEqual({
          kind: "rejection",
          code: "invalidInput",
          commandType: "CreateDocument",
          message: `${field} has at most 256 bytes of UTF-8`,
          details: { field, length: 257, limit: 256 },
        });
      // At the bound the call passes step 1 and is refused at step 4, for want of a grant.
      expect(await errorData(create("t".repeat(256)))).toMatchObject({
        code: "forbidden",
      });
      expect(await create("t-1", "k".repeat(256))).toMatchObject({
        kind: "applied",
      });
      await technicalFailure(
        run(t, { ...returning([], []), name: "N".repeat(257) }),
        "A command type has at most 256 bytes of UTF-8, and this declaration's name has 257",
      );
    },
  );
});

describe("authorizeQuery and the parent list", () => {
  const list = (
    t: Pick<App, "query">,
    numItems = 10,
    status: "draft" | "submitted" = "draft",
    tenantId = "t-1",
  ) =>
    t.query(api.readModels.listDocumentSummaries, {
      tenantId,
      status,
      paginationOpts: { cursor: null, numItems },
    });

  test(
    name(
      "a caller with no identity is refused unauthenticated and one with no grant forbidden, each naming the query, before anything is read",
    ),
    async () => {
      const t = app();
      expect(await errorData(list(t))).toEqual({
        kind: "rejection",
        code: "unauthenticated",
        commandType: "listDocumentSummaries",
        message: "listDocumentSummaries needs an authenticated caller",
      });
      const stranger = await caller(t, "user-2", permissions.documents);
      expect(await errorData(list(stranger))).toEqual({
        kind: "rejection",
        code: "forbidden",
        commandType: "listDocumentSummaries",
        message: "The caller may not read listDocumentSummaries in this tenant",
        details: { reason: "no_grant" },
      });
      // Authorization comes before the registry read: with no generation, a granted caller fails.
      const reader = await caller(t, "user-1", readPermission);
      await technicalFailure(
        list(reader),
        "The read model documentSummary has no active generation",
      );
      expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
        [],
      );
    },
  );

  test(
    name(
      "authorizeQuery makes a service actor for a configured service issuer and returns the actor it authorized",
    ),
    async () => {
      const t = app();
      await t.run((ctx) =>
        insertGrant(ctx, {
          tenantId: "t-1",
          principalKind: "service",
          principalId: `${issuer}|svc-1`,
          permission: readPermission,
          grantedBy: "operator",
        }),
      );
      const service = t.withIdentity({ issuer, subject: "svc-1" });
      const policy = {
        name: "probe",
        tenantId: "t-1",
        permission: readPermission,
      };
      expect(
        await service.run((ctx) =>
          authorizeQuery(ctx, policy, new Set([issuer])),
        ),
      ).toEqual({ kind: "service", id: `${issuer}|svc-1`, issuer });
      expect(
        await errorData(service.run((ctx) => authorizeQuery(ctx, policy))),
      ).toMatchObject({ code: "forbidden", details: { reason: "no_grant" } });
    },
  );

  test(
    name(
      "the list reads the active generation's rows of the tenant and status, without the document ID, creation time or generation, at most 100 to a page",
    ),
    async () => {
      const t = app();
      await registry(t, [
        [1, "retired"],
        [2, "active"],
      ]);
      const binding = { readModel: documentSummary, source: documentSource };
      const ids = Array.from(
        { length: 101 },
        (_, i) => `doc-${String(i).padStart(3, "0")}`,
      );
      await run(
        t,
        returning(
          ids.slice(0, 4).map((id) => documentEntry(id)),
          [binding],
        ),
      );
      await t.run(async (ctx) => {
        const row = (key: string, generation: number, tenantId = "t-1") => ({
          tenantId,
          generation,
          key,
          projectionVersion: 1,
          sourceVersions: [],
          documentId: key,
          status: "draft" as const,
          title: key,
        });
        for (const key of ids.slice(4))
          await ctx.db.insert("documentSummaries", row(key, 2));
        await ctx.db.insert("documentSummaries", row("old", 1));
        await ctx.db.insert("documentSummaries", row("other", 2, "t-2"));
      });
      const reader = await caller(t, "user-1", readPermission);
      const first = await list(reader, 3);
      expect(first.page).toEqual(
        ids.slice(0, 3).map((id) => ({
          tenantId: "t-1",
          key: id,
          projectionVersion: 1,
          sourceVersions: [documentVersion(id, 1)],
          documentId: id,
          status: "draft",
          title: `Report ${id}`,
        })),
      );
      const whole = await list(reader, 500);
      expect(whole.page.map((row) => row.key)).toEqual(ids.slice(0, 100));
      expect(whole.isDone).toBe(false);
      expect((await list(reader, 10, "submitted")).page).toEqual([]);
    },
  );
});
