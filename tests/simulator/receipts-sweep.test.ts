import { convexTest, type TestConvex } from "convex-test";
import type { SchemaDefinition } from "convex/server";
import { getDocumentSize } from "convex/values";
import { limitSweepBytes } from "../../src/command/index.js";
import { commandTables } from "../../src/command/tables.js";
import { expect, test } from "vitest";
import schema from "../../fixture/convex/schema.js";
import { internal as fixtureInternal } from "../../fixture/convex/_generated/api.js";
import { internal as productionInternal } from "../../example/convex/_generated/api.js";
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
      if (bytes >= limitSweepBytes) break;
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
}
