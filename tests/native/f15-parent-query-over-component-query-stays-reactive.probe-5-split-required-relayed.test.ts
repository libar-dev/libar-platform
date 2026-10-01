import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe5SplitRequiredRelayedContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed.contract.js";
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
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed",
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
  "a component list of {rows} rows and a subscribed page of {pageSize}, bounded by its end cursor and read through the parent with maximumRowsRead {maximumRowsRead}":
    async (world, { rows, pageSize, maximumRowsRead }) => {
      const backend = await fixtureBackend();
      const client = ordinaryClient(backend.url);
      await seedList(client, rows);
      const first = await loadPage(
        client,
        { cursor: null, numItems: pageSize },
        maximumRowsRead,
      );
      const socket = ordinarySocketClient(backend.url);
      onTestFinished(() => socket.close());
      const watch = watchQuery(socket, api.list.page, {
        maximumRowsRead,
        paginationOpts: {
          cursor: null,
          numItems: pageSize,
          endCursor: first.continueCursor,
        },
      });
      const pinned = await observedPage(
        watch,
        (page) => page.page.length === pageSize,
        "the initial pinned page",
        "initialPinnedPage",
      );
      Object.assign(world, {
        backend,
        rows,
        pageSize,
        cap: maximumRowsRead,
        watches: [watch],
        pages: [pinned],
        ends: [first.continueCursor],
      });
    },
  "rows are inserted inside the page's range until it holds {rowsInRange} rows":
    async (world, { rowsInRange }) => {
      const client = ordinaryClient(required(world.backend, "the backend").url);
      await insertInsideFirstRange(
        client,
        rowsInRange - required(world.pageSize, "the page size"),
      );
      world.split = await observedPage(
        required(world.watches?.[0], "the subscription"),
        (page) => page.pageStatus !== null && page.pageStatus !== undefined,
        "a page with split status",
        "splitPage",
      );
      measure("relayedSplit", {
        status: world.split.pageStatus ?? null,
        splitCursor: world.split.splitCursor ?? null,
        continueCursor: world.split.continueCursor,
        endCursor: required(world.ends?.[0], "the pinned end"),
        rows: world.split.page.length,
      });
    },
  "the page the parent relays carries pageStatus {pageStatus} and a split cursor":
    (world, { pageStatus }) => {
      const split = required(world.split, "the relayed page");
      expect(split.pageStatus, JSON.stringify(split)).toBe(pageStatus);
      expect(split.splitCursor, JSON.stringify(split)).toBeTypeOf("string");
      expect(split.splitCursor).not.toBe("");
    },
  "the page from the start to the split cursor and the page from the split cursor to the first page's end cursor together hold {rowsHeld} rows, every row of the range once and in order":
    async (world, { rowsHeld }) => {
      const backend = required(world.backend, "the backend");
      const client = ordinaryClient(backend.url);
      const splitCursor = required(
        required(world.split, "the split page").splitCursor ?? undefined,
        "the split cursor",
      );
      const endCursor = required(world.ends?.[0], "the pinned end cursor");
      const numItems = required(world.pageSize, "the page size");
      const left = await loadPage(
        client,
        { cursor: null, numItems, endCursor: splitCursor },
        world.cap,
      );
      const right = await loadPage(
        client,
        { cursor: splitCursor, numItems, endCursor },
        world.cap,
      );
      const wholeRange = await loadPage(client, {
        cursor: null,
        numItems,
        endCursor,
      });
      const joined = [...left.page, ...right.page];
      measure("splitSummary", {
        pageStatus: world.split?.pageStatus ?? null,
        left: idsOf(left.page),
        right: idsOf(right.page),
        wholeRange: idsOf(wholeRange.page),
      });
      expect(joined).toHaveLength(rowsHeld);
      expect(idsOf(joined)).toEqual(idsOf(wholeRange.page));
      const list = await wholeList(backend);
      expect(idsOf(joined)).toEqual(idsOf(list.slice(0, rowsHeld)));
    },
});
