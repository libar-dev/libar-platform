import { convexTest } from "convex-test";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError, getConvexSize, v, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  api as parentApi,
  internal,
} from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import { api } from "../../fixture/convex/depot/_generated/api.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import {
  documentStream,
  titleCopies,
} from "../../fixture/convex/depot/streams.js";
import { readPermission } from "../../fixture/convex/readModels.js";
import schema from "../../fixture/convex/schema.js";
import {
  createJournal,
  limitReturnBytesPerCall,
  planned,
  runOperation,
  type OperationDeclaration,
} from "../../src/context/index.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
// The depot's own functions, run as an app of their own so that the test can write its tables.
function depot() {
  return convexTest(
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
}
type Depot = ReturnType<typeof depot>;
// The fixture composition with its two components, for the parent's relay across the boundary.
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
const actor = { kind: "human", id: "user-1" } as const;
const issuer = "https://fixture-issuer.test";
function call<I>(input: I, operationId: string, tenantId = "t-1") {
  return {
    tenantId,
    actor,
    operation: {
      operationId,
      causedBy: { kind: "command" as const, commandType: "fixture" },
    },
    input,
  };
}
const pad = (n: number) => String(n).padStart(3, "0");
const documentIds = (from: number, count: number, prefix = "doc-") =>
  Array.from({ length: count }, (_, i) => `${prefix}${pad(from + i)}`);
// Creates the documents through the depot's operation, at most 100 to a call.
async function createDocuments(
  t: Depot,
  ids: readonly string[],
  tenantId = "t-1",
) {
  for (let start = 0; start < ids.length; start += 100)
    await t.mutation(
      api.operations.createDocuments,
      call(
        {
          documents: ids.slice(start, start + 100).map((documentId) => ({
            documentId,
            title: `Report ${documentId}`,
          })),
        },
        `create-${tenantId}-${start}`,
        tenantId,
      ),
    );
}
type Page = PaginationResult<{ documentId: string }>;
const list = (t: Depot, paginationOpts: PaginationOptions, tenantId = "t-1") =>
  t.query(api.queries.document.list, {
    tenantId,
    paginationOpts,
  }) as Promise<Page>;
const idsOf = (page: Page) => page.page.map((dto) => dto.documentId);
async function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}
async function technicalFailure(promise: Promise<unknown>, text: RegExp) {
  const error = await rejected(promise);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toMatch(text);
}
async function markDeleted(t: Depot, streamId: string) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("streams")
      .withIndex("by_identity", (q) =>
        q
          .eq("tenantId", "t-1")
          .eq("streamType", "document")
          .eq("streamId", streamId),
      )
      .unique();
    if (row === null) throw new Error(`No stream row ${streamId}`);
    await ctx.db.patch(row._id, { deletedAt: Date.now() });
  });
}

