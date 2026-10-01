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
  world.componentRecords = [];
  for (let round = 0; round < 9; round++) {
    for (const [index, path] of paths.entries()) {
      const mark = await backend.admin.logMark();
      const args = {
        ...required(world.seeds, "the seeded documents"),
        path,
        reads: required(world.reads, "the read count"),
        nonce: (round * 3 + index + 1) * 1000,
      };
      let callError: unknown;
      try {
        if (kind === "mutation")
          await client.mutation(api.readCost.viaMutation, args);
        else await client.query(api.readCost.viaQuery, args);
      } catch (error) {
        callError = error;
      }
      measure("costCall", {
        round,
        path,
        nonce: args.nonce,
        error: callError === undefined ? null : String(callError),
      });
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
      measure("costSample", {
        round,
        path,
        nonce: args.nonce,
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
      samples[path].push(parent.executionTime);
      if (path === "component")
        world.componentRecords.push(sharingRequest.length);
    }
  }
  world.medians = {
    helper: median(samples.helper),
    nested: median(samples.nested),
    component: median(samples.component),
  };
  measure("costMedians", {
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
