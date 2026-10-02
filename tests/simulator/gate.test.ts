import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import {
  assertWritable,
  gateAllows,
  closeScope,
  resumeScope,
} from "../../src/gate/index.js";
import { gateHandler, gateQueryHandler } from "../pure/gate-handlers.js";
import {
  close,
  resume,
  gateApp,
  gateRows,
  operatorRows,
  plainFailure,
  refusal,
  generationIds,
  operator,
} from "./gate-support.js";

beforeEach(() => {
  vi.stubEnv("MAINTENANCE_MODE", undefined);
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// spec:application.write-pause fnGateAllows, restoreDoor, errorCodeWritePaused.
test("convex-test: restore refuses every scope and generation without touching the database", async () => {
  const t = gateApp();
  const [generation] = await generationIds(t);
  vi.stubEnv("MAINTENANCE_MODE", "restore");
  await t.run(async (ctx) => {
    const access = vi.fn(() => {
      throw new Error("Database accessed under restore");
    });
    const db = new Proxy(ctx.db, { get: access });
    for (const scopes of [[], ["all"], ["tenant:t"]]) {
      expect(await gateAllows({ db }, scopes, generation)).toEqual({
        allowed: false,
        scopeKey: "all",
        reason: "restore",
      });
      await refusal(assertWritable({ db }, scopes), "all", "restore");
    }
    expect(access).not.toHaveBeenCalled();
  });
});

// spec:application.write-pause fnGateAllows, restoreDoor, indexGatesByKeyUse.
test.each(["Restore", "restore ", "", undefined])(
  "convex-test: environment value %j defers to exactly one gate read",
  async (value) => {
    const t = gateApp();
    await close(t);
    vi.stubEnv("MAINTENANCE_MODE", value);
    await t.run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      expect(await gateAllows(ctx, ["all", "tenant:t"])).toEqual({
        allowed: false,
        scopeKey: "tenant:t",
        reason: "repair",
      });
      expect(query.mock.calls).toEqual([["maintenanceGates"]]);
      query.mockRestore();
      expect(await gateAllows(ctx, ["all", "tenant:other"])).toEqual({
        allowed: true,
      });
    });
  },
);

