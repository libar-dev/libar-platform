import type { TransactionMetrics } from "convex/server";
import { expect } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
export interface BudgetWorld {
  backend?: Backend;
  path?: "nested" | "component";
  error?: string;
  cpuError?: string;
}
export async function prepareBudget(
  world: BudgetWorld,
  path: "nested" | "component",
) {
  world.backend = await fixtureBackend();
  world.path = path;
}
export async function reachBudget(world: BudgetWorld) {
  const backend = required(world.backend, "backend");
  const client = ordinaryClient(backend.url);
  const path = required(world.path, "path");
  for (const count of [100, 1000, 2000, 4000, 8000, 16000, 32000]) {
    const mark = await backend.admin.logMark();
    const start = performance.now();
    let result:
      | {
          completed: number;
          before: TransactionMetrics;
          after: TransactionMetrics;
        }
      | undefined;
    try {
      result = await client.mutation(api.callBudget.repeat, {
        path,
        count,
        write: false,
      });
    } catch (error) {
      world.error = String(error);
    }
    const wallMs = performance.now() - start;
    const records = await backend.admin.completionsSince(mark, (entries) =>
      entries.some((entry) => entry.identifier === "callBudget:repeat"),
    );
    const own = required(
      records.find((entry) => entry.identifier === "callBudget:repeat"),
      "completion",
    );
    measure(`${path}-${count}`, {
      count,
      completed: result?.completed ?? null,
      wallMs,
      executionSeconds: own.executionTime,
      usageStats: own.usageStats,
      error: world.error ?? null,
      underLoad: process.env["LIBAR_TIMINGS_UNDER_LOAD"] !== "0",
    });
    if (world.error !== undefined) break;
    expect(result?.completed).toBe(count);
    expect(result?.after.documentsRead.used).toBe(0);
    expect(result?.after.documentsWritten.used).toBe(0);
  }
  expect(world.error, "The run never reached a time boundary").toBeDefined();
}
export async function computeBudget(world: BudgetWorld, expected: string) {
  const backend = required(world.backend, "backend");
  const client = ordinaryClient(backend.url);
  const start = performance.now();
  try {
    await client.mutation(api.callBudget.compute, {});
  } catch (error) {
    world.cpuError = String(error);
  }
  measure("computationBoundary", {
    error: world.cpuError ?? null,
    wallMs: performance.now() - start,
    underLoad: process.env["LIBAR_TIMINGS_UNDER_LOAD"] !== "0",
  });
  expect(
    world.cpuError,
    "The computation did not reach its boundary",
  ).toBeDefined();
  expect(world.cpuError).toContain(expected);
}
export async function measureCalls(
  world: BudgetWorld,
  reads: number,
  writes: number,
) {
  const backend = required(world.backend, "backend");
  const client = ordinaryClient(backend.url);
  for (const write of [false, true]) {
    const count = 20;
    const mark = await backend.admin.logMark();
    const start = performance.now();
    const result: {
      completed: number;
      before: TransactionMetrics;
      after: TransactionMetrics;
    } = await client.mutation(api.callBudget.repeat, {
      path: "component",
      count,
      write,
    });
    const wallMs = performance.now() - start;
    const records = await backend.admin.completionsSince(mark, (entries) =>
      entries.some((entry) => entry.identifier === "callBudget:repeat"),
    );
    const own = required(
      records.find((entry) => entry.identifier === "callBudget:repeat"),
      "completion",
    );
    const documentsRead =
      result.after.documentsRead.used - result.before.documentsRead.used;
    const documentsWritten =
      result.after.documentsWritten.used - result.before.documentsWritten.used;
    measure(`componentCost-${write ? "write" : "empty"}`, {
      count,
      documentsRead,
      documentsWritten,
      usageStats: own.usageStats,
      executionSeconds: own.executionTime,
      perCallMs: (own.executionTime * 1000) / count,
      wallMs,
      underLoad: process.env["LIBAR_TIMINGS_UNDER_LOAD"] !== "0",
    });
    expect(result.completed).toBe(count);
    expect(documentsRead).toBe(write ? count : count * reads);
    expect(documentsWritten).toBe(write ? count : count * writes);
  }
}
