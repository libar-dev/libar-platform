// Admin setup and observations for PlaceOrder cost comparisons on the production composition.
// No function is registered by this fixture. Commands always use the production public entry.
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReturnType,
} from "convex/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError, getConvexSize, type Value } from "convex/values";
import { expect } from "vitest";
import { api } from "../../example/convex/_generated/api.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { JsonValue } from "../../harness/evidence.js";
import type { Backend } from "../../harness/backend.js";
import { measure, required } from "../../harness/native.js";
import {
  placeOrderIdentifier,
  usageOf,
  type ExperimentWorld,
} from "./first-experiment-steps.js";

type AttemptRecord = CompletionRecord & {
  willRetry?: boolean;
  occInfo?: JsonValue;
};
export type OrderArgs = FunctionArgs<typeof api.ordering.placeOrder>;
export const tables = {
  grants: ["grants", undefined],
  generations: ["generations", undefined],
  receipts: ["receipts", undefined],
  summaries: ["orderSummaries", undefined],
  orderStreams: ["streams", "orders"],
  orderEvents: ["events", "orders"],
  stockStreams: ["streams", "inventory"],
  stockEvents: ["events", "inventory"],
} as const;
export async function stored(backend: Backend) {
  const entries = await Promise.all(
    Object.entries(tables).map(
      async ([name, [table, component]]) =>
        [
          name,
          await backend.admin.readTable(
            table,
            component === undefined ? {} : { component },
          ),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<
    keyof typeof tables,
    Record<string, Value>[]
  >;
}
export type Stored = Awaited<ReturnType<typeof stored>>;
export const rowCounts = (rows: Stored) =>
  Object.fromEntries(
    Object.entries(rows).map(([name, values]) => [name, values.length]),
  );
export const rowBytes = (rows: Stored) =>
  Object.fromEntries(
    Object.entries(rows).map(([name, values]) => [
      name,
      values.map((row) => getConvexSize(row)),
    ]),
  );

// System mutations use the mutation endpoint. The generic function endpoint resolves application modules.
async function systemMutation(
  backend: Backend,
  name: string,
  args: Record<string, Value>,
  component?: string,
) {
  const client = new ConvexHttpClient(backend.url) as ConvexHttpClient & {
    setAdminAuth(key: string): void;
  };
  client.setAdminAuth(backend.adminKey);
  if (component !== undefined) {
    const components = await client.query(
      makeFunctionReference<
        "query",
        Record<string, never>,
        { id: string; path: string }[]
      >("_system/frontend/components:list"),
      {},
    );
    args["componentId"] = required(
      components.find((entry) => entry.path === component)?.id,
      "component id",
    );
  }
  return client.mutation(makeFunctionReference<"mutation">(name), args);
}
// These are the pinned backend's existing admin functions, not functions added to the application.
export async function patch(
  backend: Backend,
  table: string,
  id: Value,
  fields: Record<string, Value>,
  component?: string,
) {
  expect(
    await systemMutation(
      backend,
      "_system/frontend/patchDocumentsFields",
      {
        table,
        ids: [id],
        fields,
      },
      component,
    ),
  ).toEqual({ success: true });
}
export async function remove(
  backend: Backend,
  table: string,
  id: Value,
  component?: string,
) {
  expect(
    await systemMutation(
      backend,
      "_system/frontend/deleteDocuments",
      {
        toDelete: [{ id, tableName: table }],
      },
      component,
    ),
  ).toEqual({ success: true });
}
export async function add(
  backend: Backend,
  table: string,
  document: Record<string, Value>,
) {
  return systemMutation(backend, "_system/frontend/addDocument", {
    table,
    documents: [document],
  });
}

export async function submit(
  world: ExperimentWorld,
  args: OrderArgs,
  label: string,
) {
  const backend = required(world.backend, "the backend");
  const before = await stored(backend);
  const mark = await backend.admin.logMark();
  let response: FunctionReturnType<typeof api.ordering.placeOrder> | undefined;
  let error: unknown;
  try {
    response = await required(world.client, "the client").mutation(
      api.ordering.placeOrder,
      args,
    );
  } catch (caught) {
    error = caught;
  }
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(
      (entry) =>
        entry.identifier === placeOrderIdentifier &&
        entry.componentPath === null &&
        (entry as AttemptRecord).willRetry === false,
    ),
  );
  const own = required(
    records.find(
      (entry) =>
        entry.identifier === placeOrderIdentifier &&
        entry.componentPath === null &&
        (entry as AttemptRecord).willRetry === false,
    ),
    "the command completion",
  );
  const request = records.filter(
    (entry) => entry.requestId === own.requestId,
  ) as AttemptRecord[];
  const after = await stored(backend);
  const usage = usageOf(own);
  const outcome =
    error === undefined
      ? response
      : error instanceof ConvexError
        ? error.data
        : { kind: "technicalFailure", message: String(error) };
  // Preserve the observed fields, including any retry field a different pinned release might expose.
  measure(label, {
    submittedCalls: 1,
    observedAttempts: request.length,
    occRetries: request.filter((entry) => entry.willRetry === true).length,
    finalOutcomes: 1,
    outcome: JSON.parse(JSON.stringify(outcome)) as JsonValue,
    usageStats: usage,
    completionRecords: JSON.parse(JSON.stringify(request)) as JsonValue,
    rowsBefore: rowCounts(before),
    rowsAfter: rowCounts(after),
    convexValueBytesBefore: rowBytes(before),
    convexValueBytesAfter: rowBytes(after),
  });
  expect(request).toHaveLength(1);
  expect(request[0]?.willRetry).toBe(false);
  expect(request[0]?.occInfo).toBeNull();
  expect(own.identifier).toBe(getFunctionName(api.ordering.placeOrder));
  expect(own.udfType).toBe("Mutation");
  expect(own.cachedResult).toBe(false);
  for (const count of Object.values(usage))
    expect(count).toBeGreaterThanOrEqual(0);
  if (error !== undefined) {
    expect(own.error).not.toBeNull();
    expect(after).toEqual(before);
  } else expect(own.error).toBeNull();
  return { before, after, usage, outcome, error, response };
}

// The SDK's admin query endpoint evaluates one read-only query without deploying a function.
export async function transactionMetrics(backend: Backend) {
  const response = await fetch(`${backend.url}/api/run_test_function`, {
    method: "POST",
    headers: {
      Authorization: `Convex ${backend.adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      adminKey: backend.adminKey,
      args: {},
      format: "convex_encoded_json",
      bundle: {
        path: "testQuery.js",
        source: `import { query } from "convex:/_system/repl/wrappers.js";
export default query({ handler: async (ctx) => {
  const before = await ctx.meta.getTransactionMetrics();
  await ctx.db.query("receipts").withIndex("by_key", q => q.eq("tenantId", "absent")).unique();
  const absent = await ctx.meta.getTransactionMetrics();
  await ctx.db.query("grants").collect();
  const grants = await ctx.meta.getTransactionMetrics();
  return { before, absent, grants };
}});`,
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  expect(response.ok).toBe(true);
  const result = (await response.json()) as {
    status: string;
    value: {
      before: { documentsRead: { used: number } };
      absent: { documentsRead: { used: number } };
      grants: { documentsRead: { used: number } };
    };
  };
  measure("adminQueryMetrics", JSON.parse(JSON.stringify(result)) as JsonValue);
  expect(result.status).toBe("success");
  expect(result.value.before.documentsRead.used).toBe(0);
  expect(result.value.absent.documentsRead.used).toBe(0);
  expect(result.value.grants.documentsRead.used).toBe(4);
}
