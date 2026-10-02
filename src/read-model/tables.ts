// The parent's generation registry of spec:application.generation-registry and the conventions every
// per-entity read-model row follows (spec:application.projection-contract), as fragments the parent's
// schema.ts spreads into defineSchema.
import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
  type GenericDataModel,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  type SchemaDefinition,
} from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "../command/actor-and-scope.js";
import { streamVersionValidator } from "../context/outcome.js";
export const generationStateValidator = v.union(
  v.literal("building"),
  v.literal("verifying"),
  v.literal("verified"),
  v.literal("active"),
  v.literal("retired"),
  v.literal("aborted"),
  v.literal("purged"),
);
export const batchCursorValidator = v.object({
  tenantId: v.string(),
  pageCursor: v.union(v.string(), v.null()),
  streamId: v.optional(v.string()),
  eventCursor: v.optional(v.union(v.string(), v.null())),
});
// One row per generation of a read model, spanning every tenant, so neither index leads with one.
export const readModelTables = {
  generations: defineTable({
    readModel: v.string(),
    generation: v.number(),
    projectionVersion: v.number(),
    state: generationStateValidator,
    pauseRequired: v.boolean(),
    batchSize: v.number(),
    fence: v.number(),
    cursor: v.optional(batchCursorValidator),
    verifyCursor: v.optional(batchCursorValidator),
    batchesDone: v.number(),
    rowsWritten: v.number(),
    rowsSkipped: v.number(),
    misses: v.number(),
    startedAt: v.number(),
    startedBy: actorValidator,
    switchedAt: v.optional(v.number()),
    retireAfter: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_read_model", ["readModel", "generation"])
    .index("by_read_model_state", ["readModel", "state"]),
};
// Spread into every per-entity read-model table, which also declares
// .index("by_key", ["tenantId", "generation", "key"]).
export const rowConventions = {
  tenantId: v.string(),
  generation: v.number(),
  key: v.string(),
  projectionVersion: v.number(),
  sourceVersions: v.array(streamVersionValidator),
};
export type ReadModelDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof readModelTables, true>
>;
export type Generation = DocumentByName<ReadModelDataModel, "generations">;
// The part of a ctx the registry's helpers use. A database reader is not covariant in its data model,
// so each helper is generic over the parent's data model, which holds the registry.
export type RegistryReader<
  DataModel extends ReadModelDataModel = ReadModelDataModel,
> = { db: GenericDatabaseReader<DataModel> };
export type RegistryWriter<
  DataModel extends ReadModelDataModel = ReadModelDataModel,
> = { db: GenericDatabaseWriter<DataModel> };
// A read-model table is the parent's own. The library types every one of them as this table, whose
// fields and index each of them has, and reads and writes it under the parent's name for it. The
// table is a value only so that its type can be taken.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const rowTable = defineTable(rowConventions).index("by_key", [
  "tenantId",
  "generation",
  "key",
]);
export type RowDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<{ rows: typeof rowTable }, true>
>;
export type RowWriter<DataModel extends GenericDataModel = RowDataModel> = {
  db: GenericDatabaseWriter<DataModel>;
};
// The registry's reader and writer, and a row table's, as the library's own tables type them.
export const registryReader = <DataModel extends ReadModelDataModel>(
  ctx: RegistryReader<DataModel>,
) => ctx.db as unknown as GenericDatabaseReader<ReadModelDataModel>;
export const registryWriter = <DataModel extends ReadModelDataModel>(
  ctx: RegistryWriter<DataModel>,
) => ctx.db as unknown as GenericDatabaseWriter<ReadModelDataModel>;
export const rowWriter = <DataModel extends GenericDataModel>(
  ctx: RowWriter<DataModel>,
) => ctx.db as unknown as GenericDatabaseWriter<RowDataModel>;
export const rowsOf = (table: string) => table as "rows";
