import { execFileSync } from "node:child_process";
import { arch, platform, release } from "node:os";
import { readFileSync } from "node:fs";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { api, internal } from "../../example/convex/_generated/api.js";
import schema from "../../example/convex/schema.js";
import { contextTables } from "../../src/context/index.js";
import type { CompletionRecord, LogMark } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import type { JsonValue } from "../../harness/evidence.js";
import { measure, required } from "../../harness/native.js";
import { localWriteRateBytesPerSecond } from "../../harness/local-write-rate.js";
import {
  application,
  configurationIs,
  grantedPermissions,
  orderLines,
  placeOrderIdentifier,
  subject,
  tenantId,
  usageKeys,
  usageOf,
  type ExperimentWorld,
  type Usage,
} from "./first-experiment-steps.js";
import {
  rowCounts,
  stored,
  type OrderArgs,
  type Stored,
} from "./place-order-attribution.js";

export type ExecutionRecord = CompletionRecord & {
  willRetry: boolean;
  occInfo: {
    tableName: string;
    componentPath: string | null;
    retryCount: number;
  } | null;
};
// The table an optimistic-concurrency conflict named, with the component that holds it.
const occTable = (record: ExecutionRecord) =>
  record.occInfo === null
    ? []
    : [
        record.occInfo.componentPath === null
          ? record.occInfo.tableName
          : `${record.occInfo.componentPath}:${record.occInfo.tableName}`,
      ];
