import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5PagesStayContiguousContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous.contract.js";
import { onTestFinished } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import type { ListPage } from "../../fixture/convex/list.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  idsOf,
  insertInsideFirstRange,
  loadPage,
  seedList,
  wholeList,
  observedPage,
} from "./list-pages.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous",
  ),
});
void anchor;
type Watch = ReturnType<typeof watchQuery<typeof api.list.page>>;
interface World {
  backend?: Backend;
  pageSize?: number;
  rows?: number;
  cap?: number;
  watches?: Watch[];
  pages?: ListPage[];
  ends?: string[];
  split?: ListPage;
}
bindExample(contract, (): World => ({}), {
  "a component list of {rows} rows that a parent query relays from paginator, read in pages of {pageSize}":
    async (world, { rows, pageSize }) => {
      const backend = await fixtureBackend();
      await seedList(ordinaryClient(backend.url), rows);
      Object.assign(world, { backend, rows, pageSize });
    },
  "a client subscribed to every page, each bounded by the end cursor its first load returned":
    async (world) => {
      const backend = required(world.backend, "the backend");
      const client = ordinaryClient(backend.url);
      const socket = ordinarySocketClient(backend.url);
      onTestFinished(() => socket.close());
      world.watches = [];
      world.pages = [];
      world.ends = [];
      let cursor: string | null = null;
      for (let index = 0; index < 100; index++) {
        const numItems = required(world.pageSize, "the page size");
        const first = await loadPage(client, { cursor, numItems });
        world.ends.push(first.continueCursor);
        const watch = watchQuery(socket, api.list.page, {
          paginationOpts: { cursor, numItems, endCursor: first.continueCursor },
        });
        world.watches.push(watch);
        world.pages.push(
          await observedPage(
            watch,
            (page) => idsOf(page.page).join() === idsOf(first.page).join(),
            "the initial pinned page",
          ),
        );
        if (first.isDone) break;
        cursor = first.continueCursor;
      }
      measure(
        "initialPinnedPages",
        world.pages.map((page) => ({
          rows: page.page.length,
          isDone: page.isDone,
        })),
      );
      expect(required(world.pages.at(-1), "the last page").isDone).toBe(true);
      expect(idsOf(world.pages.flatMap((page) => page.page))).toEqual(
        idsOf(await wholeList(backend)),
      );
    },
  "{inserted} rows are inserted inside the first page's range": async (
    world,
    { inserted },
  ) => {
    const backend = required(world.backend, "the backend");
    await insertInsideFirstRange(ordinaryClient(backend.url), inserted);
    const watches = required(world.watches, "the subscriptions");
    world.pages = await Promise.all(
      watches.map((watch, index) =>
        observedPage(
          watch,
          (page) =>
            page.page.length ===
            required(world.pages?.[index], "the initial page").page.length +
              (index === 0 ? inserted : 0),
          "the pages after the insert",
        ),
      ),
    );
    measure(
      "pagesAfterInsert",
      world.pages.map((page) => page.page.map((row) => row._id)),
    );
  },
  "the subscribed pages together hold {rowsHeld} rows, every row of the list once and in order":
    async (world, { rowsHeld }) => {
      const pages = required(world.pages, "the updated pages");
      const list = await wholeList(required(world.backend, "the backend"));
      measure("contiguityAfterInsert", {
        actual: idsOf(pages.flatMap((page) => page.page)),
        expected: idsOf(list),
      });
      expect(pages.flatMap((page) => page.page)).toHaveLength(rowsHeld);
      expect(idsOf(pages.flatMap((page) => page.page))).toEqual(idsOf(list));
    },
  "the first page now holds {firstPageRows} rows": async (
    world,
    { firstPageRows },
  ) => {
    const pages = required(world.pages, "the pages");
    expect(required(pages[0], "the first page").page).toHaveLength(
      firstPageRows,
    );
    const backend = required(world.backend, "the backend");
    const removed = required(pages[1]?.page[1], "a row inside the second page");
    await ordinaryClient(backend.url).mutation(api.list.remove, {
      id: removed._id,
    });
    const after = await Promise.all(
      required(world.watches, "the subscriptions").map((watch, index) =>
        observedPage(
          watch,
          (page) =>
            page.page.length ===
            required(pages[index], "the old page").page.length -
              (index === 1 ? 1 : 0),
          "the pages after the deletion",
        ),
      ),
    );
    const list = await wholeList(backend);
    measure("contiguityAfterDelete", {
      removed: removed._id,
      actual: idsOf(after.flatMap((page) => page.page)),
      expected: idsOf(list),
    });
    expect(idsOf(after.flatMap((page) => page.page))).toEqual(idsOf(list));
    expect(list.some((row) => row._id === removed._id)).toBe(false);
  },
});
