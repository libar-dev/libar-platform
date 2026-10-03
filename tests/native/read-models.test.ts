import { installFixtureReadModel } from "./rebuild-install.js";
import { getFunctionName, type PaginationResult } from "convex/server";
import { ConvexError, convexToJson, type Value } from "convex/values";
import type { ConvexHttpClient } from "convex/browser";
import { expect, onTestFinished, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { readPermission } from "../../fixture/convex/readModels.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";
// The fixture composition's read model, documentSummary: written by CreateSummarizedDocument at the
// pipeline's step 9, made writable by the first rebuild, and read through the parent list
// listDocumentSummaries, which authorizes before it reads.
const identifier = "depotCommands:createSummarizedDocument";
const operator = "native-test";
const install = (backend: Backend) =>
  installFixtureReadModel(backend, "documentSummary");
async function grant(
  backend: Backend,
  subject: string,
  permission: string,
  tenantId = "t-1",
) {
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId,
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|${subject}`,
    permission,
    grantedBy: "native-test",
  });
}
const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
async function stored(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    events: await backend.admin.readTable("events", { component: "depot" }),
    summaries: await backend.admin.readTable("documentSummaries"),
  };
}

test("native: a command whose read model has no generation fails as a technical failure and stores nothing; after the first rebuild the same command writes its summary row in its one mutation, and another generation can be built", async () => {
  const backend = await fixtureBackend();
  await grant(backend, "user-1", permissions.documents);
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  const call = {
    tenantId: "t-1",
    requestKey: "k-1",
    input: { documentId: "doc-1", title: "Report" },
  };
  const error = await caught(
    client.mutation(api.depotCommands.createSummarizedDocument, call),
  );
  measure("noGeneration", String(error));
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(classifyThrown(error).kind).toBe("technical");
  expect(String(error)).toContain(
    "CreateSummarizedDocument writes the read model documentSummary, which has no generation to write",
  );
  expect(await stored(backend)).toEqual({
    receipts: [],
    streams: [],
    events: [],
    summaries: [],
  });
  // generation-registry.sdp.md:37; rebuild.sdp.md:115,133: the first rebuild installs generation 1.
  await install(backend);
  const registry = await backend.admin.readTable("generations");
  expect(registry).toMatchObject([
    {
      readModel: "documentSummary",
      generation: 1,
      projectionVersion: 1,
      state: "active",
      startedBy: operator,
    },
  ]);
  // rebuild.sdp.md:115: an active generation does not refuse the next rebuild.
  const nextId = await backend.admin.run(
    getFunctionName(internal.rebuild.startGeneration),
    {
      readModel: "documentSummary",
      operator,
    },
  );
  const next = (await backend.admin.readTable("generations")).find(
    (row) => row._id === nextId,
  );
  // rebuild.sdp.md:115: start takes the next generation number.
  expect(next).toMatchObject({
    generation: 2,
    projectionVersion: 1,
    startedBy: operator,
  });
  // Stop its chain before measuring the single command below.
  await backend.admin.run(getFunctionName(internal.rebuild.abortGeneration), {
    generationId: nextId,
    operator,
    reason: "keep one writable generation",
  });
  // The same command and key again: the failed attempt left no receipt, so this is new intent.
  const mark = await backend.admin.logMark();
  const response = await client.mutation(
    api.depotCommands.createSummarizedDocument,
    call,
  );
  expect(response).toMatchObject({ kind: "applied", replayed: false });
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(
      (entry) =>
        entry.identifier === identifier && entry.componentPath === null,
    ),
  );
  const own = required(
    records.find(
      (entry) =>
        entry.identifier === identifier && entry.componentPath === null,
    ),
    "the command's completion record",
  );
  // One top-level mutation wrote the receipt, the depot's rows and the summary row: the request
  // left one completion record, and no other function ran for it.
  const request = records.filter((entry) => entry.requestId === own.requestId);
  measure("summarizedCommand", {
    records: request.map(({ identifier, udfType, componentPath }) => ({
      identifier,
      udfType,
      componentPath,
    })),
    usageStats: own.usageStats,
  });
  expect(request).toHaveLength(1);
  expect(own).toMatchObject({ udfType: "Mutation", error: null });
  // Its four documents written are the receipt, the depot's stream row and event, and the summary row.
  expect(own.usageStats["databaseWriteDocuments"]).toBe(4);
  const after = await stored(backend);
  expect(after.receipts).toMatchObject([
    { requestKey: "k-1", operationId: response.operationId },
  ]);
  expect(after.events).toMatchObject([
    { streamId: "doc-1", operationId: response.operationId },
  ]);
  expect(after.summaries).toEqual([
    {
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
    },
  ]);
});

test("native: a refused parent query throws the rejection shape to an HTTP client and writes nothing, and the granted caller reads", async () => {
  const backend = await fixtureBackend();
  await install(backend);
  await grant(backend, "user-1", permissions.documents);
  const writer = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  await writer.mutation(api.depotCommands.createSummarizedDocument, {
    tenantId: "t-1",
    input: { documentId: "doc-1", title: "Report" },
  });
  const args = {
    tenantId: "t-1",
    status: "draft" as const,
    paginationOpts: { cursor: null, numItems: 10 },
  };
  const read = (client: ConvexHttpClient) =>
    client.query(api.readModels.listDocumentSummaries, args);
  const anonymous = await caught(read(ordinaryClient(backend.url)));
  const stranger = await caught(
    read(
      ordinaryClient(backend.url, {
        token: await backend.issuer.token("user-2"),
      }),
    ),
  );
  measure("refusals", {
    anonymous: convexToJson((anonymous as ConvexError<Value>).data),
    stranger: convexToJson((stranger as ConvexError<Value>).data),
  });
  for (const error of [anonymous, stranger]) {
    expect(error).toBeInstanceOf(ConvexError);
    expect(classifyThrown(error).kind).toBe("rejection");
  }
  expect((anonymous as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "unauthenticated",
    commandType: "listDocumentSummaries",
    message: "listDocumentSummaries needs an authenticated caller",
  });
  expect((stranger as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "forbidden",
    commandType: "listDocumentSummaries",
    message: "The caller may not read listDocumentSummaries in this tenant",
    details: { reason: "no_grant" },
  });
  // A subscription is refused the same way.
  const socket = ordinarySocketClient(backend.url);
  onTestFinished(() => socket.close());
  const refused = watchQuery(
    socket,
    api.readModels.listDocumentSummaries,
    args,
  );
  const subscribed = await caught(
    refused.until(() => true, "the subscription's refusal"),
  );
  expect(subscribed).toBeInstanceOf(ConvexError);
  expect((subscribed as ConvexError<Value>).data).toMatchObject({
    code: "unauthenticated",
    commandType: "listDocumentSummaries",
  });
  // The command was sent with no request key, and a read writes nothing: no receipt exists.
  expect(await backend.admin.readTable("receipts")).toEqual([]);
  await grant(backend, "user-2", readPermission);
  const page = await read(
    ordinaryClient(backend.url, {
      token: await backend.issuer.token("user-2"),
    }),
  );
  expect(page.page).toMatchObject([{ key: "doc-1", title: "Report" }]);
});

test("native: a parent list over the read model pages by the cursor pair, each page read once and then subscribed to its end cursor, with no page split and none of another tenant's rows", async () => {
  const backend = await fixtureBackend();
  await install(backend);
  for (const tenantId of ["t-1", "t-2"])
    await grant(backend, "user-1", permissions.documents, tenantId);
  await grant(backend, "user-1", readPermission);
  const token = await backend.issuer.token("user-1");
  const client = ordinaryClient(backend.url, { token });
  const pad = (n: number) => String(n).padStart(2, "0");
  const ids = Array.from({ length: 25 }, (_, i) => `doc-${pad(i)}`);
  // Created out of order, so the list's order is the key's and not the insertion's.
  for (const documentId of [...ids].reverse())
    await client.mutation(api.depotCommands.createSummarizedDocument, {
      tenantId: "t-1",
      input: { documentId, title: `Report ${documentId}` },
    });
  for (const documentId of ["doc-00", "doc-30", "doc-31"])
    await client.mutation(api.depotCommands.createSummarizedDocument, {
      tenantId: "t-2",
      input: { documentId, title: "Other" },
    });
  type Page = PaginationResult<{ key: string; tenantId: string }>;
  type Opts = { cursor: string | null; numItems: number; endCursor?: string };
  const args = (paginationOpts: Opts) => ({
    tenantId: "t-1",
    status: "draft" as const,
    paginationOpts,
  });
  const socket = ordinarySocketClient(backend.url, { token });
  onTestFinished(() => socket.close());
  const keysOf = (page: Page) => page.page.map((row) => row.key);
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const first: Page = await client.query(
      api.readModels.listDocumentSummaries,
      args({ cursor, numItems: 10 }),
    );
    const opts: Opts = first.isDone
      ? { cursor, numItems: 10 }
      : { cursor, numItems: 10, endCursor: first.continueCursor };
    const pinned = watchQuery(
      socket,
      api.readModels.listDocumentSummaries,
      args(opts),
    );
    pages.push(
      (await pinned.until(
        (page) => keysOf(page as Page).join() === keysOf(first).join(),
        `page ${i} pinned`,
      )) as Page,
    );
    if (first.isDone) break;
    cursor = first.continueCursor;
  }
  measure("readModelPages", {
    sizes: pages.map((page) => page.page.length),
    pageStatus: pages.map((page) => page.pageStatus ?? null),
  });
  expect(pages.map((page) => page.page.length)).toEqual([10, 10, 5]);
  expect(pages.flatMap(keysOf)).toEqual(ids);
  expect(pages.flatMap((page) => page.page.map((row) => row.tenantId))).toEqual(
    ids.map(() => "t-1"),
  );
  expect(pages.some((page) => page.pageStatus === "SplitRequired")).toBe(false);
});
