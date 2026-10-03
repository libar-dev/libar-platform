// The composition's thirteen internal read-model rebuild functions.
import { v } from "convex/values";
import * as rebuild from "../../src/read-model/rebuild.js";
import { readModelTables } from "../../src/read-model/tables.js";
import { components, internal } from "./_generated/api.js";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { documentSummary } from "./summaries.js";
import { documentTitle } from "./documentTitles.js";
import { documentSource } from "./summarizedTwice.js";
const config: rebuild.RebuildConfig = {
  targets: [
    {
      readModel: documentSummary,
      source: documentSource,
      list: components.depot.queries.document.list,
    },
    {
      readModel: documentTitle,
      source: documentSource,
      list: components.depot.queries.document.list,
    },
  ],
  refs: {
    backfillBatch: internal.rebuild.backfillBatch,
    verifyBatch: internal.rebuild.verifyBatch,
    purgeBatch: internal.rebuild.purgeBatch,
    fillTenantsBatch: internal.rebuild.fillTenantsBatch,
  },
};
const batchArgs = { generationId: v.id("generations"), fence: v.number() };
const generationDoc = v.object({
  ...readModelTables.generations.validator.fields,
  _id: v.id("generations"),
  _creationTime: v.number(),
});
const progressDoc = v.object({
  ...readModelTables.generationProgress.validator.fields,
  _id: v.id("generationProgress"),
  _creationTime: v.number(),
});
export const startGeneration = internalMutation({
  args: {
    readModel: v.string(),
    projectionVersion: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    operator: v.string(),
  },
  returns: v.id("generations"),
  handler: (ctx, args) => rebuild.startGeneration(ctx, config, args),
});
export const interruptGeneration = internalMutation({
  args: { generationId: v.id("generations"), operator: v.string() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.interruptGeneration(ctx, config, args),
});
export const resumeGeneration = internalMutation({
  args: { generationId: v.id("generations"), operator: v.string() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.resumeGeneration(ctx, config, args),
});
export const switchGeneration = internalMutation({
  args: {
    generationId: v.id("generations"),
    rollbackPeriodMs: v.optional(v.number()),
    operator: v.string(),
  },
  returns: v.null(),
  handler: (ctx, args) => rebuild.switchGeneration(ctx, config, args),
});
export const rollbackGeneration = internalMutation({
  args: { generationId: v.id("generations"), operator: v.string() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.rollbackGeneration(ctx, config, args),
});
export const abortGeneration = internalMutation({
  args: {
    generationId: v.id("generations"),
    reason: v.string(),
    operator: v.string(),
  },
  returns: v.null(),
  handler: (ctx, args) => rebuild.abortGeneration(ctx, config, args),
});
export const purgeGeneration = internalMutation({
  args: { generationId: v.id("generations"), operator: v.string() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.purgeGeneration(ctx, config, args),
});
export const fillTenants = internalMutation({
  args: { operator: v.string() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.fillTenants(ctx, config, args),
});
export const backfillBatch = internalMutation({
  args: batchArgs,
  returns: v.null(),
  handler: (ctx, args) => rebuild.backfillBatch(ctx, config, args),
});
export const verifyBatch = internalMutation({
  args: batchArgs,
  returns: v.null(),
  handler: (ctx, args) => rebuild.verifyBatch(ctx, config, args),
});
export const purgeBatch = internalMutation({
  args: batchArgs,
  returns: v.null(),
  handler: (ctx, args) => rebuild.purgeBatch(ctx, config, args),
});
export const fillTenantsBatch = internalMutation({
  args: { fence: v.number() },
  returns: v.null(),
  handler: (ctx, args) => rebuild.fillTenantsBatch(ctx, config, args),
});
export const getGenerations = internalQuery({
  args: { readModel: v.string() },
  returns: v.array(
    v.object({ generation: generationDoc, progress: progressDoc }),
  ),
  handler: (ctx, args) => rebuild.getGenerations(ctx, config, args),
});
