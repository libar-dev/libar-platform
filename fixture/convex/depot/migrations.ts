import { Migrations } from "@convex-dev/migrations";
import {
  type FunctionHandle,
  type GenericDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v, type GenericId } from "convex/values";
import { components } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
import schema from "./schema.js";
const migrations = new Migrations(components.migrations, {
  internalMutation,
  schema,
});
export const streams = migrations.define({
  table: "streams",
  customRange: (q) =>
    q.withIndex("by_identity", (q) =>
      q.eq("tenantId", "tenant").eq("streamType", "document"),
    ),
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    await ctx.db.insert("migrationVisits", { streamId: row.streamId });
  },
});
export const parentWrite = migrations.define({
  table: "streams",
  batchSize: 1,
  migrateOne: async (ctx) => {
    const settings = (await ctx.db.query("migrationSettings").unique())!;
    // @ts-expect-error The context owns no documentSummaries table.
    const parentTable: import("./_generated/dataModel.js").TableNames =
      "documentSummaries";
    void parentTable;
    await (ctx as GenericMutationCtx<GenericDataModel>).db.patch(
      "documentSummaries",
      settings.parentId as GenericId<"documentSummaries">,
      { title: "context write" },
    );
  },
});
export const callback = migrations.define({
  table: "streams",
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    const settings = (await ctx.db.query("migrationSettings").unique())!;
    await ctx.runMutation(settings.callback as FunctionHandle<"mutation">, {
      tenantId: row.tenantId,
      streamId: row.streamId,
      version: row.streamVersion,
      title: (row.state as { title: string }).title,
    });
  },
});
export const configure = mutation({
  args: { parentId: v.string(), callback: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("migrationSettings", args);
  },
});
