import { convexTest } from "convex-test";
import {
  componentsGeneric,
  defineSchema,
  defineTable,
  type FunctionReference,
} from "convex/server";
import { ConvexError, v, type Value } from "convex/values";
import { expect, vi } from "vitest";
import { internal as production } from "../../example/convex/_generated/api.js";
import type { productionTest } from "./production.js";
import { internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import schema from "../../fixture/convex/schema.js";

export function gateApp(refuseAudit?: "operatorAudit" | "auditRecords") {
  // Only the validator differs. Production exports and handlers still run unchanged.
  const selected =
    refuseAudit === undefined
      ? schema
      : (defineSchema({
          ...schema.tables,
          [refuseAudit]: defineTable({
            impossible: v.literal("refuse every audit record"),
          }),
        }) as unknown as typeof schema);
  const t = convexTest(
    selected,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  t.registerComponent("depot", depotSchema, {
    ...import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    "../../fixture/convex/depot/gateInspection.ts": () =>
      import("./gate-inspection.js"),
  });
  return t;
}
export type GateApp = ReturnType<typeof gateApp>;
export const operator = " stated operator ";
export const close = (
  t: GateApp,
  scopeKey = "tenant:t",
  reason = "repair",
  statedOperator = operator,
) =>
  t.mutation(internal.gate.closeGate, {
    scopeKey,
    reason,
    operator: statedOperator,
  });
export const resume = (
  t: GateApp,
  scopeKey = "tenant:t",
  statedOperator = operator,
) =>
  t.mutation(internal.gate.resumeGate, { scopeKey, operator: statedOperator });
export const gateRows = (t: GateApp) =>
  t.run((ctx) => ctx.db.query("maintenanceGates").collect());
export const operatorRows = (t: GateApp) =>
  t.run((ctx) => ctx.db.query("operatorAudit").collect());
export async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected the call to fail");
    },
    (error: unknown) => error,
  );
}
export async function plainFailure(promise: Promise<unknown>, message: string) {
  const error = await caught(promise);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect((error as Error).message).toBe(message);
}
export async function refusal(
  promise: Promise<unknown>,
  scopeKey: string,
  reason: string,
) {
  const error = await caught(promise);
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<Value>).data).toStrictEqual({
    kind: "transient",
    code: "writePaused",
    message: `write paused for ${scopeKey}: ${reason}`,
  });
}
export async function generationIds(t: GateApp) {
  await installFixtureReadModel(t, "documentSummary", "setup");
  await installFixtureReadModel(t, "documentTitle", "setup");
  const rows = await t.run((ctx) => ctx.db.query("generations").collect());
  const [first, second] = rows;
  if (!first || !second) throw new Error("Two generation rows are required");
  return [first._id, second._id] as const;
}

export const inspection = (
  componentsGeneric() as unknown as {
    depot: {
      gateInspection: {
        stored: FunctionReference<
          "query",
          "internal",
          Record<string, never>,
          { events: Value[]; streams: Value[] }
        >;
      };
    };
  }
).depot.gateInspection.stored;
export const depotRows = (t: GateApp) =>
  t.run((ctx) => ctx.runQuery(inspection, {}));

// generation-registry.sdp.md:37; rebuild.sdp.md:115,127,133: scheduled batches finish before switch.
export async function installFixtureReadModel(
  t: GateApp,
  readModel = "documentSummary",
  operator = "operator-1",
) {
  const ownedTimers = !vi.isFakeTimers();
  if (ownedTimers) vi.useFakeTimers();
  try {
    // native-harness.sdp.md:90: documentTitle setups select version 1.
    const projectionVersion = 1;
    const generationId = await t.mutation(internal.rebuild.startGeneration, {
      readModel,
      projectionVersion,
      operator,
    });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 1000);
    await t.mutation(internal.rebuild.switchGeneration, {
      generationId,
      operator,
    });
    // rebuild.sdp.md:115: the active generation is at the version the setup stated.
    expect(await t.run((ctx) => ctx.db.get(generationId))).toMatchObject({
      state: "active",
      projectionVersion,
    });
    return generationId;
  } finally {
    if (ownedTimers) vi.useRealTimers();
  }
}
export async function installOrderSummary(
  t: ReturnType<typeof productionTest>,
  operator = "operator-1",
) {
  const ownedTimers = !vi.isFakeTimers();
  if (ownedTimers) vi.useFakeTimers();
  try {
    const projectionVersion = 1;
    const generationId = await t.mutation(production.rebuild.startGeneration, {
      readModel: "orderSummary",
      projectionVersion,
      operator,
    });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 1000);
    await t.mutation(production.rebuild.switchGeneration, {
      generationId,
      operator,
    });
    // rebuild.sdp.md:115: the active generation is at the version the setup stated.
    expect(await t.run((ctx) => ctx.db.get(generationId))).toMatchObject({
      state: "active",
      projectionVersion,
    });
    return generationId;
  } finally {
    if (ownedTimers) vi.useRealTimers();
  }
}
