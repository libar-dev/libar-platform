import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";

import { recordMeasurement } from "../../harness/evidence.js";

import { waitUntil } from "../../harness/wait.js";
import {
  setup,
  seed,
  page,
  loaded,
  whole,
  joined,
  insertInside,
} from "./probe5-support.js";
import type { Probe5World } from "./probe5-support.js";

import { probe5SplitRequiredRelayedContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed",
  ),
  verifies: ref(
    "spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed",
  ),
});
void anchor;
type ProbeWorld = Probe5World;
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe5.${name}`, value);
}

bindExample(contract, (): ProbeWorld => ({}), {
  "a subscribed page of a component list, bounded by an end cursor and read through the parent with maximumRowsRead {maximumRowsRead}":
    async (w, { maximumRowsRead }) => {
      await setup(w);
      w.cap = maximumRowsRead;
      w.size = Math.floor(maximumRowsRead / 2);
      await seed(w, maximumRowsRead + 10);
      const initial = page(w, { cursor: null, numItems: w.size });
      const result = await loaded(initial, "initial split range");
      initial.stop();
      w.cursor = result.continueCursor;
      w.pages = [
        page(w, {
          cursor: null,
          endCursor: w.cursor,
          numItems: w.size,
          maximumRowsRead,
        }),
      ];
      await loaded(w.pages[0]!, "bounded capped page");
      w.rangeRows = w.pages[0]!.value!.page.length;
    },
  "rows are inserted inside the page's range until it holds {rowsInRange} rows":
    async (w, { rowsInRange }) => {
      await insertInside(w, rowsInRange - w.rangeRows!);
      w.rangeRows = rowsInRange;
    },
  "the page the parent relays carries pageStatus {pageStatus} and a split cursor":
    async (w, { pageStatus }) => {
      await waitUntil(
        "SplitRequired and split cursor on parent subscription",
        () => {
          const s = w.pages![0]!;
          if (s.error) throw s.error;
          return (
            s.value?.pageStatus === pageStatus &&
            typeof s.value?.splitCursor === "string"
          );
        },
        5000,
      );
      const result = w.pages![0]!.value!;
      w.split = result.splitCursor!;
      await measure("split.parentResult", result);
      expect(result.pageStatus).toBe(pageStatus);
      expect(typeof result.splitCursor).toBe("string");
    },
  "the two pages on either side of the split cursor together hold every row exactly once and in order {contiguous}":
    async (w, { contiguous }) => {
      w.pages![0]!.stop();
      w.pages = [
        page(w, {
          cursor: null,
          endCursor: w.split!,
          numItems: w.size!,
          maximumRowsRead: w.cap!,
        }),
        page(w, {
          cursor: w.split!,
          endCursor: w.cursor!,
          numItems: w.size!,
          maximumRowsRead: w.cap!,
        }),
      ];
      await Promise.all(w.pages.map((s) => loaded(s, "split half")));
      const original = (await whole(w)).filter((r) => r.position < w.size!);
      await waitUntil(
        "both split halves contain every original range row",
        () =>
          JSON.stringify(joined(w).map((r) => r._id)) ===
          JSON.stringify(original.map((r) => r._id)),
        5000,
      );
      await measure("split.halves", { actual: joined(w), expected: original });
      expect(
        JSON.stringify(joined(w).map((r) => r._id)) ===
          JSON.stringify(original.map((r) => r._id)),
      ).toBe(contiguous);
      expect(joined(w)).toHaveLength(w.rangeRows!);
    },
});
