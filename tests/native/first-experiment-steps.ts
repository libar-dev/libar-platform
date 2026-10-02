// The steps of spec:application.first-experiment's example space, shared by its native examples. They
// run on the production composition: admin access seeds the grants and runs the order summary's first
// activation as setup, and reads stored documents and the function log; every command and query is
// sent by an ordinary client whose token the fixture issuer signs.
import type { ConvexHttpClient } from "convex/browser";
import {
  getFunctionAddress,
  getFunctionName,
  type FunctionReturnType,
} from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { api, internal } from "../../example/convex/_generated/api.js";
import {
  maxOrderLines,
  maxStockItemIdBytes,
  placeOrderDeclaration,
  placeOrderPermission,
} from "../../example/convex/ordering.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import { receiveStockPermission } from "../../example/convex/receiving.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { measure, productionBackend, required } from "../../harness/native.js";
import { scheduledRows } from "./scheduled-rows.js";
import { utf8Length, type MutationCtx } from "../../src/command/index.js";
export const tenantId = "t-1";
export const subject = "user-1";
const operator = { kind: "operator", id: "native-test" } as const;
export const grantedPermissions = [
  placeOrderPermission,
  receiveStockPermission,
  readOrdersPermission,
  "inventory.read",
];
// The variables the production composition's auth.config.ts reads, the only ones a run sets.
export const authVariables = [
  "AUTH_APPLICATION_ID",
  "AUTH_ISSUER",
  "AUTH_JWKS",
];
export const placeOrderIdentifier = getFunctionName(api.ordering.placeOrder);
const summariesIdentifier = getFunctionName(api.readModels.listOrderSummaries);
// The F13 ceilings of one transaction: 16 MiB and 32,000 documents read, 16 MiB and 16,000
// documents written.
export const ceilings = {
  databaseReadBytes: 16 * 1024 * 1024,
  databaseReadDocuments: 32000,
  databaseWriteBytes: 16 * 1024 * 1024,
  databaseWriteDocuments: 16000,
};
// A bound these examples set on the execution time the backend's log reports for a command. It is
// not the engine's cap on completion time: the engine's limit is on the function's own computation,
// and nested calls draw on a separate budget (F19).
export const reportedExecutionSecondsBound = 1;
export const usageKeys = [
  "databaseReadDocuments",
  "databaseWriteDocuments",
  "databaseReadBytes",
  "databaseWriteBytes",
  "databaseWriteIndexRows",
] as const;
export type Usage = Record<(typeof usageKeys)[number], number>;
export type Size = "1 line" | "10 lines" | "the maximum";
export const linesOf: Record<Size, number> = {
  "1 line": 1,
  "10 lines": 10,
  "the maximum": maxOrderLines,
};
type PlaceOrderResponse = FunctionReturnType<typeof api.ordering.placeOrder>;
type OrderLine = { stockItemId: string; quantity: number; unitPrice: number };
// One PlaceOrder the test sent and what the function log and the summary list showed for it.
export interface Placed {
  orderId: string;
  lines: OrderLine[];
  response: PlaceOrderResponse;
  // The command's own completion record, and every record of its request.
  own: CompletionRecord;
  request: CompletionRecord[];
  // Every record from a mark before the command to the summary list read sent after it returned.
  window: CompletionRecord[];
  summaryKeys: string[];
}
export interface ExperimentWorld {
  backend?: Backend;
  client?: ConvexHttpClient;
  size?: Size;
  // The one-line order sent first, against which a larger order's cost is compared.
  reference?: Placed;
  placed?: Placed;
}
export async function grant(
  backend: Backend,
  who: string,
  permissions: readonly string[],
) {
  for (const permission of permissions)
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|${who}`,
      permission,
      grantedBy: "native-test",
    });
}
// The production composition on its own backend, with the setup every run takes before its first
// command: the grants and the order summary's first activation, both with admin access.
export async function application(world: {
  backend?: Backend;
  client?: ConvexHttpClient;
}) {
  const backend = await productionBackend();
  await grant(backend, subject, grantedPermissions);
  await backend.admin.run(getFunctionName(internal.readModels.activate), {
    readModel: "orderSummary",
    startedBy: operator,
  });
  Object.assign(world, {
    backend,
    client: ordinaryClient(backend.url, {
      token: await backend.issuer.token(subject),
    }),
  });
}
// The deployment is the production composition, deployed with no environment beyond the variables
// its auth.config.ts reads, and the identity source is the fixture issuer they name.
export async function configurationIs(
  world: { backend?: Backend },
  configuration: "production configuration" | "test configuration",
) {
  if (configuration !== "production configuration")
    throw new Error(`The harness deploys no ${configuration}`);
  const backend = required(world.backend, "the backend");
  const facts = backend.facts();
  expect(facts.composition).toBe("production");
  expect(facts.environment).toEqual(authVariables);
  expect(facts.identitySource).toEqual({
    kind: "fixture issuer",
    issuer: backend.issuer.issuer,
  });
  const environment = await backend.admin.environment();
  expect(Object.keys(environment).sort()).toEqual(authVariables);
  expect(environment["AUTH_ISSUER"]).toBe(backend.issuer.issuer);
}
const pad = (n: number) => String(n).padStart(3, "0");
export const orderLines = (count: number, prefix: string): OrderLine[] =>
  Array.from({ length: count }, (_, i) => ({
    stockItemId: `${prefix}-${pad(i)}`,
    quantity: 1,
    unitPrice: 100 + i,
  }));
// Stock exists only through ReceiveStock, at most 100 items a call.
export async function receive(world: ExperimentWorld, lines: OrderLine[]) {
  const client = required(world.client, "the client");
  for (let start = 0; start < lines.length; start += 100)
    await client.mutation(api.receiving.receiveStock, {
      tenantId,
      input: {
        items: lines
          .slice(start, start + 100)
          .map(({ stockItemId }) => ({ stockItemId, quantity: 2 })),
      },
    });
}
export async function anOrderOf(
  world: ExperimentWorld,
  size: Size,
  contention: "absent" | "present",
) {
  if (contention !== "absent")
    throw new Error("These examples measure without stock contention");
  world.size = size;
  await receive(world, orderLines(linesOf[size], "sku"));
  if (linesOf[size] > 1) await receive(world, orderLines(1, "ref"));
}
// Sends PlaceOrder, then reads the order summary list as an ordinary client, and reads the function
// log from before the command to that read.
export async function place(
  world: ExperimentWorld,
  orderId: string,
  lines: OrderLine[],
): Promise<Placed> {
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  const mark = await backend.admin.logMark();
  const response = await client.mutation(api.ordering.placeOrder, {
    tenantId,
    requestKey: `k-${orderId}`,
    input: { orderId, lines },
  });
  const summaries = await client.query(api.readModels.listOrderSummaries, {
    tenantId,
    status: "placed",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  const window = await backend.admin.completionsSince(mark, (records) =>
    records.some((record) => record.identifier === summariesIdentifier),
  );
  const own = required(
    window.find(
      (record) =>
        record.identifier === placeOrderIdentifier &&
        record.componentPath === null,
    ),
    "the command's completion record",
  );
  return {
    orderId,
    lines,
    response,
    own,
    request: window.filter((record) => record.requestId === own.requestId),
    window,
    summaryKeys: summaries.page.map((row) => row.key),
  };
}
// The scheduled-function tables of the parent and both contexts, read after the commands: a job
// scheduled with any delay is a row there.
const scheduledAfter = new WeakMap<
  ExperimentWorld,
  Awaited<ReturnType<typeof scheduledRows>>
>();
export async function placeOrderRuns(
  world: ExperimentWorld,
  run: "the PlaceOrder use case" | "the end-to-end path",
) {
  if (run !== "the PlaceOrder use case")
    throw new Error(`These examples run the PlaceOrder use case, not ${run}`);
  const size = required(world.size, "the order's size");
  if (linesOf[size] > 1)
    world.reference = await place(world, "order-ref", orderLines(1, "ref"));
  world.placed = await place(
    world,
    "order-1",
    orderLines(linesOf[size], "sku"),
  );
  scheduledAfter.set(
    world,
    await scheduledRows(required(world.backend, "the backend")),
  );
}
const sent = (world: ExperimentWorld): Placed[] =>
  [world.reference, required(world.placed, "the order")].filter(
    (placed): placed is Placed => placed !== undefined,
  );
// A successful command's request left one completion record: its own top-level mutation, which
// committed.
export function commitsAre(world: ExperimentWorld, commits: number) {
  for (const placed of sent(world)) {
    expect(placed.response).toMatchObject({ kind: "applied", replayed: false });
    const committed = placed.window.filter(
      (record) =>
        record.udfType === "Mutation" &&
        record.componentPath === null &&
        record.error === null &&
        record.identifier === placeOrderIdentifier,
    );
    expect(committed).toHaveLength(commits);
    expect(placed.request).toEqual(committed);
  }
}
// Nothing ran between the command and the read sent after it returned, nothing is scheduled to run
// later, and that read already shows the command's summary row: the command wrote it, and no job did.
export function projectionJobsAre(world: ExperimentWorld, jobs: number) {
  for (const placed of sent(world)) {
    const others = placed.window.filter(
      (record) =>
        record !== placed.own && record.identifier !== summariesIdentifier,
    );
    expect(others).toHaveLength(jobs);
    expect(
      required(scheduledAfter.get(world), "the scheduled-function rows"),
    ).toHaveLength(jobs);
    expect(placed.summaryKeys).toContain(placed.orderId);
  }
}
// The calls are counted at the pure tier: the backend's log holds no record of a component call
// inside a mutation. The executor runs on the input the test sent, against a ctx whose runMutation
// records each call by its function reference and answers a canned applied outcome.
export async function callsPerContextAre(
  world: ExperimentWorld,
  callsPerContext: number,
) {
  const placed = required(world.placed, "the order");
  const calls: { reference: string; args: Record<string, unknown> }[] = [];
  const ctx = {
    runMutation: (fn: unknown, args: Record<string, unknown>) => {
      const { reference } = getFunctionAddress(fn as never) as {
        reference: string;
      };
      calls.push({ reference, args });
      return Promise.resolve({
        kind: "applied",
        result: {
          orders: [{ orderId: placed.orderId, lineCount: 1, total: 1 }],
        },
        versions: [],
        streams: [],
      });
    },
  } as unknown as MutationCtx;
  await placeOrderDeclaration.executor(ctx, {
    tenantId,
    actor: { kind: "human", id: `issuer|${subject}` },
    operation: {
      operationId: placed.response.operationId,
      causedBy: { kind: "command", commandType: "PlaceOrder" },
    },
    input: { orderId: placed.orderId, lines: placed.lines },
  });
  const contextOf = (reference: string) =>
    /^_reference\/childComponent\/([^/]+)\//.exec(reference)?.[1];
  const perContext = new Map<string | undefined, number>();
  for (const call of calls)
    perContext.set(
      contextOf(call.reference),
      (perContext.get(contextOf(call.reference)) ?? 0) + 1,
    );
  expect(Object.fromEntries(perContext)).toEqual({
    orders: callsPerContext,
    inventory: callsPerContext,
  });
  // Orders first with the order, then Inventory with every line in one list.
  expect(calls.map((call) => contextOf(call.reference))).toEqual([
    "orders",
    "inventory",
  ]);
  expect(calls[1]?.args["input"]).toEqual({
    orderId: placed.orderId,
    lines: placed.lines.map(({ stockItemId, quantity }) => ({
      stockItemId,
      quantity,
    })),
  });
}
export const usageOf = (record: CompletionRecord): Usage =>
  Object.fromEntries(
    usageKeys.map((key) => [key, required(record.usageStats[key], key)]),
  ) as Usage;
// Every row stayed inside its budget, because a row above its budget fails the command and the command
// applied; what it read and wrote stayed under the transaction's ceilings, and the execution time
// the log reports stayed under the examples' bound.
export function budgetsAre(
  world: ExperimentWorld,
  budgets: "hold" | "are exceeded",
) {
  if (budgets !== "hold")
    throw new Error("These examples bind budgets that hold");
  for (const placed of sent(world)) {
    expect(placed.response.kind).toBe("applied");
    const usage = usageOf(placed.own);
    expect(usage.databaseReadDocuments).toBeLessThanOrEqual(
      ceilings.databaseReadDocuments,
    );
    expect(usage.databaseReadBytes).toBeLessThanOrEqual(
      ceilings.databaseReadBytes,
    );
    expect(usage.databaseWriteDocuments).toBeLessThanOrEqual(
      ceilings.databaseWriteDocuments,
    );
    expect(usage.databaseWriteBytes).toBeLessThanOrEqual(
      ceilings.databaseWriteBytes,
    );
    expect(placed.own.executionTime).toBeLessThan(
      reportedExecutionSecondsBound,
    );
  }
}
// What a PlaceOrder read and wrote, recorded on the test's entry in the run's evidence record. It is
// not a Measurement record of the first experiment's report.
export function recordUsage(world: ExperimentWorld) {
  const describe = (placed: Placed) => ({
    orderId: placed.orderId,
    lines: placed.lines.length,
    executionSeconds: placed.own.executionTime,
    usageStats: usageOf(placed.own),
  });
  const placed = required(world.placed, "the order");
  const reference = world.reference;
  measure("placeOrder", {
    order: describe(placed),
    reference: reference === undefined ? null : describe(reference),
    perAddedLine:
      reference === undefined
        ? null
        : Object.fromEntries(
            usageKeys.map((key) => [
              key,
              (usageOf(placed.own)[key] - usageOf(reference.own)[key]) /
                (placed.lines.length - reference.lines.length),
            ]),
          ),
  });
}

export async function storedOrderDocuments(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    orderStreams: await backend.admin.readTable("streams", {
      component: "orders",
    }),
    orderEvents: await backend.admin.readTable("events", {
      component: "orders",
    }),
    stockStreams: await backend.admin.readTable("streams", {
      component: "inventory",
    }),
    stockEvents: await backend.admin.readTable("events", {
      component: "inventory",
    }),
    summaries: await backend.admin.readTable("orderSummaries"),
  };
}
export interface StockItemIdWorld extends ExperimentWorld {
  lines?: OrderLine[];
  response?: PlaceOrderResponse;
  error?: unknown;
  own?: CompletionRecord;
  before?: Awaited<ReturnType<typeof storedOrderDocuments>>;
}
export function orderAtIdBound(
  world: StockItemIdWorld,
  size: Size,
  contention: "absent" | "present",
) {
  expect(size).toBe("the maximum");
  expect(contention).toBe("absent");
  world.lines = orderLines(linesOf[size], "sku");
  expect(world.lines).toHaveLength(100);
}
export async function stockItemIdBytesAre(
  world: StockItemIdWorld,
  idBytes: number,
  lastIdBytes: number,
) {
  const lines = required(world.lines, "the lines");
  for (const [i, line] of lines.entries())
    line.stockItemId =
      i === lines.length - 1
        ? (lastIdBytes % 2 === 1 ? "a" : "") +
          "é".repeat(Math.floor(lastIdBytes / 2))
        : line.stockItemId.padEnd(idBytes, "x");
  expect(maxStockItemIdBytes).toBe(64);
  expect(new Set(lines.map(({ stockItemId }) => stockItemId)).size).toBe(100);
  for (const [i, { stockItemId }] of lines.entries())
    expect(utf8Length(stockItemId)).toBe(
      i === lines.length - 1 ? lastIdBytes : idBytes,
    );
  const lastId = required(lines.at(-1), "the last line").stockItemId;
  expect(lastId.length).toBeLessThan(utf8Length(lastId));
  await receive(world, lines);
}
export async function placeOrderAtIdBoundRuns(
  world: StockItemIdWorld,
  run: "the PlaceOrder use case" | "the end-to-end path",
) {
  expect(run).toBe("the PlaceOrder use case");
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  world.before = await storedOrderDocuments(backend);
  const mark = await backend.admin.logMark();
  await client
    .mutation(api.ordering.placeOrder, {
      tenantId,
      requestKey: "k-order-at-id-bound",
      input: {
        orderId: "order-at-id-bound",
        lines: required(world.lines, "the lines"),
      },
    })
    .then(
      (response) => {
        world.response = response;
      },
      (error: unknown) => {
        world.error = error;
      },
    );
  const records = await backend.admin.completionsSince(mark, (records) =>
    records.some(
      (record) =>
        record.identifier === placeOrderIdentifier &&
        record.componentPath === null,
    ),
  );
  world.own = required(
    records.find(
      (record) =>
        record.identifier === placeOrderIdentifier &&
        record.componentPath === null,
    ),
    "the command's completion record",
  );
}
export function stockItemIdAnswerIs(
  world: StockItemIdWorld,
  answer: "the result" | "the rejection invalidInput",
) {
  if (answer === "the result") {
    expect(world.error).toBeUndefined();
    expect(world.response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { orderId: "order-at-id-bound", lineCount: 100, total: 14950 },
    });
    expect(required(world.own, "the completion record").error).toBeNull();
  } else {
    expect(world.response).toBeUndefined();
    expect(world.error).toBeInstanceOf(ConvexError);
    expect(required(world.own, "the completion record").error).toMatch(
      /^Uncaught ConvexError: /,
    );
  }
}
export function stockItemIdRejectionIs(
  world: StockItemIdWorld,
  line: number,
  length: number,
  limit: number,
) {
  expect((world.error as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "invalidInput",
    commandType: "PlaceOrder",
    message: `Line ${line} needs a stock item ID of at most ${limit} bytes of UTF-8, not ${length}`,
    details: { line, length, limit },
  });
}
export function commandDocumentsAre(
  world: StockItemIdWorld,
  readDocuments: number,
  writtenDocuments: number,
) {
  const usage = usageOf(required(world.own, "the completion record"));
  expect(usage.databaseReadDocuments).toBe(readDocuments);
  expect(usage.databaseWriteDocuments).toBe(writtenDocuments);
}
