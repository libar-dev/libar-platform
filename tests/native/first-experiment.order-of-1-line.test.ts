import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { orderOf1LineContract as contract } from "../../generated/contracts/application.first-experiment.order-of-1-line.contract.js";
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
  type ExperimentWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.order-of-1-line"),
  verifies: ref("spec:application.first-experiment.order-of-1-line"),
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
  async (world) => {
    const backend = required(world.backend, "the backend");
    const placed = required(world.placed, "the order");
    expect(world.reference).toBeUndefined();
    expect(placed.lines).toHaveLength(1);
    expect(placed.request).toMatchObject([
      { udfType: "Mutation", componentPath: null, error: null },
    ]);
    // The command's receipt, the order's state and event, the stock item's state and event, and the
    // summary row: what the completion record counts as written.
    const ofOperation = (rows: Record<string, unknown>[]) =>
      rows.filter((row) => row["operationId"] === placed.response.operationId);
    expect(
      ofOperation(
        await backend.admin.readTable("events", { component: "orders" }),
      ),
    ).toHaveLength(1);
    expect(
      ofOperation(
        await backend.admin.readTable("events", { component: "inventory" }),
      ),
    ).toHaveLength(1);
    expect(placed.own.usageStats["databaseWriteDocuments"]).toBe(6);
    recordUsage(world);
  },
);
