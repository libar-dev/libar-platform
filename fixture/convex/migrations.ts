// The fixture composition's migrations, driven by the migrations component mounted in the parent.
// summaries walks the parent's document summaries of generation 1 and writes generation 2 from each
// document's current state; contextBatch is a parent mutation written by hand that pages the depot's
// list and returns the context's cursor to the component; the rest show which tables a migration
// defined in the parent can reach. Generation 2 is a building generation the tests insert.
import {
  Migrations,
  type MigrationStatus,
  type MigrationFunctionReference,
} from "@convex-dev/migrations";
import {
  createFunctionHandle,
  makeFunctionReference,
  type GenericMutationCtx,
  type GenericDataModel,
} from "convex/server";
import { v, type GenericId } from "convex/values";
import { components, internal } from "./_generated/api.js";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server.js";
import schema from "./schema.js";
import { documentSummary } from "./summaries.js";
import type { StreamVersion } from "../../src/kernel/index.js";

const migrations = new Migrations(components.migrations, {
  internalMutation,
  schema,
});
// The package's runOne reference type omits explicit undefined on optional arguments.
const summaryMigration = makeFunctionReference(
  "migrations:summaries",
) as unknown as MigrationFunctionReference;
const enumerationMigration = makeFunctionReference(
  "migrations:enumeration",
) as unknown as MigrationFunctionReference;
type Document = Parameters<typeof documentSummary.projection.project>[1];

