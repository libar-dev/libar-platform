import { getFunctionName, type PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import type { ConvexHttpClient } from "convex/browser";
import { expect, onTestFinished, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { fixtureBackend, measure } from "../../harness/native.js";
// The depot's get and list, registered by defineGet and defineList, read by an ordinary client
// through the fixture parent's relays across the component boundary.
type Page = PaginationResult<{ documentId: string }>;
type Opts = { cursor: string | null; numItems: number; endCursor?: string };
const pad = (n: number) => String(n).padStart(3, "0");
const documentIds = (from: number, count: number, prefix = "doc-") =>
  Array.from({ length: count }, (_, i) => `${prefix}${pad(from + i)}`);
const idsOf = (page: Page) => page.page.map((dto) => dto.documentId);
// Creates the documents through the depot's operation with admin access, at most 100 to a call.
async function createDocuments(
  backend: Backend,
  ids: readonly string[],
  tenantId = "t-1",
) {
  for (let start = 0; start < ids.length; start += 100)
    await backend.admin.run(
      getFunctionName(internal.depotRelay.createDocuments),
      {
        tenantId,
        actor: { kind: "operator", id: "native-test" },
        operation: {
          operationId: `create-${tenantId}-${ids[start]}`,
          causedBy: { kind: "command", commandType: "fixture" },
        },
        input: {
          documents: ids.slice(start, start + 100).map((documentId) => ({
            documentId,
            title: `Report ${documentId}`,
          })),
        },
      },
    );
}
const read = (
  client: ConvexHttpClient,
  paginationOpts: Opts,
  tenantId = "t-1",
) =>
  client.query(api.depotQueries.listDocuments, {
    tenantId,
    paginationOpts,
  }) as Promise<Page>;

test("native: get answers a subject's DTO through the parent, and null for an absent subject or another tenant's", async () => {
  const backend = await fixtureBackend();
  await createDocuments(backend, ["doc-1"]);
  const client = ordinaryClient(backend.url);
  const get = (tenantId: string, documentId: string) =>
    client.query(api.depotQueries.getDocument, { tenantId, documentId });
  expect(await get("t-1", "doc-1")).toStrictEqual({
    documentId: "doc-1",
    status: "draft",
    title: "Report doc-1",
    amendments: 0,
    version: {
      tenantId: "t-1",
      contextId: "depot",
      streamType: "document",
      streamId: "doc-1",
      version: 1,
    },
  });
  expect(await get("t-1", "none")).toBeNull();
  expect(await get("t-2", "doc-1")).toBeNull();
});

test("native: a list paged by the cursor pair across the boundary stays contiguous, and a page that outgrows its row cap splits into two halves that hold every row", async () => {
  const backend = await fixtureBackend();
  await createDocuments(backend, documentIds(0, 30));
  await createDocuments(backend, documentIds(0, 3, "other-"), "t-2");
  const client = ordinaryClient(backend.url);
  const socket = ordinarySocketClient(backend.url);
  onTestFinished(() => socket.close());
  // Read each page once, then subscribe to it with the end cursor that read returned; the last page
  // is subscribed with no end cursor, so it follows rows added after it.
  const pages: { opts: Opts; watch: ReturnType<typeof watch> }[] = [];
  const watch = (opts: Opts) =>
    watchQuery(socket, api.depotQueries.listDocuments, {
      tenantId: "t-1",
      paginationOpts: opts,
    });
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const first: Page = await read(client, { cursor, numItems: 10 });
    const opts: Opts = first.isDone
      ? { cursor, numItems: 10 }
      : { cursor, numItems: 10, endCursor: first.continueCursor };
    const pinned = watch(opts);
    await pinned.until(
      (page) => idsOf(page as Page).join() === idsOf(first).join(),
      `page ${i} pinned`,
    );
    pages.push({ opts, watch: pinned });
    if (first.isDone) break;
    cursor = first.continueCursor;
  }
  const current = () => pages.map(({ watch }) => watch.values.at(-1) as Page);
  // A full page does not know it is the last: the page after it is empty and done.
  expect(current().map((page) => page.page.length)).toEqual([10, 10, 10, 0]);
  expect(current().flatMap(idsOf)).toEqual(documentIds(0, 30));
  // A document after the last one joins the last page, which has no end cursor.
  await createDocuments(backend, ["doc-100"]);
  const last = pages.at(-1)?.watch;
  await last?.until(
    (page) => idsOf(page as Page).includes("doc-100"),
    "the last page follows an added row",
  );
  // 195 documents inside the first page's range: with the row cap at twice the item cap of 100, the
  // pinned first page now reads past its cap.
  const inserted = documentIds(0, 195, "doc-000a");
  await createDocuments(backend, inserted);
  const firstWatch = pages[0]?.watch;
  const split = (await firstWatch?.until(
    (page) => (page as Page).pageStatus === "SplitRequired",
    "the first page split",
    10000,
  )) as Page;
  measure("splitPage", {
    rows: split.page.length,
    pageStatus: split.pageStatus ?? null,
    splitCursor: typeof split.splitCursor,
  });
  expect(split.splitCursor).toBeTypeOf("string");
  expect(split.page).toHaveLength(200);
  // The client replaces the page with two, the second ending at the end cursor it subscribed with.
  const endCursor = pages[0]?.opts.endCursor as string;
  const splitCursor = split.splitCursor as string;
  const left = await read(client, {
    cursor: null,
    numItems: 10,
    endCursor: splitCursor,
  });
  const right = await read(client, {
    cursor: splitCursor,
    numItems: 10,
    endCursor,
  });
  measure("halves", { left: left.page.length, right: right.page.length });
  // Each half holds more than numItems + 1 rows, which the helper marks SplitRecommended, not Required.
  expect([left.pageStatus, right.pageStatus]).toEqual([
    "SplitRecommended",
    "SplitRecommended",
  ]);
  const whole = [
    ...idsOf(left),
    ...idsOf(right),
    ...current().slice(1).flatMap(idsOf),
  ];
  expect(whole).toEqual([
    "doc-000",
    ...inserted,
    ...documentIds(1, 29),
    "doc-100",
  ]);
  expect(whole.some((id) => id.startsWith("other-"))).toBe(false);
});

test("native: a cursor the list cannot read is a technical failure, not a rejection", async () => {
  const backend = await fixtureBackend();
  await createDocuments(backend, documentIds(0, 3));
  const error = await read(ordinaryClient(backend.url), {
    cursor: "not a cursor",
    numItems: 10,
  }).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  measure("malformedCursor", String(error).slice(0, 300));
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
});
