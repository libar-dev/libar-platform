import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { components, internal } from "../../fixture/convex/_generated/api.js";
import { internal as exampleInternal } from "../../example/convex/_generated/api.js";
import { deletedTitle } from "../../fixture/convex/depot/streams.js";
import { documentTitle } from "../../fixture/convex/documentTitles.js";
import { documentSource } from "../../fixture/convex/summarizedTwice.js";
import { applyProjection } from "../../src/read-model/projection.js";
import {
  candidateRow,
  dto,
  priorRow,
  projectionCases,
  readModel,
  version,
} from "../pure/rebuild-support.js";
import { productionTest } from "./production.js";
import {
  amend,
  batch,
  create,
  failure,
  fill,
  finish,
  grantsWithoutTenants,
  inState,
  install,
  operator,
  patchGeneration,
  read,
  rebuildApp,
  refused,
  rows,
  scheduled,
  snapshot,
  start,
  summaries,
  tenant,
  tenants,
  type App,
  type GenerationId,
} from "./rebuild-support.js";

// Scheduler timers never run. Every batch below is invoked as a mutation by the test.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.stubEnv("MAINTENANCE_MODE", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const later = () => vi.setSystemTime(Date.now() + 10);
const states = [
  "building",
  "verifying",
  "verified",
  "active",
  "retired",
  "aborted",
  "purged",
] as const;
const without = <T extends object>(value: T, ...keys: (keyof T)[]) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as keyof T)),
  );
const generationMessage = (state: string, entry: string, needs: string) =>
  `Generation 1 of documentTitle is ${state}; ${entry} needs ${needs}`;
const zeros = {
  batchesDone: 0,
  rowsWritten: 0,
  rowsSkipped: 0,
  misses: 0,
  rowsPurged: 0,
};
async function lastSchedule(t: App, name: string, args: object) {
  const all = await scheduled(t);
  expect(all.at(-1)).toStrictEqual({
    _id: expect.any(String),
    _creationTime: expect.any(Number),
    name: `rebuild:${name}`,
    args: [args],
    scheduledTime: Date.now(),
    state: { kind: "pending" },
  });
}

// rebuild.sdp.md fnStartGeneration:115; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test.each([false, true])(
  "convex-test: install on an empty deployment, tenant present=%s",
  async (present) => {
    const t = rebuildApp();
    if (present) await tenant(t, "tenant-a");
    const id = await start(t, { operator: "  installer  " });
    const initial = await read(t, id);
    expect(initial.generation).toStrictEqual({
      _id: id,
      _creationTime: expect.any(Number),
      readModel: "documentTitle",
      generation: 1,
      projectionVersion: 1,
      state: "building",
      pauseRequired: false,
      fence: 1,
      startedAt: 1000,
      changedAt: 1000,
      startedBy: "installer",
      changedBy: "installer",
    });
    expect(initial.progress).toStrictEqual({
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      generationId: id,
      pass: "backfill",
      batchSize: 100,
      cursor: null,
      ...zeros,
      updatedAt: 1000,
    });
    await lastSchedule(t, "backfillBatch", { generationId: id, fence: 1 });
    later();
    await t.mutation(internal.rebuild.backfillBatch, {
      generationId: id,
      fence: 1,
    });
    const backfilled = await read(t, id);
    expect(backfilled.generation).toStrictEqual({
      ...initial.generation,
      state: "verifying",
    });
    expect(backfilled.progress).toStrictEqual({
      ...initial.progress,
      pass: "verify",
      batchesDone: 1,
      updatedAt: 1010,
    });
    await lastSchedule(t, "verifyBatch", { generationId: id, fence: 1 });
    const beforeVerify = await scheduled(t);
    later();
    await t.mutation(internal.rebuild.verifyBatch, {
      generationId: id,
      fence: 1,
    });
    const verified = await read(t, id);
    expect(verified.generation).toStrictEqual({
      ...initial.generation,
      state: "verified",
    });
    expect(verified.progress).toStrictEqual({
      ...initial.progress,
      pass: "idle",
      batchesDone: 2,
      updatedAt: 1020,
    });
    expect(await scheduled(t)).toStrictEqual(beforeVerify);
    later();
    expect(
      await t.mutation(internal.rebuild.switchGeneration, {
        generationId: id,
        operator: " switch operator ",
      }),
    ).toBeNull();
    expect(await read(t, id)).toStrictEqual({
      generation: {
        ...initial.generation,
        state: "active",
        switchedAt: 1030,
        changedAt: 1030,
        changedBy: "switch operator",
      },
      progress: verified.progress,
    });
    expect((await snapshot(t)).generations).toHaveLength(1);
  },
);

// rebuild.sdp.md fnStartGeneration:115; projection-contract.sdp.md typeReadModel:67.
test("convex-test: the default projection is the first and generation numbers increase past aborted rows", async () => {
  const t = rebuildApp();
  const first = await t.mutation(internal.rebuild.startGeneration, {
    readModel: "documentTitle",
    operator,
  });
  expect((await read(t, first)).generation.projectionVersion).toBe(2);
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: first,
    operator,
    reason: "replace",
  });
  const second = await start(t);
  expect((await read(t, second)).generation.generation).toBe(2);
});

// rebuild.sdp.md fnStartGeneration:115, fnBatchSizeFor:116, errorUnknownGeneration:143.
test("convex-test: start refusals follow target, projection, batch size, in-flight, empty list and fill order", async () => {
  const t = rebuildApp();
  await grantsWithoutTenants(t, 1);
  await t.mutation(internal.rebuild.fillTenants, { operator });
  await refused(
    t,
    () =>
      start(t, { readModel: "missing", projectionVersion: 77, batchSize: 0 }),
    "This deployment declares no read model missing",
  );
  await refused(
    t,
    () => start(t, { projectionVersion: 77, batchSize: 0 }),
    "Read model documentTitle declares no projection of version 77",
  );
  await refused(
    t,
    () => start(t, { batchSize: 0 }),
    "The batch size must be a whole number of at least 1, and 0 is not",
  );
  await refused(
    t,
    () => start(t),
    "The tenant list is empty while grants exist; fillTenants fills it from the grants table",
  );
  await tenant(t, "tenant-00");
  await refused(
    t,
    () => start(t),
    "The tenant list is being filled; startGeneration waits until fillTenants has ended",
  );
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  const id = await start(t);
  // The in-flight refusal precedes both tenant-list refusals.
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("tenants").collect())
      await ctx.db.delete(row._id);
    const f = await ctx.db.query("tenantFill").unique();
    await ctx.db.patch(f!._id, { pass: "fill" });
  });
  for (const state of ["building", "verifying", "verified"] as const) {
    await patchGeneration(t, id, { state });
    await refused(
      t,
      () => start(t),
      `Read model documentTitle already has generation 1 in ${state}`,
    );
  }
});

// rebuild.sdp.md fnStartGeneration:115, fnBatchSizeFor:116.
test.each([0, -1, 1.5, NaN, Infinity])(
  "convex-test: start refuses batch size %s with its full message",
  async (batchSize) => {
    const t = rebuildApp();
    await refused(
      t,
      () => start(t, { batchSize }),
      `The batch size must be a whole number of at least 1, and ${batchSize} is not`,
    );
  },
);

// rebuild.sdp.md fnStartGeneration:115, limitBatchSize:146.
test.each([100, 101])(
  "convex-test: start stores the capped batch size for requested %i",
  async (batchSize) => {
    const t = rebuildApp();
    const id = await start(t, { batchSize });
    expect((await read(t, id)).progress.batchSize).toBe(100);
  },
);

// rebuild.sdp.md errorUnknownGeneration:143, fnInterruptGeneration:130, fnResumeGeneration:132,
// fnSwitchGeneration:133, fnRollbackGeneration:134, fnAbortGeneration:135, fnPurgeGeneration:136.
test("convex-test: every generation entry refuses an unknown ID and every batch leaves it alone", async () => {
  const t = rebuildApp();
  const id = await start(t);
  const { progress } = await read(t, id);
  await t.run(async (ctx) => {
    await ctx.db.delete(id);
    await ctx.db.delete(progress._id);
  });
  for (const ref of [
    internal.rebuild.interruptGeneration,
    internal.rebuild.resumeGeneration,
    internal.rebuild.switchGeneration,
    internal.rebuild.rollbackGeneration,
    internal.rebuild.purgeGeneration,
  ]) {
    await refused(
      t,
      () => t.mutation(ref, { generationId: id, operator }),
      `No generation ${id}`,
    );
  }
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.abortGeneration, {
        generationId: id,
        operator,
        reason: "repair",
      }),
    `No generation ${id}`,
  );
  const before = await snapshot(t);
  for (const ref of [
    internal.rebuild.backfillBatch,
    internal.rebuild.verifyBatch,
    internal.rebuild.purgeBatch,
  ])
    expect(await t.mutation(ref, { generationId: id, fence: 1 })).toBeNull();
  expect(await snapshot(t)).toStrictEqual(before);
});

