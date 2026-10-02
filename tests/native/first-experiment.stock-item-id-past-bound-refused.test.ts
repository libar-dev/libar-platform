import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { stockItemIdPastBoundRefusedContract as contract } from "../../generated/contracts/application.first-experiment.stock-item-id-past-bound-refused.contract.js";
import { required } from "../../harness/native.js";
import {
  application,
  configurationIs,
  orderAtIdBound,
  stockItemIdBytesAre,
  placeOrderAtIdBoundRuns,
  stockItemIdAnswerIs,
  commandDocumentsAre,
  stockItemIdRejectionIs,
  storedOrderDocuments,
  type StockItemIdWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.first-experiment.stock-item-id-past-bound-refused",
  ),
  verifies: ref(
    "spec:application.first-experiment.stock-item-id-past-bound-refused",
  ),
});
void anchor;
bindExample(
  contract,
  (): StockItemIdWorld => ({}),
  {
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
    "the rejection names line {line} with a stock item ID of {length} bytes against a bound of {limit}":
      (world, { line, length, limit }) =>
        stockItemIdRejectionIs(world, line, length, limit),
  },
  async (world) => {
    expect(
      await storedOrderDocuments(required(world.backend, "the backend")),
    ).toEqual(
      required(world.before, "the stored documents before the command"),
    );
  },
);
