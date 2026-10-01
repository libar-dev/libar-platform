import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe4NestingDepthContract as contract } from "../../generated/contracts/facts.f13-transactions-have-limits.probe-4-nesting-depth.contract.js";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f13-transactions-have-limits.probe-4-nesting-depth",
  ),
  verifies: ref(
    "spec:facts.f13-transactions-have-limits.probe-4-nesting-depth",
  ),
});
void anchor;
interface World {
  backend?: Backend;
  deepest?: number;
  failed?: number;
  failure?: unknown;
}
bindExample(contract, (): World => ({}), {
  "a mutation that calls itself through ctx.runMutation until its call stack holds a requested number of functions":
    async (world) => {
      world.backend = await fixtureBackend();
      expect(api.limits.recurse).toBeDefined();
    },
  "a client asks for each number from 1 upward": async (world) => {
    const backend = required(world.backend, "the backend");
    const client = ordinaryClient(backend.url);
    world.deepest = 0;
    for (let stack = 1; stack <= 16; stack++) {
      const label = `stack ${stack}`;
      let answer: number | undefined;
      let error: unknown;
      try {
        answer = await client.mutation(api.limits.recurse, { label, stack });
      } catch (caught) {
        error = caught;
      }
      const rows = (await backend.admin.readTable("depthRows")).filter((row) => row.trial === label).length;
      measure(`stack${stack}Trial`, {
        stack,
        answer: answer ?? null,
        error: error === undefined ? null : String(error),
        rows,
      });
      if (error !== undefined) {
        expect(rows, String(error)).toBe(0);
        world.failed = stack;
        world.failure = error;
        break;
      }
      expect(answer).toBe(stack);
      expect(rows).toBe(stack);
      world.deepest = stack;
    }
    measure("depthBoundary", {
      deepest: world.deepest,
      firstFailure: world.failed ?? null,
    });
    expect(world.failed, "No stack failed through depth 16").toBeDefined();
  },
  "the first stack that does not commit is refused with an error whose text holds {depthRefusal}":
    (world, { depthRefusal }) => {
      expect(world.failure).toBeInstanceOf(Error);
      expect(String(world.failure)).toContain(depthRefusal);
    },
  "the deepest call stack that commits holds {deepestStack} functions, the top-level mutation included":
    (world, { deepestStack }) => {
      expect(
        world.deepest,
        `Deepest committed stack: ${world.deepest}; first failure: ${world.failed}`,
      ).toBe(deepestStack);
    },
});