describe("get", () => {
  test(
    name(
      "answers the subject's DTO with its stream version, and null when it is absent, of another tenant or deleted",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, ["doc-1", "doc-2"]);
      const get = (streamId: string, tenantId = "t-1") =>
        t.query(api.queries.document.get, { tenantId, streamId });
      expect(await get("doc-1")).toStrictEqual({
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
      expect(await get("none")).toBeNull();
      expect(await get("doc-1", "t-2")).toBeNull();
      await markDeleted(t, "doc-2");
      expect(await get("doc-2")).toBeNull();
    },
  );
  test(
    name("refuses a scope argument beside tenantId as a validation failure"),
    async () => {
      const t = depot();
      await technicalFailure(
        t.query(api.queries.document.get, {
          tenantId: "t-1",
          streamId: "doc-1",
          scope: { tenantId: "t-1" },
        } as never),
        /scope/,
      );
    },
  );
});

describe("list", () => {
  test(
    name(
      "pages a tenant's subjects by cursor in streamId order, each once, with none of another tenant's",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 25));
      await createDocuments(t, documentIds(0, 3, "other-"), "t-2");
      const pages: Page[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const page: Page = await list(t, { cursor, numItems: 10 });
        pages.push(page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      expect(pages.map((page) => page.page.length)).toEqual([10, 10, 5]);
      expect(pages.map((page) => page.isDone)).toEqual([false, false, true]);
      expect(pages.flatMap(idsOf)).toEqual(documentIds(0, 25));
      for (const page of pages) expect(page.pageStatus ?? null).toBeNull();
      const other = await list(t, { cursor: null, numItems: 10 }, "t-2");
      expect(idsOf(other)).toEqual(documentIds(0, 3, "other-"));
      expect(other.isDone).toBe(true);
    },
  );
  test(
    name(
      "leaves a deleted subject out after the page is read, so the page holds fewer DTOs than numItems",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 25));
      await markDeleted(t, "doc-003");
      const first = await list(t, { cursor: null, numItems: 10 });
      expect(first.page).toHaveLength(9);
      expect(first.isDone).toBe(false);
      expect(idsOf(first)).not.toContain("doc-003");
      const second = await list(t, {
        cursor: first.continueCursor,
        numItems: 10,
      });
      expect(idsOf(second)[0]).toBe("doc-010");
    },
  );
  test(
    name(
      "returns a deleted subject in its place when includeDeleted is true, and leaves it out when includeDeleted is false",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 25));
      await markDeleted(t, "doc-003");
      const page = (includeDeleted: boolean) =>
        t.query(api.queries.document.list, {
          tenantId: "t-1",
          paginationOpts: { cursor: null, numItems: 10 },
          includeDeleted,
        }) as Promise<Page>;
      const withDeleted = await page(true);
      expect(idsOf(withDeleted)).toEqual(documentIds(0, 10));
      expect(withDeleted.isDone).toBe(false);
      const second = await list(t, {
        cursor: withDeleted.continueCursor,
        numItems: 10,
      });
      expect(idsOf(second)[0]).toBe("doc-010");
      const withoutDeleted = await page(false);
      expect(withoutDeleted.page).toHaveLength(9);
      expect(idsOf(withoutDeleted)).not.toContain("doc-003");
      // includeDeleted shows another tenant's subjects no more than the default does.
      const other = await t.query(api.queries.document.list, {
        tenantId: "t-2",
        paginationOpts: { cursor: null, numItems: 10 },
        includeDeleted: true,
      });
      expect(other.page).toEqual([]);
    },
  );
  test(
    name(
      "caps numItems at the registration's item cap and ignores the caller's own row cap",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 130));
      // 100 items at the document stream's 16 KiB budget.
      const page = await list(t, {
        cursor: null,
        numItems: 500,
        maximumRowsRead: 5,
      });
      expect(page.page).toHaveLength(100);
      expect(page.pageStatus ?? null).toBeNull();
      expect(idsOf(page)).toEqual(documentIds(0, 100));
    },
  );
  test(
    name(
      "a page pinned by its end cursor that outgrows twice the item cap comes back SplitRequired, and its halves to the pinned end hold every row",
    ),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 30));
      const first = await list(t, { cursor: null, numItems: 10 });
      const endCursor = first.continueCursor;
      // 195 documents inside the first page's range: doc-000a000 to doc-000a194 sort after doc-000.
      await createDocuments(t, documentIds(0, 195, "doc-000a"));
      const pinned = await list(t, { cursor: null, numItems: 10, endCursor });
      expect(pinned.pageStatus).toBe("SplitRequired");
      expect(pinned.splitCursor).toBeTypeOf("string");
      // The row cap is 200: the capped page holds the rows up to its continueCursor only.
      expect(pinned.page).toHaveLength(200);
      const splitCursor = pinned.splitCursor as string;
      const left = await list(t, {
        cursor: null,
        numItems: 10,
        endCursor: splitCursor,
      });
      const right = await list(t, {
        cursor: splitCursor,
        numItems: 10,
        endCursor,
      });
      const range = [
        "doc-000",
        ...documentIds(0, 195, "doc-000a"),
        ...documentIds(1, 9),
      ];
      expect([...idsOf(left), ...idsOf(right)]).toEqual(range);
      const next = await list(t, { cursor: endCursor, numItems: 10 });
      expect(idsOf(next)[0]).toBe("doc-010");
    },
  );
  test(
    name("a cursor the helper cannot read is a technical failure"),
    async () => {
      const t = depot();
      await createDocuments(t, documentIds(0, 3));
      await technicalFailure(
        list(t, { cursor: "not a cursor", numItems: 10 }),
        /./,
      );
    },
  );
});

