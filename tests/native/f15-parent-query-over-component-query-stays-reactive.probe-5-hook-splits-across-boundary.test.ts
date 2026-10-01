import type { ConvexHttpClient } from "convex/browser";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, onTestFinished } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { ListPage, ListRow } from "../../fixture/convex/list.js";
import { probe5HookSplitsAcrossBoundaryContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary.contract.js";
import type { Backend } from "../../harness/backend.js";
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
} from "./list-pages.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary",
  ),
});
void anchor;
interface Hook {
  results: ListRow[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore(numItems: number): void;
}
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  rows?: number;
  pageSize?: number;
  maximumRowsRead?: number;
  // What the hook returned on its latest render.
  hook?: () => Hook | undefined;
  splitRequired?: () => Promise<ListPage>;
  endCursor?: string;
  capped?: ListPage;
  missing?: ListRow[];
}
// Waits until the hook's latest render satisfies `done`. React renders on its own schedule here,
// as it does in a browser, so this polls.
async function settled(
  world: World,
  description: string,
  done: (hook: Hook) => boolean,
): Promise<Hook> {
  const latest = required(world.hook, "the hook");
  const deadline = Date.now() + 5000;
  for (;;) {
    const hook = latest();
    if (hook !== undefined && done(hook)) return hook;
    if (Date.now() >= deadline)
      throw new Error(
        `Timed out after 5000 ms waiting for ${description}: the hook shows ${hook?.results.length ?? "no"} rows with status ${hook?.status ?? "none"}`,
      );
    await sleep(20);
  }
}
bindExample(contract, (): World => ({}), {
  "a component list of {rows} rows read through the parent by the usePaginatedQuery hook of convex-helpers/react, in pages of {pageSize} with maximumRowsRead {maximumRowsRead}":
    async (world, { rows, pageSize, maximumRowsRead }) => {
      const backend = await fixtureBackend();
      const client = ordinaryClient(backend.url);
      await seedList(client, rows);
      Object.assign(world, {
        backend,
        client,
        rows,
        pageSize,
        maximumRowsRead,
      });
      // The DOM is a happy-dom window made here. Only window and document become globals, so
      // fetch and WebSocket stay Node's and the harness works as in every other native test.
      // React DOM reads them when it loads, so it is imported after they are set.
      const { Window } = await import("happy-dom");
      const dom = new Window({ url: "http://localhost/" });
      Object.assign(globalThis, { window: dom, document: dom.document });
      const { createElement } = await import("react");
      const { createRoot } = await import("react-dom/client");
      const { ConvexProvider, ConvexReactClient } =
        await import("convex/react");
      const { usePaginatedQuery } = await import("convex-helpers/react");
      const react = new ConvexReactClient(backend.url, {
        unsavedChangesWarning: false,
      });
      let latest: Hook | undefined;
      function Shown() {
        latest = usePaginatedQuery(
          api.list.page,
          { maximumRowsRead },
          { initialNumItems: pageSize },
        ) as Hook;
        return null;
      }
      const container = dom.document.createElement("div");
      dom.document.body.appendChild(container);
      const root = createRoot(container as unknown as Element);
      onTestFinished(async () => {
        root.unmount();
        await react.close();
        await dom.happyDOM.close();
        for (const name of ["window", "document"])
          Reflect.deleteProperty(globalThis, name);
      });
      root.render(
        createElement(ConvexProvider, { client: react }, createElement(Shown)),
      );
      world.hook = () => latest;
      await settled(
        world,
        "the first page",
        (hook) => hook.status === "CanLoadMore",
      );
    },
  "the hook has loaded every page": async (world) => {
    const pageSize = required(world.pageSize, "the page size");
    let hook = await settled(world, "the hook to be idle", (shown) =>
      ["CanLoadMore", "Exhausted"].includes(shown.status),
    );
    for (let more = 0; more < 10 && hook.status !== "Exhausted"; more++) {
      const shown = hook.results.length;
      hook.loadMore(pageSize);
      hook = await settled(
        world,
        "the next page",
        (next) =>
          next.status === "Exhausted" ||
          (next.status === "CanLoadMore" && next.results.length > shown),
      );
    }
    measure("hookBeforeInsert", {
      rows: hook.results.length,
      status: hook.status,
    });
    expect(hook.status).toBe("Exhausted");
    expect(hook.results).toHaveLength(required(world.rows, "the row count"));
  },
  "rows are inserted inside the first page's range until it holds {rowsInRange} rows":
    async (world, { rowsInRange }) => {
      const backend = required(world.backend, "the backend");
      const client = required(world.client, "the client");
      const pageSize = required(world.pageSize, "the page size");
      // A second subscription to the first page as the hook pinned it. It shows that the capped
      // page came back SplitRequired, so a pass cannot come from a page that never needed the split.
      const first = await loadPage(client, {
        cursor: null,
        numItems: pageSize,
      });
      world.endCursor = first.continueCursor;
      const socket = ordinarySocketClient(backend.url);
      onTestFinished(() => socket.close());
      const capped = watchQuery(socket, api.list.page, {
        maximumRowsRead: required(world.maximumRowsRead, "the read cap"),
        paginationOpts: {
          cursor: null,
          numItems: pageSize,
          endCursor: first.continueCursor,
        },
      });
      await capped.until(
        (page) => page.page.length === pageSize,
        "the pinned first page",
      );
      world.splitRequired = () =>
        capped.until(
          (page) => page.pageStatus === "SplitRequired",
          "the capped first page to come back SplitRequired",
        );
      // One mutation, so the page jumps past its cap in one step.
      await insertInsideFirstRange(client, rowsInRange - pageSize);
    },
  "the hook's results hold {rowsShown} rows, in order and each once": async (
    world,
    { rowsShown },
  ) => {
    world.capped = await required(
      world.splitRequired,
      "the second subscription",
    )();
    measure("hookCappedPage", {
      status: world.capped.pageStatus ?? null,
      rows: world.capped.page.length,
      continueCursor: world.capped.continueCursor,
      endCursor: required(world.endCursor, "the pinned end cursor"),
    });
    expect(world.capped.pageStatus).toBe("SplitRequired");
    const list = await wholeList(required(world.backend, "the backend"));
    // Give the hook the full wait to reach the bound count, then read what it shows whether or
    // not it got there, so the measurement is recorded before the assertion.
    await settled(
      world,
      `${rowsShown} rows`,
      (hook) =>
        hook.status === "Exhausted" && hook.results.length === rowsShown,
    ).catch(() => undefined);
    const hook = required(
      required(world.hook, "the hook")(),
      "the hook's first render",
    );
    const shown = new Set(idsOf(hook.results));
    world.missing = list.filter((row) => !shown.has(row._id));
    measure("hookSplitSummary", {
      rowsInList: list.length,
      rowsShown: hook.results.length,
      status: hook.status,
      missingPositions: list
        .filter((row) => !shown.has(row._id))
        .map((row) => row.position),
    });
    expect(hook.status, `Observed hook status: ${hook.status}`).toBe(
      "Exhausted",
    );
    expect(hook.results).toHaveLength(rowsShown);
    expect(idsOf(hook.results)).toEqual(
      idsOf(list.filter((row) => shown.has(row._id))),
    );
  },
  "{rowsMissing} rows of the list are not shown, the ones between the capped page's continue cursor and its end cursor":
    async (world, { rowsMissing }) => {
      const capped = required(world.capped, "the capped page");
      const gap = await loadPage(required(world.client, "the client"), {
        cursor: capped.continueCursor,
        numItems: required(world.pageSize, "the page size"),
        endCursor: required(world.endCursor, "the pinned end cursor"),
      });
      const missing = required(world.missing, "the missing rows");
      measure("hookMissingCursorRange", {
        missing: idsOf(missing),
        betweenCursors: idsOf(gap.page),
      });
      expect(missing, `Observed ${missing.length} missing rows`).toHaveLength(
        rowsMissing,
      );
      expect(idsOf(missing)).toEqual(idsOf(gap.page));
    },
});
