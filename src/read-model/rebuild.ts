// The operator entries and bounded batch chains of the online read-model rebuild.
import type {
  FunctionReference,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationResult,
} from "convex/server";
import type { GenericId } from "convex/values";
import { assertOperator } from "../command/actor-and-scope.js";
import { nextTenant } from "../command/authority.js";
import type { CommandDataModel } from "../command/tables.js";
import type { ListArgs } from "../context/queries.js";
import { utf8Length } from "../context/text.js";
import { gateAllows, restoreDoorClosed, resumeScope } from "../gate/gate.js";
import type { GateChangeDataModel } from "../gate/tables.js";
import { applyProjection, projectionOf, type ReadModel } from "./projection.js";
import {
  rowWriter,
  rowsOf,
  type Generation,
  type ReadModelDataModel,
} from "./tables.js";
import type { SourceRef } from "./write.js";
// A per-entity read model, its source, and the source's enumeration query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RebuildTarget<D = any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readModel: ReadModel<D, any>;
  source: SourceRef;
  list: FunctionReference<"query", "internal", ListArgs, PaginationResult<D>>;
};
// A composition's own registered batch of a generation, which a batch schedules by reference.
export type BatchRef = FunctionReference<
  "mutation",
  "internal",
  { generationId: GenericId<"generations">; fence: number },
  null
>;
// A composition's own registered tenant fill batch.
export type FillBatchRef = FunctionReference<
  "mutation",
  "internal",
  { fence: number },
  null
>;
// The read models a composition can rebuild and its four registered batches.
export type RebuildConfig = {
  targets: readonly RebuildTarget[];
  refs: {
    backfillBatch: BatchRef;
    verifyBatch: BatchRef;
    purgeBatch: BatchRef;
    fillTenantsBatch: FillBatchRef;
  };
};
type RebuildDataModel = ReadModelDataModel &
  CommandDataModel &
  GateChangeDataModel;
type MutationCtx = GenericMutationCtx<RebuildDataModel>;
type GenerationArgs = {
  generationId: GenericId<"generations">;
  operator: string;
};
type BatchArgs = { generationId: GenericId<"generations">; fence: number };
// The composition holds all these tables; database helpers are not covariant in their model.
const mutationContext = <D extends RebuildDataModel>(
  ctx: GenericMutationCtx<D>,
) => ctx as unknown as MutationCtx;
// The tenants one fill batch takes from the grants.
export const limitTenantFillBatch = 8;
// The generations one getGenerations answer lists, the newest first.
export const limitGenerationsListed = 20;
// The most entities one backfill or verify batch reads, from the read model's row budget.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rebuildBatchCeiling = (readModel: ReadModel<any, any>): number =>
  Math.min(100, Math.floor(4194304 / (2 * readModel.rowBudgetBytes)));
// The most rows one purge batch deletes, from the read model's row budget.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const limitPurgeBatch = (readModel: ReadModel<any, any>): number =>
  Math.min(500, Math.floor(4194304 / readModel.rowBudgetBytes));