// rebuild.sdp.md Design:107, the generation with no progress row; fnInterruptGeneration:134.
test("convex-test: every entry that reads the progress row and every batch over a generation with none throws, and the interrupt reads none", async () => {
  const t = rebuildApp();
  const id = await start(t);
  const { generation, progress } = await read(t, id);
  await t.run(async (ctx) => {
    await ctx.db.delete(progress._id);
  });
  const message = `No progress for generation ${id}`;
  for (const ref of [
    internal.rebuild.resumeGeneration,
    internal.rebuild.rollbackGeneration,
    internal.rebuild.purgeGeneration,
  ])
    await refused(
      t,
      () => t.mutation(ref, { generationId: id, operator }),
      message,
    );
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.abortGeneration, {
        generationId: id,
        operator,
        reason: "repair",
      }),
    message,
  );
  for (const ref of [
    internal.rebuild.backfillBatch,
    internal.rebuild.verifyBatch,
    internal.rebuild.purgeBatch,
  ])
    await refused(
      t,
      () => t.mutation(ref, { generationId: id, fence: generation.fence }),
      message,
    );
  expect(
    await t.mutation(internal.rebuild.interruptGeneration, {
      generationId: id,
      operator,
    }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(id))).toStrictEqual({
    ...generation,
    fence: generation.fence + 1,
    interruptedFence: generation.fence + 1,
  });
});

// actor-and-scope.sdp.md fnAssertOperator:91; rebuild.sdp.md fnStartGeneration:115 through fnFillTenants:139.
test.each(["", " \n\t ", " ".repeat(513), "x".repeat(513), "é".repeat(257)])(
  "convex-test: every operator entry refuses invalid operator %j before a lookup",
  async (stated) => {
    const t = rebuildApp();
    const id = await start(t);
    const p = (await read(t, id)).progress;
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
      await ctx.db.delete(p._id);
    });
    const message =
      stated.trim() === ""
        ? "An operator entry needs a stated operator"
        : `The stated operator is ${new TextEncoder().encode(stated.trim()).length} bytes, above the limit of 512`;
    const args = { generationId: id, operator: stated };
    for (const ref of [
      internal.rebuild.interruptGeneration,
      internal.rebuild.resumeGeneration,
      internal.rebuild.switchGeneration,
      internal.rebuild.rollbackGeneration,
      internal.rebuild.purgeGeneration,
    ])
      await refused(t, () => t.mutation(ref, args), message);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.abortGeneration, { ...args, reason: "" }),
      message,
    );
    await refused(
      t,
      () => start(t, { readModel: "missing", operator: stated }),
      message,
    );
    vi.stubEnv("MAINTENANCE_MODE", "restore");
    await refused(
      t,
      () => t.mutation(internal.rebuild.fillTenants, { operator: stated }),
      message,
    );
  },
);

// actor-and-scope.sdp.md fnAssertOperator:91; rebuild.sdp.md convexSurface:112.
test("convex-test: every plain entry checks the operator before touching ctx", async () => {
  const t = rebuildApp();
  const id = await start(t);
  const helpers = await import("../../src/read-model/rebuild.js");
  await t.run(async (ctx) => {
    const touched = vi.fn(() => {
      throw new Error("Read before assertOperator");
    });
    const guarded = new Proxy(ctx, { get: touched });
    // Reading config, a plain object, before assertOperator is lawful; only ctx is guarded.
    const config: import("../../src/read-model/rebuild.js").RebuildConfig = {
      targets: [
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
    const args = { generationId: id, operator: " " };
    const calls = [
      () =>
        helpers.startGeneration(guarded, config, {
          readModel: "documentTitle",
          operator: " ",
        }),
      () => helpers.interruptGeneration(guarded, config, args),
      () => helpers.resumeGeneration(guarded, config, args),
      () => helpers.switchGeneration(guarded, config, args),
      () => helpers.rollbackGeneration(guarded, config, args),
      () => helpers.abortGeneration(guarded, config, { ...args, reason: "" }),
      () => helpers.purgeGeneration(guarded, config, args),
      () => helpers.fillTenants(guarded, config, { operator: " " }),
    ];
    for (const call of calls)
      await failure(
        Promise.resolve().then(call),
        "An operator entry needs a stated operator",
      );
    expect(touched).not.toHaveBeenCalled();
  });
});

// rebuild.sdp.md step6:126, verifySteps:127, fnEnumerateCall:120; actor-and-scope.sdp.md fnNextTenant:89.
test("convex-test: page cursors continue, tenants cross in tenant-ID order and verify restarts at the first tenant", async () => {
  const t = rebuildApp();
  await create(t, "z", "z", "tenant-z");
  await create(t, "a1");
  await create(t, "a2");
  await create(t, "a3");
  const id = await start(t, { batchSize: 2 });
  const first = await t.run((ctx) =>
    ctx.runQuery(components.depot.queries.document.list, {
      tenantId: "tenant-a",
      includeDeleted: true,
      paginationOpts: { numItems: 2, cursor: null },
    }),
  );
  expect(first.isDone).toBe(false);
  const initial = await read(t, id);
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: initial.generation,
    progress: {
      ...initial.progress,
      cursor: { tenantId: "tenant-a", pageCursor: first.continueCursor },
      batchesDone: 1,
      rowsWritten: 2,
      updatedAt: 1010,
    },
  });
  // step6: a pass that is not done schedules the same batch with the same fence.
  await lastSchedule(t, "backfillBatch", { generationId: id, fence: 1 });
  later();
  await batch(t, id);
  expect((await read(t, id)).progress.cursor).toStrictEqual({
    tenantId: "tenant-z",
    pageCursor: null,
  });
  await lastSchedule(t, "backfillBatch", { generationId: id, fence: 1 });
  expect((await rows(t)).map((r) => r.key).sort()).toEqual(["a1", "a2", "a3"]);
  later();
  await batch(t, id);
  const backfilled = await read(t, id);
  expect(backfilled.generation).toStrictEqual({
    ...initial.generation,
    state: "verifying",
  });
  expect(backfilled.progress).toStrictEqual({
    ...initial.progress,
    pass: "verify",
    cursor: null,
    batchesDone: 3,
    rowsWritten: 4,
    updatedAt: 1030,
  });
  later();
  await batch(t, id);
  expect((await read(t, id)).progress.cursor).toStrictEqual({
    tenantId: "tenant-a",
    pageCursor: first.continueCursor,
  });
  expect((await read(t, id)).progress.rowsSkipped).toBe(2);
  // verifySteps: a verify pass that is not done schedules verifyBatch with the same fence.
  await lastSchedule(t, "verifyBatch", { generationId: id, fence: 1 });
});

// rebuild.sdp.md step2:122, step6:126. The empty tenant is an independent tenant-list obligation.
test("convex-test: an empty tenant consumes a batch and advances to the next tenant", async () => {
  const t = rebuildApp();
  await tenant(t, "tenant-a");
  await create(t, "z", "z", "tenant-z");
  const id = await start(t);
  const before = await read(t, id);
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: before.generation,
    progress: {
      ...before.progress,
      cursor: { tenantId: "tenant-z", pageCursor: null },
      batchesDone: 1,
      updatedAt: 1010,
    },
  });
  expect(await rows(t)).toEqual([]);
  await finish(t, id);
  expect((await rows(t)).map((r) => [r.tenantId, r.key])).toEqual([
    ["tenant-z", "z"],
  ]);
});

// rebuild.sdp.md rule:81, step6:126, verifySteps:127. The tenant behind the cursor is an independent obligation.
test("convex-test: a tenant inserted between crossed tenants is skipped by backfill and visited by verify", async () => {
  const t = rebuildApp();
  await install(t);
  await install(t, "documentSummary");
  await create(t, "a", "a", "tenant-a", "twice");
  await create(t, "m", "m", "tenant-m", "twice");
  await create(t, "z", "z", "tenant-z", "twice");
  const id = await start(t);
  await batch(t, id);
  await batch(t, id);
  expect((await read(t, id)).progress.cursor).toStrictEqual({
    tenantId: "tenant-z",
    pageCursor: null,
  });
  await create(t, "h", "live", "tenant-h", "twice");
  const liveRow = (await rows(t)).find(
    (r) => r.generation === 2 && r.tenantId === "tenant-h",
  );
  expect(liveRow?.sourceVersions[0]?.version).toBe(1);
  await batch(t, id);
  expect((await read(t, id)).progress.rowsWritten).toBe(3);
  expect((await read(t, id)).progress.batchesDone).toBe(3);
  await batch(t, id);
  expect((await read(t, id)).progress.cursor).toStrictEqual({
    tenantId: "tenant-h",
    pageCursor: null,
  });
  await batch(t, id);
  expect((await read(t, id)).progress.rowsSkipped).toBe(2);
  expect((await rows(t)).find((r) => r._id === liveRow?._id)).toStrictEqual(
    liveRow,
  );
});

// rebuild.sdp.md step1:125, verifySteps:131, purgeSteps:132, limitOutstandingBatches:152.
test.each(["backfill", "verify", "purge"] as const)(
  "convex-test: in %s the batch the interrupt replaced records it once, and after a resume writes nothing",
  async (pass) => {
    const t = rebuildApp();
    await create(t, "a");
    const id = await start(t);
    if (pass === "verify") await batch(t, id);
    if (pass === "purge") {
      await finish(t, id);
      await t.mutation(internal.rebuild.abortGeneration, {
        generationId: id,
        operator,
        reason: "repair",
      });
      await t.mutation(internal.rebuild.purgeGeneration, {
        generationId: id,
        operator,
      });
    }
    const fence = (await read(t, id)).generation.fence;
    await t.mutation(internal.rebuild.interruptGeneration, {
      generationId: id,
      operator: "interrupter",
    });
    const before = await snapshot(t);
    const ref =
      pass === "backfill"
        ? internal.rebuild.backfillBatch
        : pass === "verify"
          ? internal.rebuild.verifyBatch
          : internal.rebuild.purgeBatch;
    later();
    await t.mutation(ref, { generationId: id, fence });
    const recorded = await snapshot(t);
    expect(recorded).toStrictEqual({
      ...before,
      progress: [
        {
          ...before.progress[0],
          lastError: "interrupted by interrupter",
          updatedAt: Date.now(),
        },
      ],
    });
    later();
    await t.mutation(ref, { generationId: id, fence });
    expect(await snapshot(t)).toStrictEqual(recorded);
    await t.mutation(internal.rebuild.resumeGeneration, {
      generationId: id,
      operator,
    });
    const resumed = await snapshot(t);
    later();
    await t.mutation(ref, { generationId: id, fence });
    expect(await snapshot(t)).toStrictEqual(resumed);
  },
);

