// Observations for PlaceOrder cost comparisons on the production composition. Setup goes through
// admin access; every command goes through the production public entry.
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReturnType,
} from "convex/server";
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
