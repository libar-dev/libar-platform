import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { api } from "../../example/convex/_generated/api.js";
import { maxOrderLines } from "../../example/convex/ordering.js";
import { orderOfMaxLinesContract as contract } from "../../generated/contracts/application.first-experiment.order-of-max-lines.contract.js";
import type { Backend } from "../../harness/backend.js";
import { required } from "../../harness/native.js";
import {
  anOrderOf,
  application,
  budgetsAre,
  callsPerContextAre,
  commitsAre,
  configurationIs,
  orderLines,
  placeOrderRuns,
  projectionJobsAre,
  receive,
  recordUsage,
  reportedExecutionSecondsBound,
  tenantId,
  type ExperimentWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId("test:application.first-experiment.order-of-max-lines"),
  verifies: ref("spec:application.first-experiment.order-of-max-lines"),
});
void anchor;
async function stored(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    orderStreams: await backend.admin.readTable("streams", {
      component: "orders",
    }),
    orderEvents: await backend.admin.readTable("events", {
      component: "orders",
    }),
    stockStreams: await backend.admin.readTable("streams", {
      component: "inventory",
    }),
    stockEvents: await backend.admin.readTable("events", {
      component: "inventory",
    }),
    summaries: await backend.admin.readTable("orderSummaries"),
  };
}
bindExample(
  contract,
  (): ExperimentWorld => ({}),
  {
    "the production composition on a native backend": (world) =>
      application(world),
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
    const client = required(world.client, "the client");
    const placed = required(world.placed, "the order");
    expect(placed.lines).toHaveLength(100);
    expect(maxOrderLines).toBe(100);
    expect(placed.own.executionTime).toBeLessThan(
      reportedExecutionSecondsBound,
    );
    recordUsage(world);
    // One line more than the maximum, every line with stock on hand, is refused before anything is
    // stored.
    const lines = orderLines(maxOrderLines + 1, "over");
    await receive(world, lines);
    const before = await stored(backend);
    const error = await client
      .mutation(api.ordering.placeOrder, {
        tenantId,
        requestKey: "k-over",
        input: { orderId: "order-over", lines },
      })
      .then(
        () => {
          throw new Error("An order above the maximum was applied");
        },
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<Value>).data).toEqual({
      kind: "rejection",
      code: "operationTooLarge",
      entry: "PlaceOrder",
      message: "PlaceOrder takes at most 100 items, not 101",
      details: { items: 101, maxItems: 100 },
    });
    expect(await stored(backend)).toEqual(before);
  },
);
