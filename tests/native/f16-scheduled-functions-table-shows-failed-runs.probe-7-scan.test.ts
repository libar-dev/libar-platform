import { expect, vi } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7ScanContract as contract } from "../../generated/contracts/facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { type SchedulerWorld } from "./scheduler-cases.js";
import { scanCase } from "./scheduler-cases.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-scan",
  ),
  verifies: ref(
    "spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-scan",
  ),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
type World = SchedulerWorld<Awaited<ReturnType<typeof scanCase>>>;

bindExample(contract, (): World => ({}), {
  "temporary functions provide a local reaction, a failed reaction and unrelated scheduled calls":
    async (world) => {
      Object.assign(world, await schedulingBackend());
    },
  "a local reaction succeeds and a query filters the system table for one function and failed state while unrelated schedules grow past the read boundary":
    async (world) => {
      world.observation = await scanCase(world.backend!);
    },
  "the last accepted total is {accepted} and the first refused total is {refused} with text {refusal}":
    async (world, { accepted, refused, refusal }) => {
      const o = world.observation!;
      const success = o.observations.filter((a) => a.error === null);
      const failure = o.observations.find((a) => a.error !== null)!;
      expect(success.at(-1)!.count).toBe(accepted);
      expect(failure.count).toBe(refused);
      expect(failure.error).toContain(refusal);
      for (const a of o.plain) {
        if (a.count === accepted) {
          expect(a.error).toBeNull();
          expect(a.rows).toHaveLength(1);
        } else {
          expect(a.count).toBe(refused);
          expect(a.error).toContain(refusal);
        }
      }
      expect(o.plain).toHaveLength(2);
    },
  "each successful scan reads {documents} documents and {bytes} bytes, adding {queriesPerRow} database query per row plus {extraQueries}":
    async (world, { documents, bytes, queriesPerRow, extraQueries }) => {
      const o = world.observation!;
      for (const a of [{ count: 5, ...o.first }, ...o.observations].filter(
        (a) => a.error === null,
      )) {
        const r = a.answer!;
        expect(r.rows).toHaveLength(1);
        expect(r.after.documentsRead.used - r.before.documentsRead.used).toBe(
          documents,
        );
        expect(r.after.bytesRead.used - r.before.bytesRead.used).toBe(bytes);
        expect(
          r.after.databaseQueries.used - r.before.databaseQueries.used,
        ).toBe(a.count * queriesPerRow + extraQueries);
      }
    },
  "the table reaches {total} rows and scans at {documentCeiling} and above are refused before any document bound is measured":
    async (world, { total, documentCeiling }) => {
      const o = world.observation!;
      expect(o.actualRows).toBe(total);
      for (const count of [documentCeiling, total]) {
        const a = o.observations.find((a) => a.count === count)!;
        expect(a).toBeDefined();
        expect(a.error).toMatch(
          /Too many reads in a single function execution \(limit: 4096\)|too many system operations/,
        );
      }
    },
});
