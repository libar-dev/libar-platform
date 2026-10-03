import type {
  FunctionArgs,
  FunctionReturnType,
  FunctionReference,
  PaginationResult,
} from "convex/server";
import { expectTypeOf, test } from "vitest";
import { internal as example } from "../../example/convex/_generated/api.js";
import { internal as fixture } from "../../fixture/convex/_generated/api.js";
import type { Id } from "../../fixture/convex/_generated/dataModel.js";
import type { MutationCtx } from "../../fixture/convex/_generated/server.js";
import type { ListArgs } from "../../src/context/index.js";
import type { Projection, ReadModel } from "../../src/read-model/projection.js";
import {
  batchSizeFor,
  rebuildBatchCeiling,
  limitPurgeBatch,
  resumeChain,
  type RebuildConfig,
  type RebuildTarget,
  type BatchRef,
  type FillBatchRef,
} from "../../src/read-model/rebuild.js";

type Generation = {
  _id: Id<"generations">;
  _creationTime: number;
  readModel: string;
  generation: number;
  projectionVersion: number;
  state:
    | "building"
    | "verifying"
    | "verified"
    | "active"
    | "retired"
    | "aborted"
    | "purged";
  pauseRequired: boolean;
  fence: number;
  startedAt: number;
  startedBy: string;
  changedAt: number;
  changedBy: string;
  switchedAt?: number;
  retiredAt?: number;
  retireAfter?: number;
};
type Progress = {
  _id: Id<"generationProgress">;
  _creationTime: number;
  generationId: Id<"generations">;
  pass: "backfill" | "verify" | "purge" | "idle";
  batchSize: number;
  cursor: {
    tenantId: string;
    pageCursor: string | null;
    streamId?: string;
    eventCursor?: string | null;
  } | null;
  batchesDone: number;
  rowsWritten: number;
  rowsSkipped: number;
  misses: number;
  rowsPurged: number;
  lastError?: string;
  updatedAt: number;
};

