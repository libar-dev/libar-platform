import { expect } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import type { Backend } from "../../harness/backend.js";
import type { Id } from "../../fixture/convex/_generated/dataModel.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
export interface CostWorld {
  backend?: Backend;
  reads?: number;
  seeds?: { own: Id<"samples">; annex: string };
  medians?: Record<Path, number>;
  componentRecords?: number[];
}
type Path = "helper" | "nested" | "component";
const paths: Path[] = ["helper", "nested", "component"];
const median = (values: number[]) =>
  required(
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
    "the median sample",
  );
export async function prepareCost(world: CostWorld, reads: number) {
  const backend = await fixtureBackend();
  const seeds = await ordinaryClient(backend.url).mutation(
    api.readCost.seed,
    {},
  );
  Object.assign(world, { backend, seeds, reads });
}
export async function sampleCost(world: CostWorld, kind: "mutation" | "query") {
  const backend = required(world.backend, "the backend");
  const client = ordinaryClient(backend.url);
  const samples: Record<Path, number[]> = {
    helper: [],
    nested: [],
    component: [],
  };
  const observations: Parameters<typeof measure>[1][] = [];
  world.componentRecords = [];
  try {
    for (let round = 0; round < 9; round++) {
      for (const [index, path] of paths.entries()) {
        const mark = await backend.admin.logMark();
        const args = {
          ...required(world.seeds, "the seeded documents"),
          path,
          reads: required(world.reads, "the read count"),
          cacheBuster: (round * 3 + index + 1) * 1000,
        };
        let callError: unknown;
        let result: { documentsRead: number; id: string } | undefined;
        try {
          if (kind === "mutation")
            result = await client.mutation(api.readCost.viaMutation, args);
          else result = await client.query(api.readCost.viaQuery, args);
        } catch (error) {
          callError = error;
        }
        const identifier =
          kind === "mutation" ? "readCost:viaMutation" : "readCost:viaQuery";
        const records = await backend.admin.completionsSince(mark, (entries) =>
          entries.some(
            (entry) =>
              entry.identifier === identifier && entry.componentPath === null,
          ),
        );
        const parent = required(
          records.find(
            (entry) =>
              entry.identifier === identifier && entry.componentPath === null,
          ),
          "the parent's completion",
        );
        const sharingRequest = records.filter(
          (entry) => entry.requestId === parent.requestId,
        );
        observations.push({
          round,
          path,
          cacheBuster: args.cacheBuster,
          result: result ?? null,
          callError: callError === undefined ? null : String(callError),
          executionTimeSeconds: parent.executionTime,
          cachedResult: parent.cachedResult,
          error: parent.error,
          records: sharingRequest.map((entry) => ({
            identifier: entry.identifier,
            componentPath: entry.componentPath,
            executionTime: entry.executionTime,
            cachedResult: entry.cachedResult,
          })),
        });
        expect(callError, String(callError)).toBeUndefined();
        expect(parent.error, JSON.stringify(parent)).toBeNull();
        expect(parent.cachedResult, JSON.stringify(parent)).toBe(false);
        // The sample counts only when the backend's own count of documents read on the path, from
        // the parent's transaction metrics, is the bound number.
        expect(result, JSON.stringify(result)).toEqual({
          documentsRead: args.reads,
          id: path === "component" ? args.annex : args.own,
        });
        samples[path].push(parent.executionTime);
        if (path === "component")
          world.componentRecords.push(sharingRequest.length);
      }
    }
  } finally {
    measure("costSamples", observations);
  }
  world.medians = {
    helper: median(samples.helper),
    nested: median(samples.nested),
    component: median(samples.component),
  };
  measure("readCostSummary", {
    kind,
    readsPerSample: required(world.reads, "the read count"),
    acceptedSamples: Object.fromEntries(
      paths.map((path) => [path, samples[path].length]),
    ),
    componentCompletionRecords: world.componentRecords,
    ...world.medians,
    componentMinusHelperSeconds: world.medians.component - world.medians.helper,
    componentMinusHelperPerReadSeconds:
      (world.medians.component - world.medians.helper) /
      required(world.reads, "the read count"),
  });
}
export function assertCost(world: CostWorld, expected: string) {
  const medians = required(world.medians, "the medians");
  const observed =
    medians.component > medians.helper
      ? "higher"
      : medians.component < medians.helper
        ? "lower"
        : "equal";
  expect(observed, JSON.stringify(medians)).toBe(expected);
}
export function assertRecords(world: CostWorld, records: number) {
  for (const count of required(world.componentRecords, "the record counts"))
    expect(count, `Observed ${count} records for a component parent call`).toBe(
      records,
    );
}
