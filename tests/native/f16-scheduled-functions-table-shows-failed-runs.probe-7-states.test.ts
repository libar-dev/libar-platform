import { expect, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7StatesContract as contract } from "../../generated/contracts/facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { type SchedulerWorld } from "./scheduler-cases.js";
import { statesCase } from "./scheduler-cases.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states",
  ),
  verifies: ref(
    "spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states",
  ),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
type World = SchedulerWorld<Awaited<ReturnType<typeof statesCase>>>;

bindExample(contract, (): World => ({}), {
  "the parent and Orders and Inventory have temporary functions for pending, held, successful, failed and canceled schedules":
    async (world) => {
      Object.assign(world, await schedulingBackend());
    },
  "admin access reads each scheduler table before and after a short interval":
    async (world) => {
      world.observation = await statesCase(world.backend!);
    },
  "each scope {scopes} contains state kinds {kinds}": async (
    world,
    { scopes, kinds },
  ) => {
    const o = world.observation!;
    expect(Object.keys(o.before).sort()).toEqual(scopes.split(",").sort());
    for (const rows of Object.values(o.before))
      expect(
        rows.map((r) => (r.state as { kind: string }).kind).sort(),
      ).toEqual(kinds.split(","));
  },
  "rows have names, arguments and scheduled times, and completedTime is present exactly for {terminal}":
    async (world, { terminal }) => {
      for (const rows of Object.values(world.observation!.before))
        for (const row of rows) {
          expect(typeof row.name).toBe("string");
          expect(Array.isArray(row.args)).toBe(true);
          expect(typeof row.scheduledTime).toBe("number");
          const kind = (row.state as { kind: string }).kind;
          if (Object.hasOwn(row, "completedTime"))
            expect(typeof row.completedTime).toBe("number");
          expect(Object.hasOwn(row, "completedTime")).toBe(
            terminal.split(",").includes(kind),
          );
        }
    },
  "each failed row has error text containing {failure}": async (
    world,
    { failure },
  ) => {
    for (const rows of Object.values(world.observation!.before)) {
      const failed = rows.find(
        (r) => (r.state as { kind: string }).kind === "failed",
      );
      expect((failed!.state as { error: string }).error).toContain(failure);
    }
  },
  "all scheduler rows remain unchanged across the interval {retained}": async (
    world,
    { retained },
  ) => {
    expect(
      isDeepStrictEqual(world.observation!.after, world.observation!.before),
    ).toBe(retained);
  },
});
