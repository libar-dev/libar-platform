import { getFunctionName } from "convex/server";
import type { Value } from "convex/values";
import { setTimeout as sleep } from "node:timers/promises";
import { expect } from "vitest";
import { internal as production } from "../../example/convex/_generated/api.js";
import { internal as fixture } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";

export type Generation = Record<string, Value> & {
  _id: string;
  generation: number;
  state: string;
  fence: number;
};
export type Progress = Record<string, Value> & {
  batchesDone: number;
  batchSize: number;
  pass: string;
  cursor: { tenantId: string; pageCursor: string | null } | null;
};
export type GenerationEntry = { generation: Generation; progress: Progress };

// rebuild.sdp.md:137: the operator query returns each generation with its progress row.
export async function generations(backend: Backend, readModel: string) {
  return (await backend.admin.run("rebuild:getGenerations", {
    readModel,
  })) as unknown as GenerationEntry[];
}
export async function generationEntry(
  backend: Backend,
  readModel: string,
  generationId: string,
) {
  const entry = (await generations(backend, readModel)).find(
    ({ generation }) => generation._id === generationId,
  );
  if (!entry)
    throw new Error(`Missing generation ${generationId} of ${readModel}`);
  return entry;
}

// rebuild.online-rebuild-interrupt-resume.sdp.md:33: a running chain has a 30 s stall bound.
export async function waitForGeneration(
  backend: Backend,
  readModel: string,
  generationId: string,
  until: (entry: GenerationEntry) => boolean = ({ generation }) =>
    generation.state === "verified",
  observe: (entry: GenerationEntry) => void | Promise<void> = () => {},
): Promise<GenerationEntry> {
  const deadline = Date.now() + 240_000;
  let advancedAt = Date.now();
  let batches = -1;
  for (;;) {
    const entry = await generationEntry(backend, readModel, generationId);
    await observe(entry);
    if (until(entry)) return entry;
    if (entry.progress.batchesDone !== batches) {
      batches = entry.progress.batchesDone;
      advancedAt = Date.now();
    }
    if (Date.now() - advancedAt >= 30_000 || Date.now() >= deadline)
      throw new Error(`Generation did not advance: ${JSON.stringify(entry)}`);
    await sleep(10);
  }
}

// generation-registry.sdp.md:37; rebuild.sdp.md:115,127,133: install by the first rebuild.
async function install(
  backend: Backend,
  readModel: string,
  refs: { start: string; switch: string },
  operator: string,
) {
  const projectionVersion = 1;
  const id = await backend.admin.run(refs.start, {
    readModel,
    projectionVersion,
    operator,
  });
  if (typeof id !== "string")
    throw new Error("startGeneration did not return an ID");
  const verified = await waitForGeneration(backend, readModel, id);
  // rebuild.sdp.md:115: the installed generation is at the version the setup stated.
  expect(verified.generation.projectionVersion).toBe(projectionVersion);
  await backend.admin.run(refs.switch, { generationId: id, operator });
  return id;
}
export function installOrderSummary(
  backend: Backend,
  operator = "native-test",
) {
  return install(
    backend,
    "orderSummary",
    {
      start: getFunctionName(production.rebuild.startGeneration),
      switch: getFunctionName(production.rebuild.switchGeneration),
    },
    operator,
  );
}
export function installFixtureReadModel(
  backend: Backend,
  readModel = "documentSummary",
  operator = "native-test",
) {
  // native-harness.sdp.md:90: documentTitle setups explicitly select version 1.
  return install(
    backend,
    readModel,
    {
      start: getFunctionName(fixture.rebuild.startGeneration),
      switch: getFunctionName(fixture.rebuild.switchGeneration),
    },
    operator,
  );
}
