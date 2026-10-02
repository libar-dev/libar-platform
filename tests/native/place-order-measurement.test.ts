import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { expect, test } from "vitest";
import { measure, required } from "../../harness/native.js";
import {
  place,
  callsPerContextAre,
  type ExperimentWorld,
} from "./first-experiment-steps.js";
import { stored } from "./place-order-attribution.js";
import {
  expectUsage,
  json,
  grantTenant,
  healthyUsage,
  measured,
  order,
  seed,
  setup,
} from "./place-order-measurement.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.measurement"),
  verifies: ref("spec:application.first-experiment"),
});
void anchor;

test.each([1, 10, 100] as const)(
  "native: PlaceOrder of %i lines has the recorded document and byte cost",
  async (lines) => {
    const world = await setup();
    const args = order(lines);
    await seed(world, args);
    const result = await measured(
      world,
      [args],
      "Four grants, one active generation; each line names a distinct stock item received once with quantity two; fixed seven-character stock and order IDs.",
      "healthy",
    );
    expect(result.answers[0]).toMatchObject({
      kind: "applied",
      replayed: false,
    });
    expect(result.records).toHaveLength(1);
    expectUsage(required(result.records[0], "completion"), healthyUsage[lines]);
    expect(result.value.rowsAfter).toEqual({
      grants: 4,
      generations: 1,
      receipts: 1,
      summaries: 1,
      orderStreams: 1,
      orderEvents: 1,
      stockStreams: lines,
      stockEvents: 2 * lines,
      gates: 0,
      auditRecords: 0,
      operatorAudit: 0,
    });
    expect(
      result.after.orderEvents.length - result.before.orderEvents.length,
    ).toBe(1);
    expect(
      result.after.stockEvents.length - result.before.stockEvents.length,
    ).toBe(lines);
    expect(result.after.summaries.length - result.before.summaries.length).toBe(
      1,
    );
    // Reuse the executor's pure-tier call counter with the actual input and returned operation.
    const response = result.answers[0]?.value as NonNullable<
      ExperimentWorld["placed"]
    >["response"];
    world.placed = {
      orderId: args.input.orderId,
      lines: args.input.lines,
      response,
      own: required(result.records[0], "completion"),
      request: result.records,
      window: result.records,
      summaryKeys: [args.input.orderId],
    };
    await callsPerContextAre(world, 1);
    measure("callsPerContext", {
      tier: "pure test",
      lines,
      orders: 1,
      inventory: 1,
    });
  },
);

test.each([
  "authorized duplicate",
  "changed input conflict",
  "business rejection",
  "second-context failure",
] as const)("native: PlaceOrder cost for %s", async (path) => {
  const world = await setup();
  const backend = required(world.backend, "backend");
  const args = order(10);
  await seed(world, args);
  let priorCommand = null;
  if (path === "authorized duplicate" || path === "changed input conflict") {
    const original = await place(world, args.input.orderId, args.input.lines);
    expect(original.response).toMatchObject({
      kind: "applied",
      replayed: false,
    });
    expectUsage(original.own, healthyUsage[10]);
    priorCommand = json({
      outcome: original.response,
      completionRecords: original.request,
    });
    if (path === "changed input conflict")
      required(args.input.lines[9], "last line").unitPrice++;
  }
  if (path === "business rejection")
    required(args.input.lines[9], "last line").quantity = 3;
  if (path === "second-context failure") {
    const rows = await stored(backend);
    const event = required(
      rows.stockEvents.find((row) => row.streamId === "sku-009"),
      "tail",
    );
    await backend.admin.writeTable(
      "events",
      { delete: String(event._id) },
      { component: "inventory" },
    );
  }
  const result = await measured(
    world,
    [args],
    `Ten distinct stock items, four grants and one active generation; ${path}; the short-stock or missing-tail item is last, after nine Inventory allocations and the Orders call.`,
    path,
    0,
    { priorCommand },
  );
  expect(result.records).toHaveLength(1);
  const expected =
    path === "authorized duplicate" || path === "changed input conflict"
      ? ([5, 0, 3441, 0] as const)
      : ([32, 0, 13106, 0] as const);
  expectUsage(required(result.records[0], "completion"), expected);
  expect(result.after).toEqual(result.before);
  if (path === "authorized duplicate") {
    expect(result.answers[0]).toMatchObject({
      kind: "applied",
      replayed: true,
    });
    // The answer from the receipt is the cell's one duplicate and no applied command.
    expect(result.value.outcomeCounts).toEqual({
      applied: 0,
      duplicates: 1,
      rejected: 0,
      businessFailure: 0,
      technicalFailure: 0,
      transientRefusal: 0,
    });
  }
  // One command and no concurrency: the engine reruns nothing.
  expect(result.value.engineReruns).toBe(0);
  if (path === "changed input conflict")
    expect(result.answers[0]).toMatchObject({
      kind: "rejection",
      code: "idempotencyConflict",
    });
  if (path === "business rejection")
    expect(result.answers[0]).toMatchObject({
      kind: "rejection",
      code: "insufficientStock",
    });
  if (path === "second-context failure") {
    expect(result.answers[0]?.kind).toBe("technicalFailure");
    expect(JSON.stringify(result.answers[0]?.value)).toContain(
      "journal holds no event",
    );
  }
});

