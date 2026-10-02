import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { QueryMeta } from "convex/server";
import { expect } from "vitest";
import { probe8ParentAndComponentsContract as contract } from "../../generated/contracts/facts.f18-commit-timestamps.probe-8-parent-and-components.contract.js";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f18-commit-timestamps.probe-8-parent-and-components",
  ),
  verifies: ref(
    "spec:facts.f18-commit-timestamps.probe-8-parent-and-components",
  ),
});
void anchor;
type Rows = { rows: { label: string; commitTs: bigint }[]; upper: bigint };
interface World {
  backend?: Backend;
  read?: Rows & { first: Rows; second: Rows };
  errors?: string[];
  returned?: unknown;
}
// Compiled evidence: the published QueryMeta declaration has no upper-bound method.
const declared: "getSnapshotTs" extends keyof QueryMeta ? true : false = false;
bindExample(contract, (): World => ({}), {
  "a parent and two components that write commit timestamp placeholders":
    async (world) => {
      world.backend = await fixtureBackend();
      expect(declared).toBe(false);
    },
  "three mutations commit in sequence and a query reads their indexed rows":
    async (world) => {
      const client = ordinaryClient(required(world.backend, "backend").url);
      for (const label of ["one", "two", "three"]) {
        const result = await client.mutation(api.timestamps.write, { label });
        expect(result).toMatchObject({
          unresolved: true,
          first: { unresolved: true },
          second: { unresolved: true },
        });
        expect(result).toMatchObject({
          first: { numericError: expect.stringContaining("unresolved") },
          second: { numericError: expect.stringContaining("unresolved") },
        });
        measure(`readback-${label}`, result as Parameters<typeof measure>[1]);
      }
      world.read = (await client.query(api.timestamps.read, {})) as NonNullable<
        World["read"]
      >;
      measure(
        "committedTimestamps",
        JSON.parse(
          JSON.stringify(world.read, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        ) as Parameters<typeof measure>[1],
      );
      world.errors = [];
      for (const reference of [
        api.timestamps.returnPlaceholder,
        api.timestamps.schedulePlaceholder,
      ]) {
        try {
          const value = await client.mutation(reference, {});
          world.returned = value;
          measure("returnedPlaceholder", {
            type: typeof value,
            text: String(value),
          });
          world.errors.push("");
        } catch (error) {
          world.errors.push(String(error));
        }
      }
      measure("placeholderErrors", world.errors);
    },
  "each transaction has {shared} timestamp across the three tables and later transactions have larger timestamps":
    (world, { shared }) => {
      const read = required(world.read, "query");
      expect(read.rows).toHaveLength(3);
      expect(read.first.rows).toEqual(
        expect.arrayContaining(
          read.rows.map(({ label, commitTs }) =>
            expect.objectContaining({ label, commitTs }),
          ),
        ),
      );
      expect(read.second.rows).toEqual(
        expect.arrayContaining(
          read.rows.map(({ label, commitTs }) =>
            expect.objectContaining({ label, commitTs }),
          ),
        ),
      );
      for (const [index, row] of read.rows.entries()) {
        expect(typeof row.commitTs).toBe("bigint");
        expect(row.commitTs <= read.upper).toBe(true);
        if (index > 0)
          expect(row.commitTs > read.rows[index - 1]!.commitTs).toBe(true);
        expect(
          row.commitTs === read.first.rows[index]!.commitTs &&
            row.commitTs === read.second.rows[index]!.commitTs,
        ).toBe(shared);
      }
      expect(read.first.upper).toBe(read.upper);
      expect(read.second.upper).toBe(read.upper);
    },
  "returning a placeholder {returned} and scheduling it is {refused}": async (
    world,
    { returned, refused },
  ) => {
    expect(
      typeof world.returned === "bigint"
        ? "resolves to a bigint"
        : String(world.returned),
    ).toBe(returned);
    expect(required(world.errors, "errors")[1]?.includes("$commitTs")).toBe(
      refused,
    );
    const backend = required(world.backend, "backend");
    const rows = await backend.admin.readTable("timestamps");
    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.label === "returned")?.commitTs).toBe(
      world.returned,
    );
    expect(
      (world.returned as bigint) > required(world.read, "query").upper,
    ).toBe(true);
    expect(await backend.admin.readTable("_scheduled_functions")).toHaveLength(
      0,
    );
  },
});
