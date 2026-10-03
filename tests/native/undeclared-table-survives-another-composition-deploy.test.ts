import { isDeepStrictEqual } from "node:util";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { Value } from "convex/values";
import { expect, vi } from "vitest";
import { undeclaredTableSurvivesAnotherCompositionDeployContract as contract } from "../../generated/contracts/platform.native-harness.undeclared-table-survives-another-composition-deploy.contract.js";
import type { Backend } from "../../harness/backend.js";
import { measure, productionBackend, required } from "../../harness/native.js";
import { hostedCopy, plantSchedules } from "../hosted/copy.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.undeclared-table-survives-another-composition-deploy",
  ),
  verifies: ref(
    "spec:platform.native-harness.undeclared-table-survives-another-composition-deploy",
  ),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
interface World {
  backend?: Backend;
  copy?: string;
  planted?: Record<string, Value>[];
  deployError?: string;
  after?: Record<string, Value>[];
}
bindExample(contract, (): World => ({}), {
  "a local backend running a temporary copy of the fixture composition whose schema declares the table `plantedSchedules`, holding {rows} planting records":
    async (world, { rows }) => {
      const backend = await productionBackend({ deploy: false });
      const copy = await hostedCopy();
      measure("temporary deployment", {
        ...copy.added,
        ...(await backend.admin.deployTemporary(copy.directory)),
      });
      await plantSchedules(backend, new Date().toISOString());
      world.planted = await backend.admin.readTable("plantedSchedules");
      expect(world.planted).toHaveLength(rows);
      Object.assign(world, { backend, copy: copy.directory });
    },
  "the harness deploys the production composition, whose schema leaves that table out, and then deploys the same temporary copy again":
    async (world) => {
      const backend = required(world.backend, "the backend");
      try {
        await backend.admin.deploy();
      } catch (error) {
        world.deployError = String(error);
      }
      // What an admin read finds while the table is undeclared is recorded, not bound.
      measure(
        "planting records while the production composition is deployed",
        await backend.admin.readTable("plantedSchedules").then(
          (rows) => rows.length,
          (error: unknown) => String(error),
        ),
      );
      await backend.admin.deployTemporary(required(world.copy, "the copy"));
      world.after = await backend.admin.readTable("plantedSchedules");
    },
  "the production composition's deploy completes {deployed}": (
    world,
    { deployed },
  ) => {
    expect(world.deployError === undefined, world.deployError).toBe(deployed);
  },
  "the table holds the same planting records {rows} with their IDs and creation times {unchanged}":
    (world, { rows, unchanged }) => {
      expect(world.after).toHaveLength(rows);
      expect(isDeepStrictEqual(world.after, world.planted)).toBe(unchanged);
    },
});
