import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { getConvexSize } from "convex/values";
import { expect } from "vitest";
import { orderAtStockItemIdBoundContract as contract } from "../../generated/contracts/application.first-experiment.order-at-stock-item-id-bound.contract.js";
import { required } from "../../harness/native.js";
import { limitPayloadBytes } from "../../src/context/index.js";
import {
  application,
  configurationIs,
  orderAtIdBound,
  stockItemIdBytesAre,
  placeOrderAtIdBoundRuns,
  stockItemIdAnswerIs,
  commandDocumentsAre,
  type StockItemIdWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.first-experiment.order-at-stock-item-id-bound",
  ),
  verifies: ref(
    "spec:application.first-experiment.order-at-stock-item-id-bound",
  ),
});
void anchor;
bindExample(contract, (): StockItemIdWorld => ({}), {
  "the production composition on a native backend": (world) =>
    application(world),
  "an order of {size} with stock contention {contention}": (
    world,
    { size, contention },
  ) => orderAtIdBound(world, size, contention),
  "the order's stock item IDs are {idBytes} bytes of UTF-8, the last line's {lastIdBytes}":
    (world, { idBytes, lastIdBytes }) =>
      stockItemIdBytesAre(world, idBytes, lastIdBytes),
  "the backend runs with {configuration}": (world, { configuration }) =>
    configurationIs(world, configuration),
  "{run} runs": (world, { run }) => placeOrderAtIdBoundRuns(world, run),
  "the caller receives {answer}": (world, { answer }) =>
    stockItemIdAnswerIs(world, answer),
  "the command read {readDocuments} documents and wrote {writtenDocuments}": (
    world,
    { readDocuments, writtenDocuments },
  ) => commandDocumentsAre(world, readDocuments, writtenDocuments),
  "the order's OrderPlaced payload measures {payloadBytes} bytes": async (
    world,
    { payloadBytes },
  ) => {
    const events = await required(world.backend, "the backend").admin.readTable(
      "events",
      { component: "orders" },
    );
    const own = events.filter(
      (event) => event["streamId"] === "order-at-id-bound",
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      eventType: "OrderPlaced",
      payload: { lines: world.lines, total: 14950 },
    });
    const bytes = getConvexSize(
      required(own[0]?.["payload"], "the OrderPlaced payload"),
    );
    expect(bytes).toBe(payloadBytes);
    expect(limitPayloadBytes).toBe(16384);
    expect(bytes).toBeLessThanOrEqual(limitPayloadBytes);
  },
});
