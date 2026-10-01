import { expect, onTestFinished } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5ParentPageOutgrowsRowCapContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-parent-page-outgrows-row-cap.contract.js";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../fixture/convex/_generated/api.js";
import type { ListPage, ListRow } from "../../fixture/convex/list.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { idsOf } from "./list-pages.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-parent-page-outgrows-row-cap",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-parent-page-outgrows-row-cap",
  ),
});
void anchor;
// The parent's parentRows table in the order the by_position index gives it.
async function wholeTable(backend: Backend): Promise<ListRow[]> {
  const rows = (await backend.admin.readTable(
    "parentRows",
  )) as unknown as ListRow[];
  return rows.sort(
    (a, b) =>
      a.position - b.position ||
      a._creationTime - b._creationTime ||
      (a._id < b._id ? -1 : 1),
  );
}
const insert = (client: ConvexHttpClient, positions: readonly number[]) =>
  client.mutation(api.parentList.insert, {
    rows: positions.map((position) => ({ position, label: `row ${position}` })),
  });
const read = (
  client: ConvexHttpClient,
  paginationOpts: {
    cursor: string | null;
    numItems: number;
    endCursor?: string;
  },
  maximumRowsRead?: number,
): Promise<ListPage> =>
  client.query(api.parentList.page, {
    paginationOpts,
    ...(maximumRowsRead === undefined ? {} : { maximumRowsRead }),
  });
type Watch = ReturnType<typeof watchQuery<typeof api.parentList.page>>;
interface World {
  backend?: Backend;
  pageSize?: number;
  cap?: number;
  endCursor?: string;
  watch?: Watch;
  page?: ListPage;
}
bindExample(contract, (): World => ({}), {
  "a parent table of {rows} rows and a subscribed first page of {pageSize}, read by the built-in paginate with maximumRowsRead {maximumRowsRead}":
    async (world, { rows, pageSize, maximumRowsRead }) => {
      const backend = await fixtureBackend();
      const client = ordinaryClient(backend.url);
      await insert(
        client,
        Array.from({ length: rows }, (_, position) => position),
      );
      const first = await read(
        client,
        { cursor: null, numItems: pageSize },
        maximumRowsRead,
      );
      const socket = ordinarySocketClient(backend.url);
      onTestFinished(() => socket.close());
      // The client pins the page with the end cursor its first read returned.
      const watch = watchQuery(socket, api.parentList.page, {
        maximumRowsRead,
        paginationOpts: {
          cursor: null,
          numItems: pageSize,
          endCursor: first.continueCursor,
        },
      });
      await watch.until(
        (page) => page.page.length === pageSize,
        "the pinned first page",
      );
      Object.assign(world, {
        backend,
        pageSize,
        cap: maximumRowsRead,
        endCursor: first.continueCursor,
        watch,
      });
    },
  "rows are inserted inside the page's range until it holds {rowsInRange} rows":
    async (world, { rowsInRange }) => {
      const backend = required(world.backend, "the backend");
      const count = rowsInRange - required(world.pageSize, "the page size");
      // Between position 0 and position 1, inside the first page's range.
      await insert(
        ordinaryClient(backend.url),
        Array.from({ length: count }, (_, i) => (i + 1) / (count + 1)),
      );
      const watch = required(world.watch, "the subscription");
      try {
        world.page = await watch.until(
          (page) => page.page.length === rowsInRange,
          "the pinned page after the inserts",
        );
      } finally {
        measure(
          "pinnedPage",
          watch.values.map((page) => ({
            rows: page.page.length,
            pageStatus: page.pageStatus ?? null,
          })),
        );
      }
    },
  "the subscribed page holds {rowsHeld} rows and carries pageStatus {pageStatus}":
    (world, { rowsHeld, pageStatus }) => {
      const page = required(world.page, "the pinned page");
      expect(page.page).toHaveLength(rowsHeld);
      expect(page.pageStatus).toBe(pageStatus);
      expect(page.splitCursor).toBeTypeOf("string");
    },
  "the page from the start to the split cursor and the page from the split cursor to the first page's end cursor together hold {halvesHeld} rows, every row once and in order":
    async (world, { halvesHeld }) => {
      const backend = required(world.backend, "the backend");
      const client = ordinaryClient(backend.url);
      const splitCursor = required(
        required(world.page, "the pinned page").splitCursor ?? undefined,
        "the split cursor",
      );
      const numItems = required(world.pageSize, "the page size");
      const left = await read(
        client,
        { cursor: null, numItems, endCursor: splitCursor },
        world.cap,
      );
      const right = await read(
        client,
        {
          cursor: splitCursor,
          numItems,
          endCursor: required(world.endCursor, "the end cursor"),
        },
        world.cap,
      );
      measure("halves", { left: left.page.length, right: right.page.length });
      const joined = [...left.page, ...right.page];
      expect(joined).toHaveLength(halvesHeld);
      expect(idsOf(joined)).toEqual(
        idsOf((await wholeTable(backend)).slice(0, halvesHeld)),
      );
    },
});
