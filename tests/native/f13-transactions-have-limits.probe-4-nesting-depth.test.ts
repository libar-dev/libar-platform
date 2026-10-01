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

import { probe4NestingDepthContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-4-nesting-depth.contract.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f13-transactions-have-limits.probe-4-nesting-depth",
  ),
  verifies: ref(
    "spec:facts.f13-transactions-have-limits.probe-4-nesting-depth",
  ),
});
void anchor;
interface ProbeWorld extends World {
  deepest?: number;
  outcomes?: { depth: number; committed: boolean; error?: string }[];
}

bindExample(contract, (): ProbeWorld => ({}), {
  "a mutation that calls itself through ctx.runMutation until its call stack holds a requested number of functions":
    async (w) => {
      await fixture(w);
      w.client = httpClient(backend(w).url);
    },
  "a client asks for each number from 1 upward": async (w) => {
    w.deepest = 0;
    w.outcomes = [];
    for (let depth = 1; depth <= 12; depth++) {
      let error: string | undefined;
      try {
        await client(w).mutation(api.probe4.depth, { depth });
        w.deepest = depth;
      } catch (caught) {
        error = String(caught);
      }
      const result = {
        depth,
        committed: error === undefined,
        ...(error === undefined ? {} : { error }),
      };
      w.outcomes.push(result);
      await recordMeasurement(contract.title, "probe4.depth.trial", result);
    }
    await recordMeasurement(
      contract.title,
      "probe4.depth.firstFailure",
      w.outcomes.find((r) => !r.committed) ?? null,
    );
    await recordMeasurement(
      contract.title,
      "probe4.depth.deepestCommitted",
      w.deepest,
    );
  },
  "the deepest call stack that commits holds {deepestStack} functions, the top-level mutation included":
    (w, { deepestStack }) => {
      expect(w.deepest, JSON.stringify(w.outcomes)).toBe(deepestStack);
    },
});
