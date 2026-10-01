import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { client } from "./world.js";

import {
  setup,
  seed,
  page,
  loaded,
  joined,
  insertInside,
  consistent,
} from "./probe5-support.js";
import type { Probe5World } from "./probe5-support.js";

import { probe5PagesStayContiguousContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous",
  ),
});
void anchor;
type ProbeWorld = Probe5World;
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe5.${name}`, value);
}

bindExample(contract, (): ProbeWorld => ({}), {
  "a component list of {rows} rows that a parent query relays from paginator, read in pages of {pageSize}":
    async (w, { rows, pageSize }) => {
      await setup(w);
      w.rows = rows;
      w.size = pageSize;
      await seed(w, rows);
    },
  "a client subscribed to every page, each bounded by the end cursor its first load returned":
    async (w) => {
      w.pages = [];
      let cursor: string | null = null;
      for (let i = 0; i < Math.ceil(w.rows! / w.size!); i++) {
        const initial = page(w, { cursor, numItems: w.size! });
        const value = await loaded(initial, "initial page with end cursor");
        initial.stop();
        const bounded = page(w, {
          cursor,
          numItems: w.size!,
          endCursor: value.continueCursor,
        });
        await loaded(bounded, "bounded page");
        w.pages.push(bounded);
        cursor = value.continueCursor;
      }
      await measure("pages.initial", joined(w));
    },
  "{inserted} rows are inserted inside the first page's range": async (
    w,
    { inserted },
  ) => {
    await insertInside(w, inserted);
  },
  "the subscribed pages together hold every row exactly once and in order {contiguous}":
    async (w, { contiguous }) => {
      const result = await consistent(
        w,
        "contiguous subscribed pages after insertion",
      );
      await measure("pages.afterInsert", result);
      expect(
        JSON.stringify(result.actual.map((r) => r._id)) ===
          JSON.stringify(result.expected.map((r) => r._id)),
      ).toBe(contiguous);
    },
  "the first page now holds {firstPageRows} rows": async (
    w,
    { firstPageRows },
  ) => {
    expect(w.pages![0]!.value!.page).toHaveLength(firstPageRows);
    const deleted = w.pages![1]!.value!.page[0]!;
    await client(w).mutation(api.probe5.remove, { id: deleted._id });
    const result = await consistent(
      w,
      "contiguous subscribed pages after deletion in second page",
    );
    await measure("pages.afterDelete", { deleted, ...result });
    expect(result.actual.map((r) => r._id)).toEqual(
      result.expected.map((r) => r._id),
    );
  },
});