// rebuild.sdp.md fnInterruptGeneration:134, fnResumeChain:135, fnResumeGeneration:136; rebuild.online-rebuild-interrupt-resume.sdp.md:38.
test("convex-test: interrupt after exactly three batches and resume at the stored size with a new fence", async () => {
  const t = rebuildApp();
  for (let i = 0; i < 6; i++) await create(t, `d${i}`);
  const id = await start(t, { batchSize: 1 });
  for (let i = 0; i < 3; i++) {
    later();
    await batch(t, id);
  }
  const before = await read(t, id);
  const queued = await scheduled(t);
  expect(before.progress.batchesDone).toBe(3);
  expect(before.progress.rowsWritten).toBe(3);
  later();
  await t.mutation(internal.rebuild.interruptGeneration, {
    generationId: id,
    operator: " interrupted ",
  });
  const interrupted = await read(t, id);
  expect(interrupted).toStrictEqual({
    generation: {
      ...before.generation,
      fence: 2,
      interruptedFence: 2,
      changedAt: 1040,
      changedBy: "interrupted",
    },
    progress: before.progress,
  });
  expect(await scheduled(t)).toStrictEqual(queued);
  later();
  await t.mutation(internal.rebuild.resumeGeneration, {
    generationId: id,
    operator: " resumed ",
  });
  const resumed = await read(t, id);
  expect(resumed).toStrictEqual({
    generation: {
      ...before.generation,
      fence: 3,
      interruptedFence: 2,
      changedAt: 1050,
      changedBy: "resumed",
    },
    progress: { ...before.progress, updatedAt: 1050 },
  });
  await lastSchedule(t, "backfillBatch", { generationId: id, fence: 3 });
  await t.mutation(internal.rebuild.backfillBatch, {
    generationId: id,
    fence: 3,
  });
  const next = await read(t, id);
  expect(next.generation).toStrictEqual(resumed.generation);
  expect(next.progress.batchSize).toBe(1);
  expect(next.progress.batchesDone).toBe(4);
  expect(next.progress.rowsWritten).toBe(4);
  expect(next.progress.cursor).not.toEqual(resumed.progress.cursor);
});

// rebuild.sdp.md fnInterruptGeneration:134, step1:125; rebuild.online-rebuild-interrupt-resume.sdp.md:38.
test("convex-test: an interrupt while a batch is scheduled leaves the progress row untouched, and that batch records the interruption and schedules nothing", async () => {
  const t = rebuildApp();
  for (let i = 0; i < 3; i++) await create(t, `d${i}`);
  const id = await start(t, { batchSize: 1 });
  later();
  await batch(t, id);
  const before = await read(t, id);
  const args = { generationId: id, fence: before.generation.fence };
  await lastSchedule(t, "backfillBatch", args);
  const queued = await scheduled(t);
  const titles = await rows(t);
  later();
  await t.mutation(internal.rebuild.interruptGeneration, {
    generationId: id,
    operator: " interrupter ",
  });
  const interrupted = await read(t, id);
  expect(interrupted).toStrictEqual({
    generation: {
      ...before.generation,
      fence: before.generation.fence + 1,
      interruptedFence: before.generation.fence + 1,
      changedAt: Date.now(),
      changedBy: "interrupter",
    },
    progress: before.progress,
  });
  later();
  await t.mutation(internal.rebuild.backfillBatch, args);
  expect(await read(t, id)).toStrictEqual({
    generation: interrupted.generation,
    progress: {
      ...before.progress,
      lastError: "interrupted by interrupter",
      updatedAt: Date.now(),
    },
  });
  expect(await rows(t)).toStrictEqual(titles);
  expect(await scheduled(t)).toStrictEqual(queued);
});

// rebuild.sdp.md step1:125, fnInterruptGeneration:134, fnResumeChain:135; generation-registry.sdp.md tableGenerations.
test("convex-test: a batch pending across an interrupt and a resume, or across a resume alone, writes nothing", async () => {
  const t = rebuildApp();
  for (let i = 0; i < 3; i++) await create(t, `d${i}`);
  const id = await start(t, { batchSize: 1 });
  await batch(t, id);
  for (const entries of [
    [internal.rebuild.interruptGeneration, internal.rebuild.resumeGeneration],
    [internal.rebuild.resumeGeneration],
  ]) {
    const pending = {
      generationId: id,
      fence: (await read(t, id)).generation.fence,
    };
    for (const entry of entries)
      await t.mutation(entry, { generationId: id, operator });
    const before = await snapshot(t);
    later();
    await t.mutation(internal.rebuild.backfillBatch, pending);
    expect(await snapshot(t)).toStrictEqual(before);
  }
});

// rebuild.sdp.md step1:125, fnInterruptGeneration:134; generation-registry.sdp.md tableGenerations.
test("convex-test: a batch pending across two interrupts writes the note of the second once", async () => {
  const t = rebuildApp();
  for (let i = 0; i < 3; i++) await create(t, `d${i}`);
  const id = await start(t, { batchSize: 1 });
  await batch(t, id);
  const before = await read(t, id);
  const pending = { generationId: id, fence: before.generation.fence };
  const queued = await scheduled(t);
  for (const stated of ["first", "second"])
    await t.mutation(internal.rebuild.interruptGeneration, {
      generationId: id,
      operator: stated,
    });
  expect((await read(t, id)).generation).toMatchObject({
    fence: pending.fence + 2,
    interruptedFence: pending.fence + 2,
    changedBy: "second",
  });
  later();
  await t.mutation(internal.rebuild.backfillBatch, pending);
  const recorded = await snapshot(t);
  expect((await read(t, id)).progress).toStrictEqual({
    ...before.progress,
    lastError: "interrupted by second",
    updatedAt: Date.now(),
  });
  expect(recorded.scheduled).toStrictEqual(queued);
  later();
  await t.mutation(internal.rebuild.backfillBatch, pending);
  expect(await snapshot(t)).toStrictEqual(recorded);
});

// rebuild.sdp.md fnInterruptGeneration:134, fnResumeChain:135.
test.each(states)(
  "convex-test: an idle pass in %s cannot be resumed, and the interrupt decides from the state alone",
  async (state) => {
    const t = rebuildApp();
    const id = await inState(t, state);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.resumeGeneration, {
          generationId: id,
          operator,
        }),
      "Generation 1 of documentTitle has no batch to resume",
    );
    const interrupt = () =>
      t.mutation(internal.rebuild.interruptGeneration, {
        generationId: id,
        operator: "interrupter",
      });
    if (state === "verified" || state === "active" || state === "purged") {
      await refused(
        t,
        interrupt,
        "Generation 1 of documentTitle has no batch to interrupt",
      );
      return;
    }
    const before = await read(t, id);
    later();
    await interrupt();
    expect(await read(t, id)).toStrictEqual({
      generation: {
        ...before.generation,
        fence: before.generation.fence + 1,
        interruptedFence: before.generation.fence + 1,
        changedAt: Date.now(),
        changedBy: "interrupter",
      },
      progress: before.progress,
    });
  },
);

// rebuild.sdp.md step3:123, fnResumeChain:131; write-pause.sdp.md fnGateAllows, restoreDoor.
test.each(["tenant", "restore"])(
  "convex-test: a parked batch under %s records its error without checkpointing and resumes after an interrupt",
  async (gate) => {
    const t = rebuildApp();
    await create(t, "a");
    const id = await start(t);
    if (gate === "tenant")
      await t.mutation(internal.gate.closeGate, {
        scopeKey: "tenant:tenant-a",
        reason: "repair",
        operator,
      });
    else vi.stubEnv("MAINTENANCE_MODE", "restore");
    const before = await read(t, id);
    const queued = await scheduled(t);
    later();
    await batch(t, id);
    expect(await read(t, id)).toStrictEqual({
      generation: before.generation,
      progress: {
        ...before.progress,
        lastError:
          gate === "tenant"
            ? "write paused for tenant:tenant-a: repair"
            : "write paused for all: restore",
        updatedAt: 1010,
      },
    });
    expect(await rows(t)).toEqual([]);
    expect(await scheduled(t)).toStrictEqual(queued);
    await t.mutation(internal.rebuild.interruptGeneration, {
      generationId: id,
      operator,
    });
    if (gate === "tenant")
      await t.mutation(internal.gate.resumeGate, {
        scopeKey: "tenant:tenant-a",
        operator,
      });
    else vi.stubEnv("MAINTENANCE_MODE", "Restore");
    later();
    await t.mutation(internal.rebuild.resumeGeneration, {
      generationId: id,
      operator,
    });
    const resumed = await read(t, id);
    expect(resumed.progress).toStrictEqual({
      ...before.progress,
      updatedAt: 1020,
    });
    expect(resumed.generation.fence).toBe(3);
    await batch(t, id);
    expect(await rows(t)).toHaveLength(1);
  },
);

