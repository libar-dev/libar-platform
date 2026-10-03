import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6ContextBatchCursorContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-context-batch-cursor.contract.js";
import type { Backend } from "../../harness/backend.js";
import {
  setup,
  record,
  status,
  untilStatus,
  completeRows,
} from "./migration-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-context-batch-cursor",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-context-batch-cursor",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  batch: number;
}
async function checkpoint(backend: Backend) {
  const component = (
    await backend.admin.readTable("migrations", { component: "migrations" })
  ).find((row) => row.name === "migrations:contextBatch")!;
  const generation = (await backend.admin.readTable("generations")).find(
    (row) => row.generation === 2,
  )!;
  const progress = (await backend.admin.readTable("generationProgress")).find(
    (row) => row.generationId === generation._id,
  )!;
  // generation-registry.sdp.md:74: the parent checkpoint cursor is on generationProgress.
  expect((progress.cursor as { pageCursor: string }).pageCursor).toBe(
    component.cursor,
  );
  return { component, generation };
}
bindExample(contract, (): World => ({ batch: 0 }), {
  "{rows} depot documents and a parent batch capped at {batch} source rows":
    async (world, { rows, batch }) => {
      world.backend = (await setup(rows)).backend;
      world.batch = batch;
    },
  "the migrations driver cancels and resumes the context batch and a later batch throws after writing its checkpoint":
    async (world) => {
      const backend = world.backend!;
      await backend.admin.run("migrations:runContextBatch", {
        cancel: true,
        batchSize: world.batch,
      });
      const canceled = await status(
        backend,
        "migrations",
        "migrations:contextBatch",
      );
      expect(canceled.state).toBe("canceled");
      expect(canceled.processed).toBe(world.batch);
      const before = await checkpoint(backend);
      record("context checkpoint after cancel", {
        status: canceled,
        ...before,
      });
      await backend.admin.run("migrations:configure", {
        failKey: "doc-03",
        reads: 0,
        clear: false,
      });
      await backend.admin.run("migrations:runContextBatch", {
        batchSize: world.batch,
      });
      const failed = await untilStatus(
        backend,
        "failed",
        "migrations",
        "migrations:contextBatch",
      );
      expect(failed.error).toContain(
        "Context batch interrupted after checkpoint write",
      );
      const after = await checkpoint(backend);
      record("context checkpoint after failure", { status: failed, ...after });
      expect(after.generation).toEqual(before.generation);
      expect(after.component.cursor).toBe(before.component.cursor);
      expect(await backend.admin.readTable("migrationVisits")).toHaveLength(
        world.batch,
      );
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 0,
        clear: false,
      });
      await backend.admin.run("migrations:runContextBatch", {
        batchSize: world.batch,
      });
      record("context batch complete", {
        status: await untilStatus(
          backend,
          "success",
          "migrations",
          "migrations:contextBatch",
        ),
        ...(await checkpoint(backend)),
      });
    },
  "resume writes {rows} distinct summaries and both saved cursors agree at each interrupted boundary":
    async (world, { rows }) => {
      record("context batch rows", await completeRows(world.backend!, rows, 1));
      expect(await world.backend!.admin.readTable("enumerationPages")).toEqual(
        [],
      );
    },
});
