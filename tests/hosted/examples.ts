// The steps of the four hosted examples, which the hosted driver runs in order on the one hosted
// deployment. Each example asserts only on what its own run wrote, or on what the copy's table
// plantedSchedules says an earlier run planted.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFunctionName } from "convex/server";
import type { FunctionReturnType } from "convex/server";
import { convexToJson } from "convex/values";
import type { Value } from "convex/values";
import { expect, inject, onTestFinished } from "vitest";
import {
  api as productionApi,
  internal as productionInternal,
} from "../../example/convex/_generated/api.js";
import { placeOrderPermission } from "../../example/convex/ordering.js";
import { receiveStockPermission } from "../../example/convex/receiving.js";
import { api as fixtureApi } from "../../fixture/convex/_generated/api.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import type { HostedUsage } from "../../harness/evidence.js";
import { hostedBackend, measure, required } from "../../harness/native.js";
import type { HostedBackend } from "../../harness/native.js";
import { archiveEntries } from "../native/backup-archive-entries.js";
import { installOrderSummary, generations } from "../native/rebuild-install.js";
import {
  copyScopes,
  hostedCopy,
  plantSchedules,
  scopeOptions,
  type CopyScope,
} from "./copy.js";
type Row = Record<string, Value>;
const measureValue = (name: string, value: unknown) =>
  measure(name, convexToJson(value as Value));
const startedAt = () => inject("hostedRun").startedAt;
// A run's own name in the rows it writes, so that a kept dataset never mixes two runs.
export const runId = () => startedAt().replace(/[^0-9]/g, "");
async function deployCopy(backend: HostedBackend) {
  const copy = await hostedCopy();
  measure("temporary deployment", {
    ...copy.added,
    ...(await backend.admin.deployTemporary(copy.directory)),
  });
}

// Probe 7's retention example.
export interface RetentionWorld {
  backend?: HostedBackend;
  readNothing?: boolean;
  earlier?: Row[];
  observations?: {
    scheduledId: string;
    planted: string;
    startedAt: string;
    state: Value;
    completedTime: Value;
    imports: Value;
    ageMs: number | null;
    read: boolean;
  }[];
  own?: Row[];
}
export async function retentionDeployment(world: RetentionWorld) {
  world.backend = await hostedBackend({ deploy: false });
}
// Reads before any deploy or import, then deploys the copy and plants. A deployment that holds no
// planting record yet answers a read of the table as missing, and the run records that it read
// nothing.
export async function readThenPlant(world: RetentionWorld) {
  const backend = required(world.backend, "the hosted backend");
  let earlier: Row[] = [];
  try {
    earlier = await backend.admin.readTable("plantedSchedules");
    world.readNothing = earlier.length === 0;
  } catch (error) {
    if (!String(error).includes('No table "plantedSchedules"')) throw error;
    world.readNothing = true;
  }
  const scheduled = await backend.admin.readTable("_scheduled_functions");
  const readAt = Date.now();
  const present = new Set(scheduled.map((row) => String(row._id)));
  world.earlier = earlier;
  world.observations = earlier.map((record) => ({
    scheduledId: String(record.scheduledId),
    planted: String(record.planted),
    startedAt: String(record.startedAt),
    state: record.state ?? null,
    completedTime: record.completedTime ?? null,
    imports: record.imports ?? null,
    ageMs:
      typeof record.completedTime === "number"
        ? readAt - record.completedTime
        : null,
    read: present.has(String(record.scheduledId)),
  }));
  measureValue("planting records read", {
    readAt: new Date(readAt).toISOString(),
    readNothing: world.readNothing,
    observations: world.observations,
  });
  await deployCopy(backend);
  await plantSchedules(backend, startedAt());
  const ownIds = new Set(
    (await backend.admin.readTable("plantedSchedules"))
      .filter((record) => record.startedAt === startedAt())
      .map((record) => String(record.scheduledId)),
  );
  world.own = (await backend.admin.readTable("_scheduled_functions")).filter(
    (row) => ownIds.has(String(row._id)),
  );
  measureValue("own planted schedules", world.own);
}
export function earlierRecorded(world: RetentionWorld, recorded: boolean) {
  const earlier = required(world.earlier, "the earlier planting records");
  const observations = required(world.observations, "the observations");
  expect(
    observations.length === earlier.length &&
      observations.every(
        (observation) =>
          typeof observation.read === "boolean" &&
          (typeof observation.ageMs === "number" ||
            observation.completedTime === null),
      ),
  ).toBe(recorded);
}
export function ownStates(
  world: RetentionWorld,
  states: string,
  completedTime: boolean,
) {
  const own = required(world.own, "the run's own schedules");
  expect(own.map((row) => (row.state as { kind: string }).kind).sort()).toEqual(
    states.split(",").sort(),
  );
  for (const row of own)
    expect(typeof row.completedTime === "number").toBe(completedTime);
}