async function writeSummary(ctx: MutationCtx, tenantId: string, dto: Document) {
  const existing = await ctx.db
    .query("documentSummaries")
    .withIndex("by_key", (q) =>
      q.eq("tenantId", tenantId).eq("generation", 2).eq("key", dto.documentId),
    )
    .unique();
  if (existing && existing.sourceVersions[0]!.version >= dto.version.version)
    return;
  const row = {
    ...documentSummary.projection.project(tenantId, dto, [dto.version])!,
    tenantId,
    generation: 2,
    key: dto.documentId,
    projectionVersion: 1,
    sourceVersions: [dto.version],
  };
  if (existing) await ctx.db.replace("documentSummaries", existing._id, row);
  else await ctx.db.insert("documentSummaries", row);
}
export const summaries = migrations.define({
  table: "documentSummaries",
  customRange: (q) =>
    q.withIndex("by_key", (q) =>
      q.eq("tenantId", "tenant").eq("generation", 1),
    ),
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    const dto = (await ctx.runQuery(components.depot.queries.document.get, {
      tenantId: row.tenantId,
      streamId: row.key,
    })) as Document;
    const settings = await ctx.db.query("migrationSettings").unique();
    // Repeated reads widen the overlap with a live command without changing its domain work.
    for (let i = 0; i < (settings?.reads ?? 0); i++)
      await ctx.db.get("documentSummaries", row._id);
    await writeSummary(ctx, row.tenantId, dto);
    await ctx.db.insert("migrationVisits", {
      key: row.key,
      version: dto.version.version,
    });
    if (settings?.failKey === row.key)
      throw new Error("Backfill batch interrupted after row write");
  },
});
export const run = internalMutation({
  args: {
    cancel: v.optional(v.boolean()),
    reset: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ started: MigrationStatus; stopped: MigrationStatus | null }> => {
    const started = await migrations.runOne(ctx, summaryMigration, {
      ...(args.reset === undefined ? {} : { reset: args.reset }),
      ...(args.batchSize === undefined ? {} : { batchSize: args.batchSize }),
    });
    const stopped = args.cancel
      ? await migrations.cancel(ctx, summaryMigration)
      : null;
    return { started, stopped };
  },
});
export const status = internalQuery({
  args: {},
  handler: (ctx): Promise<MigrationStatus[]> =>
    migrations.getStatus(ctx, { migrations: [summaryMigration] }),
});
export const configure = internalMutation({
  args: {
    failKey: v.union(v.string(), v.null()),
    reads: v.number(),
    clear: v.boolean(),
    exhaustKey: v.optional(v.string()),
  },
  handler: async (ctx, { clear, ...settings }) => {
    const old = await ctx.db.query("migrationSettings").unique();
    if (old) await ctx.db.replace("migrationSettings", old._id, settings);
    else await ctx.db.insert("migrationSettings", settings);
    if (clear) {
      for (const row of await ctx.db.query("migrationVisits").collect())
        await ctx.db.delete("migrationVisits", row._id);
      for (const row of await ctx.db.query("documentSummaries").collect())
        if (row.generation === 2)
          await ctx.db.delete("documentSummaries", row._id);
    }
  },
});
// This declaration is deliberately refused by the parent's generated data model.
export const contextTable = migrations.define({
  // @ts-expect-error The parent owns no streams table.
  table: "streams",
  migrateOne: async (ctx, row) => {
    await ctx.db.insert("migrationVisits", { key: row._id, version: 0 });
  },
});
export const contextId = internalMutation({
  args: { id: v.string() },
  handler: (ctx, { id }) =>
    (ctx as GenericMutationCtx<GenericDataModel>).db.get(
      "streams",
      id as GenericId<"streams">,
    ),
});
export const enumeration = migrations.define({
  table: "enumerationPages",
  batchSize: 1,
  migrateOne: async (ctx, row) => {
    const page = await ctx.runQuery(components.depot.queries.document.list, {
      tenantId: row.tenantId,
      paginationOpts: { cursor: row.cursor, numItems: row.size },
    });
    for (const value of page.page)
      await writeSummary(ctx, row.tenantId, value as Document);
    console.log("Enumeration batch", {
      items: page.page.length,
      contextCalls: 1,
      isDone: page.isDone,
    });
    if (!page.isDone)
      await ctx.db.insert("enumerationPages", {
        tenantId: row.tenantId,
        cursor: page.continueCursor,
        size: row.size,
      });
  },
});
export const runEnumeration = internalMutation({
  args: {},
  handler: (ctx): Promise<MigrationStatus> =>
    migrations.runOne(ctx, enumerationMigration),
});
export const prepareContext = internalMutation({
  args: { parentId: v.string() },
  handler: async (ctx, { parentId }): Promise<null> =>
    ctx.runMutation(components.depot.migrations.configure, {
      parentId,
      callback: await createFunctionHandle(internal.migrations.receive),
    }),
});
export const receive = internalMutation({
  args: {
    tenantId: v.string(),
    streamId: v.string(),
    version: v.number(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const version: StreamVersion = {
      tenantId: args.tenantId,
      contextId: "depot",
      streamType: "document",
      streamId: args.streamId,
      version: args.version,
    };
    await writeSummary(ctx, args.tenantId, {
      documentId: args.streamId,
      title: args.title,
      status: "draft",
      amendments: 0,
      version,
    });
  },
});

// A whole parent batch, with the context's cursor as the driver's cursor.
export const contextBatch = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    oneBatchOnly: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<import("@convex-dev/migrations").MigrationResult> => {
    if (args.dryRun)
      throw new Error("This fixture batch requires dryRun false");
    const size = Math.min(args.batchSize ?? 2, 2);
    const page = await ctx.runQuery(components.depot.queries.document.list, {
      tenantId: "tenant",
      paginationOpts: { cursor: args.cursor ?? null, numItems: size },
      includeDeleted: true,
    });
    const generation = (await ctx.db
      .query("generations")
      .withIndex("by_read_model", (q) =>
        q.eq("readModel", "documentSummary").eq("generation", 2),
      )
      .unique())!;
    const settings = await ctx.db.query("migrationSettings").unique();
    for (let i = 0; i < (settings?.reads ?? 0); i++)
      await ctx.db.get("generations", generation._id);
    for (const value of page.page) {
      const dto = value as Document;
      await writeSummary(ctx, "tenant", dto);
      await ctx.db.insert("migrationVisits", {
        key: dto.documentId,
        version: dto.version.version,
      });
    }
    await ctx.db.patch("generations", generation._id, {
      cursor: { tenantId: "tenant", pageCursor: page.continueCursor },
      batchesDone: generation.batchesDone + 1,
      rowsWritten: generation.rowsWritten + page.page.length,
    });
    if (
      page.page.some(
        (value) => (value as Document).documentId === settings?.exhaustKey,
      )
    )
      await ctx.db
        .query("blobs")
        .withIndex("by_group", (q) => q.eq("group", "migration-budget"))
        .collect();
    if (
      page.page.some(
        (value) => (value as Document).documentId === settings?.failKey,
      )
    )
      throw new Error("Context batch interrupted after checkpoint write");
    console.log("Context batch", { items: page.page.length, contextCalls: 1 });
    return {
      continueCursor: page.continueCursor,
      processed: page.page.length,
      isDone: page.isDone,
    };
  },
});
const contextBatchMigration = makeFunctionReference(
  "migrations:contextBatch",
) as unknown as MigrationFunctionReference;
export const runContextBatch = internalMutation({
  args: { cancel: v.optional(v.boolean()), batchSize: v.number() },
  handler: async (ctx, args): Promise<MigrationStatus> => {
    const result = await migrations.runOne(ctx, contextBatchMigration, {
      batchSize: args.batchSize,
    });
    return args.cancel ? migrations.cancel(ctx, contextBatchMigration) : result;
  },
});

const tableWalker = new Migrations(components.migrations, { internalMutation });
export const contextTableWithoutSchema = tableWalker.define({
  // @ts-expect-error The parent owns no streams table, even without the schema option.
  table: "streams",
  migrateOne: async (ctx, row) => {
    await ctx.db.insert("migrationVisits", { key: row._id, version: 0 });
  },
});

export const rangeWithoutSchema = tableWalker.define({
  table: "documentSummaries",
  customRange: (q) =>
    q.withIndex("by_key", (q) =>
      q.eq("tenantId", "tenant").eq("generation", 1),
    ),
  migrateOne: () => undefined,
});