// spec:application.write-pause Contract "A deployment with no gate document is open", fnGateAllows.
test("convex-test: an absent gate is open and neither read helper writes", async () => {
  const t = gateApp();
  await t.run(async (ctx) => {
    const writes = [
      vi.spyOn(ctx.db, "insert"),
      vi.spyOn(ctx.db, "patch"),
      vi.spyOn(ctx.db, "replace"),
      vi.spyOn(ctx.db, "delete"),
    ];
    expect(await gateAllows(ctx, ["all", "tenant:t"])).toEqual({
      allowed: true,
    });
    await assertWritable(ctx, ["all", "tenant:t"]);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
  expect(await gateRows(t)).toEqual([]);
});

// spec:application.write-pause fnGateAllows, tableMaintenanceGates.
test("convex-test: the first matching entry wins in closed array order", async () => {
  const t = gateApp();
  await close(t, "tenant:other", "unmatched");
  await close(t, "tenant:t", "tenant first");
  await close(t, "all", "deployment last");
  expect(await t.run((ctx) => gateAllows(ctx, ["all", "tenant:t"]))).toEqual({
    allowed: false,
    scopeKey: "tenant:t",
    reason: "tenant first",
  });
  await resume(t);
  expect(await t.run((ctx) => gateAllows(ctx, ["tenant:t", "all"]))).toEqual({
    allowed: false,
    scopeKey: "all",
    reason: "deployment last",
  });
});

// spec:application.write-pause fnGateAllows, Contract "The rebuild a scope was closed for".
test("convex-test: only an explicitly matching generation exempts an entry", async () => {
  const t = gateApp();
  const [first, second] = await generationIds(t);
  await close(t);
  const read = (id?: typeof first) =>
    t.run((ctx) => gateAllows(ctx, ["all", "tenant:t"], id));
  const closed = { allowed: false, scopeKey: "tenant:t", reason: "repair" };
  expect(await read()).toEqual(closed);
  expect(await read(first)).toEqual(closed);
  await t.run(async (ctx) => {
    const row = await ctx.db.query("maintenanceGates").unique();
    if (!row) throw new Error("Gate missing");
    await ctx.db.patch(row._id, {
      closed: row.closed.map((entry) => ({ ...entry, generationId: first })),
    });
  });
  expect(await read()).toEqual(closed);
  expect(await read(second)).toEqual(closed);
  expect(await read(first)).toEqual({ allowed: true });
  await close(t, "all", "another entry");
  expect(await read(first)).toEqual({
    allowed: false,
    scopeKey: "all",
    reason: "another entry",
  });
});

// spec:application.write-pause fnCloseScope, fnResumeScope, validatorClosedEntry; spec:operations.baseline-operations tableOperatorAudit; spec:command.actor-and-scope limitOperatorBytes, the trimmed text is the operator.
test("convex-test: close and resume record exactly one audit each with the trimmed operator", async () => {
  const t = gateApp();
  const before = Date.now();
  expect(await close(t)).toBeNull();
  const [row] = await gateRows(t);
  expect(row).toEqual({
    _id: expect.any(String),
    _creationTime: expect.any(Number),
    key: "gates",
    closed: [
      {
        scopeKey: "tenant:t",
        reason: "repair",
        changedAt: expect.any(Number),
        changedBy: operator.trim(),
      },
    ],
    updatedAt: expect.any(Number),
  });
  expect(row!.updatedAt).toBe(row!.closed[0]!.changedAt);
  expect(row!.updatedAt).toBeGreaterThanOrEqual(before);
  expect(row!.updatedAt).toBeLessThanOrEqual(Date.now());
  expect(await operatorRows(t)).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.close",
      scopeKey: "tenant:t",
      reason: "repair",
      operator: operator.trim(),
      recordedAt: row!.updatedAt,
    },
  ]);
  const frozen = await gateRows(t);
  await plainFailure(close(t), "The scope tenant:t is already closed");
  expect(await gateRows(t)).toEqual(frozen);
  expect(await operatorRows(t)).toHaveLength(1);
  expect(await resume(t, "tenant:t", "other operator")).toBeNull();
  const [opened] = await gateRows(t);
  expect(opened?.closed).toEqual([]);
  expect(await operatorRows(t)).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.close",
      scopeKey: "tenant:t",
      reason: "repair",
      operator: operator.trim(),
      recordedAt: row!.updatedAt,
    },
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.resume",
      scopeKey: "tenant:t",
      reason: "repair",
      operator: "other operator",
      recordedAt: opened!.updatedAt,
    },
  ]);
});

// spec:application.write-pause fnResumeScope.
test("convex-test: resuming an absent or already open scope changes nothing", async () => {
  const t = gateApp();
  await plainFailure(resume(t), "The scope tenant:t is not closed");
  expect(await gateRows(t)).toEqual([]);
  expect(await operatorRows(t)).toEqual([]);
  await close(t);
  await resume(t);
  const before = await gateRows(t);
  await plainFailure(resume(t), "The scope tenant:t is not closed");
  expect(await gateRows(t)).toEqual(before);
  expect(await operatorRows(t)).toHaveLength(2);
});

// spec:application.write-pause fnCloseScope, limitClosedScopes.
test("convex-test: the sixteenth scope closes and the seventeenth is refused", async () => {
  const t = gateApp();
  for (let i = 0; i < 16; i++) await close(t, `tenant:${i}`);
  const before = await gateRows(t);
  expect(before[0]?.closed.map((entry) => entry.scopeKey)).toEqual(
    Array.from({ length: 16 }, (_, i) => `tenant:${i}`),
  );
  await plainFailure(
    close(t, "tenant:16"),
    "The gate holds 16 closed scopes, its limit",
  );
  expect(await gateRows(t)).toEqual(before);
  expect(await operatorRows(t)).toHaveLength(16);
  await resume(t, "tenant:0");
  await close(t, "tenant:16");
  expect((await gateRows(t))[0]?.closed).toHaveLength(16);
});

