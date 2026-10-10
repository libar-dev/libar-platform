import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type PaginationResult } from "convex/server";
import type { Value } from "convex/values";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, onTestFinished, vi } from "vitest";
import { api, internal } from "../../example/convex/_generated/api.js";
import type { OrderDto } from "../../example/convex/orders/streams.js";
import { onlineRebuildInterruptResumeContract as contract } from "../../generated/contracts/application.rebuild.online-rebuild-interrupt-resume.contract.js";
import type { CompletionRecord, LogMark } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { productionBackend, required } from "../../harness/native.js";
import { grant, permissions } from "./order-use-case.js";
import {
  generationEntry,
  generations,
  installOrderSummary,
  waitForGeneration,
  type GenerationEntry,
} from "./rebuild-install.js";

vi.setConfig({ testTimeout: 300_000 });
const anchor = specTest({
  id: testAnchorId("test:application.rebuild.online-rebuild-interrupt-resume"),
  verifies: ref("spec:application.rebuild.online-rebuild-interrupt-resume"),
});
void anchor;
const tenants = ["tenant-a", "tenant-z"] as const;
const operator = "order summary operator";
const readModel = "orderSummary";
const listName = getFunctionName(api.readModels.listOrderSummaries);
type Row = Record<string, Value>;
type Execution = CompletionRecord & {
  willRetry?: boolean;
  occInfo?: {
    tableName: string;
    componentPath: string | null;
    retryCount: number;
  } | null;
};
type Operation = {
  operationId: string;
  orders: number;
  inventory: number;
  receipts: number;
};
type Watch = ReturnType<
  typeof watchQuery<typeof api.readModels.listOrderSummaries>
>;
interface World {
  backend?: Backend;
  clients: ConvexHttpClient[];
  generation1?: string;
  generation2?: string;
  initial?: GenerationEntry;
  interrupted?: GenerationEntry;
  resumed?: GenerationEntry;
  verified?: GenerationEntry;
  oldFence?: number;
  missingOrder?: string | undefined;
  existingOrder?: string | undefined;
  operations: Operation[];
  log: Map<string, Execution>;
  mark?: LogMark;
  batchStart?: number;
  batchEnd?: number;
  subjectsAtVerified?: number;
  cursors: string[];
  live: boolean;
  workers: Promise<void>[];
  workerError?: unknown;
  liveCounts: number[];
  watches: Watch[];
  startedAt: number;
  recordPath?: string;
}
const backendOf = (w: World) => required(w.backend, "the backend");
const id2 = (w: World) => required(w.generation2, "generation 2");
const seeded = (i: number) => `seed-${String(i).padStart(3, "0")}`;
const records = (w: World) => [...w.log.values()];