// The batch size startGeneration stores: the request, refused below 1 or fractional, lowered to the
// ceiling, or the ceiling when none is asked.
export function batchSizeFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readModel: ReadModel<any, any>,
  requested?: number,
): number {
  if (
    requested !== undefined &&
    (!Number.isInteger(requested) || requested < 1)
  )
    throw new Error(
      `The batch size must be a whole number of at least 1, and ${requested} is not`,
    );
  return Math.min(
    requested ?? rebuildBatchCeiling(readModel),
    rebuildBatchCeiling(readModel),
  );
}
function targetFor(config: RebuildConfig, name: string): RebuildTarget {
  const target = config.targets.find(
    ({ readModel }) => readModel.name === name,
  );
  if (target === undefined)
    throw new Error(`This deployment declares no read model ${name}`);
  return target;
}
async function inFlight(ctx: MutationCtx, name: string) {
  const building = await ctx.db
    .query("generations")
    .withIndex("by_read_model_state", (q) =>
      q.eq("readModel", name).eq("state", "building"),
    )
    .first();
  if (building !== null) return building;
  const verifying = await ctx.db
    .query("generations")
    .withIndex("by_read_model_state", (q) =>
      q
        .eq("readModel", name)
        .gte("state", "verified")
        .lte("state", "verifying"),
    )
    .first();
  return verifying ?? undefined;
}
function flightError(row: Generation) {
  return new Error(
    `Read model ${row.readModel} already has generation ${row.generation} in ${row.state}`,
  );
}
async function loadGeneration(
  ctx: MutationCtx,
  generationId: GenericId<"generations">,
) {
  const generation = await ctx.db.get("generations", generationId);
  if (generation === null) throw new Error(`No generation ${generationId}`);
  return generation;
}
async function load(ctx: MutationCtx, generationId: GenericId<"generations">) {
  const generation = await loadGeneration(ctx, generationId);
  const progress = await ctx.db
    .query("generationProgress")
    .withIndex("by_generation", (q) => q.eq("generationId", generationId))
    .unique();
  if (progress === null)
    throw new Error(`No progress for generation ${generationId}`);
  return { generation, progress };
}
const description = (row: Generation) =>
  `Generation ${row.generation} of ${row.readModel}`;