export type Answer = {
  kind: string;
  code: string | null;
  replayed: boolean;
  value: JsonValue;
};
export const json = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;
export const pad = (n: number) => String(n).padStart(3, "0");
export const writeCap = localWriteRateBytesPerSecond;
export async function setup(): Promise<ExperimentWorld> {
  const world: ExperimentWorld = {};
  await application(world);
  await configurationIs(world, "production configuration");
  return world;
}
export async function seed(
  world: ExperimentWorld,
  args: OrderArgs,
  quantity = 2,
) {
  const client = required(world.client, "client");
  for (let offset = 0; offset < args.input.lines.length; offset += 100)
    await client.mutation(api.receiving.receiveStock, {
      tenantId: args.tenantId,
      input: {
        items: args.input.lines
          .slice(offset, offset + 100)
          .map((line) => ({ stockItemId: line.stockItemId, quantity })),
      },
    });
}
export async function grantTenant(world: ExperimentWorld, tenant: string) {
  const backend = required(world.backend, "backend");
  for (const permission of grantedPermissions)
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId: tenant,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|${subject}`,
      permission,
      grantedBy: "native-test",
    });
}
export function order(
  lines: number,
  index?: number,
  tenant = tenantId,
): OrderArgs {
  const orderId = index === undefined ? "order-1" : `ord-${pad(index)}`;
  return {
    tenantId: tenant,
    requestKey: `k-${orderId}`,
    input: {
      orderId,
      lines: orderLines(lines, index === undefined ? "sku" : pad(index)),
    },
  };
}
export async function send(
  world: ExperimentWorld,
  args: OrderArgs,
): Promise<Answer> {
  try {
    const value = await required(world.client, "client").mutation(
      api.ordering.placeOrder,
      args,
      { skipQueue: true },
    );
    return {
      kind: value.kind,
      code: null,
      replayed: value.replayed,
      value: json(value),
    };
  } catch (error) {
    const value =
      error instanceof ConvexError
        ? json(error.data)
        : { message: String(error) };
    const data = value as { kind?: string; code?: string };
    return {
      kind: data.kind ?? "technicalFailure",
      code: data.code ?? null,
      replayed: false,
      value,
    };
  }
}
export const isOwn = (record: CompletionRecord) =>
  record.identifier === placeOrderIdentifier && record.componentPath === null;
export const finals = (records: readonly CompletionRecord[]) =>
  records
    .filter(isOwn)
    .filter((record) => (record as ExecutionRecord).willRetry === false);
export function collect(
  backend: Backend,
  mark: LogMark,
  count: () => number,
  done: () => boolean = () => true,
  timeout = 30000,
) {
  return backend.admin.completionsSince(
    mark,
    (records) => done() && finals(records).length >= count(),
    timeout,
  );
}
const sumUsage = (records: readonly CompletionRecord[]): Usage =>
  Object.fromEntries(
    usageKeys.map((key) => [
      key,
      records.reduce((sum, record) => sum + usageOf(record)[key], 0),
    ]),
  ) as Usage;
const packageVersion = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        new URL(`../../node_modules/${name}/package.json`, import.meta.url),
        "utf8",
      ),
    ) as { version: string }
  ).version;
export function pins(backend: Backend) {
  return {
    tier: "native backend",
    environment: "local backend",
    backend: backend.facts().executable,
    convex: packageVersion("convex"),
    convexHelpers: packageVersion("convex-helpers"),
    convexTest: packageVersion("convex-test"),
    node: process.version,
    operatingSystem: `${platform()} ${release()} ${arch()}`,
  };
}
export async function schedules(backend: Backend) {
  const entries = await Promise.all(
    [undefined, "orders", "inventory"].map(
      async (component) =>
        [
          component ?? "parent",
          (
            await backend.admin.readTable(
              "_scheduled_functions",
              component === undefined ? {} : { component },
            )
          ).length,
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}
// Rows left behind are counted over every table the production composition deploys; markers, the
// gate and audit records are reported as not deployed only while neither schema declares a table.
export function leftBehind(before: Stored, after: Stored) {
  expect(Object.keys(schema.tables).sort()).toEqual([
    "generations",
    "grants",
    "orderSummaries",
    "receipts",
  ]);
  expect(Object.keys(contextTables).sort()).toEqual(["events", "streams"]);
  return {
    generations: {
      before: before.generations.length,
      after: after.generations.length,
      created: after.generations.filter(
        (row) => !before.generations.some((prior) => prior._id === row._id),
      ).length,
    },
    markers: "not deployed",
    gate: "not deployed",
    audit: "not deployed",
  };
}
// A complete experiment record, distinct from the harness's name/value Measurement envelope.
export function recordMeasurement(
  world: ExperimentWorld,
  options: {
    dataset: string;
    lines: number;
    contention: number;
    path: string;
    answers: Answer[];
    records: CompletionRecord[];
    before: Stored;
    after: Stored;
    extra?: Record<string, JsonValue>;
  },
) {
  const backend = required(world.backend, "backend");
  const own = options.records.filter(isOwn) as ExecutionRecord[];
  const completed = finals(own) as ExecutionRecord[];
  const requests = [...new Set(own.map((record) => record.requestId))].map(
    (requestId) => {
      const executions = own.filter((record) => record.requestId === requestId);
      const final = required(
        executions.find((record) => record.willRetry === false),
        "final completion",
      );
      const reruns = executions.filter((record) => record.willRetry);
      return {
        requestId,
        executions: executions.length,
        finalOutcomes: 1,
        finalError: final.error,
        engineReruns: reruns.length,
        occTables: [...new Set(executions.flatMap(occTable))],
        usageStats: sumUsage(executions),
        finalUsageStats: usageOf(final),
        rerunUsageStats: sumUsage(reruns),
        latencyMs: final.executionTime * 1000,
        completionRecords: executions,
      };
    },
  );
  const outcomeCounts = {
    applied: options.answers.filter(
      (answer) => answer.kind === "applied" && !answer.replayed,
    ).length,
    duplicates: options.answers.filter((answer) => answer.replayed).length,
    rejected: options.answers.filter((answer) => answer.kind === "rejection")
      .length,
    businessFailure: options.answers.filter(
      (answer) => answer.kind === "businessFailure",
    ).length,
    technicalFailure: options.answers.filter(
      (answer) => answer.kind === "technicalFailure",
    ).length,
    transientRefusal: options.answers.filter(
      (answer) => answer.kind === "transient",
    ).length,
  };
  const value = {
    recordType: "Measurement",
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    pins: pins(backend),
    configuration: "production",
    identitySource: "fixture-issuer",
    installedLayers: backend.facts().installedLayers,
    dataset: options.dataset,
    command: "PlaceOrder",
    lines: options.lines,
    contention: options.contention,
    path: options.path,
    otherExecutions: options.records.filter(
      (record) =>
        !isOwn(record) && record.identifier !== "readModels:listOrderSummaries",
    ),
    submittedCommands: options.answers.length,
    executions: own.length,
    finalOutcomes: completed.length,
    outcomeCounts,
    topLevelCommits: completed.filter((record) => record.error === null).length,
    functionCalls: own.length,
    componentCalls: "not exposed",
    rolledBackWrites: "not exposed",
    writeSetFromLog: "not exposed",
    usageStats: sumUsage(own),
    finalUsageStats: sumUsage(completed),
    rerunUsageStats: sumUsage(own.filter((record) => record.willRetry)),
    engineReruns: own.filter((record) => record.willRetry).length,
    engineFailedCommands: completed.filter((record) => record.occInfo !== null)
      .length,
    occTables: [...new Set(own.flatMap(occTable))],
    rowsBefore: rowCounts(options.before),
    rowsAfter: rowCounts(options.after),
    rowsLeftBehind: leftBehind(options.before, options.after),
    requests,
    callerAnswers: options.answers,
    requestToInput:
      "not exposed by HTTP response; concurrent answers are not paired by order",
    writeCapBytesPerSecond: writeCap,
    timingReading: "taken under load",
    latencyDistribution: null,
    throughput: null,
    ...options.extra,
  };
  measure("Measurement", json(value));
  // A terminal record per submitted command is also the log-completeness check.
  expect(completed).toHaveLength(options.answers.length);
  expect(requests).toHaveLength(options.answers.length);
  expect(new Set(own.map((record) => record.executionId)).size).toBe(
    own.length,
  );
  for (const request of requests) {
    expect(
      request.completionRecords.filter((record) => !record.willRetry),
    ).toHaveLength(1);
    // The engine numbers the executions it refused at commit, so its own count agrees with ours.
    expect(
      request.completionRecords
        .filter((record) => record.willRetry)
        .map((record) => record.occInfo?.retryCount),
    ).toEqual(request.completionRecords.slice(0, -1).map((_, index) => index));
    expect(request.completionRecords.at(-1)?.willRetry).toBe(false);
    for (const record of request.completionRecords) {
      expect(typeof record.willRetry).toBe("boolean");
      expect(record).toHaveProperty("occInfo");
      if (record.willRetry) {
        expect(record.occInfo).not.toBeNull();
        expect(typeof record.occInfo?.tableName).toBe("string");
        expect(record.error).toBeNull();
      }
      if (record.error !== null || record.willRetry) {
        expect(usageOf(record).databaseWriteDocuments).toBe(0);
        expect(usageOf(record).databaseWriteBytes).toBe(0);
      }
      for (const count of Object.values(usageOf(record)))
        expect(count).toBeGreaterThanOrEqual(0);
    }
  }
  return value;
}
export async function measured(
  world: ExperimentWorld,
  args: OrderArgs[],
  dataset: string,
  path: string,
  contention = 0,
  extra: Record<string, JsonValue> = {},
) {
  const backend = required(world.backend, "backend");
  const before = await stored(backend);
  const mark = await backend.admin.logMark();
  const answers = await Promise.all(args.map((arg) => send(world, arg)));
  // Close the interval with ordinary essential reads, one per tenant, before inspecting tables.
  const summaries: Record<string, string[]> = {};
  for (const tenant of new Set(args.map((arg) => arg.tenantId))) {
    let cursor: string | null = null;
    const keys: string[] = [];
    for (;;) {
      const page: FunctionReturnType<typeof api.readModels.listOrderSummaries> =
        await required(world.client, "client").query(
          api.readModels.listOrderSummaries,
          {
            tenantId: tenant,
            status: "placed" as const,
            paginationOpts: { cursor, numItems: 100 },
          },
        );
      keys.push(...page.page.map((row) => row.key));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    summaries[tenant] = keys;
  }
  const records = await backend.admin.completionsSince(
    mark,
    (entries) =>
      finals(entries).length >= args.length &&
      entries.filter(
        (record) => record.identifier === "readModels:listOrderSummaries",
      ).length >= Object.keys(summaries).length,
    30000,
  );
  const after = await stored(backend);
  const scheduled = await schedules(backend);
  const others = records.filter(
    (record) =>
      !isOwn(record) && record.identifier !== "readModels:listOrderSummaries",
  );
  const value = recordMeasurement(world, {
    dataset,
    lines: required(args[0], "first command").input.lines.length,
    contention,
    path,
    answers,
    records,
    before,
    after,
    extra: {
      scheduledFunctions: scheduled,
      otherExecutions: json(others),
      summaryKeys: summaries,
      submittedInputs: json(args),
      ...extra,
    },
  });
  expect(others).toEqual([]);
  expect(scheduled).toEqual({ parent: 0, orders: 0, inventory: 0 });
  expect(after.grants).toEqual(before.grants);
  expect(after.generations).toEqual(before.generations);
  for (const [index, answer] of answers.entries()) {
    if (answer.kind !== "applied") continue;
    const arg = required(args[index], "command");
    expect(summaries[arg.tenantId]).toContain(arg.input.orderId);
  }
  return {
    value,
    before,
    after,
    answers,
    records: records.filter(isOwn) as ExecutionRecord[],
  };
}
export function expectUsage(
  record: CompletionRecord,
  [reads, writes, readBytes, writeBytes]: readonly [
    number,
    number,
    number,
    number,
  ],
) {
  expect(usageOf(record)).toMatchObject({
    databaseReadDocuments: reads,
    databaseWriteDocuments: writes,
    databaseReadBytes: readBytes,
    databaseWriteBytes: writeBytes,
    databaseWriteIndexRows: required(
      ({ 0: 0, 6: 25, 24: 97, 204: 817 } as Record<number, number>)[writes],
      "expected index writes",
    ),
  });
}
export const healthyUsage = {
  1: [8, 6, 2943, 4271],
  10: [35, 24, 14454, 18410],
  100: [305, 204, 129564, 159800],
} as const;

export type PlaceOrderMeasurement = ReturnType<typeof recordMeasurement>;