// projection-contract.sdp.md step1:90, step3:92, step4:93, definition of older:64.
test.each(projectionCases)(
  "convex-test: $mode / $role / $state / null=$isNull",
  async ({ mode, role, state, isNull, expected }) => {
    const t = rebuildApp();
    const prior = priorRow(state);
    if (prior) await t.run((ctx) => ctx.db.insert("documentTitles", prior));
    const before = await rows(t);
    const result = await t.run((ctx) =>
      applyProjection(ctx, readModel, {
        tenantId: "tenant-a",
        dto: { ...dto, title: isNull ? deletedTitle : "candidate" },
        versions: [version(3)],
        mode,
        generations: [{ role, generation: 1, projectionVersion: 2 }],
      }),
    );
    expect(result).toStrictEqual([expected]);
    if (expected === "inserted" || expected === "updated")
      expect(await rows(t)).toStrictEqual([
        {
          ...candidateRow,
          _id: before[0]?._id ?? expect.any(String),
          _creationTime: before[0]?._creationTime ?? expect.any(Number),
        },
      ]);
    else if (expected === "deleted") expect(await rows(t)).toStrictEqual([]);
    else expect(await rows(t)).toStrictEqual(before);
  },
);

// spec:application.projection-contract#design.step3, spec:application.generation-registry#design.writableGenerationRole,
// spec:application.rebuild#design.step5 and its rule that live commands also write the generation being built.
test.each(["building", "verifying", "verified"] as const)(
  "convex-test: live commands create and update rows in %s with that state's role",
  async (state) => {
    const t = rebuildApp();
    await install(t, "documentSummary");
    await create(t, "old", "original", "tenant-a", "summary");
    const id = await start(t, { readModel: "documentSummary" });
    if (state !== "building") await batch(t, id);
    if (state === "verified") await batch(t, id);
    // A missing row after backfill stands for a subject that projected to none.
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("documentSummaries").collect())
        if (r.generation === 2) await ctx.db.delete(r._id);
    });
    const firstUpdate = await amend(t, "old", "amended", true);
    const oldRows = (await summaries(t)).filter((r) => r.key === "old");
    expect(oldRows.map((r) => r.generation).sort()).toEqual(
      state === "building" ? [1] : [1, 2],
    );
    for (const r of oldRows)
      expect(r).toStrictEqual({
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        tenantId: "tenant-a",
        generation: r.generation,
        key: "old",
        projectionVersion: 1,
        sourceVersions: firstUpdate.versions,
        documentId: "old",
        title: "amended",
        status: "draft",
      });
    const created = await create(t, "new", "new", "tenant-a", "summary");
    for (const r of (await summaries(t)).filter((r) => r.key === "new"))
      expect(r.sourceVersions).toStrictEqual(created.versions);
    expect(
      (await summaries(t))
        .filter((r) => r.key === "new")
        .map((r) => r.generation)
        .sort(),
    ).toEqual([1, 2]);
    const updated = await amend(t, "new", "updated", true);
    expect(
      (await summaries(t))
        .filter((r) => r.key === "new")
        .map((r) => ({
          generation: r.generation,
          title: r.title,
          sourceVersions: r.sourceVersions,
        })),
    ).toStrictEqual(
      [1, 2].map((generation) => ({
        generation,
        title: "updated",
        sourceVersions: updated.versions,
      })),
    );
    expect((await read(t, id)).generation.state).toBe(state);
  },
);

// native-harness.sdp.md fixtureReadModel:90; projection-contract.sdp.md:106; rebuild.online-rebuild-interrupt-resume.sdp.md:38.
test("convex-test: active version one and building version two project live writes and backfill by their own versions", async () => {
  const t = rebuildApp();
  await install(t, "documentSummary");
  await create(t, "deleted-before", deletedTitle);
  const activeId = await install(t, "documentTitle", 1);
  expect((await rows(t)).find((r) => r.key === "deleted-before")).toStrictEqual(
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "tenant-a",
      generation: 1,
      projectionVersion: 1,
      key: "deleted-before",
      documentId: "deleted-before",
      title: deletedTitle,
      sourceVersions: [{ ...version(1), streamId: "deleted-before" }],
    },
  );
  const id = await start(t, { projectionVersion: 2 });
  await create(t, "live", "live", "tenant-a", "twice");
  await create(t, "deleted-live", deletedTitle, "tenant-a", "twice");
  expect(
    (await rows(t))
      .filter((r) => r.key === "live")
      .map((r) => [r.generation, r.projectionVersion]),
  ).toEqual([
    [1, 1],
    [2, 2],
  ]);
  expect(
    (await rows(t))
      .filter((r) => r.key === "deleted-live")
      .map((r) => [r.generation, r.title]),
  ).toEqual([[1, deletedTitle]]);
  const active = await read(t, activeId);
  await finish(t, id);
  expect(
    (await rows(t)).filter((r) => r.generation === 2).map((r) => r.key),
  ).toEqual(["live"]);
  expect(await read(t, activeId)).toStrictEqual(active);
  expect(
    (await rows(t))
      .filter((r) => r.generation === 1)
      .map((r) => r.key)
      .sort(),
  ).toEqual(["deleted-before", "deleted-live", "live"]);
});

// rebuild.sdp.md verifySteps:127; projection-contract.sdp.md step1:90, step3:92.
test("convex-test: verify inserts a missing row, updates an older row and deletes a row projected to null", async () => {
  const t = rebuildApp();
  for (const key of ["missing", "older", "deleted"])
    await create(t, key, key === "deleted" ? deletedTitle : key);
  const id = await start(t, { projectionVersion: 2 });
  await batch(t, id);
  await t.run(async (ctx) => {
    for (const r of await ctx.db.query("documentTitles").collect()) {
      if (r.key === "missing") await ctx.db.delete(r._id);
      if (r.key === "older")
        await ctx.db.patch(r._id, {
          title: "old",
          sourceVersions: [{ ...version(0), streamId: "older" }],
        });
    }
    await ctx.db.insert("documentTitles", {
      tenantId: "tenant-a",
      generation: 1,
      projectionVersion: 2,
      key: "deleted",
      documentId: "deleted",
      title: "old",
      sourceVersions: [{ ...version(0), streamId: "deleted" }],
    });
  });
  const before = await read(t, id);
  const queue = await scheduled(t);
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: { ...before.generation, state: "verified" },
    progress: {
      ...before.progress,
      pass: "idle",
      cursor: null,
      batchesDone: before.progress.batchesDone + 1,
      misses: 3,
      updatedAt: 1010,
    },
  });
  expect(await scheduled(t)).toStrictEqual(queue);
  expect(
    (await rows(t)).sort((a, b) => a.key.localeCompare(b.key)),
  ).toStrictEqual(
    ["missing", "older"].map((key) => ({
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "tenant-a",
      generation: 1,
      projectionVersion: 2,
      key,
      documentId: key,
      title: key,
      sourceVersions: [{ ...version(1), streamId: key }],
    })),
  );
});

// projection-contract.sdp.md:106, step1:90, step3:92.
test.each(["active", "building", "verifying"] as const)(
  "convex-test: a higher live update regains a null-projected row in role %s when the role permits",
  async (role) => {
    const t = rebuildApp();
    const apply = (
      title: string,
      n: number,
      mode: "live-created" | "live-updated" | "backfill",
    ) =>
      t.run((ctx) =>
        applyProjection(ctx, documentTitle, {
          tenantId: "tenant-a",
          dto: { documentId: "document-a", title },
          versions: [version(n)],
          mode,
          generations: [{ role, generation: 1, projectionVersion: 2 }],
        }),
      );
    expect(await apply("original", 1, "live-created")).toEqual(["inserted"]);
    expect(await apply(deletedTitle, 2, "backfill")).toEqual(["deleted"]);
    expect(await rows(t)).toEqual([]);
    expect(await apply("regained", 3, "live-updated")).toEqual([
      role === "building" ? "skipped-missing" : "inserted",
    ]);
    expect(await rows(t)).toStrictEqual(
      role === "building"
        ? []
        : [
            {
              ...candidateRow,
              title: "regained",
              _id: expect.any(String),
              _creationTime: expect.any(Number),
            },
          ],
    );
  },
);

// rebuild.sdp.md fnSwitchGeneration:133; generation-registry.sdp.md transitionCost.
test.each([undefined, 0, 2592000000])(
  "convex-test: switch patches both generations atomically with rollback period %s",
  async (rollbackPeriodMs) => {
    const t = rebuildApp();
    const old = await install(t);
    const id = await start(t);
    await finish(t, id);
    const previous = await read(t, old);
    const next = await read(t, id);
    later();
    await t.mutation(internal.rebuild.switchGeneration, {
      generationId: id,
      operator: " switch ",
      ...(rollbackPeriodMs === undefined ? {} : { rollbackPeriodMs }),
    });
    expect(await read(t, old)).toStrictEqual({
      generation: {
        ...previous.generation,
        state: "retired",
        retiredAt: 1010,
        retireAfter: 1010 + (rollbackPeriodMs ?? 604800000),
        changedAt: 1010,
        changedBy: "switch",
      },
      progress: previous.progress,
    });
    expect(await read(t, id)).toStrictEqual({
      generation: {
        ...next.generation,
        state: "active",
        switchedAt: 1010,
        changedAt: 1010,
        changedBy: "switch",
      },
      progress: next.progress,
    });
  },
);

// rebuild.sdp.md fnSwitchGeneration:133.
test.each(states.filter((s) => s !== "verified"))(
  "convex-test: switch refuses %s before an invalid rollback period",
  async (state) => {
    const t = rebuildApp();
    const id = await inState(t, state);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.switchGeneration, {
          generationId: id,
          operator,
          rollbackPeriodMs: -1,
        }),
      generationMessage(state, "switchGeneration", "verified"),
    );
  },
);