async function reopenGates(
  ctx: MutationCtx,
  generationId: GenericId<"generations">,
  operator: string,
) {
  const gate = await ctx.db
    .query("maintenanceGates")
    .withIndex("by_key", (q) => q.eq("key", "gates"))
    .unique();
  for (const entry of gate?.closed ?? [])
    if (entry.generationId === generationId)
      await resumeScope(ctx, entry.scopeKey, operator);
}
export async function startGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: {
    readModel: string;
    projectionVersion?: number;
    batchSize?: number;
    operator: string;
  },
): Promise<GenericId<"generations">> {
  const operator = assertOperator(args.operator);
  const ctx = mutationContext(parentCtx);
  const target = targetFor(config, args.readModel);
  const projectionVersion =
    args.projectionVersion ?? target.readModel.projections[0].version;
  projectionOf(target.readModel, projectionVersion);
  const batchSize = batchSizeFor(target.readModel, args.batchSize);
  const flight = await inFlight(ctx, args.readModel);
  if (flight !== undefined) throw flightError(flight);
  if (
    (await nextTenant(ctx, null)) === null &&
    (await ctx.db.query("grants").first()) !== null
  )
    throw new Error(
      "The tenant list is empty while grants exist; fillTenants fills it from the grants table",
    );
  const fill = await ctx.db.query("tenantFill").first();
  if (fill?.pass === "fill")
    throw new Error(
      "The tenant list is being filled; startGeneration waits until fillTenants has ended",
    );
  const last = await ctx.db
    .query("generations")
    .withIndex("by_read_model", (q) => q.eq("readModel", args.readModel))
    .order("desc")
    .first();
  const now = Date.now();
  const generationId = await ctx.db.insert("generations", {
    readModel: args.readModel,
    generation: (last?.generation ?? 0) + 1,
    projectionVersion,
    state: "building",
    pauseRequired: false,
    fence: 1,
    startedAt: now,
    startedBy: operator,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.insert("generationProgress", {
    generationId,
    pass: "backfill",
    batchSize,
    cursor: null,
    batchesDone: 0,
    rowsWritten: 0,
    rowsSkipped: 0,
    misses: 0,
    rowsPurged: 0,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, config.refs.backfillBatch, {
    generationId,
    fence: 1,
  });
  return generationId;
}
export async function interruptGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  _config: RebuildConfig,
  args: GenerationArgs,
): Promise<null> {
  const operator = assertOperator(args.operator);
  const ctx = mutationContext(parentCtx);
  const { generation, progress } = await load(ctx, args.generationId);
  if (progress.pass === "idle")
    throw new Error(`${description(generation)} has no batch to interrupt`);
  const now = Date.now();
  await ctx.db.patch(generation._id, {
    fence: generation.fence + 1,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.patch(progress._id, {
    lastError: `interrupted by ${operator}`,
    updatedAt: now,
  });
  return null;
}
// Bumps the fence and schedules the batch of the pass the progress row names, in the caller's mutation.
export async function resumeChain<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  generationId: GenericId<"generations">,
  operator: string,
): Promise<void> {
  const ctx = mutationContext(parentCtx);
  const { generation, progress } = await load(ctx, generationId);
  if (progress.pass === "idle")
    throw new Error(`${description(generation)} has no batch to resume`);
  const fence = generation.fence + 1;
  const now = Date.now();
  await ctx.db.patch(generationId, {
    fence,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.patch(progress._id, { lastError: undefined, updatedAt: now });
  const ref =
    progress.pass === "backfill"
      ? config.refs.backfillBatch
      : progress.pass === "verify"
        ? config.refs.verifyBatch
        : config.refs.purgeBatch;
  await ctx.scheduler.runAfter(0, ref, { generationId, fence });
}
export async function resumeGeneration<D extends RebuildDataModel>(
  ctx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: GenerationArgs,
): Promise<null> {
  const operator = assertOperator(args.operator);
  await resumeChain(ctx, config, args.generationId, operator);
  return null;
}
export async function switchGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  _config: RebuildConfig,
  args: GenerationArgs & { rollbackPeriodMs?: number },
): Promise<null> {
  const operator = assertOperator(args.operator);
  const ctx = mutationContext(parentCtx);
  const generation = await loadGeneration(ctx, args.generationId);
  if (generation.state !== "verified")
    throw new Error(
      `${description(generation)} is ${generation.state}; switchGeneration needs verified`,
    );
  const period = args.rollbackPeriodMs;
  if (
    period !== undefined &&
    (!Number.isInteger(period) || period < 0 || period > 2592000000)
  )
    throw new Error(
      `The rollback period must be between 0 and 2592000000 ms, and ${period} is not`,
    );
  const now = Date.now();
  const active = await ctx.db
    .query("generations")
    .withIndex("by_read_model_state", (q) =>
      q.eq("readModel", generation.readModel).eq("state", "active"),
    )
    .unique();
  if (active !== null)
    await ctx.db.patch(active._id, {
      state: "retired",
      retiredAt: now,
      retireAfter: now + (period ?? 604800000),
      changedAt: now,
      changedBy: operator,
    });
  await ctx.db.patch(generation._id, {
    state: "active",
    switchedAt: now,
    retiredAt: undefined,
    retireAfter: undefined,
    changedAt: now,
    changedBy: operator,
  });
  if (generation.pauseRequired)
    await reopenGates(ctx, generation._id, operator);
  return null;
}
export async function rollbackGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: GenerationArgs,
): Promise<null> {
  const operator = assertOperator(args.operator);
  const ctx = mutationContext(parentCtx);
  const { generation, progress } = await load(ctx, args.generationId);
  if (generation.state !== "retired")
    throw new Error(
      `${description(generation)} is ${generation.state}; rollbackGeneration needs retired`,
    );
  const now = Date.now();
  if (now >= generation.retireAfter!)
    throw new Error(`${description(generation)} is past its rollback period`);
  if (progress.pass === "purge")
    throw new Error(`${description(generation)} is already being purged`);
  if (generation.pauseRequired)
    throw new Error(
      `${description(generation)} needs a write pause and cannot be rolled back`,
    );
  const flight = await inFlight(ctx, generation.readModel);
  if (flight !== undefined) throw flightError(flight);
  projectionOf(
    targetFor(config, generation.readModel).readModel,
    generation.projectionVersion,
  );
  const fence = generation.fence + 1;
  await ctx.db.patch(generation._id, {
    state: "verifying",
    fence,
    retiredAt: undefined,
    retireAfter: undefined,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.patch(progress._id, {
    pass: "verify",
    cursor: null,
    misses: 0,
    lastError: undefined,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, config.refs.verifyBatch, {
    generationId: generation._id,
    fence,
  });
  return null;
}
export async function abortGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  _config: RebuildConfig,
  args: GenerationArgs & { reason: string },
): Promise<null> {
  const operator = assertOperator(args.operator);
  if (utf8Length(args.reason) < 1 || utf8Length(args.reason) > 256)
    throw new Error("The reason must be between 1 and 256 bytes");
  const ctx = mutationContext(parentCtx);
  const { generation, progress } = await load(ctx, args.generationId);
  if (
    generation.state !== "building" &&
    generation.state !== "verifying" &&
    generation.state !== "verified"
  )
    throw new Error(
      `${description(generation)} is ${generation.state}; abortGeneration needs building, verifying or verified`,
    );
  const now = Date.now();
  await ctx.db.patch(generation._id, {
    state: "aborted",
    fence: generation.fence + 1,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.patch(progress._id, {
    pass: "idle",
    lastError: `aborted: ${args.reason}`,
    updatedAt: now,
  });
  await reopenGates(ctx, generation._id, operator);
  return null;
}
export async function purgeGeneration<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: GenerationArgs,
): Promise<null> {
  const operator = assertOperator(args.operator);
  const ctx = mutationContext(parentCtx);
  const { generation, progress } = await load(ctx, args.generationId);
  if (generation.state !== "retired" && generation.state !== "aborted")
    throw new Error(
      `${description(generation)} is ${generation.state}; purgeGeneration needs retired or aborted`,
    );
  const now = Date.now();
  if (generation.state === "retired" && now < generation.retireAfter!)
    throw new Error(`${description(generation)} is inside its rollback period`);
  if (progress.pass === "purge")
    throw new Error(
      `${description(generation)} is already being purged; resumeGeneration continues it`,
    );
  const fence = generation.fence + 1;
  await ctx.db.patch(generation._id, {
    fence,
    changedAt: now,
    changedBy: operator,
  });
  await ctx.db.patch(progress._id, {
    pass: "purge",
    cursor: null,
    lastError: undefined,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, config.refs.purgeBatch, {
    generationId: generation._id,
    fence,
  });
  return null;
}
// All three generation batches share the fence, tenant cursor, gate and checkpoint rules.
async function generationBatch(
  ctx: MutationCtx,
  config: RebuildConfig,
  args: BatchArgs,
  pass: "backfill" | "verify" | "purge",
): Promise<null> {
  const generation = await ctx.db.get("generations", args.generationId);
  if (generation === null) return null;
  const progress = await ctx.db
    .query("generationProgress")
    .withIndex("by_generation", (q) => q.eq("generationId", args.generationId))
    .unique();
  const stateMatches =
    pass === "backfill"
      ? generation.state === "building"
      : pass === "verify"
        ? generation.state === "verifying"
        : generation.state === "retired" || generation.state === "aborted";
  if (
    !stateMatches ||
    progress === null ||
    progress.pass !== pass ||
    generation.fence !== args.fence
  )
    return null;
  const tenantId = progress.cursor?.tenantId ?? (await nextTenant(ctx, null));
  const gate = await gateAllows(
    ctx,
    tenantId === null ? ["all"] : ["all", `tenant:${tenantId}`],
    args.generationId,
  );
  if (!gate.allowed) {
    await ctx.db.patch(progress._id, {
      lastError: `write paused for ${gate.scopeKey}: ${gate.reason}`,
      updatedAt: Date.now(),
    });
    return null;
  }
  const target = targetFor(config, generation.readModel);
  let cursor = progress.cursor;
  let done = tenantId === null;
  let { rowsWritten, rowsSkipped, misses, rowsPurged } = progress;
  if (tenantId !== null) {
    if (pass === "purge") {
      const size = Math.min(
        progress.batchSize,
        limitPurgeBatch(target.readModel),
      );
      const db = rowWriter(ctx);
      const rows = await db
        .query(rowsOf(target.readModel.table))
        .withIndex("by_key", (q) =>
          q.eq("tenantId", tenantId).eq("generation", generation.generation),
        )
        .take(size);
      for (const row of rows) await db.delete(row._id);
      rowsPurged += rows.length;
      const next =
        rows.length === size ? tenantId : await nextTenant(ctx, tenantId);
      done = next === null;
      cursor = next === null ? null : { tenantId: next, pageCursor: null };
    } else {
      const page = await ctx.runQuery(target.list, {
        tenantId,
        includeDeleted: true,
        paginationOpts: {
          numItems: progress.batchSize,
          cursor: progress.cursor?.pageCursor ?? null,
        },
      });
      for (const dto of page.page) {
        const [result] = await applyProjection(ctx, target.readModel, {
          tenantId,
          dto,
          versions: [dto.version],
          mode: "backfill",
          generations: [
            {
              role: generation.state === "building" ? "building" : "verifying",
              generation: generation.generation,
              projectionVersion: generation.projectionVersion,
            },
          ],
        });
        if (
          result === "inserted" ||
          result === "updated" ||
          result === "deleted"
        ) {
          if (pass === "backfill") rowsWritten += 1;
          else misses += 1;
        } else rowsSkipped += 1;
      }
      if (page.isDone) {
        const next = await nextTenant(ctx, tenantId);
        done = next === null;
        cursor = next === null ? null : { tenantId: next, pageCursor: null };
      } else cursor = { tenantId, pageCursor: page.continueCursor };
    }
  }
  const now = Date.now();
  const counts = {
    batchesDone: progress.batchesDone + 1,
    ...(!done ? { lastError: undefined } : {}),
    updatedAt: now,
  };
  if (pass === "purge") {
    await ctx.db.patch(progress._id, {
      ...counts,
      cursor: done ? null : cursor,
      rowsPurged,
      ...(done ? { pass: "idle" as const } : {}),
    });
    if (done)
      await ctx.db.patch(generation._id, {
        state: "purged",
        retiredAt: undefined,
        retireAfter: undefined,
      });
    else await ctx.scheduler.runAfter(0, config.refs.purgeBatch, args);
  } else {
    await ctx.db.patch(progress._id, {
      ...counts,
      rowsSkipped,
      ...(pass === "backfill"
        ? { rowsWritten, ...(done ? { misses: 0 } : {}) }
        : { misses }),
      cursor: done ? null : cursor,
      ...(done
        ? {
            pass: pass === "backfill" ? ("verify" as const) : ("idle" as const),
          }
        : {}),
    });
    if (done)
      await ctx.db.patch(generation._id, {
        state: pass === "backfill" ? "verifying" : "verified",
      });
    if (pass === "backfill")
      await ctx.scheduler.runAfter(
        0,
        done ? config.refs.verifyBatch : config.refs.backfillBatch,
        args,
      );
    else if (!done)
      await ctx.scheduler.runAfter(0, config.refs.verifyBatch, args);
  }
  return null;
}
export async function backfillBatch<D extends RebuildDataModel>(
  ctx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: BatchArgs,
): Promise<null> {
  return generationBatch(mutationContext(ctx), config, args, "backfill");
}
export async function verifyBatch<D extends RebuildDataModel>(
  ctx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: BatchArgs,
): Promise<null> {
  return generationBatch(mutationContext(ctx), config, args, "verify");
}
export async function purgeBatch<D extends RebuildDataModel>(
  ctx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: BatchArgs,
): Promise<null> {
  return generationBatch(mutationContext(ctx), config, args, "purge");
}
export async function getGenerations<D extends RebuildDataModel>(
  parentCtx: GenericQueryCtx<D>,
  _config: RebuildConfig,
  args: { readModel: string },
) {
  const ctx = parentCtx as unknown as GenericQueryCtx<RebuildDataModel>;
  const generations = await ctx.db
    .query("generations")
    .withIndex("by_read_model", (q) => q.eq("readModel", args.readModel))
    .order("desc")
    .take(limitGenerationsListed);
  return Promise.all(
    generations.map(async (generation) => {
      const progress = await ctx.db
        .query("generationProgress")
        .withIndex("by_generation", (q) => q.eq("generationId", generation._id))
        .unique();
      if (progress === null)
        throw new Error(`No progress for generation ${generation._id}`);
      return { generation, progress };
    }),
  );
}
export async function fillTenants<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: { operator: string },
): Promise<null> {
  const operator = assertOperator(args.operator);
  if (restoreDoorClosed())
    throw new Error("fillTenants is refused while the restore door is closed");
  const ctx = mutationContext(parentCtx);
  for (const { readModel } of config.targets) {
    const flight = await inFlight(ctx, readModel.name);
    if (flight !== undefined)
      throw new Error(
        `Read model ${readModel.name} has generation ${flight.generation} in ${flight.state}; fillTenants needs no generation in flight`,
      );
  }
  const row = await ctx.db.query("tenantFill").first();
  const now = Date.now();
  const fence = (row?.fence ?? 0) + 1;
  const counts = {
    cursor: null,
    batchesDone: 0,
    tenantsRead: 0,
    tenantsInserted: 0,
  };
  if (row === null)
    await ctx.db.insert("tenantFill", {
      ...counts,
      pass: "fill",
      fence,
      startedAt: now,
      startedBy: operator,
      changedAt: now,
      changedBy: operator,
      updatedAt: now,
    });
  else
    await ctx.db.patch(row._id, {
      ...(row.pass === "idle" ? counts : {}),
      pass: "fill",
      fence,
      lastError: undefined,
      changedAt: now,
      changedBy: operator,
      updatedAt: now,
    });
  await ctx.scheduler.runAfter(0, config.refs.fillTenantsBatch, { fence });
  return null;
}
export async function fillTenantsBatch<D extends RebuildDataModel>(
  parentCtx: GenericMutationCtx<D>,
  config: RebuildConfig,
  args: { fence: number },
): Promise<null> {
  const ctx = mutationContext(parentCtx);
  const row = await ctx.db.query("tenantFill").first();
  if (row === null || row.pass !== "fill" || row.fence !== args.fence)
    return null;
  const gate = await gateAllows(ctx, ["all"]);
  if (!gate.allowed) {
    await ctx.db.patch(row._id, {
      lastError: `write paused for ${gate.scopeKey}: ${gate.reason}`,
      updatedAt: Date.now(),
    });
    return null;
  }
  const now = Date.now();
  let { cursor, tenantsRead, tenantsInserted } = row;
  let done = false;
  for (let i = 0; i < limitTenantFillBatch; i++) {
    const after = cursor;
    const grant = await ctx.db
      .query("grants")
      .withIndex("by_principal", (q) =>
        after === null ? q : q.gt("tenantId", after),
      )
      .first();
    if (grant === null) {
      done = true;
      break;
    }
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_tenant", (q) => q.eq("tenantId", grant.tenantId))
      .first();
    if (tenant === null) {
      await ctx.db.insert("tenants", {
        tenantId: grant.tenantId,
        createdAt: now,
      });
      tenantsInserted += 1;
    }
    tenantsRead += 1;
    cursor = grant.tenantId;
  }
  await ctx.db.patch(row._id, {
    cursor: done ? null : cursor,
    tenantsRead,
    tenantsInserted,
    batchesDone: row.batchesDone + 1,
    ...(!done ? { lastError: undefined } : {}),
    updatedAt: now,
    ...(done ? { pass: "idle" as const } : {}),
  });
  if (!done)
    await ctx.scheduler.runAfter(0, config.refs.fillTenantsBatch, args);
  return null;
}
