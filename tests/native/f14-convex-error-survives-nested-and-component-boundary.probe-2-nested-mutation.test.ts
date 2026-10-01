import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";
import { httpClient } from "../../harness/clients.js";
import { ConvexError } from "convex/values";
import { isDeepStrictEqual } from "node:util";
import { probe2NestedMutationContract as contract } from "../../generated/contracts/facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-nested-mutation.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-nested-mutation",
  ),
  verifies: ref(
    "spec:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-nested-mutation",
  ),
});
void anchor;
interface ProbeWorld extends World {
  data?: {
    code: string;
    number: number;
    boolean: boolean;
    nil: null;
    array: (number | string)[];
    nested: { value: string };
    integer: bigint;
  };
  caught?: {
    isConvexError: boolean;
    data: unknown;
    message: string;
    property: unknown;
  } | null;
}
const component = false;
async function measure(name: string, value: unknown) {
  await recordMeasurement(
    contract.title,
    `probe2.${component ? "component" : "nested"}.${name}`,
    value,
  );
}
function args(w: ProbeWorld, ordinary = false) {
  return { component, data: w.data!, ordinary };
}
bindExample(contract, (): ProbeWorld => ({}), {
  "a mutation that writes one row and then throws a ConvexError carrying structured data with code {code}":
    async (w, { code }) => {
      await fixture(w);
      w.client = httpClient(backend(w).url);
      w.data = {
        code,
        number: 12.5,
        boolean: true,
        nil: null,
        array: [1, "two"],
        nested: { value: "inside" },
        integer: 9223372036854775807n,
      };
    },
  "a parent mutation calls it through ctx.runMutation and a client calls the parent":
    async (w) => {
      w.caught = await client(w).mutation(api.probe2.catching, args(w));
      await measure("parentCaught", w.caught);
    },
  "the parent's catch reads the thrown data unchanged {parentReadsData}":
    async (w, { parentReadsData }) => {
      expect(w.caught?.isConvexError).toBe(parentReadsData);
      expect(isDeepStrictEqual(w.caught?.data, w.data)).toBe(parentReadsData);
    },
  "a client whose parent lets the error pass reads the thrown data unchanged {clientReadsData}":
    async (w, { clientReadsData }) => {
      let caught: unknown;
      try {
        await client(w).mutation(api.probe2.passing, args(w));
      } catch (error) {
        caught = error;
      }
      const data = caught instanceof ConvexError ? caught.data : null;
      await measure("clientCaught", {
        isConvexError: caught instanceof ConvexError,
        data,
        message: String(caught),
      });
      expect(caught instanceof ConvexError).toBe(clientReadsData);
      expect(isDeepStrictEqual(data, w.data)).toBe(clientReadsData);
    },
  "the row the throwing mutation wrote is stored after the parent caught the error and committed {childRowStored}":
    async (w, { childRowStored }) => {
      const rows = await backend(w).readTable(
        "probe2Writes",
        component ? "probe" : undefined,
      );
      await measure("storedChildRows", rows);
      expect(
        rows.some((row) => (row as { marker: string }).marker === "child"),
      ).toBe(childRowStored);
      const parent = await backend(w).readTable("probe2Writes");
      expect(
        parent.some((row) => (row as { marker: string }).marker === "parent"),
      ).toBe(true);
      const ordinaryParent = await client(w).mutation(
        api.probe2.catching,
        args(w, true),
      );
      await measure("ordinaryParent", ordinaryParent);
      let ordinary: unknown;
      try {
        await client(w).mutation(api.probe2.passing, args(w, true));
      } catch (error) {
        ordinary = error;
      }
      await measure("ordinaryClient", {
        message: String(ordinary),
        property:
          (ordinary as { probeProperty?: unknown } | undefined)
            ?.probeProperty ?? null,
      });
    },
});
