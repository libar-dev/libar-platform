import { convexTest } from "convex-test";
import { ConvexError, type Value } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "../../fixture/convex/schema.js";
import {
  insertGrant,
  nextTenant,
  revokeGrant,
} from "../../src/command/index.js";
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(1_000_000));
afterEach(() => vi.restoreAllMocks());
const app = () =>
  convexTest(schema, import.meta.glob("../../fixture/convex/**/*.ts"));
const grant = (tenantId: string, permission = "documents") => ({
  tenantId,
  principalKind: "service" as const,
  principalId: "caller",
  permission,
  grantedBy: "admin",
});

// spec:command.actor-and-scope fnInsertGrant, tableTenants, Contract "The tenant list is the tenants table".
test("convex-test: the first grant creates one tenant row, later grants and all revocations retain it", async () => {
  const t = app();
  const at = await t.run(async (ctx) => {
    const now = Date.now();
    await insertGrant(ctx, grant("t"));
    return now;
  });
  const first = await t.run((ctx) => ctx.db.query("tenants").collect());
  expect(first).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      tenantId: "t",
      createdAt: at,
    },
  ]);
  expect(await t.run((ctx) => ctx.db.query("grants").collect())).toEqual([
    expect.objectContaining({ tenantId: "t", grantedAt: at }),
  ]);
  await t.run((ctx) => insertGrant(ctx, grant("t", "stock")));
  expect(await t.run((ctx) => ctx.db.query("tenants").collect())).toEqual(
    first,
  );
  await t.run(async (ctx) => {
    expect(await revokeGrant(ctx, grant("t"))).toBe(1);
    expect(await revokeGrant(ctx, grant("t", "stock"))).toBe(1);
  });
  expect(await t.run((ctx) => ctx.db.query("grants").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("tenants").collect())).toEqual(
    first,
  );
});

// spec:command.actor-and-scope fnNextTenant, Contract "A pass over the whole deployment".
test("convex-test: nextTenant reads one tenant in ascending ID order, excludes the cursor and ends at null", async () => {
  const t = app();
  expect(await t.run((ctx) => nextTenant(ctx, null))).toBeNull();
  for (const id of ["z", "b", "a", "tenant:source:depot"])
    await t.run((ctx) => insertGrant(ctx, grant(id)));
  for (const [after, expected] of [
    [null, "a"],
    ["a", "b"],
    ["b", "tenant:source:depot"],
    ["tenant:source:depot", "z"],
    ["z", null],
    ["az", "b"],
  ] as const) {
    await t.run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      expect(await nextTenant(ctx, after)).toBe(expected);
      expect(query.mock.calls).toEqual([["tenants"]]);
      query.mockRestore();
    });
  }
  await t.run((ctx) => insertGrant(ctx, grant("aa")));
  expect(await t.run((ctx) => nextTenant(ctx, "b"))).toBe(
    "tenant:source:depot",
  );
});

// spec:command.actor-and-scope fnInsertGrant, tableTenants: at most limitIdLength bytes of tenant ID.
test("convex-test: insertGrant refuses a tenant ID of 257 bytes as invalidInput and stores neither a tenant nor a grant, and takes one of 256", async () => {
  const t = app();
  const error = await t
    .run((ctx) => insertGrant(ctx, grant("t".repeat(257))))
    .then(
      () => null,
      (thrown: unknown) => thrown,
    );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<Value>).data).toEqual({
    code: "invalidInput",
    message: "tenantId has at most 256 bytes of UTF-8",
    details: { field: "tenantId", length: 257, limit: 256 },
  });
  expect(await t.run((ctx) => ctx.db.query("tenants").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("grants").collect())).toEqual([]);
  await t.run((ctx) => insertGrant(ctx, grant("é".repeat(128))));
  expect(
    (await t.run((ctx) => ctx.db.query("tenants").collect())).map(
      (row) => row.tenantId,
    ),
  ).toEqual(["é".repeat(128)]);
});
