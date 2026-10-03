// read-models.sdp.md fnPageInGeneration, fnListOrSummary, indexReadModelList, pagination and the two
// rules on a client's page across a switch; projection-contract.sdp.md tableOrderSummaries. Every case
// runs through a composition's list entry.
import type { PaginationOptions } from "convex/server";
import { expect, test } from "vitest";
import {
  api as productionApi,
  internal as productionInternal,
} from "../../example/convex/_generated/api.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import {
  api as fixtureApi,
  internal as fixtureInternal,
} from "../../fixture/convex/_generated/api.js";
import { readPermission } from "../../fixture/convex/readModels.js";
import { productionTest } from "./production.js";
import { rebuildApp } from "./rebuild-support.js";

const issuer = "https://page.test";
const tenantId = "tenant-a";
const refused = "The cursor is not from this list";
// b and c share placedAt, so a page edge between them is a tie on the order field.
const orders = [
  ["a", 1],
  ["b", 2],
  ["c", 2],
  ["d", 3],
  ["e", 4],
] as const;
type Production = ReturnType<typeof productionTest>;
type Page = { rows: string[]; isDone: boolean; continueCursor: string };
const generationRow = (readModel: string, generation: number) => ({
  readModel,
  generation,
  projectionVersion: 1,
  state: generation === 1 ? ("active" as const) : ("verified" as const),
  pauseRequired: false,
  fence: 1,
  startedAt: 0,
  startedBy: "operator",
  changedAt: 0,
  changedBy: "operator",
});

// Generations 1 and 2 of the order summary hold the same orders in two tenants; a row's total is the
// generation that wrote it, so a page shows which generation it read. Generation 1 is active.
async function seeded() {
  const t = productionTest();
  for (const tenant of [tenantId, "tenant-b"])
    await t.mutation(productionInternal.grants.grant, {
      tenantId: tenant,
      principalKind: "human",
      principalId: `${issuer}|reader`,
      permission: readOrdersPermission,
      grantedBy: "operator",
    });
  await t.run(async (ctx) => {
    for (const generation of [1, 2]) {
      await ctx.db.insert(
        "generations",
        generationRow("orderSummary", generation),
      );
      for (const tenant of [tenantId, "tenant-b"])
        for (const [key, placedAt] of orders)
          await ctx.db.insert("orderSummaries", {
            tenantId: tenant,
            generation,
            key,
            projectionVersion: 1,
            sourceVersions: [],
            orderId: key,
            status: "placed",
            lineCount: 1,
            total: generation,
            placedAt,
          });
    }
  });
  return t;
}
// The switch as the registry records it: the named generation active, the other retired.
async function activate(t: Production, generation: number) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("generations").collect())
      await ctx.db.patch(row._id, {
        state: row.generation === generation ? "active" : "retired",
      });
  });
}
async function page(
  t: Production,
  opts: PaginationOptions,
  args: { tenantId?: string; status?: "placed" | "cancelled" } = {},
): Promise<Page> {
  const result = await t
    .withIdentity({ issuer, subject: "reader" })
    .query(productionApi.readModels.listOrderSummaries, {
      tenantId,
      status: "placed",
      ...args,
      paginationOpts: opts,
    });
  return {
    rows: result.page.map((row) => `${row.key}@${row.total}`),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  };
}

