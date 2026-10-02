import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { orderOf10LinesContract as contract } from "../../generated/contracts/application.first-experiment.order-of-10-lines.contract.js";
import { required } from "../../harness/native.js";
import {
  anOrderOf,
  application,
  budgetsAre,
  callsPerContextAre,
  commitsAre,
  configurationIs,
  placeOrderRuns,
  projectionJobsAre,
  recordUsage,
  usageOf,
  type ExperimentWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.order-of-10-lines"),
  verifies: ref("spec:application.first-experiment.order-of-10-lines"),
});
void anchor;
bindExample(
  contract,
  (): ExperimentWorld => ({}),
  {
    "the Orders and Inventory application built through Layer 2 on a native backend":
      (world) => application(world),
    "an order of {size} with stock contention {contention}": (
      world,
      { size, contention },
    ) => anOrderOf(world, size, contention),
    "the backend runs with {configuration}": (world, { configuration }) =>
      configurationIs(world, configuration),
    "{run} runs": (world, { run }) => placeOrderRuns(world, run),
    "each successful command makes {commits} top-level commit": (
      world,
      { commits },
    ) => commitsAre(world, commits),
    "the core path runs {projectionJobs} projection jobs": (
      world,
      { projectionJobs },
    ) => projectionJobsAre(world, projectionJobs),
    "the use case makes {callsPerContext} call per context": (
      world,
      { callsPerContext },
    ) => callsPerContextAre(world, callsPerContext),
    "the budgets {budgets}": (world, { budgets }) => budgetsAre(world, budgets),
  },
  // The verification bullets.
  (world) => {
    const placed = required(world.placed, "the order");
    const reference = required(world.reference, "the one-line order");
    expect(placed.lines).toHaveLength(10);
    expect(new Set(placed.lines.map((line) => line.stockItemId)).size).toBe(10);
    // Each line beyond the first is one more stock item: its state and its event.
    const added = placed.lines.length - reference.lines.length;
    expect(
      usageOf(placed.own).databaseWriteDocuments -
        usageOf(reference.own).databaseWriteDocuments,
    ).toBe(2 * added);
    recordUsage(world);
  },
);