// spec:application.write-pause fnCloseGate, limitGateReason.
test.each(["a", " ", "a".repeat(256), "é".repeat(128), "😀".repeat(64)])(
  "convex-test: a reason within the byte bound is stored unchanged, %j",
  async (reason) => {
    const t = gateApp();
    await close(t, "tenant:t", reason);
    expect((await gateRows(t))[0]?.closed[0]?.reason).toBe(reason);
    expect((await operatorRows(t))[0]?.reason).toBe(reason);
  },
);

// spec:application.write-pause fnCloseGate, limitGateReason.
test.each(["", "a".repeat(257), "é".repeat(128) + "a", "😀".repeat(64) + "é"])(
  "convex-test: a reason outside the byte bound changes nothing, %j",
  async (reason) => {
    const t = gateApp();
    await plainFailure(
      close(t, "tenant:t", reason),
      "The reason must be between 1 and 256 bytes",
    );
    expect(await gateRows(t)).toEqual([]);
    expect(await operatorRows(t)).toEqual([]);
  },
);

for (const entry of ["closeGate", "resumeGate"] as const) {
  // spec:application.write-pause fnCloseGate, fnResumeGate.
  test(`convex-test: ${entry} refuses a source scope with its own name`, async () => {
    const t = gateApp();
    const scopeKey = "source:depot:document";
    await plainFailure(
      entry === "closeGate" ? close(t, scopeKey) : resume(t, scopeKey),
      `${entry} takes the scope all or a tenant scope, and ${scopeKey} is neither`,
    );
    expect(await gateRows(t)).toEqual([]);
    expect(await operatorRows(t)).toEqual([]);
  });

  // spec:command.actor-and-scope fnAssertOperator, Contract "An operator entry that changes anything".
  test.each(["", " \t", "a".repeat(513), "é".repeat(257)])(
    `convex-test: ${entry} refuses operator %j before any context access`,
    async (stated) => {
      const t = gateApp();
      await t.run(async (ctx) => {
        const access = vi.fn(() => {
          throw new Error("Context accessed");
        });
        const guarded = new Proxy(ctx, { get: access });
        const message =
          stated.trim() === ""
            ? "An operator entry needs a stated operator"
            : `The stated operator is ${new TextEncoder().encode(stated).length} bytes, above the limit of 512`;
        await plainFailure(
          gateHandler(entry)._handler(guarded, {
            scopeKey: "source:depot:document",
            reason: "",
            operator: stated,
          }),
          message,
        );
        expect(access).not.toHaveBeenCalled();
      });
      expect(await gateRows(t)).toEqual([]);
      expect(await operatorRows(t)).toEqual([]);
    },
  );
}

// spec:command.actor-and-scope Contract "An operator entry is an internalMutation", fnAssertOperator; spec:application.write-pause fnCloseGate.
test.each(["a".repeat(512), "é".repeat(256)])(
  "convex-test: bounded operators change a tenant with no grant and no auth read, %j",
  async (stated) => {
    const t = gateApp();
    await t.run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      const auth = vi.spyOn(ctx.auth, "getUserIdentity");
      for (const entry of ["closeGate", "resumeGate"] as const)
        await gateHandler(entry)._handler(ctx, {
          scopeKey: "tenant:source:depot:document",
          reason: "repair",
          operator: stated,
        });
      expect(
        query.mock.calls.every(([table]) => table === "maintenanceGates"),
      ).toBe(true);
      expect(auth).not.toHaveBeenCalled();
    });
    expect((await operatorRows(t)).map((row) => row.operator)).toEqual([
      stated,
      stated,
    ]);
    expect(await t.run((ctx) => ctx.db.query("tenants").collect())).toEqual([]);
  },
);

