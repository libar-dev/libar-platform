import { convexTest, type TestConvex } from "convex-test";
import type { SchemaDefinition } from "convex/server";
import { getDocumentSize } from "convex/values";
import { commandTables } from "../../src/command/tables.js";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../../fixture/convex/schema.js";
import { internal as fixtureInternal } from "../../fixture/convex/_generated/api.js";
import { internal as productionInternal } from "../../example/convex/_generated/api.js";
import { refusal } from "./gate-support.js";
import { productionTest } from "./production.js";

const compositions: {
  name: string;
  app: () => TestConvex<SchemaDefinition<typeof commandTables, true>>;
  internal: typeof fixtureInternal | typeof productionInternal;
}[] = [
  {
    name: "fixture",
    app: () =>
      convexTest(schema, import.meta.glob("../../fixture/convex/**/*.ts")),
    internal: fixtureInternal,
  },
  { name: "production", app: productionTest, internal: productionInternal },
];
const now = 1000;
afterEach(() => vi.unstubAllEnvs());
function receipt(tenantId: string, requestKey: string, expiresAt = now) {
  return {
    tenantId,
    requestKey,
    expiresAt,
    namespace: "worker" as const,
    commandType: "SweepTest",
    fingerprint: "fingerprint",
    contractVersion: 1,
    outcome: "applied" as const,
    operationId: requestKey,
    affected: [
      { contextId: "context", streamType: "subject", streamId: requestKey },
    ],
    versions: [
      {
        tenantId,
        contextId: "context",
        streamType: "subject",
        streamId: requestKey,
        version: 1,
      },
    ],
    actorId: "worker",
    recordedAt: 0,
    tombstone: false,
  };
}
for (const composition of compositions) {
  // spec:command.idempotency-and-receipts limitSweepBatch; spec:command.receipt-table fnSweep.
  test.each([3, 1000, 1001])(
    `convex-test: ${composition.name} sweep bounds expired receipts at %i`,
    async (count) => {
      const t = composition.app();
      const kept = await t.run(async (ctx) => {
        for (let i = 0; i < count; i++)
          await ctx.db.insert("receipts", receipt("a", `expired-${i}`));
        const future = await ctx.db.insert(
          "receipts",
          receipt("a", "future", now + 1),
        );
        const other = await ctx.db.insert("receipts", receipt("b", "other"));
        return [await ctx.db.get(future), await ctx.db.get(other)];
      });
      expect(
        await t.mutation(composition.internal.receipts.sweep, {
          tenantId: "a",
          now,
          limit: 2000,
        }),
      ).toEqual({
        deleted: Math.min(count, 1000),
        compacted: 0,
        more: count > 1000,
      });
      const remaining = await t.run((ctx) =>
        ctx.db.query("receipts").collect(),
      );
      for (const row of kept) expect(remaining).toContainEqual(row);
      expect(remaining).toHaveLength(Math.max(0, count - 1000) + 2);
      if (count > 1000)
        expect(
          await t.mutation(composition.internal.receipts.sweep, {
            tenantId: "a",
            now,
            limit: 1000,
          }),
        ).toEqual({ deleted: 1, compacted: 0, more: false });
      expect(
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        ),
      ).toEqual([]);
    },
  );
  test(`convex-test: ${composition.name} sweep honors a smaller limit and refuses invalid limits`, async () => {
    const t = composition.app();
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++)
        await ctx.db.insert("receipts", receipt("a", `${i}`));
    });
    for (const limit of [0, -1, 1.5])
      await expect(
        t.mutation(composition.internal.receipts.sweep, {
          tenantId: "a",
          now,
          limit,
        }),
      ).rejects.toThrow("positive safe integer");
    expect(
      await t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 2,
      }),
    ).toEqual({ deleted: 2, compacted: 0, more: true });
  });
  // spec:command.receipt-table fnSweep: a bad now, a now later than the current time.
  test(`convex-test: ${composition.name} sweep refuses a non-finite now and a now later than the current time, and deletes nothing`, async () => {
    const t = composition.app();
    const later = Date.now() + 60 * 60 * 1000;
    const stored = await t.run(async (ctx) => {
      await ctx.db.insert("receipts", receipt("a", "expired"));
      await ctx.db.insert("receipts", receipt("a", "live", later - 1));
      await ctx.db.insert("receipts", {
        ...receipt("a", "tombstone", Number.MAX_SAFE_INTEGER),
        tombstone: true,
        affected: [],
        versions: [],
      });
      return ctx.db.query("receipts").collect();
    });
    for (const [bad, message] of [
      [NaN, "must be finite"],
      [Infinity, "must be finite"],
      [-Infinity, "must be finite"],
      [later, "must not be later than the current time"],
    ] as const)
      await expect(
        t.mutation(composition.internal.receipts.sweep, {
          tenantId: "a",
          now: bad,
          limit: 1000,
        }),
      ).rejects.toThrow(message);
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      stored,
    );
  });
  // spec:command.idempotency-and-receipts limitSweepBatch: the byte bound of a run.
  test(`convex-test: ${composition.name} sweep ends a run at the byte bound and reports more`, async () => {
    const t = composition.app();
    const rows = await t.run(async (ctx) => {
      for (let i = 0; i < 20; i++)
        await ctx.db.insert("receipts", {
          ...receipt("a", `large-${i}`),
          actorId: "x".repeat(512 * 1024),
        });
      return ctx.db
        .query("receipts")
        .withIndex("by_tenant_expiry", (q) => q.eq("tenantId", "a"))
        .collect();
    });
    // The rows read up to and including the one whose size reaches the bound.
    let bytes = 0;
    let read = 0;
    for (const row of rows) {
      bytes += getDocumentSize(row);
      read++;
      if (bytes >= 8 * 1024 * 1024) break;
    }
    expect(read).toBeLessThan(rows.length);
    expect(
      await t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      }),
    ).toEqual({ deleted: read, compacted: 0, more: true });
    expect(
      (await t.run((ctx) => ctx.db.query("receipts").collect())).map(
        (row) => row.requestKey,
      ),
    ).toEqual(rows.slice(read).map((row) => row.requestKey));
    expect(
      await t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      }),
    ).toEqual({ deleted: rows.length - read, compacted: 0, more: false });
  });
  // spec:command.receipt-table tombstoneShape, expiryDefaults and fnSweep.
  test(`convex-test: ${composition.name} deletes an expired tombstone and leaves an unexpired tombstone untouched`, async () => {
    const t = composition.app();
    const kept = await t.run(async (ctx) => {
      await ctx.db.insert("receipts", receipt("a", "reversible", now - 1));
      await ctx.db.insert("receipts", {
        ...receipt("a", "expired-tombstone"),
        tombstone: true,
        affected: [],
        versions: [],
      });
      const id = await ctx.db.insert("receipts", {
        ...receipt("a", "unexpired-tombstone", Number.MAX_SAFE_INTEGER),
        tombstone: true,
        affected: [],
        versions: [],
      });
      return ctx.db.get(id);
    });
    expect(
      await t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      }),
    ).toEqual({ deleted: 2, compacted: 0, more: false });
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([
      kept,
    ]);
  });
  // spec:command.actor-and-scope fnNextTenant and the receipt sweep's per-tenant boundary.
  test(`convex-test: ${composition.name} sweep loop visits one tenant per run and finishes the current tenant first`, async () => {
    const t = composition.app();
    await t.run(async (ctx) => {
      for (const tenantId of ["b", "a"]) {
        await ctx.db.insert("tenants", { tenantId, createdAt: 0 });
        for (let i = 0; i < 2; i++)
          await ctx.db.insert(
            "receipts",
            receipt(tenantId, `${tenantId}-${i}`),
          );
      }
    });
    const run = (after: string | null) =>
      t.mutation(composition.internal.receipts.sweepNext, {
        after,
        now,
        limit: 1,
      });
    expect(await run(null)).toEqual({
      tenantId: "a",
      after: null,
      deleted: 1,
      compacted: 0,
      more: true,
    });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("receipts")
          .withIndex("by_tenant_expiry", (q) => q.eq("tenantId", "b"))
          .collect(),
      ),
    ).toHaveLength(2);
    expect(await run(null)).toEqual({
      tenantId: "a",
      after: "a",
      deleted: 1,
      compacted: 0,
      more: false,
    });
    expect(await run("a")).toEqual({
      tenantId: "b",
      after: "a",
      deleted: 1,
      compacted: 0,
      more: true,
    });
    expect(await run("a")).toEqual({
      tenantId: "b",
      after: "b",
      deleted: 1,
      compacted: 0,
      more: false,
    });
    expect(await run("b")).toEqual({
      tenantId: null,
      after: null,
      deleted: 0,
      compacted: 0,
      more: false,
    });
    expect(
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      ),
    ).toEqual([]);
  });
  // spec:command.receipt-table fnSweepNext checks now and limit before anything else.
  test(`convex-test: ${composition.name} sweep loop refuses a bad now or limit whether or not a tenant follows`, async () => {
    const t = composition.app();
    const later = Date.now() + 60 * 60 * 1000;
    const bad = [
      [{ now: NaN, limit: 1 }, "must be finite"],
      [{ now: Infinity, limit: 1 }, "must be finite"],
      [{ now: later, limit: 1 }, "must not be later than the current time"],
      [{ now, limit: 0 }, "positive safe integer"],
      [{ now, limit: 1.5 }, "positive safe integer"],
    ] as const;
    for (const after of [null, "z"])
      for (const [args, message] of bad)
        await expect(
          t.mutation(composition.internal.receipts.sweepNext, {
            after,
            ...args,
          }),
        ).rejects.toThrow(message);
    await t.run(async (ctx) => {
      await ctx.db.insert("tenants", { tenantId: "a", createdAt: 0 });
      await ctx.db.insert("receipts", receipt("a", "expired"));
    });
    for (const [args, message] of bad)
      await expect(
        t.mutation(composition.internal.receipts.sweepNext, {
          after: null,
          ...args,
        }),
      ).rejects.toThrow(message);
    expect(
      await t.run((ctx) => ctx.db.query("receipts").collect()),
    ).toHaveLength(1);
  });
  // spec:application.write-pause fnAssertWritable, errorCodeWritePaused; spec:command.receipt-table
  // fnSweep, fnSweepNext: the sweep reads the gate after its argument check and before any receipt read.
  test(`convex-test: ${composition.name} a closed deployment refuses sweep and sweepNext with writePaused and the expired receipts remain until the resume`, async () => {
    const t = composition.app();
    const stored = await t.run(async (ctx) => {
      await ctx.db.insert("tenants", { tenantId: "a", createdAt: 0 });
      for (let i = 0; i < 3; i++)
        await ctx.db.insert("receipts", receipt("a", `expired-${i}`));
      return ctx.db.query("receipts").collect();
    });
    await t.mutation(composition.internal.gate.closeGate, {
      scopeKey: "all",
      reason: "move",
      operator: "ops",
    });
    const run = () =>
      t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      });
    // The argument check comes first: a bad limit is the plain error, not the refusal.
    await expect(
      t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 0,
      }),
    ).rejects.toThrow("positive safe integer");
    await refusal(run(), "all", "move");
    await refusal(
      t.mutation(composition.internal.receipts.sweepNext, {
        after: null,
        now,
        limit: 1000,
      }),
      "all",
      "move",
    );
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      stored,
    );
    await t.mutation(composition.internal.gate.resumeGate, {
      scopeKey: "all",
      operator: "ops",
    });
    expect(await run()).toEqual({ deleted: 3, compacted: 0, more: false });
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      [],
    );
  });
  // spec:application.write-pause Contract "A use case is in scope when all is closed, when its tenant is closed"; spec:command.receipt-table fnSweep, fnSweepNext.
  test(`convex-test: ${composition.name} a closed tenant refuses its sweep and the loop sweeps another tenant`, async () => {
    const t = composition.app();
    const kept = await t.run(async (ctx) => {
      for (const tenantId of ["a", "b"]) {
        await ctx.db.insert("tenants", { tenantId, createdAt: 0 });
        await ctx.db.insert(
          "receipts",
          receipt(tenantId, `${tenantId}-expired`),
        );
      }
      return ctx.db
        .query("receipts")
        .withIndex("by_tenant_expiry", (q) => q.eq("tenantId", "a"))
        .collect();
    });
    await t.mutation(composition.internal.gate.closeGate, {
      scopeKey: "tenant:a",
      reason: "move",
      operator: "ops",
    });
    await refusal(
      t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      }),
      "tenant:a",
      "move",
    );
    await refusal(
      t.mutation(composition.internal.receipts.sweepNext, {
        after: null,
        now,
        limit: 1000,
      }),
      "tenant:a",
      "move",
    );
    expect(
      await t.mutation(composition.internal.receipts.sweepNext, {
        after: "a",
        now,
        limit: 1000,
      }),
    ).toEqual({
      tenantId: "b",
      after: "b",
      deleted: 1,
      compacted: 0,
      more: false,
    });
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      kept,
    );
  });
  // spec:application.write-pause restoreDoor, Contract "The restore door is read before the gate document"; spec:command.receipt-table fnSweep.
  test(`convex-test: ${composition.name} the restore door refuses the sweep and deletes nothing, and the same call deletes once the variable is cleared`, async () => {
    const t = composition.app();
    const stored = await t.run(async (ctx) => {
      await ctx.db.insert("tenants", { tenantId: "a", createdAt: 0 });
      await ctx.db.insert("receipts", receipt("a", "expired"));
      return ctx.db.query("receipts").collect();
    });
    vi.stubEnv("MAINTENANCE_MODE", "restore");
    const run = () =>
      t.mutation(composition.internal.receipts.sweep, {
        tenantId: "a",
        now,
        limit: 1000,
      });
    await refusal(run(), "all", "restore");
    await refusal(
      t.mutation(composition.internal.receipts.sweepNext, {
        after: null,
        now,
        limit: 1000,
      }),
      "all",
      "restore",
    );
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      stored,
    );
    vi.stubEnv("MAINTENANCE_MODE", undefined);
    expect(await run()).toEqual({ deleted: 1, compacted: 0, more: false });
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual(
      [],
    );
  });
}
