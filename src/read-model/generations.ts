// The registry's first activation and the reads a command and a query make of it
// (spec:application.generation-registry). None is registered here.
import type { Actor } from "../command/actor-and-scope.js";
import type { AnyReadModel, WritableGeneration } from "./projection.js";
import {
  registryReader,
  registryWriter,
  type Generation,
  type ReadModelDataModel,
  type RegistryReader,
  type RegistryWriter,
} from "./tables.js";
// Makes generation 1 of a read model active. Legal only when the read model has no generation row in
// any state. It reads no source: a read model added to a deployment that already has history is a
// rebuild's work.
export async function activateFirstGeneration<
  DataModel extends ReadModelDataModel,
>(
  ctx: RegistryWriter<DataModel>,
  readModel: AnyReadModel,
  startedBy: Actor,
): Promise<number> {
  const db = registryWriter(ctx);
  const existing = await db
    .query("generations")
    .withIndex("by_read_model", (q) => q.eq("readModel", readModel.name))
    .first();
  if (existing !== null)
    throw new Error(
      `Read model ${readModel.name} already has generation ${existing.generation}, which is ${existing.state}`,
    );
  const now = Date.now();
  await db.insert("generations", {
    readModel: readModel.name,
    generation: 1,
    projectionVersion: readModel.projection.version,
    state: "active",
    pauseRequired: false,
    batchSize: 0,
    fence: 0,
    batchesDone: 0,
    rowsWritten: 0,
    rowsSkipped: 0,
    misses: 0,
    startedAt: now,
    startedBy,
    switchedAt: now,
    updatedAt: now,
  });
  return 1;
}
// The generations a command writes: the active one first, then the one in building, verifying or
// verified, each with its role. Two indexed reads: the state ranges active to building and verified
// to verifying hold no other state, and each holds at most two rows of a sound registry.
export async function generationsToWrite<DataModel extends ReadModelDataModel>(
  ctx: RegistryReader<DataModel>,
  readModel: string,
): Promise<WritableGeneration[]> {
  const db = registryReader(ctx);
  const rows = [
    ...(await db
      .query("generations")
      .withIndex("by_read_model_state", (q) =>
        q
          .eq("readModel", readModel)
          .gte("state", "active")
          .lte("state", "building"),
      )
      .take(3)),
    ...(await db
      .query("generations")
      .withIndex("by_read_model_state", (q) =>
        q
          .eq("readModel", readModel)
          .gte("state", "verified")
          .lte("state", "verifying"),
      )
      .take(3)),
  ];
  const active = rows.filter((row) => row.state === "active");
  const building = rows.filter((row) => row.state !== "active");
  if (active.length > 1 || building.length > 1)
    throw new Error(
      `Read model ${readModel} has ${active.length} active generations and ${building.length} in building, verifying or verified`,
    );
  const writable = (role: WritableGeneration["role"], row: Generation) => ({
    role,
    generation: row.generation,
    projectionVersion: row.projectionVersion,
  });
  return [
    ...active.map((row) => writable("active", row)),
    ...building.map((row) => writable("building", row)),
  ];
}
// The generation a query reads, or undefined when the read model has none active. One indexed read.
export async function activeGeneration<DataModel extends ReadModelDataModel>(
  ctx: RegistryReader<DataModel>,
  readModel: string,
): Promise<number | undefined> {
  const active = await registryReader(ctx)
    .query("generations")
    .withIndex("by_read_model_state", (q) =>
      q.eq("readModel", readModel).eq("state", "active"),
    )
    .unique();
  return active?.generation;
}