// Probe 7's replacement in place.
// The copy mounts these components beside the parent; a component that another composition's
// deploy left unmounted is not among them.
export const mountedComponents = [
  "annex",
  "annexClock",
  "migrations",
  "depot",
  "yard",
];
const scopeName = (scope: CopyScope) => scope ?? "parent";
// Every user table of the parent and of every mounted component, read whole, keyed by
// scope/table, from the tables a backup archive holds.
async function storedData(backend: Backend, entries: string[]) {
  const data: Record<string, Row[]> = {};
  for (const entry of entries) {
    const match =
      /^(?:_components\/([^/]+)\/)?([^_/][^/]*)\/documents\.jsonl$/.exec(entry);
    if (match === null) continue;
    const [, component, table] = match;
    if (component !== undefined && !mountedComponents.includes(component))
      continue;
    data[`${component ?? "parent"}/${table!}`] = await backend.admin.readTable(
      table!,
      component === undefined ? {} : { component },
    );
  }
  return data;
}
async function schedulerRows(backend: Backend) {
  const rows: Record<string, Row[]> = {};
  for (const scope of copyScopes)
    rows[scopeName(scope)] = await backend.admin.readTable(
      "_scheduled_functions",
      scopeOptions(scope),
    );
  return rows;
}
// The state kinds of the scheduler rows this run's labels name, in one scope.
async function ownKinds(
  backend: Backend,
  scope: CopyScope,
  id: string,
): Promise<string[]> {
  return (
    await backend.admin.readTable("_scheduled_functions", scopeOptions(scope))
  )
    .filter((row) => JSON.stringify(row.args).includes(id))
    .map((row) => (row.state as { kind: string }).kind)
    .sort();
}
async function clearSchedulerTables(backend: Backend) {
  for (const scope of copyScopes)
    for (const table of [
      "schedulerData",
      "schedulerReferences",
      "schedulerEffects",
    ])
      for (const row of await backend.admin.readTable(
        table,
        scopeOptions(scope),
      ))
        await backend.admin.writeTable(
          table,
          { delete: String(row._id) },
          scopeOptions(scope),
        );
}
async function createDocuments(backend: Backend, prefix: string) {
  await backend.admin.run("depotRelay:createDocuments", {
    tenantId: "hosted",
    actor: { kind: "operator", id: "hosted-driver" },
    operation: {
      operationId: prefix,
      causedBy: { kind: "command", commandType: "fixture" },
    },
    input: {
      documents: [1, 2].map((n) => ({
        documentId: `${prefix}-${n}`,
        title: `${prefix} ${n}`,
      })),
    },
  });
  await backend.admin.run("markers:insert", { trial: prefix });
}
export type InPlaceObservation = Awaited<ReturnType<typeof hostedInPlace>>;
export interface InPlaceWorld {
  backend?: HostedBackend;
  directory?: string;
  observation?: InPlaceObservation;
}
// The copy is the one the retention example deployed, so the table plantedSchedules stays in the
// export.
export async function inPlaceDeployment(world: InPlaceWorld) {
  world.backend = await hostedBackend({ deploy: false });
  const directory = await mkdtemp(join(tmpdir(), "libar-hosted-archive-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  world.directory = directory;
}
// Runs the replacement in place with the run's own name in every label it schedules, and with
// pending reactions due a time after the start that leaves room for the export and the import.
export async function hostedInPlace(
  backend: Backend,
  directory: string,
  options: { id: string; dueMs?: number },
) {
  const id = options.id;
  const exportedLabel = `exported:${id}`;
  const laterLabel = `after-export:${id}`;
  // The deployment keeps earlier runs' scheduler tables. The reactions read the first data row,
  // so the run starts them empty.
  await clearSchedulerTables(backend);
  const due = Date.now() + (options.dueMs ?? 180000);
  await createDocuments(backend, `exported-${id}`);
  for (const scope of copyScopes) {
    await backend.admin.writeTable(
      "schedulerData",
      { insert: { value: "exported", held: true } },
      scopeOptions(scope),
    );
    await backend.admin.run(
      "scheduling:states",
      { label: exportedLabel, due },
      scopeOptions(scope),
    );
  }
  for (const scope of copyScopes)
    await expect
      .poll(() => ownKinds(backend, scope, id), { timeout: 60000 })
      .toEqual(["canceled", "failed", "inProgress", "pending", "success"]);
  await backend.admin.setEnvironment({ SCHEDULER_VALUE: "exported" });
  const path = join(directory, "backup-archive.zip");
  await backend.admin.exportBackupArchive(path);
  const entries = await archiveEntries(path);
  measure("backup archive entries", entries);
  expect(entries).toContain("plantedSchedules/documents.jsonl");
  expect(entries.some((entry) => entry.includes("_scheduled_functions"))).toBe(
    false,
  );
  const exported = await storedData(backend, entries);
  measureValue("exported data", exported);

  await createDocuments(backend, `after-export-${id}`);
  for (const scope of copyScopes) {
    const [row] = await backend.admin.readTable(
      "schedulerData",
      scopeOptions(scope),
    );
    await backend.admin.writeTable(
      "schedulerData",
      {
        patch: String(required(row, "the data row")._id),
        fields: { value: "after-export" },
      },
      scopeOptions(scope),
    );
    await backend.admin.run(
      "scheduling:states",
      { label: laterLabel, due },
      scopeOptions(scope),
    );
  }
  for (const scope of copyScopes)
    await expect
      .poll(() => ownKinds(backend, scope, id), { timeout: 60000 })
      .toEqual([
        "canceled",
        "canceled",
        "failed",
        "failed",
        "inProgress",
        "inProgress",
        "pending",
        "pending",
        "success",
        "success",
      ]);
  await backend.admin.setEnvironment({ SCHEDULER_VALUE: "after-export" });
  const environment = await backend.admin.environment();
  const changedData = await storedData(backend, entries);
  measureValue("data before the import", changedData);
  for (const table of [
    "parent/markers",
    "depot/streams",
    "depot/events",
    ...copyScopes.map((scope) => `${scopeName(scope)}/schedulerData`),
  ])
    expect(changedData[table]).not.toEqual(exported[table]);
  const before = await schedulerRows(backend);
  await backend.admin.importBackupArchive(path);
  const importedAt = Date.now();
  expect(importedAt).toBeLessThan(due);
  const after = await schedulerRows(backend);
  const restored = await storedData(backend, entries);
  measureValue("restored data", restored);
  const environmentAfter = await backend.admin.environment();
  // The planting records the import restored count it, read by the next run's retention example.
  await backend.admin.run("planting:countImport", {});

  const references = [];
  for (const scope of copyScopes) {
    const reference = required(
      exported[`${scopeName(scope)}/schedulerReferences`]?.find(
        (row) => row.label === exportedLabel,
      ),
      "the exported scheduler reference",
    );
    const referenceId = String(reference.dispatchId);
    const found = await backend.admin.run(
      "scheduling:reference",
      { id: referenceId, cancel: true },
      scopeOptions(scope),
    );
    const canceled = (
      await backend.admin.readTable("_scheduled_functions", scopeOptions(scope))
    ).find((row) => row._id === referenceId);
    references.push({
      scope: scopeName(scope),
      id: referenceId,
      found,
      canceled,
    });
  }
  const reactions = [];
  for (const scope of copyScopes) {
    await expect
      .poll(
        async () =>
          (
            await backend.admin.readTable(
              "schedulerEffects",
              scopeOptions(scope),
            )
          ).filter((row) => row.label === laterLabel).length,
        { timeout: due - Date.now() + 60000, interval: 1000 },
      )
      .toBe(1);
    const effects = await backend.admin.readTable(
      "schedulerEffects",
      scopeOptions(scope),
    );
    reactions.push({
      scope: scopeName(scope),
      kept: effects.find((row) => row.label === laterLabel),
      effects,
    });
  }
  measureValue("kept reactions", { due, reactions });
  // Every kept schedule has run or is released before the example ends, so that no later example
  // finds one pending or in progress.
  for (const scope of copyScopes)
    for (const row of await backend.admin.readTable(
      "schedulerData",
      scopeOptions(scope),
    ))
      await backend.admin.writeTable(
        "schedulerData",
        { patch: String(row._id), fields: { held: false } },
        scopeOptions(scope),
      );
  for (const scope of copyScopes)
    await expect
      .poll(
        async () =>
          (await ownKinds(backend, scope, id)).filter(
            (kind) => kind === "pending" || kind === "inProgress",
          ),
        { timeout: 60000, interval: 1000 },
      )
      .toEqual([]);
  return {
    exported,
    changedData,
    restored,
    before,
    after,
    environment,
    environmentAfter,
    references,
    reactions,
    due,
    exportedLabel,
    laterLabel,
  };
}

// The production composition's acceptance on the hosted deployment.
export interface AcceptanceWorld {
  backend?: Backend;
  response?: FunctionReturnType<typeof productionApi.ordering.placeOrder>;
  records?: CompletionRecord[];
}
export async function acceptanceDeployment(world: AcceptanceWorld) {
  world.backend = await hostedBackend({
    composition: "production",
    deploy: false,
  });
}
const tenantId = "hosted";
export async function deployAndPlace(
  world: AcceptanceWorld,
  lines: number,
  id: string,
) {
  const backend = required(world.backend, "the hosted backend");
  await backend.admin.deploy();
  const subject = `hosted-${id}`;
  for (const permission of [placeOrderPermission, receiveStockPermission])
    await backend.admin.run(getFunctionName(productionInternal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|${subject}`,
      permission,
      grantedBy: "hosted-driver",
    });
  // The deployment keeps the order summary installed by an earlier run.
  if (
    !(await generations(backend, "orderSummary")).some(
      ({ generation }) => generation.state === "active",
    )
  )
    await installOrderSummary(backend, "hosted-driver");
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
  const items = Array.from({ length: lines }, (_, n) => ({
    stockItemId: `hosted-${id}-${n}`,
    quantity: 1,
    unitPrice: 100,
  }));
  await client.mutation(productionApi.receiving.receiveStock, {
    tenantId,
    input: {
      items: items.map(({ stockItemId }) => ({ stockItemId, quantity: 2 })),
    },
  });
  const mark = await backend.admin.logMark();
  world.response = await client.mutation(productionApi.ordering.placeOrder, {
    tenantId,
    requestKey: `hosted-${id}`,
    input: { orderId: `hosted-${id}`, lines: items },
  });
  const identifier = getFunctionName(productionApi.ordering.placeOrder);
  // The hosted log's retention is not published, so the run reads as it goes and records what it saw.
  world.records = await backend.admin.completionsSince(
    mark,
    (records) => records.some((record) => record.identifier === identifier),
    60000,
  );
  measure("function log after the command", {
    completionRecords: world.records.length,
    identifiers: world.records.map((record) => record.identifier),
  });
}
export function placeOrderRecords(world: AcceptanceWorld): CompletionRecord[] {
  const identifier = getFunctionName(productionApi.ordering.placeOrder);
  return required(world.records, "the function log").filter(
    (record) =>
      record.identifier === identifier && record.componentPath === null,
  );
}

// Probe 3's quota half.
export interface QuotaWorld {
  backend?: HostedBackend;
  reads?: number;
  calls?: number;
  seeds?: FunctionReturnType<typeof fixtureApi.readCost.seed>;
  readings?: { set: string; readings: HostedUsage[] }[];
  added?: { set: string; functionCalls: number }[];
  settled?: { settled: boolean; reasons: string[] };
}
const functionCalls = (usage: HostedUsage): number => {
  const response = usage.response as {
    metrics?: { functionCalls?: { usage?: { current_day?: number } } };
  };
  const value = response.metrics?.functionCalls?.usage?.current_day;
  if (typeof value !== "number")
    throw new Error("The usage reading holds no function calls for the day");
  return value;
};
// Reads the usage until two readings in a row agree on the function calls, and keeps every reading.
async function settledReading(
  backend: HostedBackend,
  readings: HostedUsage[],
): Promise<HostedUsage> {
  let last = await backend.admin.usage();
  readings.push(last);
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const next = await backend.admin.usage();
    readings.push(next);
    if (functionCalls(next) === functionCalls(last)) return next;
    last = next;
  }
  throw new Error("Two usage readings in a row never agreed in 300 s");
}
export async function quotaDeployment(world: QuotaWorld, reads: number) {
  const backend = await hostedBackend({ deploy: false });
  await deployCopy(backend);
  const seeds = await ordinaryClient(backend.url).mutation(
    fixtureApi.readCost.seed,
    {},
  );
  Object.assign(world, { backend, reads, seeds });
}
export async function quotaSets(world: QuotaWorld, calls: number) {
  const backend = required(world.backend, "the hosted backend");
  const client = ordinaryClient(backend.url);
  const seeds = required(world.seeds, "the seeded documents");
  const reads = required(world.reads, "the read count");
  world.calls = calls;
  world.readings = [];
  world.added = [];
  const start: HostedUsage[] = [];
  let before = await settledReading(backend, start);
  world.readings.push({ set: "start", readings: start });
  for (const [index, path] of (
    ["component", "helper", "component"] as const
  ).entries()) {
    for (let call = 0; call < calls; call++)
      await client.mutation(fixtureApi.readCost.viaMutation, {
        ...seeds,
        path,
        reads,
        cacheBuster: Date.now() * 100 + index * calls + call,
      });
    const readings: HostedUsage[] = [];
    const after = await settledReading(backend, readings);
    const set = `${index + 1}: ${path}`;
    world.readings.push({ set, readings });
    world.added.push({
      set,
      functionCalls: functionCalls(after) - functionCalls(before),
    });
    before = after;
  }
  const all = world.readings.flatMap(({ readings }) => readings);
  const [first, second, third] = world.added;
  const reasons = [
    ...(second!.functionCalls === calls
      ? []
      : [`the helper set added ${second!.functionCalls}, not ${calls}`]),
    ...(first!.functionCalls === third!.functionCalls
      ? []
      : [
          `the component sets added ${first!.functionCalls} and ${third!.functionCalls}`,
        ]),
    ...(all.every((reading) => reading.seedStatus === "complete")
      ? []
      : ["a reading's seedStatus was not complete"]),
    ...(all[0]!.readAt.slice(0, 10) === all.at(-1)!.readAt.slice(0, 10)
      ? []
      : ["a UTC day boundary fell between the first and the last reading"]),
  ];
  world.settled = { settled: reasons.length === 0, reasons };
  measure("function calls by set", {
    calls,
    reads,
    added: world.added,
    settled: world.settled,
    readings: world.readings,
  });
}
