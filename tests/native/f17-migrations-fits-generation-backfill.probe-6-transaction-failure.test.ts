import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe6TransactionFailureContract as contract } from "../../generated/contracts/facts.f17-migrations-fits-generation-backfill.probe-6-transaction-failure.contract.js";
import type { Backend } from "../../harness/backend.js";
import { paceAfterWrite } from "../../harness/wait.js";
import { setup, record, untilStatus, completeRows } from "./migration-steps.js";
import { migrationState, equalContextCursor } from "./migration-state.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f17-migrations-fits-generation-backfill.probe-6-transaction-failure",
  ),
  verifies: ref(
    "spec:facts.f17-migrations-fits-generation-backfill.probe-6-transaction-failure",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  rows: number;
  batch: number;
  failed?: Awaited<ReturnType<typeof migrationState>>;
}
bindExample(contract, (): World => ({ rows: 0, batch: 0 }), {
  "{rows} depot documents, batches of {batch} and {blobs} payloads of {kib} KiB":
    async (world, { rows, batch, blobs, kib }) => {
      world.backend = (await setup(rows)).backend;
      world.rows = rows;
      world.batch = batch;
      for (let i = 0; i < blobs; i++) {
        await world.backend.admin.run("limits:insertBlobs", {
          group: "migration-budget",
          count: 1,
          size: kib * 1024,
        });
        await paceAfterWrite(kib * 1024 + 256);
      }
      record("transaction budget payload", {
        blobs,
        kib,
        bytes: blobs * kib * 1024,
      });
    },
  "the scheduled context batch exceeds the read budget after attempting its rows and checkpoint":
    async (world) => {
      const backend = world.backend!;
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 0,
        clear: false,
        exhaustKey: "doc-02",
      });
      const started = await backend.admin.run("migrations:runContextBatch", {
        batchSize: world.batch,
      });
      record("transaction failure start", started);
      await untilStatus(
        backend,
        "failed",
        "migrations",
        "migrations:contextBatch",
      );
      const failed = await migrationState(backend, "migrations:contextBatch");
      record("transaction failure saved state", failed);
      world.failed = failed;
      expect((failed.worker!.state as { kind: string }).kind).toBe("failed");
      expect(JSON.stringify(failed.worker!.state)).toContain(
        "Too many bytes read in a single function execution",
      );
      equalContextCursor(failed);
      expect((failed.worker!.args as { cursor: string }[])[0]!.cursor).toBe(
        failed.component.cursor,
      );
      expect(failed.generation.batchesDone).toBe(1);
      expect(failed.generation.rowsWritten).toBe(world.batch);
      expect(failed.rows.map((row) => row.key).sort()).toEqual([
        "doc-00",
        "doc-01",
      ]);
      await backend.admin.run("migrations:configure", {
        failKey: null,
        reads: 0,
        clear: false,
      });
      await backend.admin.run("migrations:runContextBatch", {
        batchSize: world.batch,
      });
      await untilStatus(
        backend,
        "success",
        "migrations",
        "migrations:contextBatch",
      );
      const final = await migrationState(backend, "migrations:contextBatch");
      record("transaction failure resume complete", final);
      equalContextCursor(final);
    },
  "status is {state}, the component stores {errors} errors, {committed} rows remain and resume visits every source {copies} time":
    async (world, { state, errors, committed, copies }) => {
      expect(world.failed!.status.state).toBe(state);
      expect(world.failed!.component.error === undefined ? 0 : 1).toBe(errors);
      expect(world.failed!.status.error).toBeUndefined();
      expect(world.failed!.rows).toHaveLength(committed);
      expect(world.failed!.visits).toHaveLength(committed);
      expect(world.failed!.component.processed).toBe(committed);
      await completeRows(world.backend!, world.rows, copies);
    },
});