// Marks overlap: establish the next mark before draining the previous one, then deduplicate by execution.
async function drain(w: World) {
  const backend = backendOf(w);
  const next = await backend.admin.logMark();
  const previous = w.mark;
  if (previous) {
    let read = false;
    const entries = await backend.admin.completionsSince(previous, () => {
      if (!read) {
        read = true;
        return false;
      }
      return true;
    });
    for (const entry of entries)
      w.log.set(entry.executionId, entry as Execution);
  }
  w.mark = next;
}
async function observe(w: World, entry: GenerationEntry) {
  if (entry.progress.cursor && entry.progress.pass === "backfill")
    w.cursors.push(entry.progress.cursor.tenantId);
  if (w.workerError) throw w.workerError;
  await drain(w);
}
async function entry(w: World, generationId = id2(w)) {
  return generationEntry(backendOf(w), readModel, generationId);
}
async function place(w: World, tenant: number, orderId: string) {
  const response = await w.clients[tenant]!.mutation(api.ordering.placeOrder, {
    tenantId: tenants[tenant]!,
    requestKey: `place:${orderId}`,
    input: {
      orderId,
      lines: [{ stockItemId: "stock", quantity: 1, unitPrice: 100 }],
    },
  });
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: no command ends in a failure.
  expect(response).toMatchObject({ kind: "applied", replayed: false });
  w.operations.push({
    operationId: response.operationId,
    orders: 1,
    inventory: 1,
    receipts: 1,
  });
}
async function cancel(w: World, tenant: number, orderId: string) {
  const response = await w.clients[tenant]!.mutation(api.ordering.cancelOrder, {
    tenantId: tenants[tenant]!,
    requestKey: `cancel:${orderId}`,
    input: { orderId },
  });
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: no command ends in a failure.
  expect(response).toMatchObject({ kind: "applied", replayed: false });
  w.operations.push({
    operationId: response.operationId,
    orders: 1,
    inventory: 1,
    receipts: 1,
  });
}
function startLive(w: World) {
  w.live = true;
  w.workers = tenants.map(async (_tenant, i) => {
    try {
      while (w.live) {
        const n = w.liveCounts[i]!;
        const orderId = `live-${n}`;
        await place(w, i, orderId);
        await cancel(w, i, orderId);
        w.liveCounts[i] = n + 1;
        await sleep(200);
      }
    } catch (error) {
      w.workerError = error;
      w.live = false;
    }
  });
}
async function stopLive(w: World) {
  w.live = false;
  await Promise.all(w.workers);
  if (w.workerError) throw w.workerError;
}
async function rows(w: World, generation: number) {
  return (await backendOf(w).admin.readTable("orderSummaries")).filter(
    (row) => row.generation === generation,
  );
}
function without(row: Row, keys: string[]) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !keys.includes(key)),
  );
}
async function verifyBatchCount(w: World, batchSize: number) {
  let count = 0;
  for (const tenantId of tenants) {
    let cursor: string | null = null;
    for (;;) {
      const page = (await backendOf(w).admin.run(
        "queries/order:list",
        {
          tenantId,
          includeDeleted: true,
          paginationOpts: { cursor, numItems: batchSize },
        },
        { component: "orders" },
      )) as unknown as PaginationResult<OrderDto>;
      count++;
      await drain(w);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }
  return count;
}
// The orders the Orders context's list enumerates in both tenants, deleted ones included.
async function subjects(w: World) {
  let count = 0;
  for (const tenantId of tenants) {
    let cursor: string | null = null;
    for (;;) {
      const page = (await backendOf(w).admin.run(
        "queries/order:list",
        {
          tenantId,
          includeDeleted: true,
          paginationOpts: { cursor, numItems: 100 },
        },
        { component: "orders" },
      )) as unknown as PaginationResult<OrderDto>;
      count += page.page.length;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }
  return count;
}
async function assertCoverage(w: World, generation: number) {
  const target = await rows(w, generation);
  const expected: { tenantId: string; key: string }[] = [];
  for (const tenantId of tenants) {
    let cursor: string | null = null;
    for (;;) {
      const page = (await backendOf(w).admin.run(
        "queries/order:list",
        {
          tenantId,
          includeDeleted: true,
          paginationOpts: { cursor, numItems: 16 },
        },
        { component: "orders" },
      )) as unknown as PaginationResult<OrderDto>;
      for (const order of page.page) {
        expected.push({ tenantId, key: order.orderId });
        const matching = target.filter(
          (row) => row.tenantId === tenantId && row.key === order.orderId,
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: each enumerated order has exactly one row at its source version.
        expect(matching).toHaveLength(1);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: no stale data, including a cancel while interrupted.
        expect(matching[0]).toMatchObject({
          sourceVersions: [order.version],
          projectionVersion: 1,
          orderId: order.orderId,
          status: order.status,
          total: order.total,
          lineCount: order.lines.length,
          placedAt: order.placedAt,
        });
      }
      await drain(w);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }
  const key = ({
    tenantId,
    key,
  }: {
    tenantId: Value | undefined;
    key: Value | undefined;
  }) => `${tenantId}/${key}`;
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: coverage equals the Orders enumeration in both tenants.
  expect(
    target.map((row) => key({ tenantId: row.tenantId, key: row.key })).sort(),
  ).toEqual(expected.map(key).sort());
}
async function assertJournals(w: World) {
  const backend = backendOf(w);
  const tables = {
    orders: await backend.admin.readTable("events", { component: "orders" }),
    inventory: await backend.admin.readTable("events", {
      component: "inventory",
    }),
    receipts: await backend.admin.readTable("receipts"),
  };
  for (const kind of ["orders", "inventory", "receipts"] as const) {
    const byOperation = new Map<string, number>();
    for (const row of tables[kind]) {
      const operationId = String(row.operationId);
      byOperation.set(operationId, (byOperation.get(operationId) ?? 0) + 1);
    }
    const expected = new Map(
      w.operations
        .filter((operation) => operation[kind] > 0)
        .map((operation) => [operation.operationId, operation[kind]]),
    );
    // rebuild.online-rebuild-interrupt-resume.sdp.md:35: journals and receipts, grouped by operation, contain exactly what the commands produced.
    expect(byOperation).toEqual(expected);
  }
}
async function assertLog(w: World) {
  await drain(w);
  const log = records(w);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: no action ran, including outside the observed batch interval.
  expect(
    log.filter(
      ({ udfType }) => udfType === "Action" || udfType === "HttpAction",
    ),
  ).toEqual([]);
  // The harness's own reads through system functions are the test's, not the run's.
  const during = log.filter(
    (record) =>
      !record.identifier.startsWith("_system/") &&
      record.timestamp * 1000 > required(w.batchStart, "batch start") &&
      record.timestamp * 1000 <= required(w.batchEnd, "batch end"),
  );
  const allowed = new Set([
    "rebuild:startGeneration",
    "rebuild:interruptGeneration",
    "rebuild:resumeGeneration",
    "rebuild:backfillBatch",
    "rebuild:verifyBatch",
    "rebuild:getGenerations",
    getFunctionName(api.ordering.placeOrder),
    getFunctionName(api.ordering.cancelOrder),
  ]);
  const mutationNames = new Set([
    ...allowed,
    "rebuild:switchGeneration",
    "rebuild:rollbackGeneration",
    getFunctionName(api.receiving.receiveStock),
  ]);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: installation and rollback also have no unaccounted mutation.
  expect(
    log.filter(
      (record) =>
        record.udfType === "Mutation" && !mutationNames.has(record.identifier),
    ),
  ).toEqual([]);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: only batches, operator entries and the live commands complete during the batches.
  expect(during.filter((record) => !allowed.has(record.identifier))).toEqual(
    [],
  );
  // rebuild.online-rebuild-interrupt-resume.sdp.md:33: the batches that wrote, by pass, are the progress
  // row's batchesDone and the one backfill batch that recorded the interruption; any other batch under a
  // replaced fence completes without writing.
  const wrote = (identifier: string) =>
    during.filter(
      (record) =>
        record.identifier === identifier &&
        !record.willRetry &&
        record.error === null &&
        (record.usageStats["databaseWriteDocuments"] ?? 0) > 0,
    ).length;
  const backfills = wrote("rebuild:backfillBatch") - 1;
  const verifies = wrote("rebuild:verifyBatch");
  expect(backfills + verifies).toBe(
    required(w.verified, "verified generation").progress.batchesDone,
  );
  // rebuild.online-rebuild-interrupt-resume.sdp.md:33: at a batch size of 1 each pass takes one batch per
  // subject it visits and at most one more per tenant.
  for (const count of [backfills, verifies]) {
    expect(count).toBeGreaterThanOrEqual(350);
    expect(count).toBeLessThanOrEqual(
      required(w.subjectsAtVerified, "subjects at verified") + tenants.length,
    );
  }
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: the batch log assertion is not vacuous.
  expect(
    during.filter(
      (record) =>
        record.identifier === "rebuild:backfillBatch" && !record.willRetry,
    ).length,
  ).toBeGreaterThanOrEqual(350);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: no PlaceOrder, CancelOrder or parent query names progress
  // as its conflict table; an operator entry and a batch may, and the run record counts them.
  const live = new Set([
    getFunctionName(api.ordering.placeOrder),
    getFunctionName(api.ordering.cancelOrder),
  ]);
  expect(
    log.filter(
      (record) =>
        record.occInfo?.tableName === "generationProgress" &&
        (live.has(record.identifier) || record.udfType === "Query"),
    ),
  ).toEqual([]);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: the interrupt conflicts with a batch only through the
  // generation row, so no completion of it names the progress row.
  expect(
    log.filter(
      (record) =>
        record.identifier === "rebuild:interruptGeneration" &&
        record.occInfo?.tableName === "generationProgress",
    ),
  ).toEqual([]);
  const commands = new Set([
    getFunctionName(api.ordering.placeOrder),
    getFunctionName(api.ordering.cancelOrder),
    getFunctionName(api.receiving.receiveStock),
  ]);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: every final command completion is successful.
  expect(
    log.filter(
      (record) =>
        commands.has(record.identifier) &&
        !record.willRetry &&
        (record.error !== null || record.occInfo != null),
    ),
  ).toEqual([]);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:35: every completed command belongs to a command the test sent, including retries with no new effects.
  expect(
    log.filter(
      (record) =>
        commands.has(record.identifier) &&
        !record.willRetry &&
        record.error === null,
    ),
  ).toHaveLength(w.operations.length);
  const transitions = new Set([
    "rebuild:startGeneration",
    "rebuild:interruptGeneration",
    "rebuild:resumeGeneration",
    "rebuild:switchGeneration",
    "rebuild:rollbackGeneration",
  ]);
  const operatorEntries = log.filter(
    (record) =>
      transitions.has(record.identifier) &&
      !record.willRetry &&
      record.error === null,
  ).length;
  // Two pass ends per installation or rebuild, and one for the rollback verify pass.
  const passEnds = w.watches.length === 0 ? 4 : 5;
  const reruns = log.filter(
    (record) => record.occInfo?.tableName === "generations",
  );
  // rebuild.online-rebuild-interrupt-resume.sdp.md:36: two ordinary callers and one chain bound registry reruns per transition.
  expect(reruns.length).toBeLessThanOrEqual(
    (operatorEntries + passEnds) * (2 + 1),
  );
}
async function subscribe(w: World) {
  for (const tenantId of tenants) {
    const socket = ordinarySocketClient(backendOf(w).url, {
      token: await backendOf(w).issuer.token("writer"),
    });
    onTestFinished(() => socket.close());
    const watch = watchQuery(socket, api.readModels.listOrderSummaries, {
      tenantId,
      status: "placed",
      paginationOpts: { cursor: null, numItems: 100 },
    });
    await watch.until(() => true, `the initial list for ${tenantId}`);
    w.watches.push(watch);
  }
  await drain(w);
}
async function switchAndObserve(w: World, generationId: string) {
  const backend = backendOf(w);
  const before = w.watches.map((watch) => watch.values.at(-1)!.page);
  // No commands or explicit list queries occur in this interval. The two query arguments name different tenants.
  const mark = await backend.admin.logMark();
  await backend.admin.run(getFunctionName(internal.rebuild.switchGeneration), {
    generationId,
    operator,
  });
  const completions = await backend.admin.completionsSince(
    mark,
    (seen) =>
      seen.filter(
        (record) =>
          record.identifier === listName &&
          record.udfType === "Query" &&
          !record.cachedResult,
      ).length >= 2,
  );
  for (const completion of completions)
    w.log.set(completion.executionId, completion as Execution);
  // rebuild.online-rebuild-interrupt-resume.sdp.md:37: both subscriptions reexecute because of this switch.
  expect(
    completions.filter(
      (record) =>
        record.identifier === listName &&
        record.udfType === "Query" &&
        !record.cachedResult,
    ),
  ).toHaveLength(2);
  for (let i = 0; i < w.watches.length; i++) {
    const value = await w.watches[i]!.until(
      (page) => JSON.stringify(page.page) === JSON.stringify(before[i]),
      "the same rows after switch",
    );
    // rebuild.online-rebuild-interrupt-resume.sdp.md:37: each subscription retains its rows across the switch.
    expect(value.page).toEqual(before[i]);
  }
  // read-models.sdp.md fnPageInGeneration: the first page's cursor pages on in the generation now active.
  const first = w.watches[0]!.values.at(-1)!;
  const next = await w.clients[0]!.query(api.readModels.listOrderSummaries, {
    tenantId: tenants[0],
    status: "placed",
    paginationOpts: { cursor: first.continueCursor, numItems: 100 },
  });
  expect(next.page.map(({ key }) => key)).not.toContain(first.page.at(-1)?.key);
  expect(next.page.length).toBeGreaterThan(0);
  await drain(w);
}

bindExample(
  contract,
  (): World => ({
    clients: [],
    operations: [],
    log: new Map(),
    cursors: [],
    live: false,
    workers: [],
    liveCounts: [0, 0],
    watches: [],
    startedAt: Date.now(),
  }),
  {
    "a {viewKind} read model with an active generation": async (w) => {
      const directory = await mkdtemp(join(tmpdir(), "online-rebuild-"));
      w.recordPath = join(directory, "run.json");
      console.log(`Online rebuild run record: ${w.recordPath}`);
      onTestFinished(async () => {
        w.live = false;
        await Promise.all(w.workers);
        const elapsedMs = Date.now() - w.startedAt;
        await writeFile(
          w.recordPath!,
          JSON.stringify(
            {
              elapsedMs,
              exceeds60Seconds: elapsedMs > 60_000,
              callersInFlight: 2,
              cursors: w.cursors,
              operations: w.operations,
              completions: records(w),
              registryReruns: records(w).filter(
                (record) => record.occInfo?.tableName === "generations",
              ),
              // rebuild.online-rebuild-interrupt-resume.sdp.md:36: batches and the other operator entries that reran on the progress row.
              progressReruns: records(w).filter(
                (record) =>
                  record.occInfo?.tableName === "generationProgress" &&
                  record.identifier.startsWith("rebuild:"),
              ),
            },
            null,
            2,
          ),
        );
        console.log(
          `Online rebuild elapsed: ${elapsedMs} ms; run record: ${w.recordPath}`,
        );
      });
      w.backend = await productionBackend();
      // Deliberately grant in reverse order: the batch must use tenant-ID order.
      for (const tenantId of [...tenants].reverse())
        for (const permission of permissions)
          await grant(backendOf(w), "writer", permission, tenantId);
      w.mark = await backendOf(w).admin.logMark();
      w.generation1 = await installOrderSummary(backendOf(w), operator);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:33: generation 1 is installed before any order.
      expect(
        (await generationEntry(backendOf(w), readModel, w.generation1))
          .generation,
      ).toMatchObject({ generation: 1, state: "active" });
      await drain(w);
      for (let i = 0; i < tenants.length; i++) {
        const client = ordinaryClient(backendOf(w).url, {
          token: await backendOf(w).issuer.token("writer"),
        });
        w.clients.push(client);
        const response = await client.mutation(api.receiving.receiveStock, {
          tenantId: tenants[i]!,
          input: { items: [{ stockItemId: "stock", quantity: 10000 }] },
        });
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: stock setup also ends applied.
        expect(response.kind).toBe("applied");
        w.operations.push({
          operationId: response.operationId,
          orders: 0,
          inventory: 1,
          receipts: 0,
        });
        for (let n = 0; n < (i === 0 ? 250 : 100); n++) {
          await place(w, i, seeded(n));
          if (n % 20 === 0) await drain(w);
        }
      }
      await drain(w);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:33: exactly 250 and 100 seeded orders in tenant-ID order.
      expect(
        (await rows(w, 1)).reduce(
          (counts, row) => {
            const i = tenants.indexOf(row.tenantId as (typeof tenants)[number]);
            counts[i]!++;
            return counts;
          },
          [0, 0],
        ),
      ).toEqual([250, 100]);
    },
    "a new generation registered as {mode}": async (w) => {
      const mark = await backendOf(w).admin.logMark();
      w.batchStart = mark.cursorMs;
      const id = await backendOf(w).admin.run(
        getFunctionName(internal.rebuild.startGeneration),
        { readModel, projectionVersion: 1, batchSize: 1, operator },
      );
      if (typeof id !== "string") throw new Error("Expected a generation ID");
      w.generation2 = id;
      w.initial = await entry(w);
      w.oldFence = w.initial.generation.fence;
      // rebuild.online-rebuild-interrupt-resume.sdp.md:33: online generation 2 uses version 1, batch size 1 and the stated operator.
      expect(w.initial).toMatchObject({
        generation: {
          generation: 2,
          state: "building",
          projectionVersion: 1,
          pauseRequired: false,
          startedBy: operator,
        },
        progress: { batchSize: 1, pass: "backfill" },
      });
    },
    "live commands {liveCommands}": async (w) => {
      startLive(w);
      await waitForGeneration(
        backendOf(w),
        readModel,
        id2(w),
        () => w.liveCounts.every((count) => count >= 1),
        (entry) => observe(w, entry),
      );
    },
    "the backfill is interrupted after {batches} batches and then {resumption}":
      async (w, { batches }) => {
        await waitForGeneration(
          backendOf(w),
          readModel,
          id2(w),
          ({ progress }) => progress.batchesDone >= batches,
          (entry) => observe(w, entry),
        );
        await backendOf(w).admin.run(
          getFunctionName(internal.rebuild.interruptGeneration),
          { generationId: id2(w), operator: "interrupt operator" },
        );
        await stopLive(w);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:33; rebuild.sdp.md step1:125: the batch the interrupt
        // replaced records the interruption, with the operator from the generation row, and schedules nothing.
        w.interrupted = await waitForGeneration(
          backendOf(w),
          readModel,
          id2(w),
          ({ progress }) =>
            progress.lastError === "interrupted by interrupt operator",
          (entry) => observe(w, entry),
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:33: the interrupt lands after at least three and below 350 batches, with a tenant cursor.
        expect(w.interrupted.progress.batchesDone).toBeGreaterThanOrEqual(
          batches,
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:33: backfill is interrupted before 350 batches.
        expect(w.interrupted.progress.batchesDone).toBeLessThan(350);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:33: the cursor names a tenant.
        expect(tenants).toContain(w.interrupted.progress.cursor?.tenantId);
        await sleep(150);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:33: the interrupted checkpoint stops advancing.
        expect((await entry(w)).progress).toEqual(w.interrupted.progress);
        const target = await rows(w, 2);
        w.missingOrder = Array.from({ length: 100 }, (_, i) => seeded(i)).find(
          (key) =>
            !target.some(
              (row) => row.tenantId === tenants[1] && row.key === key,
            ),
        );
        w.existingOrder = target.find(
          (row) =>
            row.tenantId === tenants[0] &&
            row.status === "placed" &&
            String(row.key).startsWith("seed-"),
        )?.key as string | undefined;
        await cancel(
          w,
          1,
          required(
            w.missingOrder,
            "a second-tenant order backfill has not written",
          ),
        );
        await cancel(
          w,
          0,
          required(
            w.existingOrder,
            "a first-tenant row read before cancellation",
          ),
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:34: an existing building row is updated immediately by the live cancel.
        expect(
          (await rows(w, 2)).find(
            (row) => row.tenantId === tenants[0] && row.key === w.existingOrder,
          )?.status,
        ).toBe("cancelled");
        // rebuild.sdp.md:69: an existing subject without a building row remains absent until a batch writes it.
        expect(
          (await rows(w, 2)).find(
            (row) => row.tenantId === tenants[1] && row.key === w.missingOrder,
          ),
        ).toBeUndefined();
        const checkpoint = (await entry(w)).progress;
        await backendOf(w).admin.run(
          getFunctionName(internal.rebuild.backfillBatch),
          {
            generationId: id2(w),
            fence: required(w.oldFence, "the replaced fence"),
          },
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: a queued batch under the replaced fence cannot checkpoint,
        // and the interruption it would record is already there.
        expect((await entry(w)).progress).toEqual(checkpoint);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: interrupt changes only the fence, its mark and operator change fields.
        expect(
          without(w.interrupted.generation, [
            "fence",
            "interruptedFence",
            "changedAt",
            "changedBy",
          ]),
        ).toEqual(
          without(required(w.initial, "the start row").generation, [
            "fence",
            "interruptedFence",
            "changedAt",
            "changedBy",
          ]),
        );
        // rebuild.sdp.md:134: the interrupt replaces the fence, marks it as its own and records the operator.
        expect(w.interrupted.generation).toMatchObject({
          fence: required(w.oldFence, "the original fence") + 1,
          interruptedFence: required(w.oldFence, "the original fence") + 1,
          changedBy: "interrupt operator",
        });
        await backendOf(w).admin.run(
          getFunctionName(internal.rebuild.resumeGeneration),
          { generationId: id2(w), operator: "resume operator" },
        );
        w.resumed = await entry(w);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: resume changes only fence and operator change fields.
        expect(
          without(w.resumed.generation, ["fence", "changedAt", "changedBy"]),
        ).toEqual(
          without(w.interrupted.generation, [
            "fence",
            "changedAt",
            "changedBy",
          ]),
        );
        // rebuild.sdp.md:131: resume replaces the fence and keeps the batch size.
        expect(w.resumed).toMatchObject({
          generation: {
            fence: w.interrupted.generation.fence + 1,
            changedBy: "resume operator",
          },
          progress: { batchSize: 1 },
        });
        // rebuild.sdp.md:131: resume clears the interrupt error.
        expect(w.resumed.progress.lastError).toBeUndefined();
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: each operator change records a new time.
        expect(Number(w.interrupted.generation.changedAt)).toBeGreaterThan(
          Number(required(w.initial, "the start row").generation.changedAt),
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: resume records its own time.
        expect(Number(w.resumed.generation.changedAt)).toBeGreaterThan(
          Number(w.interrupted.generation.changedAt),
        );
        const resumedAt = w.cursors.length;
        startLive(w);
        w.verified = await waitForGeneration(
          backendOf(w),
          readModel,
          id2(w),
          undefined,
          (entry) => observe(w, entry),
        );
        await stopLive(w);
        w.batchEnd = (await backendOf(w).admin.logMark()).cursorMs;
        w.subjectsAtVerified = await subjects(w);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: the backfill cursor visits the first tenant before the second.
        expect(w.cursors.indexOf(tenants[0])).toBeGreaterThanOrEqual(0);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: the cursor crosses to the second tenant after resume.
        expect(w.cursors.indexOf(tenants[1])).toBeGreaterThan(
          w.cursors.indexOf(tenants[0]),
        );
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: after the resume the cursor names the second tenant.
        expect(w.cursors.slice(resumedAt)).toContain(tenants[1]);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:35: after the resume it never returns to the first tenant once it left it.
        const afterResume = w.cursors.slice(resumedAt);
        expect(
          afterResume.slice(afterResume.indexOf(tenants[1])),
        ).not.toContain(tenants[0]);
        // rebuild.online-rebuild-interrupt-resume.sdp.md:34: the second tenant's interrupted cancel survives whichever pass wrote its row.
        expect(
          (await rows(w, 2)).find(
            (row) => row.tenantId === tenants[1] && row.key === w.missingOrder,
          )?.status,
        ).toBe("cancelled");
        // rebuild.online-rebuild-interrupt-resume.sdp.md:36: batches alter only state on the generation row.
        expect(without(w.verified.generation, ["state"])).toEqual(
          without(w.resumed.generation, ["state"]),
        );
      },
    "no row of the new generation holds data older than its source stream version":
      (w) => assertCoverage(w, 2),
    "the new generation {coverage}": async (w) => {
      // rebuild.online-rebuild-interrupt-resume.sdp.md:35: both passes have ended before cutover.
      expect(required(w.verified, "verified generation")).toMatchObject({
        generation: { state: "verified" },
        progress: { pass: "idle", cursor: null },
      });
    },
    "no command or external effect ran during the rebuild": async (w) => {
      await assertJournals(w);
      await assertLog(w);
    },
    "the active generation {cutover}": async (w) => {
      await subscribe(w);
      await switchAndObserve(w, id2(w));
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: the first switch retires generation 1 and activates generation 2.
      expect(
        (await generations(backendOf(w), readModel)).map(({ generation }) => [
          generation.generation,
          generation.state,
        ]),
      ).toEqual([
        [2, "active"],
        [1, "retired"],
      ]);
      await place(w, 0, "after-switch");
      const old = w.watches[0]!.values.at(-1)!.page.find(
        (row) => row.status === "placed" && row.key.startsWith("seed-"),
      );
      const cancelled = String(required(old, "an earlier placed order").key);
      await cancel(w, 0, cancelled);
      await w.watches[0]!.until(
        (page) => !page.page.some((row) => row.key === cancelled),
        "the live writes before rollback",
      );
      const retiredRows = await rows(w, 1);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37; rebuild.sdp.md:74: the retired generation was not written by the new order.
      expect(
        retiredRows.find(
          (row) => row.tenantId === tenants[0] && row.key === "after-switch",
        ),
      ).toBeUndefined();
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37; rebuild.sdp.md:74: the retired row still needs its cancellation repaired.
      expect(
        retiredRows.find(
          (row) => row.tenantId === tenants[0] && row.key === cancelled,
        )?.status,
      ).toBe("placed");
      const generation1 = required(w.generation1, "generation 1");
      const before = await entry(w, generation1);
      const expectedBatches = await verifyBatchCount(
        w,
        before.progress.batchSize,
      );
      const rollbackMark = await backendOf(w).admin.logMark();
      await backendOf(w).admin.run(
        getFunctionName(internal.rebuild.rollbackGeneration),
        { generationId: generation1, operator },
      );
      const verified = await waitForGeneration(
        backendOf(w),
        readModel,
        generation1,
        undefined,
        () => drain(w),
      );
      const completions = await backendOf(w).admin.completionsSince(
        rollbackMark,
        (seen) =>
          seen.some((record) => record.identifier === "rebuild:verifyBatch"),
      );
      for (const completion of completions)
        w.log.set(completion.executionId, completion as Execution);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: rollback runs only verify batches, never a backfill pass.
      expect(
        completions.filter(
          (record) => record.identifier === "rebuild:backfillBatch",
        ),
      ).toEqual([]);
      // rebuild.sdp.md:134: rollback retains generation 1's batch size and cumulative counts.
      expect(verified.progress.batchSize).toBe(before.progress.batchSize);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: every checkpoint in rollback is one committed verify batch.
      expect(verified.progress.batchesDone - before.progress.batchesDone).toBe(
        completions.filter(
          (record) =>
            record.identifier === "rebuild:verifyBatch" &&
            !(record as Execution).willRetry &&
            record.error === null,
        ).length,
      );
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37; rebuild.sdp.md:127: exactly one verify pass, at generation 1's retained size.
      expect(verified.progress.batchesDone - before.progress.batchesDone).toBe(
        expectedBatches,
      );
      await assertCoverage(w, 1);
      const repaired = await rows(w, 1);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: rollback repairs the new order before activation.
      expect(repaired).toContainEqual(
        expect.objectContaining({
          tenantId: tenants[0],
          key: "after-switch",
          status: "placed",
        }),
      );
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: rollback repairs the cancellation before activation.
      expect(repaired).toContainEqual(
        expect.objectContaining({
          tenantId: tenants[0],
          key: cancelled,
          status: "cancelled",
        }),
      );
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: the repaired generation is verified, while generation 2 still serves queries.
      expect(
        (await generations(backendOf(w), readModel)).map(({ generation }) => [
          generation.generation,
          generation.state,
        ]),
      ).toEqual([
        [2, "active"],
        [1, "verified"],
      ]);
      await switchAndObserve(w, generation1);
      // rebuild.online-rebuild-interrupt-resume.sdp.md:37: the return switch activates generation 1 and retires generation 2.
      expect(
        (await generations(backendOf(w), readModel)).map(({ generation }) => [
          generation.generation,
          generation.state,
        ]),
      ).toEqual([
        [2, "retired"],
        [1, "active"],
      ]);
    },
    "writes {writes}": async (w) => {
      // rebuild.online-rebuild-interrupt-resume.sdp.md:33,36: both ordinary callers placed and cancelled orders while batches ran.
      expect(w.liveCounts.every((count) => count >= 2)).toBe(true);
      await assertJournals(w);
      await assertLog(w);
    },
  },
);