// rebuild.sdp.md fnStartGeneration:115; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example startGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.startGeneration>
  >().toEqualTypeOf<{
    readModel: string;
    projectionVersion?: number;
    batchSize?: number;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.startGeneration>
  >().toEqualTypeOf<Id<"generations">>();
  expectTypeOf<typeof example.rebuild.startGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      {
        readModel: string;
        projectionVersion?: number;
        batchSize?: number;
        operator: string;
      },
      Id<"generations">
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.startGeneration, {
    readModel: "documentTitle",
    operator: "operator",
    projectionVersion: 2,
    batchSize: 1,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.startGeneration, {
    readModel: "documentTitle",
    operator: "operator",
    projectionVersion: "2",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.startGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnInterruptGeneration:130; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example interruptGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.interruptGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.interruptGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.interruptGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.interruptGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.interruptGeneration, { generationId });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.interruptGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnResumeGeneration:132; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example resumeGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.resumeGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.resumeGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.resumeGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.resumeGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.resumeGeneration, {
    generationId,
    operator: "operator",
    batchSize: 2,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.resumeGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnSwitchGeneration:133; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example switchGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.switchGeneration>
  >().toEqualTypeOf<{
    generationId: Id<"generations">;
    rollbackPeriodMs?: number;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.switchGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.switchGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      {
        generationId: Id<"generations">;
        rollbackPeriodMs?: number;
        operator: string;
      },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.switchGeneration, {
    generationId,
    operator: "operator",
    rollbackPeriodMs: 0,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.switchGeneration, {
    generationId,
    operator: "operator",
    rollbackPeriodMs: "0",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.switchGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnRollbackGeneration:134; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example rollbackGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.rollbackGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.rollbackGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.rollbackGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.rollbackGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.rollbackGeneration, {
    generationId,
    operator: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.rollbackGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnAbortGeneration:135; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example abortGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.abortGeneration>
  >().toEqualTypeOf<{
    generationId: Id<"generations">;
    reason: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.abortGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.abortGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; reason: string; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.abortGeneration, {
    generationId,
    operator: "operator",
    reason: "repair",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.abortGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.abortGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnPurgeGeneration:136; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example purgeGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.purgeGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.purgeGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.purgeGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.purgeGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.purgeGeneration, {
    generationId,
    operator: "operator",
    batchSize: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.purgeGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnBackfillBatch:117; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example backfillBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.backfillBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.backfillBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.backfillBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.backfillBatch, {
    generationId,
    fence: 1,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.backfillBatch, {
    generationId,
    fence: "1",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.backfillBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnVerifyBatch:118; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example verifyBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.verifyBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.verifyBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.verifyBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.verifyBatch, { generationId, fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.verifyBatch, { generationId });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.verifyBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnPurgeBatch:119; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example purgeBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.purgeBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.purgeBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.purgeBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.purgeBatch, { generationId, fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.purgeBatch, {
    generationId,
    fence: 1,
    batchSize: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.purgeBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnFillTenants:139; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example fillTenants arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.fillTenants>
  >().toEqualTypeOf<{ operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.fillTenants>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.fillTenants>().toExtend<
    FunctionReference<"mutation", "internal", { operator: string }, null>
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.fillTenants, { operator: "operator" });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.fillTenants, {});
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.fillTenants> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnFillTenantsBatch:140; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example fillTenantsBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.fillTenantsBatch>
  >().toEqualTypeOf<{ fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.fillTenantsBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof example.rebuild.fillTenantsBatch>().toExtend<
    FunctionReference<"mutation", "internal", { fence: number }, null>
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(example.rebuild.fillTenantsBatch, { fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(example.rebuild.fillTenantsBatch, {
    fence: 1,
    generationId,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.fillTenantsBatch> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnGetGenerations:137; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: example getGenerations arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof example.rebuild.getGenerations>
  >().toEqualTypeOf<{ readModel: string }>();
  expectTypeOf<
    FunctionReturnType<typeof example.rebuild.getGenerations>
  >().toEqualTypeOf<{ generation: Generation; progress: Progress }[]>();
  expectTypeOf<typeof example.rebuild.getGenerations>().toExtend<
    FunctionReference<
      "query",
      "internal",
      { readModel: string },
      { generation: Generation; progress: Progress }[]
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runQuery(example.rebuild.getGenerations, {
    readModel: "documentTitle",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runQuery(example.rebuild.getGenerations, {
    readModel: "documentTitle",
    operator: "operator",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof example.rebuild.getGenerations> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnStartGeneration:115; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture startGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.startGeneration>
  >().toEqualTypeOf<{
    readModel: string;
    projectionVersion?: number;
    batchSize?: number;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.startGeneration>
  >().toEqualTypeOf<Id<"generations">>();
  expectTypeOf<typeof fixture.rebuild.startGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      {
        readModel: string;
        projectionVersion?: number;
        batchSize?: number;
        operator: string;
      },
      Id<"generations">
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.startGeneration, {
    readModel: "documentTitle",
    operator: "operator",
    projectionVersion: 2,
    batchSize: 1,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.startGeneration, {
    readModel: "documentTitle",
    operator: "operator",
    projectionVersion: "2",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.startGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnInterruptGeneration:130; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture interruptGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.interruptGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.interruptGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.interruptGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.interruptGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.interruptGeneration, { generationId });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.interruptGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnResumeGeneration:132; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture resumeGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.resumeGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.resumeGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.resumeGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.resumeGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.resumeGeneration, {
    generationId,
    operator: "operator",
    batchSize: 2,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.resumeGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnSwitchGeneration:133; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture switchGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.switchGeneration>
  >().toEqualTypeOf<{
    generationId: Id<"generations">;
    rollbackPeriodMs?: number;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.switchGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.switchGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      {
        generationId: Id<"generations">;
        rollbackPeriodMs?: number;
        operator: string;
      },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.switchGeneration, {
    generationId,
    operator: "operator",
    rollbackPeriodMs: 0,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.switchGeneration, {
    generationId,
    operator: "operator",
    rollbackPeriodMs: "0",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.switchGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnRollbackGeneration:134; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture rollbackGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.rollbackGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.rollbackGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.rollbackGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.rollbackGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.rollbackGeneration, {
    generationId,
    operator: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.rollbackGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnAbortGeneration:135; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture abortGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.abortGeneration>
  >().toEqualTypeOf<{
    generationId: Id<"generations">;
    reason: string;
    operator: string;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.abortGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.abortGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; reason: string; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.abortGeneration, {
    generationId,
    operator: "operator",
    reason: "repair",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.abortGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.abortGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnPurgeGeneration:136; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture purgeGeneration arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.purgeGeneration>
  >().toEqualTypeOf<{ generationId: Id<"generations">; operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.purgeGeneration>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.purgeGeneration>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; operator: string },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.purgeGeneration, {
    generationId,
    operator: "operator",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.purgeGeneration, {
    generationId,
    operator: "operator",
    batchSize: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.purgeGeneration> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnBackfillBatch:117; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture backfillBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.backfillBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.backfillBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.backfillBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.backfillBatch, {
    generationId,
    fence: 1,
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.backfillBatch, {
    generationId,
    fence: "1",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.backfillBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnVerifyBatch:118; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture verifyBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.verifyBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.verifyBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.verifyBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.verifyBatch, { generationId, fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.verifyBatch, { generationId });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.verifyBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnPurgeBatch:119; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture purgeBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.purgeBatch>
  >().toEqualTypeOf<{ generationId: Id<"generations">; fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.purgeBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.purgeBatch>().toExtend<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.purgeBatch, { generationId, fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.purgeBatch, {
    generationId,
    fence: 1,
    batchSize: 1,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.purgeBatch> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnFillTenants:139; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture fillTenants arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.fillTenants>
  >().toEqualTypeOf<{ operator: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.fillTenants>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.fillTenants>().toExtend<
    FunctionReference<"mutation", "internal", { operator: string }, null>
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.fillTenants, { operator: "operator" });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.fillTenants, {});
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.fillTenants> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnFillTenantsBatch:140; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture fillTenantsBatch arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.fillTenantsBatch>
  >().toEqualTypeOf<{ fence: number }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.fillTenantsBatch>
  >().toEqualTypeOf<null>();
  expectTypeOf<typeof fixture.rebuild.fillTenantsBatch>().toExtend<
    FunctionReference<"mutation", "internal", { fence: number }, null>
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runMutation(fixture.rebuild.fillTenantsBatch, { fence: 1 });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runMutation(fixture.rebuild.fillTenantsBatch, {
    fence: 1,
    generationId,
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.fillTenantsBatch> =
    true;
  void [generationId, wrong];
});

// rebuild.sdp.md fnGetGenerations:137; generation-registry.sdp.md tableGenerations, tableGenerationProgress.
test("compiled: fixture getGenerations arguments, visibility and return", () => {
  expectTypeOf<
    FunctionArgs<typeof fixture.rebuild.getGenerations>
  >().toEqualTypeOf<{ readModel: string }>();
  expectTypeOf<
    FunctionReturnType<typeof fixture.rebuild.getGenerations>
  >().toEqualTypeOf<{ generation: Generation; progress: Progress }[]>();
  expectTypeOf<typeof fixture.rebuild.getGenerations>().toExtend<
    FunctionReference<
      "query",
      "internal",
      { readModel: string },
      { generation: Generation; progress: Progress }[]
    >
  >();
  const ctx = {} as MutationCtx;
  const generationId = "generation" as Id<"generations">;
  void ctx.runQuery(fixture.rebuild.getGenerations, {
    readModel: "documentTitle",
  });
  // @ts-expect-error The entry accepts only the arguments its validator declares.
  void ctx.runQuery(fixture.rebuild.getGenerations, {
    readModel: "documentTitle",
    operator: "operator",
  });
  // @ts-expect-error The return validator does not accept a boolean.
  const wrong: FunctionReturnType<typeof fixture.rebuild.getGenerations> = true;
  void [generationId, wrong];
});

// rebuild.sdp.md typeRebuildTarget:113, typeRebuildConfig:114, fnBatchSizeFor:116, fnResumeChain:131, limitPurgeBatch:147.
test("compiled: rebuild configuration and helpers have the pinned signatures", () => {
  type Dto = { documentId: string };
  type Row = { documentId: string };
  expectTypeOf<RebuildTarget<Dto>>().toEqualTypeOf<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readModel: ReadModel<Dto, any>;
    source: { contextId: string; streamType: string };
    list: FunctionReference<
      "query",
      "internal",
      ListArgs,
      PaginationResult<Dto>
    >;
  }>();
  expectTypeOf<BatchRef>().toEqualTypeOf<
    FunctionReference<
      "mutation",
      "internal",
      { generationId: Id<"generations">; fence: number },
      null
    >
  >();
  expectTypeOf<FillBatchRef>().toEqualTypeOf<
    FunctionReference<"mutation", "internal", { fence: number }, null>
  >();
  expectTypeOf<RebuildConfig>().toEqualTypeOf<{
    targets: readonly RebuildTarget[];
    refs: {
      backfillBatch: BatchRef;
      verifyBatch: BatchRef;
      purgeBatch: BatchRef;
      fillTenantsBatch: FillBatchRef;
    };
  }>();
  type AnyModel = RebuildTarget["readModel"];
  expectTypeOf<typeof batchSizeFor>().parameters.toEqualTypeOf<
    [readModel: AnyModel, requested?: number]
  >();
  expectTypeOf<typeof rebuildBatchCeiling>().parameters.toEqualTypeOf<
    [readModel: AnyModel]
  >();
  expectTypeOf<typeof limitPurgeBatch>().parameters.toEqualTypeOf<
    [readModel: AnyModel]
  >();
  const model = {} as ReadModel<Dto, Row>;
  expectTypeOf(batchSizeFor(model)).toEqualTypeOf<number>();
  expectTypeOf(batchSizeFor(model, 1)).toEqualTypeOf<number>();
  expectTypeOf(rebuildBatchCeiling(model)).toEqualTypeOf<number>();
  expectTypeOf(limitPurgeBatch(model)).toEqualTypeOf<number>();
  // @ts-expect-error The purge limit is a function of a read model, not a numeric budget.
  limitPurgeBatch(16384);
  // @ts-expect-error A requested batch size is numeric.
  batchSizeFor(model, "1");
  const ctx = {} as MutationCtx;
  const config = {} as RebuildConfig;
  const id = "generation" as Id<"generations">;
  expectTypeOf(resumeChain(ctx, config, id, "operator")).toEqualTypeOf<
    Promise<void>
  >();
  // @ts-expect-error Resumption keeps the progress row's batch size.
  void resumeChain(ctx, config, id, "operator", 1);
});

// projection-contract.sdp.md typeReadModel:67, typeProjection:66.
test("compiled: ReadModel declares a nonempty readonly list of projections", () => {
  type Dto = { documentId: string };
  type Row = { documentId: string };
  expectTypeOf<ReadModel<Dto, Row>["projections"]>().toEqualTypeOf<
    readonly [Projection<Dto, Row>, ...Projection<Dto, Row>[]]
  >();
  // @ts-expect-error Every read model declares at least one projection.
  const empty: ReadModel<Dto, Row>["projections"] = [];
  // @ts-expect-error The old singular projection field is not part of ReadModel.
  type Singular = ReadModel<Dto, Row>["projection"];
  void empty;
  void ({} as Singular);
});
