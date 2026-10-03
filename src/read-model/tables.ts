// The parent's generation registry of spec:application.generation-registry, with its progress rows,
// aggregate markers and the tenant fill's row, and the conventions every
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
export const progressPassValidator = v.union(
  v.literal("backfill"),
  v.literal("verify"),
  v.literal("purge"),
  v.literal("idle"),
);
// One row per generation of a read model, spanning every tenant, so neither index leads with one.
export const readModelTables = {
  generations: defineTable({
    readModel: v.string(),
    generation: v.number(),
    projectionVersion: v.number(),
    state: generationStateValidator,
    pauseRequired: v.boolean(),
    fence: v.number(),
    startedAt: v.number(),
    startedBy: v.string(),
    changedAt: v.number(),
    changedBy: v.string(),
    switchedAt: v.optional(v.number()),
    retiredAt: v.optional(v.number()),
    retireAfter: v.optional(v.number()),
    interruptedFence: v.optional(v.number()),
  })
    .index("by_read_model", ["readModel", "generation"])
    .index("by_read_model_state", ["readModel", "state"]),
  generationProgress: defineTable({
    generationId: v.id("generations"),
    pass: progressPassValidator,
    batchSize: v.number(),
    cursor: v.union(batchCursorValidator, v.null()),
    batchesDone: v.number(),
    rowsWritten: v.number(),
    rowsSkipped: v.number(),
    misses: v.number(),
    rowsPurged: v.number(),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_generation", ["generationId"]),
  projectionMarkers: defineTable({
    tenantId: v.string(),
    readModel: v.string(),
    generation: v.number(),
    entityKey: v.string(),
    aggregateKey: v.string(),
    contribution: v.number(),
    sourceVersions: v.array(streamVersionValidator),
  }).index("by_entity", ["tenantId", "readModel", "generation", "entityKey"]),
  tenantFill: defineTable({
    pass: v.union(v.literal("fill"), v.literal("idle")),
    fence: v.number(),
    cursor: v.union(v.string(), v.null()),
    batchesDone: v.number(),
    tenantsRead: v.number(),
    tenantsInserted: v.number(),
    lastError: v.optional(v.string()),
    startedAt: v.number(),
    startedBy: v.string(),
    changedAt: v.number(),
    changedBy: v.string(),
    updatedAt: v.number(),
  }),
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