// spec:application.write-pause fnCloseScope, fnResumeScope, Contract "Gate changes are treated as mandatory audit".
test("convex-test: close and resume in one mutation leave two audit records and an open gate", async () => {
  const t = gateApp();
  await t.run(async (ctx) => {
    await closeScope(ctx, "all", "repair", "closer");
    await resumeScope(ctx, "all", "resumer");
  });
  expect((await gateRows(t))[0]?.closed).toEqual([]);
  expect(
    (await operatorRows(t)).map(
      ({ kind, operator: stated, reason, scopeKey }) => ({
        kind,
        operator: stated,
        reason,
        scopeKey,
      }),
    ),
  ).toEqual([
    {
      kind: "gate.close",
      operator: "closer",
      reason: "repair",
      scopeKey: "all",
    },
    {
      kind: "gate.resume",
      operator: "resumer",
      reason: "repair",
      scopeKey: "all",
    },
  ]);
});

// spec:application.write-pause fnResumeScope, fnResumeGate; spec:operations.baseline-operations fnWriteOperatorAudit.
test("convex-test: resumeGate copies the removed entry's generation and reason to audit", async () => {
  const t = gateApp();
  const [generationId] = await generationIds(t);
  await t.run((ctx) =>
    ctx.db.insert("maintenanceGates", {
      key: "gates",
      closed: [
        {
          scopeKey: "tenant:t",
          reason: "restored entry",
          generationId,
          changedBy: "closer",
          changedAt: 1,
        },
      ],
      updatedAt: 1,
    }),
  );
  await resume(t);
  expect((await gateRows(t))[0]?.closed).toEqual([]);
  expect(await operatorRows(t)).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.resume",
      scopeKey: "tenant:t",
      reason: "restored entry",
      generationId,
      operator: operator.trim(),
      recordedAt: expect.any(Number),
    },
  ]);
});

// spec:application.write-pause Contract "Gate changes are treated as mandatory audit"; spec:operations.baseline-operations faultInjection.
test.each(["absent", "existing", "resume"])(
  "convex-test: a refused operator audit leaves the %s gate unchanged",
  async (state) => {
    const t = gateApp("operatorAudit");
    if (state !== "absent")
      await t.run((ctx) =>
        ctx.db.insert("maintenanceGates", {
          key: "gates",
          closed: [
            {
              scopeKey: "tenant:t",
              reason: "original",
              changedAt: 1,
              changedBy: "original operator",
            },
          ],
          updatedAt: 1,
        }),
      );
    const before = await gateRows(t);
    await expect(
      state === "resume" ? resume(t) : close(t, "all"),
    ).rejects.toThrow();
    expect(await gateRows(t)).toEqual(before);
    expect(await operatorRows(t)).toEqual([]);
  },
);

// spec:application.write-pause fnGetGate.
test("convex-test: getGate reports restore separately and preserves document entries", async () => {
  const t = gateApp();
  expect(await t.query(internal.gate.getGate, {})).toEqual({
    restore: false,
    closed: [],
  });
  vi.stubEnv("MAINTENANCE_MODE", "restore");
  expect(await t.query(internal.gate.getGate, {})).toEqual({
    restore: true,
    closed: [],
  });
  await close(t);
  expect(await t.query(internal.gate.getGate, {})).toEqual({
    restore: true,
    closed: (await gateRows(t))[0]!.closed,
  });
  vi.stubEnv("MAINTENANCE_MODE", "Restore");
  expect(await t.query(internal.gate.getGate, {})).toEqual({
    restore: false,
    closed: (await gateRows(t))[0]!.closed,
  });
  await resume(t);
});