// rebuild.sdp.md fnSwitchGeneration:133.
test.each([-1, 0.5, 2592000001, NaN, Infinity])(
  "convex-test: switch refuses rollback period %s without changing either row",
  async (rollbackPeriodMs) => {
    const t = rebuildApp();
    await install(t);
    const id = await start(t);
    await finish(t, id);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.switchGeneration, {
          generationId: id,
          operator,
          rollbackPeriodMs,
        }),
      `The rollback period must be between 0 and 2592000000 ms, and ${rollbackPeriodMs} is not`,
    );
  },
);

// rebuild.sdp.md fnSwitchGeneration:133, fnAbortGeneration:135.
test("convex-test: abort cannot remove the active generation while another awaits switch", async () => {
  const t = rebuildApp();
  const active = await install(t);
  const id = await start(t);
  await finish(t, id);
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.abortGeneration, {
        generationId: active,
        operator,
        reason: "repair",
      }),
    generationMessage(
      "active",
      "abortGeneration",
      "building, verifying or verified",
    ),
  );
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: id,
    operator,
  });
  expect((await read(t, active)).generation.state).toBe("retired");
  expect((await read(t, id)).generation.state).toBe("active");
});

// rebuild.sdp.md fnRollbackGeneration:134, verifySteps:127; rebuild.online-rebuild-interrupt-resume.sdp.md:38.
test("convex-test: rollback at version two repairs intervening creates, updates and a deletion before switch", async () => {
  const t = rebuildApp();
  await install(t, "documentSummary");
  await create(t, "updated", "original");
  await create(t, "deleted", "original");
  const old = await start(t, { projectionVersion: 2 });
  await batch(t, old);
  await t.run(async (ctx) => {
    const r = await ctx.db
      .query("documentTitles")
      .withIndex("by_key", (q) =>
        q.eq("tenantId", "tenant-a").eq("generation", 1).eq("key", "updated"),
      )
      .unique();
    await ctx.db.delete(r!._id);
  });
  await finish(t, old);
  expect((await read(t, old)).progress.misses).toBe(1);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: old,
    operator,
  });
  const id = await start(t, { projectionVersion: 2 });
  await finish(t, id);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: id,
    operator,
  });
  const retiredRows = (await rows(t)).filter((r) => r.generation === 1);
  await create(t, "created", "created", "tenant-a", "twice");
  const amended = await amend(t, "updated", "amended");
  await amend(t, "deleted", deletedTitle);
  expect((await rows(t)).filter((r) => r.generation === 1)).toStrictEqual(
    retiredRows,
  );
  const before = await read(t, old);
  const active = await read(t, id);
  later();
  await t.mutation(internal.rebuild.rollbackGeneration, {
    generationId: old,
    operator: " rollback ",
  });
  const rolled = await read(t, old);
  expect(rolled).toStrictEqual({
    generation: {
      ...without(before.generation, "retiredAt", "retireAfter"),
      state: "verifying",
      fence: before.generation.fence + 1,
      changedAt: 1010,
      changedBy: "rollback",
    },
    progress: {
      ...without(before.progress, "lastError"),
      pass: "verify",
      cursor: null,
      misses: 0,
      updatedAt: 1010,
    },
  });
  await lastSchedule(t, "verifyBatch", {
    generationId: old,
    fence: rolled.generation.fence,
  });
  later();
  await batch(t, old);
  const verified = await read(t, old);
  expect(verified.generation).toStrictEqual({
    ...rolled.generation,
    state: "verified",
  });
  expect(verified.progress).toStrictEqual({
    ...rolled.progress,
    pass: "idle",
    batchesDone: rolled.progress.batchesDone + 1,
    misses: 3,
    updatedAt: 1020,
  });
  expect(await read(t, id)).toStrictEqual(active);
  expect(
    (await rows(t))
      .filter((r) => r.generation === 1)
      .sort((a, b) => a.key.localeCompare(b.key)),
  ).toStrictEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "tenant-a",
      generation: 1,
      projectionVersion: 2,
      key: "created",
      documentId: "created",
      title: "created",
      sourceVersions: [{ ...version(1), streamId: "created" }],
    },
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "tenant-a",
      generation: 1,
      projectionVersion: 2,
      key: "updated",
      documentId: "updated",
      title: "amended",
      sourceVersions: amended.versions,
    },
  ]);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: old,
    operator,
  });
  expect((await read(t, old)).generation.state).toBe("active");
  expect((await read(t, id)).generation.state).toBe("retired");
});

// rebuild.sdp.md fnRollbackGeneration:134, limitRollbackPeriod:150.
test.each(states.filter((s) => s !== "retired"))(
  "convex-test: rollback refuses %s",
  async (state) => {
    const t = rebuildApp();
    const id = await inState(t, state);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.rollbackGeneration, {
          generationId: id,
          operator,
        }),
      generationMessage(state, "rollbackGeneration", "retired"),
    );
  },
);

// rebuild.sdp.md fnRollbackGeneration:134. The remaining five refusals are checked in their pinned order.
test("convex-test: rollback checks period, purge, pause, in-flight generation and projection in order", async () => {
  const t = rebuildApp();
  const old = await install(t);
  const active = await start(t);
  await finish(t, active);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: active,
    operator,
    rollbackPeriodMs: 0,
  });
  await patchGeneration(
    t,
    old,
    { pauseRequired: true, projectionVersion: 99 },
    { pass: "purge" },
  );
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "Generation 1 of documentTitle is past its rollback period",
  );
  await patchGeneration(t, old, { retireAfter: Date.now() + 1 });
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "Generation 1 of documentTitle is already being purged",
  );
  await patchGeneration(t, old, {}, { pass: "idle" });
  const other = await start(t);
  // rebuild.sdp.md:84, :134: a fill and a reopened generation exclude each other; the pause refusal
  // precedes the fill refusal, which precedes the in-flight refusal.
  const fillRow = {
    fence: 1,
    cursor: null,
    batchesDone: 0,
    tenantsRead: 0,
    tenantsInserted: 0,
    startedAt: Date.now(),
    startedBy: operator,
    changedAt: Date.now(),
    changedBy: operator,
    updatedAt: Date.now(),
  };
  const fillId = await t.run(async (ctx) => {
    const prior = await ctx.db.query("tenantFill").first();
    if (prior !== null) await ctx.db.delete(prior._id);
    return ctx.db.insert("tenantFill", { ...fillRow, pass: "fill" });
  });
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "Generation 1 of documentTitle needs a write pause and cannot be rolled back",
  );
  await patchGeneration(t, old, { pauseRequired: false });
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "The tenant list is being filled; rollbackGeneration waits until fillTenants has ended",
  );
  await t.run((ctx) => ctx.db.patch(fillId, { pass: "idle" }));
  for (const state of ["building", "verifying", "verified"] as const) {
    await patchGeneration(t, other, { state });
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.rollbackGeneration, {
          generationId: old,
          operator,
        }),
      `Read model documentTitle already has generation 3 in ${state}`,
    );
  }
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: other,
    operator,
    reason: "repair",
  });
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "Read model documentTitle declares no projection of version 99",
  );
});

// rebuild.sdp.md fnAbortGeneration:135.
test.each(["building", "verifying", "verified"] as const)(
  "convex-test: abort from %s keeps its cursor and counts and ends the pass",
  async (state) => {
    const t = rebuildApp();
    await create(t, "a");
    await create(t, "b");
    const id = await start(t, { batchSize: 1 });
    await batch(t, id);
    await patchGeneration(
      t,
      id,
      { state },
      { misses: 4, rowsSkipped: 7, rowsPurged: 9 },
    );
    const before = await read(t, id);
    const queue = await scheduled(t);
    later();
    await t.mutation(internal.rebuild.abortGeneration, {
      generationId: id,
      reason: "é".repeat(128),
      operator: " abort ",
    });
    expect(await read(t, id)).toStrictEqual({
      generation: {
        ...before.generation,
        state: "aborted",
        fence: before.generation.fence + 1,
        changedAt: 1010,
        changedBy: "abort",
      },
      progress: {
        ...before.progress,
        pass: "idle",
        lastError: `aborted: ${"é".repeat(128)}`,
        updatedAt: 1010,
      },
    });
    expect(await scheduled(t)).toStrictEqual(queue);
  },
);

// rebuild.sdp.md fnAbortGeneration:135.
test.each(["", "x".repeat(257), "é".repeat(129)])(
  "convex-test: abort refuses reason %j before checking state",
  async (reason) => {
    const t = rebuildApp();
    const id = await install(t);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.abortGeneration, {
          generationId: id,
          operator,
          reason,
        }),
      "The reason must be between 1 and 256 bytes",
    );
  },
);

// rebuild.sdp.md fnAbortGeneration:135.
test.each(["active", "retired", "aborted", "purged"] as const)(
  "convex-test: abort refuses %s",
  async (state) => {
    const t = rebuildApp();
    const id = await inState(t, state);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.abortGeneration, {
          generationId: id,
          operator,
          reason: "r",
        }),
      generationMessage(
        state,
        "abortGeneration",
        "building, verifying or verified",
      ),
    );
  },
);

// rebuild.sdp.md fnRollbackGeneration:134, fnAbortGeneration:135.
test("convex-test: aborting a rollback leaves the serving generation active", async () => {
  const t = rebuildApp();
  const old = await install(t);
  const active = await start(t);
  await finish(t, active);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: active,
    operator,
  });
  const serving = await read(t, active);
  await t.mutation(internal.rebuild.rollbackGeneration, {
    generationId: old,
    operator,
  });
  const before = await read(t, old);
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: old,
    operator,
    reason: "stop rollback",
  });
  expect(await read(t, active)).toStrictEqual(serving);
  expect((await read(t, old)).generation).toStrictEqual({
    ...before.generation,
    state: "aborted",
    fence: before.generation.fence + 1,
  });
  expect((await read(t, old)).progress).toStrictEqual({
    ...before.progress,
    pass: "idle",
    lastError: "aborted: stop rollback",
  });
});

