import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6InterruptionAndResumeContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-interruption-and-resume.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-interruption-and-resume",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-interruption-and-resume",
  ),
});
void anchor;
import type { Backend } from "../../harness/backend.js";
import {
  setup,
  record,
  status,
  untilStatus,
  completeRows,
} from "./migration-steps.js";
interface World {
  backend?: Backend;
  rows: number;
  batch: number;
}
bindExample(contract, (): World => ({ rows: 0, batch: 0 }), {
  "{rows} document summaries and a migration with batch size {batch}": async (
    world,
    { rows, batch },
  ) => {
    world.backend = (await setup(rows)).backend;
    world.rows = rows;
    world.batch = batch;
  },
  "the migration is canceled, resumed, failed inside a batch and resumed, then the backend restarts with a batch pending":
    async (world) => {
      const backend = world.backend!;
      const canceled = await backend.admin.run("migrations:run", {
        cancel: true,
        batchSize: world.batch,
      });
      const state = await status(backend);
      record("cancel", {
        returned: canceled,
        status: state,
        stored: await backend.admin.readTable("migrations", {
          component: "migrations",
        }),
      });
      expect(state.state).toBe("canceled");
      expect(state.processed).toBe(world.batch);
      expect(state.cursor).not.toBeNull();
      expect(await backend.admin.readTable("migrationVisits")).toHaveLength(
        world.batch,
      );
      await backend.admin.run("migrations:run", { batchSize: world.batch });
      record("resumed", await untilStatus(backend, "success"));
      await completeRows(backend, world.rows, 1);
      await backend.admin.run("migrations:configure", {
        failKey: "doc-03",
        reads: 0,
        clear: true,
      });
      await backend.admin.run("migrations:run", {
        reset: true,
        cancel: true,
        batchSize: world.batch,
      });
      const before = await status(backend);
      await backend.admin.run("migrations:run", { batchSize: world.batch });
      const failed = await untilStatus(backend, "failed");
      record("thrown batch", {
        before,
        failed,
        visits: await backend.admin.readTable("migrationVisits"),
        stored: await backend.admin.readTable("migrations", {
          component: "migrations",
        }),
      });
      expect(failed.error).toContain(
        "Backfill batch interrupted after row write",
      );
      expect(failed.cursor).toBe(before.cursor);
      expect(failed.processed).toBe(before.processed);
      expect(await backend.admin.readTable("migrationVisits")).toHaveLength(
        world.batch,
      );
      expect(
        (await backend.admin.readTable("documentSummaries")).filter(
          (row) => row.generation === 2,
        ),
      ).toHaveLength(world.batch);
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 0,
        clear: false,
      });
      await backend.admin.run("migrations:run", { batchSize: world.batch });
      record("resumed after throw", await untilStatus(backend, "success"));
      await completeRows(backend, world.rows, 1);
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 200,
        clear: true,
      });
      await backend.admin.run("migrations:run", { reset: true, batchSize: 1 });
      const scheduled = await backend.admin.readTable("_scheduled_functions", {
        component: "migrations",
      });
      const pending = scheduled.filter(
        (row) => (row.state as { kind: string }).kind === "pending",
      );
      record("before restart", { status: await status(backend), pending });
      expect(pending.length).toBeGreaterThan(0);
      await backend.kill();
      await backend.restart();
      record("after restart", await untilStatus(backend, "success"));
    },
  "every source has exactly {copies} target row and a successful visit after each completed migration":
    async (world, { copies }) => {
      record(
        "final rows",
        await completeRows(world.backend!, world.rows, copies),
      );
    },
});