describe("the parent relays a context query across the component boundary", () => {
  test(
    name(
      "get and list reach the depot through the component API with the tenant as their one scope argument",
    ),
    async () => {
      const t = app();
      await t.mutation(
        internal.depotRelay.createDocuments,
        call(
          {
            documents: documentIds(0, 12).map((documentId) => ({
              documentId,
              title: `Report ${documentId}`,
            })),
          },
          "create-1",
        ),
      );
      // A caller granted the depot's read permission in both tenants, so each tenant's answer is
      // the context's and not a refusal.
      for (const tenantId of ["t-1", "t-2"])
        await t.mutation(internal.grants.grant, {
          tenantId,
          principalKind: "human",
          principalId: `${issuer}|user-1`,
          permission: readPermission,
          grantedBy: "operator",
        });
      const reader = t.withIdentity({ issuer, subject: "user-1" });
      const dto = (await reader.query(parentApi.depotQueries.getDocument, {
        tenantId: "t-1",
        documentId: "doc-004",
      })) as { title: string; version: { version: number } };
      expect(dto.title).toBe("Report doc-004");
      expect(dto.version.version).toBe(1);
      expect(
        await reader.query(parentApi.depotQueries.getDocument, {
          tenantId: "t-2",
          documentId: "doc-004",
        }),
      ).toBeNull();
      const first = (await reader.query(parentApi.depotQueries.listDocuments, {
        tenantId: "t-1",
        paginationOpts: { cursor: null, numItems: 10 },
      })) as Page;
      const second = (await reader.query(parentApi.depotQueries.listDocuments, {
        tenantId: "t-1",
        paginationOpts: { cursor: first.continueCursor, numItems: 10 },
      })) as Page;
      expect([...idsOf(first), ...idsOf(second)]).toEqual(documentIds(0, 12));
      expect(second.isDone).toBe(true);
    },
  );
});

describe("the bound on what an operation returns", () => {
  const titles = (length: number, count = 10) =>
    documentIds(0, count).map((documentId, i) => ({
      documentId,
      title: String(i).padEnd(length, "x"),
    }));
  test(
    name(
      "an operation whose return measures above 8 MiB fails as a technical failure and commits nothing, while it writes far less",
    ),
    async () => {
      const t = depot();
      const documents = titles(15000);
      // What the combined result alone measures: above the bound, with the rows and events far below.
      expect(
        getConvexSize({
          titles: documents.flatMap(({ title }) =>
            Array.from({ length: titleCopies }, () => title),
          ),
        }),
      ).toBeGreaterThan(limitReturnBytesPerCall);
      await technicalFailure(
        t.mutation(api.operations.copyTitles, call({ documents }, "copy-1")),
        new RegExp(
          `Operation copyTitles would return \\d+ bytes, above ${limitReturnBytesPerCall}`,
        ),
      );
      expect(
        await t.run((ctx) => ctx.db.query("streams").collect()),
      ).toHaveLength(0);
      expect(
        await t.run((ctx) => ctx.db.query("events").collect()),
      ).toHaveLength(0);
    },
  );
  test(
    name(
      "the same operation returns when its whole value measures under the bound",
    ),
    async () => {
      const t = depot();
      const outcome = await t.mutation(
        api.operations.copyTitles,
        call({ documents: titles(100) }, "copy-1"),
      );
      expect(outcome.result.titles).toHaveLength(10 * titleCopies);
      expect(getConvexSize(outcome as Value)).toBeLessThan(
        limitReturnBytesPerCall,
      );
    },
  );
  test(
    name(
      "the bound counts the events and DTOs beside the combined result, not the result alone",
    ),
    async () => {
      const t = depot();
      const journal = createJournal({
        contextId: "depot",
        history: "auditOnly",
      });
      // A result just under the bound on its own, which the DTOs and events beside it push over.
      const filler = "x".repeat(limitReturnBytesPerCall - 64 * 1024);
      const declaration: OperationDeclaration<
        Record<string, never>,
        { filler: string }
      > = {
        name: "nearlyFull",
        streams: [documentStream],
        input: {},
        returns: v.object({ filler: v.string() }),
        plan: () =>
          titles(15000, 6).map(({ documentId, title }) =>
            planned(
              documentStream,
              documentId,
              { commandType: "create", title },
              0,
            ),
          ),
        combine: () => ({ filler }),
        maxStreams: 10,
      };
      expect(getConvexSize({ filler })).toBeLessThan(limitReturnBytesPerCall);
      await technicalFailure(
        t.run((ctx) =>
          runOperation(ctx, journal, declaration, call({}, "nearly-full")),
        ),
        /Operation nearlyFull would return \d+ bytes/,
      );
    },
  );
});
