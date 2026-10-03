// read-models.sdp.md fnPageInGeneration, indexReadModelList, pagination and the two rules on a
// client's page across a switch; projection-contract.sdp.md tableOrderSummaries.
import type { PaginationOptions } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { expect, test } from "vitest";
import schema from "../../example/convex/schema.js";
import { pageInGeneration } from "../../src/read-model/index.js";
import { productionTest } from "./production.js";

const tenantId = "tenant-a";
// b and c share placedAt, so a page edge between them is a tie on the order field.
const orders = [
  ["a", 1],
  ["b", 2],
  ["c", 2],
  ["d", 3],
  ["e", 4],
] as const;
type Page = { rows: string[]; isDone: boolean; continueCursor: string };

async function seeded() {
  const t = productionTest();
  await t.run(async (ctx) => {
    for (const generation of [1, 2])
      for (const [key, placedAt] of orders)
        await ctx.db.insert("orderSummaries", {
          tenantId,
          generation,
          key,
          projectionVersion: 1,
          sourceVersions: [],
          orderId: key,
          status: "placed",
          lineCount: 1,
          total: 1,
          placedAt,
        });
  });
  return t;
}
// One page of the list as listOrderSummaries reads it, in the generation then active.
function page(
  t: Awaited<ReturnType<typeof seeded>>,
  generation: number,
  opts: PaginationOptions,
): Promise<Page> {
  return t.run(async (ctx) => {
    const result = await paginator(ctx.db, schema)
      .query("orderSummaries")
      .withIndex("by_status", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("generation", generation)
          .eq("status", "placed"),
      )
      .paginate(pageInGeneration(opts, generation));
    return {
      rows: result.page.map((row) => `${row.key}@${row.generation}`),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  });
}

test("convex-test: a later page's cursor continues from the same position in the generation switched to", async () => {
  const t = await seeded();
  const first = await page(t, 1, { cursor: null, numItems: 1 });
  expect(first.rows).toEqual(["a@1"]);
  expect(
    (await page(t, 2, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["b@2", "c@2"]);
});

test("convex-test: a pinned page shows the switched-to generation's rows up to its end cursor", async () => {
  const t = await seeded();
  const first = await page(t, 1, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@1", "b@1"]);
  const pinned = await page(t, 2, {
    cursor: null,
    endCursor: first.continueCursor,
    numItems: 2,
  });
  expect(pinned.rows).toEqual(["a@2", "b@2"]);
  expect(pinned.isDone).toBe(false);
});

test("convex-test: after a switch back a cursor of generation 2 continues from the same position in generation 1", async () => {
  const t = await seeded();
  const first = await page(t, 2, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@2", "b@2"]);
  expect(
    (await page(t, 1, { cursor: first.continueCursor, numItems: 2 })).rows,
  ).toEqual(["c@1", "d@1"]);
});

test("convex-test: a page edge on an order-field tie neither repeats nor skips a row across a switch", async () => {
  const t = await seeded();
  const first = await page(t, 1, { cursor: null, numItems: 2 });
  expect(first.rows).toEqual(["a@1", "b@1"]);
  const next = await page(t, 2, {
    cursor: first.continueCursor,
    numItems: 2,
  });
  expect(next.rows).toEqual(["c@2", "d@2"]);
});

test("convex-test: pageInGeneration returns a cursor that is not an index key as it is", () => {
  for (const cursor of [null, "[]", "not json", '{"a":1}', '["a","b","c","d"]'])
    expect(pageInGeneration({ cursor, numItems: 1 }, 2)).toStrictEqual({
      cursor,
      numItems: 1,
    });
  expect(
    pageInGeneration({ cursor: null, endCursor: null, numItems: 1 }, 2),
  ).toStrictEqual({ cursor: null, endCursor: null, numItems: 1 });
});
