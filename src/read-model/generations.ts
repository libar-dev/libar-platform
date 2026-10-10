// The registry reads a command and a query make. None is registered here.
import type { WritableGeneration } from "./projection.js";
import {
  registryReader,
  type Generation,
  type ReadModelDataModel,
  type RegistryReader,
} from "./tables.js";
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
    ...building.map((row) =>
      writable(row.state === "building" ? "building" : "verifying", row),
    ),
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