// spec:application.write-pause fnGetGateAudit; spec:operations.baseline-operations limitOperatorQuery, tableOperatorAudit.
test("convex-test: getGateAudit pages one scope newest first with at most 100 records", async () => {
  const t = gateApp();
  await t.run(async (ctx) => {
    for (let i = 0; i < 205; i++)
      await ctx.db.insert("operatorAudit", {
        kind: i % 2 === 0 ? "gate.close" : "gate.resume",
        scopeKey: "tenant:t",
        reason: `reason-${i}`,
        operator: "op",
        recordedAt: i,
      });
    await ctx.db.insert("operatorAudit", {
      kind: "gate.close",
      scopeKey: "tenant:other",
      reason: "other",
      operator: "op",
      recordedAt: 999,
    });
  });
  const expected = (await operatorRows(t))
    .filter((row) => row.scopeKey === "tenant:t")
    .sort((a, b) => b.recordedAt - a.recordedAt);
  const rows = [];
  let cursor: string | null = null;
  let done = false;
  for (let page = 0; page < 4 && !done; page++) {
    const result: FunctionReturnType<typeof internal.gate.getGateAudit> =
      await t.query(internal.gate.getGateAudit, {
        scopeKey: "tenant:t",
        paginationOpts: { numItems: 1000, cursor },
      });
    expect(result.page.length).toBeGreaterThan(0);
    expect(result.page.length).toBeLessThanOrEqual(100);
    rows.push(...result.page);
    cursor = result.continueCursor;
    done = result.isDone;
  }
  expect(done).toBe(true);
  expect(rows).toEqual(expected);
  const small = await t.query(internal.gate.getGateAudit, {
    scopeKey: "tenant:t",
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(small.page).toEqual(expected.slice(0, 1));
});

// spec:application.write-pause fnCloseScope; spec:operations.baseline-operations tableOperatorAudit, fnWriteOperatorAudit.
test("convex-test: closeScope copies an existing generation into the entry and its audit", async () => {
  const t = gateApp();
  const [generationId] = await generationIds(t);
  await t.run((ctx) =>
    closeScope(ctx, "tenant:t", "repair", operator, generationId),
  );
  const [gate] = await gateRows(t);
  expect(gate?.closed).toEqual([
    {
      scopeKey: "tenant:t",
      reason: "repair",
      generationId,
      changedAt: 1_000_000,
      changedBy: operator,
    },
  ]);
  expect(await operatorRows(t)).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.close",
      scopeKey: "tenant:t",
      reason: "repair",
      generationId,
      operator,
      recordedAt: 1_000_000,
    },
  ]);
});

// spec:command.actor-and-scope Contract "An operator entry is an internalMutation", "An operator entry that changes anything"; spec:application.write-pause fnGetGate, fnGetGateAudit.
test("convex-test: the reading entries require no operator and read neither grants nor auth", async () => {
  const t = gateApp();
  await close(t);
  await t.run(async (ctx) => {
    const query = vi.spyOn(ctx.db, "query");
    const auth = vi.spyOn(ctx.auth, "getUserIdentity");
    const insert = vi.spyOn(ctx.db, "insert");
    const patch = vi.spyOn(ctx.db, "patch");
    const remove = vi.spyOn(ctx.db, "delete");
    const replace = vi.spyOn(ctx.db, "replace");
    await gateQueryHandler("getGate")._handler(ctx, {});
    await gateQueryHandler("getGateAudit")._handler(ctx, {
      scopeKey: "tenant:t",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(query.mock.calls).toEqual([["maintenanceGates"], ["operatorAudit"]]);
    for (const access of [auth, insert, patch, remove, replace])
      expect(access).not.toHaveBeenCalled();
  });
});

// spec:application.write-pause typeScopeKey, fnCloseGate, fnGateAllows.
test("convex-test: colons inside a tenant ID remain part of that tenant's closed scope", async () => {
  const t = gateApp();
  await close(t, "tenant:source:depot:document");
  expect((await gateRows(t))[0]?.closed[0]?.scopeKey).toBe(
    "tenant:source:depot:document",
  );
  expect(
    await t.run((ctx) =>
      gateAllows(ctx, ["all", "tenant:source:depot:document"]),
    ),
  ).toEqual({
    allowed: false,
    scopeKey: "tenant:source:depot:document",
    reason: "repair",
  });
  expect(
    await t.run((ctx) => gateAllows(ctx, ["all", "tenant:source"])),
  ).toEqual({ allowed: true });
  await resume(t, "tenant:source:depot:document");
  expect((await gateRows(t))[0]?.closed).toEqual([]);
});
