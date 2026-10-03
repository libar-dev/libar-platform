import { convexTest } from "convex-test";
import { ConvexError, v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";
import { expect } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import type { Doc, Id } from "../../fixture/convex/_generated/dataModel.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import schema from "../../fixture/convex/schema.js";

export function rebuildApp(onlyFirstActive = false) {
  // The fault schema refuses activation of generation two. All registered functions and
  // component schemas remain the composition's own.
  const fields = schema.tables.generations.validator.fields;
  const selected = onlyFirstActive
    ? (defineSchema({
        ...schema.tables,
        generations: defineTable(
          v.union(
            v.object({
              ...fields,
              state: v.union(
                v.literal("building"),
                v.literal("verifying"),
                v.literal("verified"),
                v.literal("retired"),
                v.literal("aborted"),
                v.literal("purged"),
              ),
            }),
            v.object({
              ...fields,
              state: v.literal("active"),
              generation: v.literal(1),
            }),
          ),
        )
          .index("by_read_model", ["readModel", "generation"])
          .index("by_read_model_state", ["readModel", "state"]),
      }) as unknown as typeof schema)
    : schema;
  const t = convexTest(
    selected,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  t.registerComponent(
    "depot",
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
  return t;
}
export type App = ReturnType<typeof rebuildApp>;
export type GenerationId = Id<"generations">;
export const operator = "rebuild operator";
export const start = (
  t: App,
  args: {
    readModel?: string;
    projectionVersion?: number;
    batchSize?: number;
    operator?: string;
  } = {},
) =>
  t.mutation(internal.rebuild.startGeneration, {
    readModel: "documentTitle",
    projectionVersion: 1,
    operator,
    ...args,
  });
export async function read(t: App, generationId: GenerationId) {
  return t.run(async (ctx) => {
    const generation = await ctx.db.get(generationId);
    const progress = await ctx.db
      .query("generationProgress")
      .withIndex("by_generation", (q) => q.eq("generationId", generationId))
      .unique();
    if (!generation || !progress)
      throw new Error("Generation and progress are required");
    return { generation, progress };
  });
}
export const rows = (t: App) =>
  t.run((ctx) => ctx.db.query("documentTitles").collect());
export const summaries = (t: App) =>
  t.run((ctx) => ctx.db.query("documentSummaries").collect());
export const scheduled = (t: App) =>
  t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
export const fill = (t: App) =>
  t.run((ctx) => ctx.db.query("tenantFill").unique());
export const tenants = (t: App) =>
  t.run((ctx) => ctx.db.query("tenants").withIndex("by_tenant").collect());
export async function snapshot(t: App) {
  return t.run(async (ctx) => ({
    generations: await ctx.db.query("generations").collect(),
    progress: await ctx.db.query("generationProgress").collect(),
    titles: await ctx.db.query("documentTitles").collect(),
    summaries: await ctx.db.query("documentSummaries").collect(),
    tenants: await ctx.db.query("tenants").collect(),
    fills: await ctx.db.query("tenantFill").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}
export async function failure(call: Promise<unknown>, message: string) {
  const error: unknown = await call.then(
    () => {
      throw new Error("Expected refusal");
    },
    (e) => e,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect((error as Error).message).toBe(message);
}
export async function refused(
  t: App,
  call: () => Promise<unknown>,
  message: string,
) {
  const before = await snapshot(t);
  await failure(call(), message);
  expect(await snapshot(t)).toStrictEqual(before);
}
export async function batch(t: App, generationId: GenerationId) {
  const { generation, progress } = await read(t, generationId);
  const args = { generationId, fence: generation.fence };
  switch (progress.pass) {
    case "backfill":
      return t.mutation(internal.rebuild.backfillBatch, args);
    case "verify":
      return t.mutation(internal.rebuild.verifyBatch, args);
    case "purge":
      return t.mutation(internal.rebuild.purgeBatch, args);
    default:
      throw new Error("No pass to run");
  }
}
export async function finish(t: App, id: GenerationId) {
  for (let i = 0; i < 100; i++) {
    if ((await read(t, id)).progress.pass === "idle") return;
    await batch(t, id);
  }
  throw new Error("The pass did not finish within 100 direct batches");
}
export async function install(
  t: App,
  readModel = "documentTitle",
  projectionVersion = 1,
) {
  const id = await start(t, { readModel, projectionVersion });
  await finish(t, id);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: id,
    operator,
  });
  return id;
}
export const tenant = (t: App, tenantId: string) =>
  t.run((ctx) => ctx.db.insert("tenants", { tenantId, createdAt: Date.now() }));
export async function caller(t: App, tenantId = "tenant-a") {
  await t.mutation(internal.grants.grant, {
    tenantId,
    principalKind: "human",
    principalId: "https://rebuild.test|reader",
    permission: "depot.documents",
    grantedBy: operator,
  });
  return t.withIdentity({ issuer: "https://rebuild.test", subject: "reader" });
}
export async function create(
  t: App,
  documentId: string,
  title = documentId,
  tenantId = "tenant-a",
  kind: "plain" | "summary" | "twice" = "plain",
) {
  const user = await caller(t, tenantId);
  const ref =
    kind === "plain"
      ? api.depotCommands.createDocument
      : kind === "summary"
        ? api.depotCommands.createSummarizedDocument
        : api.summarizedTwice.createTwiceSummarizedDocument;
  const result = await user.mutation(ref, {
    tenantId,
    input: { documentId, title },
  });
  expect(result.kind).toBe("applied");
  return result;
}
export async function amend(
  t: App,
  documentId: string,
  title: string,
  summary = false,
) {
  const user = await caller(t);
  const result = await user.mutation(
    summary
      ? api.depotCommands.amendSummarizedDocument
      : api.depotCommands.amendDocument,
    { tenantId: "tenant-a", input: { documentId, title } },
  );
  expect(result.kind).toBe("applied");
  return result;
}
export async function patchGeneration(
  t: App,
  id: GenerationId,
  fields: Partial<Doc<"generations">>,
  progress: Partial<Doc<"generationProgress">> = {},
) {
  const { progress: p } = await read(t, id);
  await t.run(async (ctx) => {
    await ctx.db.patch(id, fields);
    await ctx.db.patch(p._id, progress);
  });
}
// Refusal tests arrange otherwise unreachable or invalid states directly. Successful installs use
// startGeneration, direct batches and switchGeneration.
export async function inState(
  t: App,
  state: Doc<"generations">["state"],
  pass: Doc<"generationProgress">["pass"] = "idle",
) {
  const id = await start(t);
  await patchGeneration(t, id, { state }, { pass });
  return id;
}
export async function grantsWithoutTenants(t: App, count: number) {
  await t.run(async (ctx) => {
    for (let i = count - 1; i >= 0; i--) {
      const tenantId = `tenant-${String(i).padStart(2, "0")}`;
      for (const principalId of ["one", "two"])
        await ctx.db.insert("grants", {
          tenantId,
          principalKind: "human",
          principalId,
          permission: "depot.documents",
          grantedBy: operator,
          grantedAt: Date.now(),
        });
    }
  });
}