// rebuild.sdp.md fnPurgeGeneration:136.
test.each(["building", "verifying", "verified", "active", "purged"] as const)(
  "convex-test: purge refuses %s",
  async (state) => {
    const t = rebuildApp();
    const id = await inState(t, state);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.purgeGeneration, {
          generationId: id,
          operator,
        }),
      generationMessage(state, "purgeGeneration", "retired or aborted"),
    );
  },
);

// rebuild.sdp.md fnPurgeGeneration:136, fnRollbackGeneration:134, limitRollbackPeriod:150.
test("convex-test: purge is refused before retireAfter and allowed at it while rollback is refused at it", async () => {
  const t = rebuildApp();
  const old = await install(t);
  const active = await start(t);
  await finish(t, active);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: active,
    operator,
    rollbackPeriodMs: 10,
  });
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.purgeGeneration, {
        generationId: old,
        operator,
      }),
    "Generation 1 of documentTitle is inside its rollback period",
  );
  later();
  await refused(
    t,
    () =>
      t.mutation(internal.rebuild.rollbackGeneration, {
        generationId: old,
        operator,
      }),
    "Generation 1 of documentTitle is past its rollback period",
  );
  const before = await read(t, old);
  await t.mutation(internal.rebuild.purgeGeneration, {
    generationId: old,
    operator: " purge ",
  });
  expect(await read(t, old)).toStrictEqual({
    generation: {
      ...before.generation,
      fence: before.generation.fence + 1,
      changedAt: 1010,
      changedBy: "purge",
    },
    progress: {
      ...before.progress,
      pass: "purge",
      cursor: null,
      updatedAt: 1010,
    },
  });
  await lastSchedule(t, "purgeBatch", {
    generationId: old,
    fence: before.generation.fence + 1,
  });
});

async function purgeRows(
  t: App,
  generation: number,
  tenantId: string,
  count: number,
) {
  await tenant(t, tenantId);
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      const key = `document-${i}`;
      await ctx.db.insert("documentTitles", {
        tenantId,
        generation,
        key,
        documentId: key,
        title: key,
        projectionVersion: 1,
        sourceVersions: [{ ...version(1), tenantId, streamId: key }],
      });
    }
  });
}

// rebuild.sdp.md purgeSteps:128, fnPurgeGeneration:136; generation-registry.sdp.md tableGenerationProgress.
test("convex-test: purge crosses tenants and checkpoints only progress until the pass ends", async () => {
  const t = rebuildApp();
  const id = await start(t, { batchSize: 2 });
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: id,
    operator,
    reason: "repair",
  });
  await purgeRows(t, 1, "tenant-a", 3);
  await purgeRows(t, 1, "tenant-z", 1);
  later();
  await t.mutation(internal.rebuild.purgeGeneration, {
    generationId: id,
    operator,
  });
  const before = await read(t, id);
  expect(before.progress).not.toHaveProperty("lastError");
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: before.generation,
    progress: {
      ...before.progress,
      cursor: { tenantId: "tenant-a", pageCursor: null },
      batchesDone: 1,
      rowsPurged: 2,
      updatedAt: 1020,
    },
  });
  expect((await rows(t)).map((r) => r.tenantId).sort()).toEqual([
    "tenant-a",
    "tenant-z",
  ]);
  // purgeSteps: a purge pass that is not done schedules purgeBatch with the same fence.
  await lastSchedule(t, "purgeBatch", {
    generationId: id,
    fence: before.generation.fence,
  });
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: before.generation,
    progress: {
      ...before.progress,
      cursor: { tenantId: "tenant-z", pageCursor: null },
      batchesDone: 2,
      rowsPurged: 3,
      updatedAt: 1030,
    },
  });
  const queue = await scheduled(t);
  later();
  await batch(t, id);
  expect(await read(t, id)).toStrictEqual({
    generation: { ...before.generation, state: "purged" },
    progress: {
      ...before.progress,
      pass: "idle",
      cursor: null,
      batchesDone: 3,
      rowsPurged: 4,
      updatedAt: 1040,
    },
  });
  expect(await rows(t)).toEqual([]);
  expect(await scheduled(t)).toStrictEqual(queue);
});

// rebuild.sdp.md purgeSteps:128, limitPurgeBatch:147. The purge near its bound is an independent obligation.
test("convex-test: one more row than the purge cap takes exactly two batches on the tenant", async () => {
  const t = rebuildApp();
  const id = await start(t, { batchSize: 2 });
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: id,
    operator,
    reason: "repair",
  });
  await purgeRows(t, 1, "tenant-a", 3);
  await t.mutation(internal.rebuild.purgeGeneration, {
    generationId: id,
    operator,
  });
  const before = await read(t, id);
  await batch(t, id);
  expect(await rows(t)).toHaveLength(1);
  expect(await read(t, id)).toStrictEqual({
    generation: before.generation,
    progress: {
      ...before.progress,
      pass: "purge",
      batchesDone: 1,
      rowsPurged: 2,
      cursor: { tenantId: "tenant-a", pageCursor: null },
    },
  });
  await batch(t, id);
  expect(await rows(t)).toEqual([]);
  expect(await read(t, id)).toStrictEqual({
    generation: { ...before.generation, state: "purged" },
    progress: {
      ...before.progress,
      pass: "idle",
      batchesDone: 2,
      rowsPurged: 3,
      cursor: null,
    },
  });
});

// rebuild.sdp.md purgeSteps:128, limitPurgeBatch:147. A valid start caps batchSize below this limit;
// these stored progress rows exercise the defensive cap with a size above it.
test.each([256, 257])(
  "convex-test: the read-model purge limit caps an oversized stored batch at 256 for %i rows",
  async (count) => {
    const t = rebuildApp();
    const id = await start(t);
    await t.mutation(internal.rebuild.abortGeneration, {
      generationId: id,
      operator,
      reason: "repair",
    });
    await patchGeneration(t, id, {}, { batchSize: 500 });
    await purgeRows(t, 1, "tenant-a", count);
    await t.mutation(internal.rebuild.purgeGeneration, {
      generationId: id,
      operator,
    });
    const before = await read(t, id);
    later();
    await batch(t, id);
    expect(await rows(t)).toHaveLength(count - 256);
    expect(await read(t, id)).toStrictEqual({
      generation: before.generation,
      progress: {
        ...before.progress,
        cursor: { tenantId: "tenant-a", pageCursor: null },
        rowsPurged: 256,
        batchesDone: 1,
        updatedAt: 1010,
      },
    });
    later();
    await batch(t, id);
    expect(await rows(t)).toEqual([]);
    expect(await read(t, id)).toStrictEqual({
      generation: { ...before.generation, state: "purged" },
      progress: {
        ...before.progress,
        pass: "idle",
        rowsPurged: count,
        batchesDone: 2,
        updatedAt: 1020,
      },
    });
  },
);

// rebuild.sdp.md fnPurgeGeneration:136, fnInterruptGeneration:130, fnResumeGeneration:132, purgeSteps:128.
test.each(["retired", "aborted"] as const)(
  "convex-test: an interrupted purge of %s resumes at its stored batch size",
  async (state) => {
    const t = rebuildApp();
    const id = await start(t, { batchSize: 2 });
    await finish(t, id);
    if (state === "aborted")
      await t.mutation(internal.rebuild.abortGeneration, {
        generationId: id,
        operator,
        reason: "repair",
      });
    else {
      await t.mutation(internal.rebuild.switchGeneration, {
        generationId: id,
        operator,
      });
      const next = await start(t);
      await finish(t, next);
      await t.mutation(internal.rebuild.switchGeneration, {
        generationId: next,
        operator,
        rollbackPeriodMs: 0,
      });
    }
    await purgeRows(t, 1, "tenant-a", 5);
    await t.mutation(internal.rebuild.purgeGeneration, {
      generationId: id,
      operator,
    });
    await batch(t, id);
    await refused(
      t,
      () =>
        t.mutation(internal.rebuild.purgeGeneration, {
          generationId: id,
          operator,
        }),
      "Generation 1 of documentTitle is already being purged; resumeGeneration continues it",
    );
    const oldFence = (await read(t, id)).generation.fence;
    await t.mutation(internal.rebuild.interruptGeneration, {
      generationId: id,
      operator,
    });
    const interrupted = await read(t, id);
    later();
    await t.mutation(internal.rebuild.resumeGeneration, {
      generationId: id,
      operator: " resume purge ",
    });
    const resumed = await read(t, id);
    expect(resumed).toStrictEqual({
      generation: {
        ...interrupted.generation,
        fence: oldFence + 2,
        changedAt: 1010,
        changedBy: "resume purge",
      },
      progress: {
        ...without(interrupted.progress, "lastError"),
        updatedAt: 1010,
      },
    });
    await lastSchedule(t, "purgeBatch", {
      generationId: id,
      fence: oldFence + 2,
    });
    const beforeStale = await snapshot(t);
    await t.mutation(internal.rebuild.purgeBatch, {
      generationId: id,
      fence: oldFence,
    });
    expect(await snapshot(t)).toStrictEqual(beforeStale);
    await batch(t, id);
    expect(await rows(t)).toHaveLength(1);
    expect((await read(t, id)).progress).toStrictEqual({
      ...resumed.progress,
      rowsPurged: 4,
      batchesDone: resumed.progress.batchesDone + 1,
    });
    await batch(t, id);
    const done = await read(t, id);
    expect(done.generation).toStrictEqual({
      ...without(resumed.generation, "retiredAt", "retireAfter"),
      state: "purged",
    });
    expect(done.progress).toStrictEqual({
      ...resumed.progress,
      pass: "idle",
      cursor: null,
      rowsPurged: 5,
      batchesDone: resumed.progress.batchesDone + 2,
    });
  },
);

