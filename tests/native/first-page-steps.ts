import { expect } from "vitest";
import type { StepParams } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split.contract.js";
import type { ListPage } from "../../fixture/convex/list.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { idsOf, loadPage, seedList, wholeList } from "./list-pages.js";
// The steps the two full-first-page examples share: they differ only in their bound values.
export interface FirstPageWorld {
  backend?: Backend;
  page?: ListPage;
}
type Steps = {
  [Step in keyof StepParams]: (
    world: FirstPageWorld,
    params: StepParams[Step],
  ) => Promise<void>;
};
export const firstPageSteps: Steps = {
  "a component list of {rows} rows": async (world, { rows }) => {
    world.backend = await fixtureBackend();
    await seedList(ordinaryClient(world.backend.url), rows);
  },
  "a first page of {pageSize} is read through the parent with maximumRowsRead {maximumRowsRead}":
    async (world, { pageSize, maximumRowsRead }) => {
      const client = ordinaryClient(required(world.backend, "the backend").url);
      world.page = await loadPage(
        client,
        { cursor: null, numItems: pageSize },
        maximumRowsRead,
      );
      measure("firstPage", {
        rows: world.page.page.length,
        isDone: world.page.isDone,
        pageStatus: world.page.pageStatus ?? null,
        splitCursor:
          world.page.splitCursor === undefined
            ? "absent"
            : typeof world.page.splitCursor,
      });
    },
  "the page holds {rowsHeld} rows and carries pageStatus {pageStatus}": async (
    world,
    { rowsHeld, pageStatus },
  ) => {
    const page = required(world.page, "the first page");
    expect(page.page).toHaveLength(rowsHeld);
    expect(page.pageStatus ?? "none").toBe(pageStatus);
    if (pageStatus === "SplitRequired") {
      // The status is the helper's: it comes with the cursor where the page splits.
      expect(page.splitCursor).toBeTypeOf("string");
      return;
    }
    // A page with no split status is whole: the next page starts at the row after its last.
    expect(page.isDone).toBe(false);
    const backend = required(world.backend, "the backend");
    const next = await loadPage(ordinaryClient(backend.url), {
      cursor: page.continueCursor,
      numItems: rowsHeld,
    });
    const list = await wholeList(backend);
    expect(idsOf(page.page)).toEqual(idsOf(list.slice(0, rowsHeld)));
    expect(next.page[0]?._id).toBe(list[rowsHeld]?._id);
  },
};
