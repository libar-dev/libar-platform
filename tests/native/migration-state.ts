import { expect } from "vitest";
import type { Backend } from "../../harness/backend.js";
import { status } from "./migration-steps.js";

export async function migrationState(backend: Backend, name: string) {
  const component = (
    await backend.admin.readTable("migrations", { component: "migrations" })
  ).find((row) => row.name === name)!;
  const scheduled = await backend.admin.readTable("_scheduled_functions", {
    component: "migrations",
  });
  const worker = scheduled.find((row) => row._id === component.workerId);
  const generation = (await backend.admin.readTable("generations")).find(
    (row) => row.generation === 2,
  )!;
  const progress = (await backend.admin.readTable("generationProgress")).find(
    (row) => row.generationId === generation._id,
  )!;
  const rows = (await backend.admin.readTable("documentSummaries")).filter(
    (row) => row.generation === 2,
  );
  const visits = await backend.admin.readTable("migrationVisits");
  return {
    status: await status(backend, "migrations", name),
    component,
    worker,
    generation,
    progress,
    rows,
    visits,
  };
}
export function equalContextCursor(
  state: Awaited<ReturnType<typeof migrationState>>,
) {
  // generation-registry.sdp.md:74: the cursor is held by the progress row.
  expect((state.progress.cursor as { pageCursor: string }).pageCursor).toBe(
    state.component.cursor,
  );
}