// rebuild.sdp.md fnStartGeneration:115, fnFillTenants:139.
test("convex-test: a grant beside an empty tenant list refuses start with the fillTenants message", async () => {
  const t = rebuildApp();
  await grantsWithoutTenants(t, 1);
  await refused(
    t,
    () => start(t),
    "The tenant list is empty while grants exist; fillTenants fills it from the grants table",
  );
});

// rebuild.sdp.md tableTenantFill:138, fnFillTenants:139, fillSteps:141, limitTenantFillBatch:142.
test.each([8, 9])(
  "convex-test: fill walks %i distinct tenants with a bound of eight and a second fill inserts none",
  async (count) => {
    const t = rebuildApp();
    await grantsWithoutTenants(t, count);
    expect(await tenants(t)).toEqual([]);
    await t.mutation(internal.rebuild.fillTenants, {
      operator: " fill operator ",
    });
    const initial = await fill(t);
    expect(initial).toStrictEqual({
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      pass: "fill",
      fence: 1,
      cursor: null,
      batchesDone: 0,
      tenantsRead: 0,
      tenantsInserted: 0,
      startedAt: 1000,
      startedBy: "fill operator",
      changedAt: 1000,
      changedBy: "fill operator",
      updatedAt: 1000,
    });
    await lastSchedule(t, "fillTenantsBatch", { fence: 1 });
    later();
    await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
    expect(await fill(t)).toStrictEqual({
      ...initial,
      cursor: "tenant-07",
      batchesDone: 1,
      tenantsRead: 8,
      tenantsInserted: 8,
      updatedAt: 1010,
    });
    expect(await tenants(t)).toStrictEqual(
      Array.from({ length: 8 }, (_, i) => ({
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        tenantId: `tenant-0${i}`,
        createdAt: 1010,
      })),
    );
    await lastSchedule(t, "fillTenantsBatch", { fence: 1 });
    const queue = await scheduled(t);
    later();
    await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
    const done = {
      ...initial,
      pass: "idle",
      cursor: null,
      batchesDone: 2,
      tenantsRead: count,
      tenantsInserted: count,
      updatedAt: 1020,
    };
    expect(await fill(t)).toStrictEqual(done);
    expect(await scheduled(t)).toStrictEqual(queue);
    const inserted = await tenants(t);
    expect(inserted).toHaveLength(count);
    if (count === 9)
      expect(inserted.at(-1)).toStrictEqual({
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        tenantId: "tenant-08",
        createdAt: 1020,
      });
    later();
    await t.mutation(internal.rebuild.fillTenants, { operator: "again" });
    const reopened = {
      ...initial,
      fence: 2,
      changedAt: 1030,
      changedBy: "again",
      updatedAt: 1030,
    };
    expect(await fill(t)).toStrictEqual(reopened);
    await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 2 });
    expect(await fill(t)).toStrictEqual({
      ...reopened,
      cursor: "tenant-07",
      tenantsRead: 8,
      tenantsInserted: 0,
      batchesDone: 1,
    });
    await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 2 });
    expect(await fill(t)).toStrictEqual({
      ...reopened,
      pass: "idle",
      cursor: null,
      tenantsRead: count,
      tenantsInserted: 0,
      batchesDone: 2,
    });
    expect(await tenants(t)).toStrictEqual(inserted);
  },
);

// rebuild.sdp.md fnFillTenants:139, fnStartGeneration:115.
test.each(["building", "verifying", "verified"] as const)(
  "convex-test: fillTenants refuses a generation in %s",
  async (state) => {
    const t = rebuildApp();
    const id = await start(t, { readModel: "documentSummary" });
    await patchGeneration(t, id, { state });
    await refused(
      t,
      () => t.mutation(internal.rebuild.fillTenants, { operator }),
      `Read model documentSummary has generation 1 in ${state}; fillTenants needs no generation in flight`,
    );
  },
);

// rebuild.sdp.md fnStartGeneration:115, fnFillTenants:139, fillSteps:141.
test("convex-test: start refuses an unfinished fill even after the tenant list has rows", async () => {
  const t = rebuildApp();
  await grantsWithoutTenants(t, 9);
  await t.mutation(internal.rebuild.fillTenants, { operator });
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  await refused(
    t,
    () => start(t),
    "The tenant list is being filled; startGeneration waits until fillTenants has ended",
  );
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  const id = await start(t);
  expect((await read(t, id)).generation.state).toBe("building");
});

// rebuild.sdp.md fillSteps:141, fnFillTenants:139; write-pause.sdp.md fnGateAllows.
test("convex-test: fill ignores a tenant gate, parks under the deployment gate and keeps its cursor on resumption", async () => {
  const t = rebuildApp();
  await grantsWithoutTenants(t, 9);
  await t.mutation(internal.gate.closeGate, {
    scopeKey: "tenant:tenant-00",
    reason: "tenant repair",
    operator,
  });
  await t.mutation(internal.rebuild.fillTenants, { operator });
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect((await fill(t))?.tenantsInserted).toBe(8);
  await t.mutation(internal.gate.closeGate, {
    scopeKey: "all",
    reason: "repair",
    operator,
  });
  const before = await fill(t);
  const queue = await scheduled(t);
  const listed = await tenants(t);
  later();
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect(await fill(t)).toStrictEqual({
    ...before,
    lastError: "write paused for all: repair",
    updatedAt: 1010,
  });
  expect(await scheduled(t)).toStrictEqual(queue);
  expect(await tenants(t)).toStrictEqual(listed);
  await t.mutation(internal.gate.resumeGate, { scopeKey: "all", operator });
  later();
  await t.mutation(internal.rebuild.fillTenants, { operator: "continued" });
  expect(await fill(t)).toStrictEqual({
    ...before,
    fence: 2,
    changedAt: 1020,
    changedBy: "continued",
    updatedAt: 1020,
  });
  await lastSchedule(t, "fillTenantsBatch", { fence: 2 });
  const current = await snapshot(t);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect(await snapshot(t)).toStrictEqual(current);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 2 });
  expect(await fill(t)).toStrictEqual({
    ...before,
    pass: "idle",
    cursor: null,
    fence: 2,
    changedAt: 1020,
    changedBy: "continued",
    updatedAt: 1020,
    batchesDone: 2,
    tenantsRead: 9,
    tenantsInserted: 9,
  });
});

// rebuild.sdp.md fnFillTenants:139, fillSteps:141.
test("convex-test: fill refuses exactly the restore door and its batch parks there", async () => {
  const t = rebuildApp();
  await grantsWithoutTenants(t, 1);
  vi.stubEnv("MAINTENANCE_MODE", "restore");
  await refused(
    t,
    () => t.mutation(internal.rebuild.fillTenants, { operator }),
    "fillTenants is refused while the restore door is closed",
  );
  vi.stubEnv("MAINTENANCE_MODE", "Restore");
  await t.mutation(internal.rebuild.fillTenants, { operator });
  const before = await fill(t);
  const queue = await scheduled(t);
  vi.stubEnv("MAINTENANCE_MODE", "restore");
  later();
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect(await fill(t)).toStrictEqual({
    ...before,
    lastError: "write paused for all: restore",
    updatedAt: 1010,
  });
  expect(await tenants(t)).toEqual([]);
  expect(await scheduled(t)).toStrictEqual(queue);
});

// rebuild.sdp.md fillSteps:141.
test("convex-test: fill batches with no row, a stale fence or an idle pass write nothing", async () => {
  const t = rebuildApp();
  const empty = await snapshot(t);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect(await snapshot(t)).toStrictEqual(empty);
  await t.mutation(internal.rebuild.fillTenants, { operator });
  const filling = await snapshot(t);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 0 });
  expect(await snapshot(t)).toStrictEqual(filling);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  const idle = await snapshot(t);
  await t.mutation(internal.rebuild.fillTenantsBatch, { fence: 1 });
  expect(await snapshot(t)).toStrictEqual(idle);
});

// rebuild.sdp.md fnGetGenerations:137, limitGenerationsListed:151.
test("convex-test: getGenerations returns the newest twenty complete row pairs from twenty-one generations", async () => {
  const t = rebuildApp();
  const ids: GenerationId[] = [];
  for (let i = 0; i < 21; i++) {
    const id = await start(t);
    ids.push(id);
    await t.mutation(internal.rebuild.abortGeneration, {
      generationId: id,
      operator,
      reason: "repair",
    });
  }
  const before = await snapshot(t);
  expect(
    await t.query(internal.rebuild.getGenerations, {
      readModel: "documentTitle",
    }),
  ).toStrictEqual(
    await Promise.all(
      ids
        .slice(1)
        .reverse()
        .map((id) => read(t, id)),
    ),
  );
  expect(
    await t.query(internal.rebuild.getGenerations, { readModel: "unknown" }),
  ).toEqual([]);
  expect(await snapshot(t)).toStrictEqual(before);
});

