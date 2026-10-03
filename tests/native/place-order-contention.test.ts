import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { nativeContentionContract as contract } from "../../generated/contracts/application.first-experiment.native-contention.contract.js";
import { contentionCell } from "./place-order-contention.js";
import type { PlaceOrderMeasurement } from "./place-order-measurement.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.native-contention"),
  verifies: ref("spec:application.first-experiment.native-contention"),
});
void anchor;
bindExample(
  contract,
  (): { cells: PlaceOrderMeasurement[] } => ({ cells: [] }),
  {
    "the production composition on a native backend": () => {},
    "the contention matrix has sizes {sizes} and callers {callers}": (
      _world,
      { sizes, callers },
    ) => {
      expect(sizes).toBe("1, 10, 100");
      expect(callers).toBe("2, 8, 32");
    },
    "the backend runs with {configuration}": (_world, { configuration }) => {
      expect(configuration).toBe("production configuration");
    },
    "{run} runs": async (world, { run }) => {
      expect(run).toBe("the PlaceOrder use case");
      for (const lines of [1, 10, 100] as const)
        for (const callers of [2, 8, 32] as const)
          world.cells.push(await contentionCell(lines, callers));
    },
    "each successful command makes {commits} top-level commit": (
      world,
      { commits },
    ) => {
      expect(world.cells).toHaveLength(9);
      for (const cell of world.cells)
        expect(cell.topLevelCommits).toBe(commits);
    },
    "the core path runs {projectionJobs} projection jobs": (
      world,
      { projectionJobs },
    ) => {
      for (const cell of world.cells)
        expect((cell.otherExecutions as unknown[]).length).toBe(projectionJobs);
    },
    "the contention matrix records one applied outcome per cell and {smallCellEngineFailures} engine failures at two and eight callers":
      (world, { smallCellEngineFailures }) => {
        for (const cell of world.cells) {
          expect(cell.outcomeCounts.applied).toBe(1);
          if (cell.contention < 32)
            expect(cell.engineFailedCommands).toBe(smallCellEngineFailures);
        }
        expect(
          world.cells.reduce((sum, cell) => sum + cell.engineReruns, 0),
          "the matrix must observe at least one refused commit",
        ).toBeGreaterThan(0);
      },
  },
);
