import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6BatchRacesCommandContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-batch-races-command.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-batch-races-command",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-batch-races-command",
  ),
});
void anchor;
import { setTimeout as sleep } from "node:timers/promises";
import { api } from "../../fixture/convex/_generated/api.js";
import { setup, record } from "./migration-steps.js";
type Prepared = Awaited<ReturnType<typeof setup>>;
interface World {
  first?: Prepared;
  results: number[];
}
bindExample(contract, (): World => ({ results: [] }), {
  "a document source at stream version 1 with its building summary missing":
    async (world) => {
      world.first = await setup(1);
    },
  "a component-driven backfill races a live depot amendment in {trials} trials":
    async (world, { trials }) => {
      for (let trial = 0; trial < trials; trial++) {
        const { backend, client } = trial === 0 ? world.first! : await setup(1);
        await backend.admin.run("migrations:configure", {
          failKey: null,
          reads: 400,
          clear: false,
        });
        const mark = await backend.admin.logMark();
        const batch = backend.admin.run("migrations:run", {
          reset: true,
          batchSize: 1,
        });
        await sleep(trial % 2 === 0 ? 5 : 20);
        const command = client.mutation(
          api.depotCommands.amendSummarizedDocument,
          {
            tenantId: "tenant",
            input: { documentId: "doc-00", title: "amended" },
          },
        );
        await Promise.all([batch, command]);
        const rows = await backend.admin.readTable("documentSummaries");
        expect(await backend.admin.readTable("migrationVisits")).toHaveLength(
          1,
        );
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.title).toBe("amended");
          world.results.push(
            (row.sourceVersions as { version: number }[])[0]!.version,
          );
        }
        const logs = await backend.admin.completionsSince(
          mark,
          (entries) =>
            entries.some(
              (entry) =>
                entry.identifier === "depotCommands:amendSummarizedDocument",
            ) && entries.some((entry) => entry.identifier === "migrations:run"),
        );
        const observed = logs as ((typeof logs)[number] & {
          executionTimestamp: number;
          willRetry: boolean;
          occInfo: { retryCount: number; tableName: string } | null;
        })[];
        const commandLog = observed.find(
          (entry) =>
            entry.identifier === "depotCommands:amendSummarizedDocument",
        )!;
        const batchLogs = observed.filter(
          (entry) => entry.identifier === "migrations:run",
        );
        const overlapped = batchLogs.some(
          (entry) =>
            entry.executionTimestamp <
              commandLog.executionTimestamp + commandLog.executionTime &&
            commandLog.executionTimestamp <
              entry.executionTimestamp + entry.executionTime,
        );
        record(`race ${trial}`, {
          rows,
          entries: logs,
          overlapped,
          conflicts: observed.filter((entry) => entry.occInfo !== null).length,
          retryRequests: observed.filter((entry) => entry.willRetry).length,
        });
        expect(overlapped, "The mutation executions must overlap").toBe(true);
        // Both serial orders must also preserve the newest version.
        await backend.admin.run("migrations:configure", {
          failKey: null,
          reads: 0,
          clear: false,
        });
        await backend.admin.run("migrations:run", { reset: true });
        expect(
          (await backend.admin.readTable("documentSummaries")).map(
            (row) => row.title,
          ),
        ).toEqual(["amended", "amended"]);
      }
      for (const first of ["batch", "command"] as const) {
        const { backend, client } = await setup(1);
        const batch = () => backend.admin.run("migrations:run", {});
        const command = () =>
          client.mutation(api.depotCommands.amendSummarizedDocument, {
            tenantId: "tenant",
            input: { documentId: "doc-00", title: "amended" },
          });
        if (first === "batch") {
          await batch();
          expect(
            (await backend.admin.readTable("documentSummaries")).filter(
              (row) => row.generation === 2,
            ),
          ).toHaveLength(1);
          await command();
        } else {
          await command();
          expect(
            (await backend.admin.readTable("documentSummaries")).filter(
              (row) => row.generation === 2,
            ),
          ).toHaveLength(0);
          await batch();
        }
        const rows = await backend.admin.readTable("documentSummaries");
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.title).toBe("amended");
          world.results.push(
            (row.sourceVersions as { version: number }[])[0]!.version,
          );
        }
        record(`serial ${first} first`, rows);
      }
    },
  "both generations end at stream version {version} with the amended title": (
    world,
    { version },
  ) => {
    expect(world.results.length).toBeGreaterThan(0);
    expect(world.results.every((value) => value === version)).toBe(true);
  },
});
