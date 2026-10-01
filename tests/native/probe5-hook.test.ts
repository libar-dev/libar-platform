// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { withBackend } from "../../harness/backend.js";
import { httpClient, websocketClient } from "../../harness/clients.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { probe5SplitRequiredRelayedContract as contract } from "../../generated/contracts/facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed.contract.js";
import type { Row, Page } from "./probe5-support.js";
const name =
  "Probe 5: usePaginatedQuery shows every row after a component split";
test(name, async () => {
  const packages = [
    "react",
    "react-dom",
    "@testing-library/react",
    "happy-dom",
  ];
  const versions = Object.fromEntries(
    await Promise.all(
      packages.map(async (packageName) => {
        const json = JSON.parse(
          await readFile(
            new URL(
              `../../node_modules/${packageName}/package.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ) as { version: string };
        return [packageName, json.version];
      }),
    ),
  );
  await recordMeasurement(name, "probe5.hook.runtime", {
    environment: "happy-dom",
    versions,
  });
  const given = contract.steps[0]!.params;
  const when = contract.steps[1]!.params;
  const split = contract.steps[2]!.params;
  const final = contract.steps[3]!.params;
  // The contract's step-indexed params are a union outside bindExample.
  if (
    !("maximumRowsRead" in given) ||
    !("rowsInRange" in when) ||
    !("pageStatus" in split) ||
    !("contiguous" in final)
  )
    throw new Error("Split contract step layout changed");
  const cap = given.maximumRowsRead;
  const size = Math.floor(cap / 2);
  await withBackend(async (backend) => {
    const http = httpClient(backend.url);
    await http.mutation(api.probe5.write, {
      rows: Array.from({ length: cap + size }, (_, position) => ({
        position,
        value: `row-${position}`,
      })),
    });
    const react = new ConvexReactClient(backend.url, {
      unsavedChangesWarning: false,
    });
    const ws = websocketClient(backend.url);
    const measure = async (key: string, value: unknown) =>
      recordMeasurement(name, `probe5.hook.${key}`, value);
    let unmount = () => {};
    try {
      let first: Page | undefined;
      let subscriptionError: Error | undefined;
      const initial = ws.onUpdate(
        api.probe5.page,
        { paginationOpts: { cursor: null, numItems: size } },
        (value) => {
          first = value;
        },
        (error) => {
          subscriptionError = error;
        },
      );
      await waitFor(
        () => {
          if (subscriptionError) throw subscriptionError;
          expect(first).toBeDefined();
        },
        { timeout: 5000 },
      );
      initial();
      let splitSeen = false;
      const observe = ws.onUpdate(
        api.probe5.page,
        {
          paginationOpts: {
            cursor: null,
            numItems: size,
            endCursor: first!.continueCursor,
            maximumRowsRead: cap,
          },
        },
        (value) => {
          if (value.pageStatus === split.pageStatus) splitSeen = true;
        },
        (error) => {
          subscriptionError = error;
        },
      );
      const rendered = renderHook(
        () =>
          usePaginatedQuery(
            api.probe5.page,
            { maximumRowsRead: cap },
            { initialNumItems: size },
          ),
        {
          wrapper: ({ children }) =>
            createElement(ConvexProvider, { client: react }, children),
        },
      );
      unmount = rendered.unmount;
      await waitFor(
        () => expect(rendered.result.current.results).toHaveLength(size),
        { timeout: 5000 },
      );
      for (let loaded = size; loaded < cap + size; loaded += size) {
        act(() => rendered.result.current.loadMore(size));
        await waitFor(
          () =>
            expect(rendered.result.current.results).toHaveLength(loaded + size),
          { timeout: 5000 },
        );
      }
      await http.mutation(api.probe5.write, {
        rows: Array.from({ length: when.rowsInRange - size }, (_, i) => ({
          position: (i + 1) / (when.rowsInRange - size + 1),
          value: `insert-${i}`,
        })),
      });
      const expected = (
        (await backend.readTable("rows", "probe")) as Row[]
      ).sort((a, b) => a.position - b.position);
      await waitFor(
        () => {
          if (subscriptionError) throw subscriptionError;
          expect(splitSeen).toBe(true);
        },
        { timeout: 5000 },
      );
      await measure("splitSeen", splitSeen);
      try {
        await waitFor(
          () =>
            expect(
              JSON.stringify(
                (rendered.result.current.results as Row[]).map((r) => r._id),
              ) === JSON.stringify(expected.map((r) => r._id)),
            ).toBe(final.contiguous),
          { timeout: 5000 },
        );
      } finally {
        const actual = rendered.result.current.results as Row[];
        await measure("finalRows", { actual, expected });
        await measure(
          "everyRow",
          JSON.stringify(actual.map((r) => r._id)) ===
            JSON.stringify(expected.map((r) => r._id)),
        );
      }
      observe();
    } catch (error) {
      await measure("failure", String(error));
      throw error;
    } finally {
      unmount();
      await react.close();
      await ws.close();
    }
  });
});