test("convex-test: a later page's cursor continues from the same position in the generation switched to", async () => {
  const t = await seeded();
  const first = await page(t, { cursor: null, numItems: 1 });
  expect(first.rows).toEqual(["a@1"]);
  await activate(t, 2);
  expect(
    (await page(t, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["b@2", "c@2"]);
});

test("convex-test: a pinned page shows the switched-to generation's rows up to its end cursor", async () => {
  const t = await seeded();
  const first = await page(t, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@1", "b@1"]);
  await activate(t, 2);
  const pinned = await page(t, {
    cursor: null,
    endCursor: first.continueCursor,
    numItems: 2,
  });
  expect(pinned.rows).toEqual(["a@2", "b@2"]);
  expect(pinned.isDone).toBe(false);
});

test("convex-test: a pinned page's continueCursor, already moved, pages on across a switch back", async () => {
  const t = await seeded();
  const first = await page(t, { cursor: null, numItems: 2 });
  await activate(t, 2);
  const pinned = await page(t, {
    cursor: null,
    endCursor: first.continueCursor,
    numItems: 2,
  });
  expect(pinned.rows).toEqual(["a@2", "b@2"]);
  await activate(t, 1);
  expect(
    (await page(t, { cursor: pinned.continueCursor, numItems: 2 })).rows,
  ).toEqual(["c@1", "d@1"]);
});

test("convex-test: after a switch back a cursor of generation 2 continues from the same position in generation 1", async () => {
  const t = await seeded();
  await activate(t, 2);
  const first = await page(t, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@2", "b@2"]);
  await activate(t, 1);
  expect(
    (await page(t, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["c@1", "d@1"]);
});

test("convex-test: a page edge on an order-field tie neither repeats nor skips a row across a switch", async () => {
  const t = await seeded();
  const first = await page(t, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@1", "b@1"]);
  await activate(t, 2);
  expect(
    (await page(t, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["c@2", "d@2"]);
});

test("convex-test: a cursor of another tenant, another status, the wrong length or a non-numeric generation is refused", async () => {
  const t = await seeded();
  const other = await page(
    t,
    { cursor: null, numItems: 2 },
    { tenantId: "tenant-b" },
  );
  const key = JSON.parse(other.continueCursor) as unknown[];
  const cursors = [
    other.continueCursor,
    JSON.stringify([tenantId, 1, "cancelled", ...key.slice(3)]),
    JSON.stringify([tenantId, 1, "placed", ...key.slice(3, 6)]),
    JSON.stringify([tenantId, "1", "placed", ...key.slice(3)]),
    "not json",
  ];
  for (const cursor of cursors) {
    await expect(page(t, { cursor, numItems: 2 })).rejects.toThrow(refused);
    await expect(
      page(t, { cursor: null, endCursor: cursor, numItems: 2 }),
    ).rejects.toThrow(refused);
  }
});

test("convex-test: the fixture's document list moves a cursor across a switch and refuses another tenant's", async () => {
  const t = rebuildApp();
  for (const tenant of [tenantId, "tenant-b"])
    await t.mutation(fixtureInternal.grants.grant, {
      tenantId: tenant,
      principalKind: "human",
      principalId: `${issuer}|reader`,
      permission: readPermission,
      grantedBy: "operator",
    });
  await t.run(async (ctx) => {
    for (const generation of [1, 2]) {
      await ctx.db.insert(
        "generations",
        generationRow("documentSummary", generation),
      );
      for (const tenant of [tenantId, "tenant-b"])
        for (const [key] of orders)
          await ctx.db.insert("documentSummaries", {
            tenantId: tenant,
            generation,
            key,
            projectionVersion: 1,
            sourceVersions: [],
            documentId: key,
            status: "draft",
            title: `${key}@${generation}`,
          });
    }
  });
  const list = async (tenant: string, opts: PaginationOptions) => {
    const result = await t
      .withIdentity({ issuer, subject: "reader" })
      .query(fixtureApi.readModels.listDocumentSummaries, {
        tenantId: tenant,
        status: "draft",
        paginationOpts: opts,
      });
    return { ...result, rows: result.page.map(({ title }) => title) };
  };
  const first = await list(tenantId, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@1", "b@1"]);
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("generations").collect())
      await ctx.db.patch(row._id, {
        state: row.generation === 2 ? "active" : "retired",
      });
  });
  expect(
    (await list(tenantId, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["c@2", "d@2"]);
  await expect(
    list("tenant-b", { cursor: first.continueCursor, numItems: 2 }),
  ).rejects.toThrow(refused);
});
