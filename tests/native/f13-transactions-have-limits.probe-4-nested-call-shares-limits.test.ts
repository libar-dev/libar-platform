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
import type { ReadResult } from "../../fixture/convex/probe/probe4.js";
import type { TransactionMetrics } from "convex/server";
import { probe4NestedCallSharesLimitsContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits",
  ),
  verifies: ref(
    "spec:facts.f13-transactions-have-limits.probe-4-nested-call-shares-limits",
  ),
});
void anchor;
interface ProbeWorld extends World {
  size?: number;
  parent?: number;
  child?: number;
  together?: { error?: string };
  parentResult?: {
    parentCount: number;
    before: TransactionMetrics;
    after: TransactionMetrics;
    child: ReadResult;
  };
  childResult?: ReadResult;
}
const component = false;
async function measure(name: string, value: unknown) {
  await recordMeasurement(
    contract.title,
    `probe4.${component ? "component" : "nested"}.${name}`,
    value,
  );
}
async function outcome(call: Promise<unknown>) {
  try {
    await call;
    return {};
  } catch (error) {
    return { error: String(error) };
  }
}
function verdict(
  result: { error?: string },
  fragment: string,
  success: string,
) {
  return result.error?.includes(fragment)
    ? `fails on the ${fragment === "Too many bytes read" ? "bytes-read" : "bytes-written"} limit`
    : (result.error ?? success);
}
bindExample(contract, (): ProbeWorld => ({}), {
  "documents of {documentSize} each, {parentDocuments} that a parent mutation reads and {childDocuments} more that a nested query reads":
    async (w, { documentSize, parentDocuments, childDocuments }) => {
      await fixture(w);
      w.client = httpClient(backend(w).url);
      const match = /^(\d+) KiB$/.exec(documentSize);
      if (!match) throw new Error(`Unsupported document size ${documentSize}`);
      w.size = Number(match[1]) * 1024;
      w.parent = parentDocuments;
      w.child = childDocuments;
      for (let i = 0; i < parentDocuments; i++)
        await client(w).mutation(api.probe4.seed, {
          group: "parent",
          count: 1,
          size: w.size,
        });
      for (let i = 0; i < childDocuments; i++)
        await client(w).mutation(
          component ? api.probe4.seedComponent : api.probe4.seed,
          { group: "child", count: 1, size: w.size },
        );
      await measure("dataset", {
        documentSize,
        parentDocuments,
        childDocuments,
        bytes: w.size,
      });
    },
  "a client calls the parent mutation, which reads its documents and then calls the nested query through ctx.runQuery":
    async (w) => {
      w.together = await outcome(
        client(w).mutation(api.probe4.parentRead, {
          component,
          parent: w.parent!,
          child: w.child!,
        }),
      );
      await measure("combinedRead", w.together);
    },
  "the call {together}": (w, { together }) => {
    expect(verdict(w.together!, "Too many bytes read", "commits")).toBe(
      together,
    );
  },
  "the parent reading alone {parentAlone} and the nested query called alone {childAlone}":
    async (w, { parentAlone, childAlone }) => {
      const parent = await outcome(
        client(w).mutation(api.probe4.parentRead, {
          component,
          parent: w.parent!,
          child: 0,
        }),
      );
      await measure("parentAlone", parent);
      expect(verdict(parent, "Too many bytes read", "commits")).toBe(
        parentAlone,
      );
      const child = await outcome(
        client(w).query(api.probe4.childAlone, { component, count: w.child! }),
      );
      await measure("childAlone", child);
      expect(verdict(child, "Too many bytes read", "returns")).toBe(childAlone);
      const metrics = await client(w).mutation(api.probe4.parentRead, {
        component,
        parent: 0,
        child: w.child!,
      });
      await measure("metrics", metrics);
      expect(metrics.child.count).toBe(w.child);
      expect(metrics.child.payloadBytes).toBe(w.child! * w.size!);
      expect(
        metrics.after.documentsRead.used - metrics.before.documentsRead.used,
      ).toBe(
        metrics.child.after.documentsRead.used -
          metrics.child.before.documentsRead.used,
      );
      expect(metrics.after.bytesRead.used - metrics.before.bytesRead.used).toBe(
        metrics.child.after.bytesRead.used -
          metrics.child.before.bytesRead.used,
      );
      expect(
        metrics.after.documentsRead.used - metrics.before.documentsRead.used,
      ).toBe(w.child);
      expect(
        metrics.after.bytesRead.used - metrics.before.bytesRead.used,
      ).toBeGreaterThanOrEqual(metrics.child.payloadBytes);
    },
  "the same split of bytes written by a parent mutation and a nested mutation {writesTogether}":
    async (w, { writesTogether }) => {
      const result = await outcome(
        client(w).mutation(api.probe4.parentWrite, {
          component,
          parent: w.parent!,
          child: w.child!,
          size: w.size!,
        }),
      );
      await measure("combinedWrite", result);
      expect(verdict(result, "Too many bytes written", "commits")).toBe(
        writesTogether,
      );
      const written = await client(w).query(api.probe4.writtenCount, {
        component,
      });
      await measure("writtenRowsAfterFailure", written);
      expect(written).toBe(0);
    },
});
