import { setTimeout as sleep } from "node:timers/promises";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6OperatorCancelContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-operator-cancel.contract.js";
import { setup, record, untilStatus, completeRows } from "./migration-steps.js";
import { migrationState, equalContextCursor } from "./migration-state.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-operator-cancel",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-operator-cancel",
  ),
});
void anchor;
interface World {
  rows: number;
  batch: number;
  results: { state: string; laterBatches: number; copies: number }[];
}
bindExample(contract, (): World => ({ rows: 0, batch: 0, results: [] }), {
  "{rows} depot documents and parent migrations capped at {batch} source rows":
    (world, { rows, batch }) => {
      world.rows = rows;
      world.batch = batch;
    },
  "an operator observes each committed successor pending and cancels it in a separate mutation":
    async (world) => {
      for (const form of ["summaries", "contextBatch"] as const) {
        const { backend } = await setup(world.rows);
        const name = `migrations:${form}`;
        const run =
          form === "summaries"
            ? "migrations:run"
            : "migrations:runContextBatch";
        const mark = await backend.admin.logMark();
        await backend.admin.run("migrations:configure", {
          failKey: null,
          reads: 200,
          clear: false,
        });
        const started = await backend.admin.run(run, {
          batchSize: world.batch,
        });
        const scheduled = await backend.admin.readTable(
          "_scheduled_functions",
          { component: "migrations" },
        );
        const pending = scheduled.filter(
          (row) => (row.state as { kind: string }).kind === "pending",
        );
        record(`${form} before operator cancel`, { started, pending });
        expect(pending.length).toBeGreaterThan(0);
        const canceled = await backend.admin.run(
          "lib:cancel",
          { name },
          { component: "migrations" },
        );
        const after = await migrationState(backend, name);
        record(`${form} operator cancel committed`, {
          returned: canceled,
          ...after,
        });
        expect(after.status.state).toBe("canceled");
        expect((after.worker!.state as { kind: string }).kind).toBe("canceled");
        expect(after.status.processed).toBeGreaterThan(0);
        expect(after.status.processed).toBeLessThan(world.rows);
        expect(after.rows).toHaveLength(after.status.processed);
        expect(after.visits).toHaveLength(after.status.processed);
        if (form === "contextBatch") equalContextCursor(after);
        await sleep(500);
        const quiet = await migrationState(backend, name);
        record(`${form} after cancel interval`, quiet);
        expect(quiet).toEqual(after);
        await backend.admin.run("migrations:status", {});
        const entries = await backend.admin.completionsSince(mark, (logs) =>
          logs.some((entry) => entry.identifier === "migrations:status"),
        );
        const cancel = entries.find(
          (entry) => entry.identifier === "lib:cancel",
        )!;
        expect(cancel).toBeDefined();
        record(`${form} cancel execution records`, {
          entries,
          laterCompletions: entries.filter(
            (entry) =>
              entry.identifier === "lib:migrate" &&
              entry.timestamp > cancel.timestamp,
          ),
        });
        const laterBatches =
          (quiet.visits.length - after.visits.length) / world.batch;
        await backend.admin.run("migrations:configure", {
          failKey: null,
          reads: 0,
          clear: false,
        });
        await backend.admin.run(run, { batchSize: world.batch });
        await untilStatus(backend, "success", "migrations", name);
        const final = await migrationState(backend, name);
        record(`${form} operator resume complete`, final);
        if (form === "contextBatch") equalContextCursor(final);
        const complete = await completeRows(backend, world.rows, 1);
        world.results.push({
          state: after.status.state,
          laterBatches,
          copies: complete.visits.length / world.rows,
        });
      }
    },
  "both drivers report {state}, commit {laterBatches} later batches and resume to {copies} visit per source":
    (world, expected) => {
      expect(world.results).toEqual([expected, expected]);
    },
});
