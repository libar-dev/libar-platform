import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { TransactionMetrics } from "convex/server";
import { getDocumentSize } from "convex/values";
import { expect } from "vitest";
import { probe10OversizedRowContract as contract } from "../../generated/contracts/facts.f20-pagination-checks-bytes-after-reading.probe-10-oversized-row.contract.js";
import { api } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import type { Backend } from "../../harness/backend.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f20-pagination-checks-bytes-after-reading.probe-10-oversized-row",
  ),
  verifies: ref(
    "spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-oversized-row",
  ),
});
void anchor;
type Result = {
  result: { page: Record<string, unknown>[]; pageStatus: string };
  before: TransactionMetrics;
  after: TransactionMetrics;
};
interface World {
  backend?: Backend;
  pages?: { bound: number; read: Result }[];
}
bindExample(contract, (): World => ({}), {
  "a component list with two rows larger than the requested byte bound": async (
    world,
  ) => {
    world.backend = await fixtureBackend();
    await world.backend.admin.run(
      "list:insert",
      {
        rows: [
          { position: 1, label: "a".repeat(8192) },
          { position: 2, label: "b".repeat(8192) },
        ],
      },
      { component: "annex" },
    );
  },
  "the parent reads the component paginator with byte bounds below and at one row":
    async (world) => {
      const backend = required(world.backend, "backend");
      const stored = await backend.admin.readTable("rows", {
        component: "annex",
      });
      const size = getDocumentSize(stored[0]!);
      world.pages = [];
      for (const bound of [-1, 0, 1, size - 1, size]) {
        const read = (await ordinaryClient(backend.url).query(
          api.bytePage.read,
          { maximumBytesRead: bound },
        )) as unknown as Result;
        world.pages.push({ bound, read });
        measure(`page-${bound}`, {
          bound,
          storedSize: size,
          kept: read.result.page.length,
          status: read.result.pageStatus,
          bytesRead: read.after.bytesRead.used - read.before.bytesRead.used,
          documentsRead:
            read.after.documentsRead.used - read.before.documentsRead.used,
        });
      }
    },
  "the first page keeps {rows} row and reports {status}": (
    world,
    { rows, status },
  ) => {
    for (const { read } of required(world.pages, "pages")) {
      expect(read.result.page).toHaveLength(rows);
      expect(read.result.pageStatus).toBe(status);
    }
  },
  "the recorded bytes exceed the smaller requested bound by {overshoot}": (
    world,
    { overshoot },
  ) => {
    for (const { bound, read } of required(world.pages, "pages").slice(0, -1))
      expect(
        read.after.bytesRead.used - read.before.bytesRead.used > bound,
      ).toBe(overshoot);
  },
});
