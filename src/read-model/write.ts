// The read-model half of step 9 of spec:command.command-pipeline: the read models a command declares,
// written from the streams entries its executor returned.
import type { StreamDto } from "../context/adapter.js";
import type { StreamVersion } from "../kernel/index.js";
import { generationsToWrite } from "./generations.js";
import {
  applyProjection,
  type AnyReadModel,
  type WritableGeneration,
} from "./projection.js";
import type {
  ReadModelDataModel,
  RegistryReader,
  RowWriter,
} from "./tables.js";
// One context and stream type pair.
export type SourceRef = { contextId: string; streamType: string };
// A read model a command writes, and the context and stream type whose DTOs feed it.
export type ReadModelBinding = { readModel: AnyReadModel; source: SourceRef };
// The read-model rows one command writes, a row in each generation counted once.
export const limitReadModelWritesPerCommand = 4;
// Whether a streams entry is of the source's context and stream type.
export const fromSource = (
  source: SourceRef,
  entry: { version: StreamVersion },
) =>
  entry.version.contextId === source.contextId &&
  entry.version.streamType === source.streamType;
// Every binding's read model must have a generation to write, whether or not an entry matches it.
// Returns the number of read-model rows inserted, replaced or deleted, a row in each generation once:
// the count held against limitReadModelWritesPerCommand, which the diagnostic record carries.
export async function writeReadModels<DataModel extends ReadModelDataModel>(
  ctx: RegistryReader<DataModel> & RowWriter<DataModel>,
  commandType: string,
  bindings: readonly ReadModelBinding[],
  input: { tenantId: string; streams: readonly StreamDto[] },
): Promise<number> {
  // One registry read per read model, however many sources bind it.
  const registry = new Map<string, WritableGeneration[]>();
  let rows = 0;
  for (const { readModel, source } of bindings) {
    let generations = registry.get(readModel.name);
    if (generations === undefined) {
      generations = await generationsToWrite(ctx, readModel.name);
      registry.set(readModel.name, generations);
    }
    if (generations.length === 0)
      throw new Error(
        `${commandType} writes the read model ${readModel.name}, which has no generation to write`,
      );
    for (const entry of input.streams) {
      if (!fromSource(source, entry)) continue;
      const results = await applyProjection(ctx, readModel, {
        tenantId: input.tenantId,
        dto: entry.dto,
        versions: [entry.version],
        mode: entry.created ? "live-created" : "live-updated",
        generations,
      });
      rows += results.filter(
        (result) =>
          result === "inserted" || result === "updated" || result === "deleted",
      ).length;
      // The mutation rolls back every row written before the one that passes the limit.
      if (rows > limitReadModelWritesPerCommand)
        throw new Error(
          `${commandType} writes more than ${limitReadModelWritesPerCommand} read-model rows`,
        );
    }
  }
  return rows;
}