// actor-and-scope.sdp.md fnAssertOperator:91; rebuild.sdp.md fnStartGeneration:115 through fnFillTenants:139.
test("convex-test: every operator entry accepts and records the trimmed 512-byte bound", async () => {
  const t = rebuildApp();
  const atBound = "é".repeat(256);
  const stated = `  ${atBound}  `;
  const id = await start(t, { operator: stated });
  expect((await read(t, id)).generation.startedBy).toBe(atBound);
  await t.mutation(internal.rebuild.interruptGeneration, {
    generationId: id,
    operator: stated,
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  await t.mutation(internal.rebuild.resumeGeneration, {
    generationId: id,
    operator: stated,
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  await finish(t, id);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: id,
    operator: stated,
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  const next = await start(t);
  await finish(t, next);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: next,
    operator,
  });
  await t.mutation(internal.rebuild.rollbackGeneration, {
    generationId: id,
    operator: stated,
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  await t.mutation(internal.rebuild.abortGeneration, {
    generationId: id,
    operator: stated,
    reason: "r",
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  await t.mutation(internal.rebuild.purgeGeneration, {
    generationId: id,
    operator: stated,
  });
  expect((await read(t, id)).generation.changedBy).toBe(atBound);
  await t.mutation(internal.rebuild.fillTenants, { operator: stated });
  expect((await fill(t))?.startedBy).toBe(atBound);
  expect((await fill(t))?.changedBy).toBe(atBound);
});

// rebuild.sdp.md convexSurface:112, fnStartGeneration:115, fnBackfillBatch:117, fnVerifyBatch:118, fnSwitchGeneration:133.
test("convex-test: the example composition installs orderSummary through its registered rebuild entries", async () => {
  const t = productionTest();
  const id = await t.mutation(exampleInternal.rebuild.startGeneration, {
    readModel: "orderSummary",
    operator,
  });
  await t.mutation(exampleInternal.rebuild.backfillBatch, {
    generationId: id,
    fence: 1,
  });
  await t.mutation(exampleInternal.rebuild.verifyBatch, {
    generationId: id,
    fence: 1,
  });
  await t.mutation(exampleInternal.rebuild.switchGeneration, {
    generationId: id,
    operator,
  });
  const listed = await t.query(exampleInternal.rebuild.getGenerations, {
    readModel: "orderSummary",
  });
  expect(listed).toHaveLength(1);
  expect(listed[0]?.generation).toStrictEqual({
    _id: id,
    _creationTime: expect.any(Number),
    readModel: "orderSummary",
    generation: 1,
    projectionVersion: 1,
    state: "active",
    pauseRequired: false,
    fence: 1,
    startedAt: 1000,
    startedBy: operator,
    changedAt: 1000,
    changedBy: operator,
    switchedAt: 1000,
  });
  expect(listed[0]?.progress).toStrictEqual({
    _id: expect.any(String),
    _creationTime: expect.any(Number),
    generationId: id,
    pass: "idle",
    batchSize: 100,
    cursor: null,
    ...zeros,
    batchesDone: 2,
    updatedAt: 1000,
  });
});

// rebuild.sdp.md step1:121, verifySteps:127, purgeSteps:128.
test.each([
  ["backfillBatch", "active", "backfill"],
  ["backfillBatch", "building", "verify"],
  ["verifyBatch", "building", "verify"],
  ["verifyBatch", "verifying", "backfill"],
  ["purgeBatch", "active", "purge"],
  ["purgeBatch", "retired", "idle"],
  ["purgeBatch", "aborted", "idle"],
] as const)(
  "convex-test: %s leaves state %s and pass %s untouched",
  async (entry, state, pass) => {
    const t = rebuildApp();
    const id = await inState(t, state, pass);
    await purgeRows(t, 1, "tenant-a", 1);
    const before = await snapshot(t);
    await t.mutation(internal.rebuild[entry], { generationId: id, fence: 1 });
    expect(await snapshot(t)).toStrictEqual(before);
  },
);

// rebuild.sdp.md fnResumeChain:131, fnResumeGeneration:132, verifySteps:127.
test("convex-test: resuming verify preserves its counts and cursor and schedules verify with the new fence", async () => {
  const t = rebuildApp();
  for (let i = 0; i < 3; i++) await create(t, `document-${i}`);
  const id = await start(t, { batchSize: 1 });
  for (
    let i = 0;
    i < 5 && (await read(t, id)).progress.pass === "backfill";
    i++
  )
    await batch(t, id);
  expect((await read(t, id)).generation.state).toBe("verifying");
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("documentTitles")
      .withIndex("by_key", (q) =>
        q
          .eq("tenantId", "tenant-a")
          .eq("generation", 1)
          .eq("key", "document-0"),
      )
      .unique();
    await ctx.db.delete(row!._id);
  });
  await batch(t, id);
  const before = await read(t, id);
  expect(before.progress.misses).toBe(1);
  expect(before.progress.cursor).not.toBeNull();
  await t.mutation(internal.rebuild.interruptGeneration, {
    generationId: id,
    operator,
  });
  later();
  await t.mutation(internal.rebuild.resumeGeneration, {
    generationId: id,
    operator: "resume verify",
  });
  const resumed = await read(t, id);
  expect(resumed).toStrictEqual({
    generation: {
      ...before.generation,
      fence: 3,
      interruptedFence: 2,
      changedAt: 1010,
      changedBy: "resume verify",
    },
    progress: { ...before.progress, updatedAt: 1010 },
  });
  await lastSchedule(t, "verifyBatch", { generationId: id, fence: 3 });
  await batch(t, id);
  expect((await read(t, id)).generation).toStrictEqual(resumed.generation);
  expect((await read(t, id)).progress.cursor).not.toStrictEqual(
    resumed.progress.cursor,
  );
  expect((await read(t, id)).progress).toStrictEqual({
    ...resumed.progress,
    cursor: { tenantId: "tenant-a", pageCursor: expect.any(String) },
    rowsSkipped: resumed.progress.rowsSkipped + 1,
    batchesDone: resumed.progress.batchesDone + 1,
  });
});

// rebuild.sdp.md step3:123, verifySteps:127, purgeSteps:128; write-pause.sdp.md fnGateAllows:66.
test.each(["verify", "purge"] as const)(
  "convex-test: %s also parks under a closed tenant without touching rows or checkpoint counts",
  async (pass) => {
    const t = rebuildApp();
    await create(t, "a");
    const id = await start(t);
    await batch(t, id);
    if (pass === "purge") {
      await t.mutation(internal.rebuild.abortGeneration, {
        generationId: id,
        operator,
        reason: "repair",
      });
      await t.mutation(internal.rebuild.purgeGeneration, {
        generationId: id,
        operator,
      });
    }
    await t.mutation(internal.gate.closeGate, {
      scopeKey: "tenant:tenant-a",
      reason: "repair",
      operator,
    });
    const before = await read(t, id);
    const written = await rows(t);
    const queue = await scheduled(t);
    later();
    await batch(t, id);
    expect(await read(t, id)).toStrictEqual({
      generation: before.generation,
      progress: {
        ...before.progress,
        lastError: "write paused for tenant:tenant-a: repair",
        updatedAt: 1010,
      },
    });
    expect(await rows(t)).toStrictEqual(written);
    expect(await scheduled(t)).toStrictEqual(queue);
  },
);

// rebuild.sdp.md fnStartGeneration:115, fnSwitchGeneration:133; generation-registry.sdp.md transitionCost.
test("convex-test: a failed activation commits neither half of the switch", async () => {
  const t = rebuildApp(true);
  const old = await install(t);
  const id = await start(t);
  await finish(t, id);
  const before = await snapshot(t);
  await expect(
    t.mutation(internal.rebuild.switchGeneration, {
      generationId: id,
      operator,
    }),
  ).rejects.toThrow();
  expect(await snapshot(t)).toStrictEqual(before);
  expect((await read(t, old)).generation.state).toBe("active");
  expect((await read(t, id)).generation.state).toBe("verified");
});

// rebuild.sdp.md fnStartGeneration:115, Design:107; projection-contract.sdp.md readModelRowShape.
test("convex-test: startGeneration schedules exactly one batch and an install leaves one row per subject and no marker", async () => {
  const t = rebuildApp();
  for (const documentId of ["a1", "a2", "a3"]) await create(t, documentId);
  const before = await scheduled(t);
  const id = await start(t);
  const added = (await scheduled(t)).filter(
    (row) => !before.some((prior) => prior._id === row._id),
  );
  expect(added.map(({ name, args }) => ({ name, args }))).toStrictEqual([
    { name: "rebuild:backfillBatch", args: [{ generationId: id, fence: 1 }] },
  ]);
  await finish(t, id);
  await t.mutation(internal.rebuild.switchGeneration, {
    generationId: id,
    operator,
  });
  const generation = (await read(t, id)).generation.generation;
  expect(
    (await rows(t))
      .filter((row) => row.generation === generation)
      .map(({ key }) => key)
      .sort(),
  ).toStrictEqual(["a1", "a2", "a3"]);
  // documentTitle is a per-entity read model: markers belong to aggregate rows, so none is written.
  expect(
    await t.run((ctx) => ctx.db.query("projectionMarkers").collect()),
  ).toStrictEqual([]);
});

// rebuild.sdp.md fnGetGenerations:137: only a declared read model's rows are listed.
test("convex-test: getGenerations answers [] for an undeclared read model even when rows name it", async () => {
  const t = rebuildApp();
  const id = await start(t);
  await t.run(async (ctx) => {
    const { _id, _creationTime, ...row } = (await ctx.db.get(id))!;
    void [_id, _creationTime];
    await ctx.db.insert("generations", { ...row, readModel: "undeclared" });
  });
  expect(
    await t.query(internal.rebuild.getGenerations, { readModel: "undeclared" }),
  ).toStrictEqual([]);
});
