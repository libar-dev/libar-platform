import { installOrderSummary } from "./rebuild-install.js";
import { expect } from "vitest";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Value } from "convex/values";
import type { Backend } from "../../harness/backend.js";
import { measure } from "../../harness/native.js";
import { paceAfterWrite } from "../../harness/wait.js";
import { archiveEntries } from "./backup-archive-entries.js";
import {
  initialize,
  schedulerRows,
  dataRows,
  record,
} from "./scheduler-composition.js";
import {
  grant,
  grantedPermissions,
  subject,
} from "./first-experiment-steps.js";
import { ordinaryClient } from "../../harness/clients.js";
import { api } from "../../example/convex/_generated/api.js";
export interface SchedulerWorld<T> {
  backend?: Backend;
  directory?: string;
  observation?: T;
}
export async function statesCase(backend: Backend) {
  await initialize(backend, Date.now() + 3600000);
  const before = await schedulerRows(backend);
  record("scheduler states", before);
  const intervalStart = Date.now();
  await sleep(1500);
  const after = await schedulerRows(backend);
  record("retention observation", {
    intervalStart,
    observedAt: Date.now(),
    rows: after,
  });
  return { before, after };
}
interface Attempt {
  size: number;
  count: number;
  character: string;
  parts: number;
  returned?: number;
  error: string | null;
  stage: string;
  utf8Bytes: number;
  jsonBytes: number;
  countedBytes?: number;
  trim: number;
  logLines: string[];
  mutationReturned: boolean;
}
export async function argumentsCase(backend: Backend) {
  const attempts: Attempt[] = [];
  async function attempt(
    size: number,
    count = 1,
    character = "a",
    parts = 1,
    trim = 0,
  ) {
    const value = character.repeat(size);
    const payload =
      parts === 1
        ? value
        : Array.from({ length: parts }, (_, i) =>
            i === parts - 1 ? value.slice(0, value.length - trim) : value,
          );
    const input = { size, count, character, parts, trim };
    const observed: Attempt = {
      ...input,
      error: null,
      logLines: [],
      mutationReturned: false,
      stage: "committed",
      utf8Bytes:
        (Buffer.byteLength(value) * parts -
          Buffer.byteLength(character) * trim) *
        count,
      jsonBytes: Buffer.byteLength(JSON.stringify({ payload })) * count,
    };
    const mark = await backend.admin.logMark();
    try {
      const result = (await backend.admin.run(
        "scheduling:argumentsLimit",
        input,
      )) as {
        returned: number;
        error: string | null;
        metrics: { scheduledFunctionArgsBytes: { used: number } };
      };
      Object.assign(observed, {
        mutationReturned: true,
        returned: result.returned,
        countedBytes: result.metrics.scheduledFunctionArgsBytes.used,
        error: result.error,
        stage: result.error === null ? "committed" : "runAfter",
      });
      record("argument metrics", result.metrics);
    } catch (error) {
      observed.error = String(error);
      observed.stage = "commit or uncatchable syscall";
    }
    const completions = await backend.admin.completionsSince(mark, (rows) =>
      rows.some((row) => row.identifier === "scheduling:argumentsLimit"),
    );
    observed.logLines = completions
      .filter((row) => row.identifier === "scheduling:argumentsLimit")
      .flatMap((row) => row.logLines);
    record("argument completion records", completions as unknown as Value);
    attempts.push(observed);
    measure("argument attempt", { ...observed });
    await paceAfterWrite(Math.min(observed.utf8Bytes + 1024, 17 * 1024 * 1024));
    return observed;
  }
  for (const boundary of [
    4 * 1024 * 1024,
    8000000,
    8 * 1024 * 1024,
    16 * 1024 * 1024,
  ])
    for (const delta of [-64, 64]) await attempt(boundary + delta);
  await attempt(4 * 1024 * 1024 - 16);
  await attempt(4 * 1024 * 1024);
  await attempt(2 * 1024 * 1024 - 32, 1, "é");
  await attempt(2 * 1024 * 1024 + 32, 1, "é");
  await attempt(4 * 1024 - 4, 1, "a", 1024);
  await attempt(4 * 1024, 1, "a", 1024);
  for (const boundary of [8000000, 8 * 1024 * 1024, 16 * 1024 * 1024])
    for (const delta of [-256, 256])
      await attempt(Math.floor((boundary + delta) / 8), 8);
  for (const character of ["a", "é", "😀", "\n", '"'])
    for (const parts of [1, 2, 1024]) await attempt(3, 1, character, parts);
  await attempt(8000000);
  await attempt(8388608);
  for (const accounted of [4194254, 4194304, 4194305])
    await attempt(accounted - 14);
  // Find the warning onset without assuming that it equals the named limit.
  let quiet = 14;
  let warned = 4194254;
  while (warned - quiet > 1) {
    const accounted = Math.floor((quiet + warned) / 2);
    const observed = await attempt(accounted - 14);
    if (
      observed.logLines.some((line) =>
        line.includes("Large arguments for a single scheduled function"),
      )
    )
      warned = accounted;
    else quiet = accounted;
  }
  const warningBefore = await attempt(quiet - 14);
  const warningFirst = await attempt(warned - 14);
  const exact = await attempt(16 * 1024 * 1024 - 14);
  const over = await attempt(16 * 1024 * 1024 - 13);
  const multibyte = await attempt((16 * 1024 * 1024 - 14) / 2, 1, "é");
  const multibyteOver = await attempt((16 * 1024 * 1024 - 14) / 2 + 1, 1, "é");
  const many = await attempt(16382, 1, "a", 1024, 14);
  const manyOver = await attempt(16382, 1, "a", 1024, 13);
  const sum = await attempt(2 * 1024 * 1024 - 14, 8);
  const sumOver = await attempt(2 * 1024 * 1024 - 13, 8);
  record(
    "argument boundary summary",
    attempts.map((a) => ({ ...a })),
  );
  return {
    attempts,
    exact,
    over,
    multibyte,
    multibyteOver,
    many,
    manyOver,
    sum,
    sumOver,
    warningBefore,
    warningFirst,
  };
}