test.each([
  ["in one tenant", false],
  ["in eight tenants", true],
] as const)(
  "native: eight PlaceOrder commands at once on unrelated stock %s",
  async (_tenants, separateTenants) => {
    const world = await setup();
    const args = Array.from({ length: 8 }, (_, i) =>
      order(10, i, separateTenants ? `t-${i + 1}` : "t-1"),
    );
    for (const arg of args) {
      if (separateTenants && arg.tenantId !== "t-1")
        await grantTenant(world, arg.tenantId);
      await seed(world, arg);
    }
    const result = await measured(
      world,
      args,
      `Eight simultaneous commands of ten lines; no shared stock item; ${separateTenants ? "eight unrelated tenants, each with four grants" : "one tenant with four grants"}; one active generation, seven-character stock and order IDs.`,
      "unrelated stock",
      8,
    );
    expect(result.answers.map((answer) => answer.kind)).toEqual(
      Array(8).fill("applied"),
    );
    expect(result.value.engineFailedCommands).toBe(0);
    expect(result.value.topLevelCommits).toBe(8);
    expect(result.value.rowsAfter).toEqual({
      grants: separateTenants ? 32 : 4,
      generations: 1,
      receipts: 8,
      summaries: 8,
      orderStreams: 8,
      orderEvents: 8,
      stockStreams: 80,
      stockEvents: 160,
      gates: 0,
      auditRecords: 0,
      operatorAudit: 0,
    });
    for (const record of result.records.filter((record) => !record.willRetry))
      expectUsage(record, healthyUsage[10]);
    expect(
      result.after.orderEvents.length - result.before.orderEvents.length,
    ).toBe(8);
    expect(
      result.after.stockEvents.length - result.before.stockEvents.length,
    ).toBe(80);
    expect(result.after.receipts.length - result.before.receipts.length).toBe(
      8,
    );
  },
);

test("native: a matching journal tail does not prove that current stock equals its event fold", async () => {
  const world = await setup();
  const backend = required(world.backend, "backend");
  const args = order(1);
  await seed(world, args);
  const before = await stored(backend);
  const stock = required(before.stockStreams[0], "stock");
  await backend.admin.writeTable(
    "streams",
    {
      patch: String(stock._id),
      fields: { state: { onHand: 3, allocated: 0 } },
    },
    { component: "inventory" },
  );
  required(args.input.lines[0], "line").quantity = 3;
  const result = await measured(
    world,
    [args],
    "One stock item received with quantity two; admin access changes only current onHand to three, keeping stream version one and its journal tail; PlaceOrder asks for three. This corrupt state is not made by a command.",
    "current state differs from fold",
  );
  expect(result.answers[0]).toMatchObject({ kind: "applied", replayed: false });
  expectUsage(required(result.records[0], "completion"), healthyUsage[1]);
  expect(result.after.stockStreams[0]?.state).toEqual({
    onHand: 3,
    allocated: 3,
  });
  expect(
    result.after.stockEvents.map((row) => ({
      type: row.eventType,
      payload: row.payload,
    })),
  ).toEqual([
    { type: "StockReceived", payload: { quantity: 2 } },
    { type: "StockAllocated", payload: { quantity: 3, orderId: "order-1" } },
  ]);
});
