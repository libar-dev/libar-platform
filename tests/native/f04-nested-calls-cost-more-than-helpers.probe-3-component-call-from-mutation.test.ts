import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { recordMeasurement } from "../../harness/evidence.js";
import { backend, client, fixture } from "./world.js";
import type { World } from "./world.js";
import { httpClient } from "../../harness/clients.js";
import type { Id } from "../../fixture/convex/_generated/dataModel.js";
import type { FunctionLogRecord } from "../../harness/backend.js";
import { probe3ComponentCallFromMutationContract as contract } from "../../generated/contracts/facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation",
  ),
  verifies: ref(
    "spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-component-call-from-mutation",
  ),
});
void anchor;
interface ProbeWorld extends World {
  reads?: number;
  id?: Id<"probe3Docs">;
  componentId?: string;
  medians?: Record<string, number>;
  counts?: number[];
  log?: ReturnType<ReturnType<typeof backend>["logs"]>;
}
const kind: string = "mutation";
const parentName =
  kind === "mutation" ? "probe3:parentMutation" : "probe3:parentQuery";
const completion = (r: FunctionLogRecord) => r.kind === "Completion";
async function measure(name: string, value: unknown) {
  await recordMeasurement(contract.title, `probe3.${kind}.${name}`, value);
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
bindExample(contract, (): ProbeWorld => ({}), {
  "a parent mutation that reads the same document {reads} times in a row through one of three paths: a helper function, a nested query, a component query":
    async (w, { reads }) => {
      await fixture(w);
      w.client = httpClient(backend(w).url);
      w.reads = reads;
      w.id = await client(w).mutation(api.probe3.seed, {});
      w.componentId = await client(w).mutation(api.probe3.seedComponent, {});
      w.log = backend(w).logs();
      await measure("readsPerCall", reads);
    },
  "a client calls the parent mutation once for each path, several times over":
    async (w) => {
      const samples: Record<string, number[]> = {
        helper: [],
        nested: [],
        component: [],
      };
      w.counts = [];
      for (let trial = 0; trial < 9; trial++)
        for (const path of ["helper", "nested", "component"] as const) {
          const offset = w.log!.records.length;
          const args = {
            id: w.id!,
            componentId: w.componentId!,
            reads: w.reads!,
            nonce:
              trial * 10000 +
              { helper: 0, nested: 1000, component: 2000 }[path],
            path,
          };
          if (kind === "mutation")
            await client(w).mutation(api.probe3.parentMutation, args);
          else await client(w).query(api.probe3.parentQuery, args);
          const record = await w.log!.waitFor(
            (r) =>
              w.log!.records.indexOf(r) >= offset &&
              completion(r) &&
              r.identifier === parentName,
            5000,
          );
          await measure("completion", { path, trial, record });
          if (typeof record.executionTime !== "number")
            throw new Error(
              `Parent completion has no executionTime: ${JSON.stringify(record)}`,
            );
          if (typeof record.requestId !== "string")
            throw new Error(
              `Parent completion has no requestId: ${JSON.stringify(record)}`,
            );
          samples[path]!.push(record.executionTime * 1000);
          const records = w.log!.records.filter(
            (r) => completion(r) && r.requestId === record.requestId,
          );
          if (path === "component") w.counts.push(records.length);
          await measure("callLog", {
            path,
            trial,
            records,
            nestedVisible: records.some(
              (r) => r.identifier === "probe3:read" && !r.componentPath,
            ),
            componentVisible: records.some(
              (r) =>
                r.identifier === "probe3:read" && r.componentPath === "probe",
            ),
          });
        }
      w.medians = Object.fromEntries(
        Object.entries(samples).map(([path, times]) => [path, median(times)]),
      );
      for (const path of ["helper", "nested", "component"])
        await measure(`${path}MedianMs`, w.medians[path]);
      await measure(
        "nestedCostPerCallMs",
        (w.medians.nested! - w.medians.helper!) / w.reads!,
      );
      await measure(
        "componentCostPerCallMs",
        (w.medians.component! - w.medians.helper!) / w.reads!,
      );
      await measure("completionRecordsPerComponentParent", w.counts);
    },
  "the median execution time through the component is {componentAgainstHelper} than through the helper":
    (w, { componentAgainstHelper }) => {
      const observed =
        w.medians!.component! > w.medians!.helper!
          ? "higher"
          : w.medians!.component! < w.medians!.helper!
            ? "lower"
            : "equal";
      expect(observed, JSON.stringify(w.medians)).toBe(componentAgainstHelper);
    },
  "the function log holds {recordsPerCall} execution record for one parent call through the component":
    (w, { recordsPerCall }) => {
      for (const count of w.counts!) expect(count).toBe(recordsPerCall);
    },
});