export async function scanCase(backend: Backend) {
  await backend.admin.writeTable("schedulerData", {
    insert: { value: "local", held: true },
  });
  await backend.admin.run("scheduling:states", {
    label: "local",
    due: Date.now() + 3600000,
  });
  await expect
    .poll(
      async () => (await backend.admin.readTable("schedulerEffects")).length,
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await backend.admin.readTable("_scheduled_functions")).filter(
          (r) => (r.state as { kind: string }).kind === "failed",
        ).length,
    )
    .toBe(1);
  async function scan(outstanding: number) {
    const mark = await backend.admin.logMark();
    let answer: Value = null;
    let error: string | null = null;
    try {
      answer = await backend.admin.run("scheduling:scan");
    } catch (caught) {
      error = String(caught);
    }
    record("scan observation", {
      totalRows: outstanding,
      outstanding: outstanding - 3,
      pending: outstanding - 4,
      answer,
      error,
    });
    const logs = await backend.admin.completionsSince(mark, (logs) =>
      logs.some((l) => l.identifier.includes("scheduling:scan")),
    );
    measure(
      "scan completion usage",
      logs.map((l) => ({
        identifier: l.identifier,
        usageStats: l.usageStats,
        error: l.error,
      })),
    );
    return {
      answer: answer as {
        rows: Value[];
        before: Record<
          "documentsRead" | "bytesRead" | "databaseQueries",
          { used: number }
        >;
        after: Record<
          "documentsRead" | "bytesRead" | "databaseQueries",
          { used: number }
        >;
      } | null,
      error,
    };
  }
  const first = await scan(5);
  expect(first.answer?.rows).toHaveLength(1);
  let count = 5;
  const observations = [];
  const plain = [];
  for (const target of [1000, 4090, 4091, 4092, 4096, 32000, 32001]) {
    while (count < target) {
      const batch = Math.min(500, target - count);
      await backend.admin.run("scheduling:populate", { count: batch });
      count += batch;
    }
    const observed = await scan(count);
    observations.push({ count, ...observed });
    if (target === 4091 || target === 4092) {
      let rows: Value = null;
      let error: string | null = null;
      try {
        rows = await backend.admin.run("scheduling:scanPlain");
      } catch (caught) {
        error = String(caught);
      }
      record("plain scan observation", {
        totalRows: target,
        outstanding: target - 3,
        rows,
        error,
      });
      plain.push({ count: target, rows, error });
    }
  }
  const actualRows = (await backend.admin.readTable("_scheduled_functions"))
    .length;
  measure("scheduler rows after scan boundary", {
    total: actualRows,
    outstanding: actualRows - 3,
  });
  expect(actualRows).toBe(32001);
  return { first, observations, plain, actualRows };
}

async function productionData(backend: Backend) {
  await grant(backend, subject, grantedPermissions);
  await installOrderSummary(backend);
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku", quantity: 3 }] },
  });
  await client.mutation(api.ordering.placeOrder, {
    tenantId: "t-1",
    requestKey: "order",
    input: {
      orderId: "order",
      lines: [{ stockItemId: "sku", quantity: 1, unitPrice: 10 }],
    },
  });
}
export async function placeAdditionalOrder(backend: Backend) {
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
  await client.mutation(api.receiving.receiveStock, {
    tenantId: "t-1",
    input: { items: [{ stockItemId: "sku", quantity: 2 }] },
  });
  await client.mutation(api.ordering.placeOrder, {
    tenantId: "t-1",
    requestKey: "another-order",
    input: {
      orderId: "another-order",
      lines: [{ stockItemId: "sku", quantity: 1, unitPrice: 10 }],
    },
  });
}
export async function exportData(
  backend: Backend,
  directory: string,
  due: number,
) {
  await productionData(backend);
  await initialize(backend, due);
  await backend.admin.setEnvironment({ SCHEDULER_VALUE: "exported" });
  record("source environment", await backend.admin.environment());
  const data = await dataRows(backend);
  const schedules = await schedulerRows(backend);
  record("exported data", data);
  record("exported schedules", schedules);
  const path = join(directory, "backup-archive.zip");
  await backend.admin.exportBackupArchive(path);
  const entries = await archiveEntries(path);
  measure("archive entries", entries);
  for (const entry of [
    "receipts/documents.jsonl",
    "orderSummaries/documents.jsonl",
    "_components/orders/streams/documents.jsonl",
    "_components/orders/events/documents.jsonl",
    "_components/inventory/streams/documents.jsonl",
    "_components/inventory/events/documents.jsonl",
  ])
    expect(entries).toContain(entry);
  expect(entries.some((e) => e.includes("_scheduled_functions"))).toBe(false);
  expect(await dataRows(backend)).toEqual(data);
  expect(await schedulerRows(backend)).toEqual(schedules);
  return { data, schedules, path };
}
