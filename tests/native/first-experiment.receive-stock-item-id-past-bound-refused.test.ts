import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { receiveStockItemIdPastBoundRefusedContract as contract } from "../../generated/contracts/application.first-experiment.receive-stock-item-id-past-bound-refused.contract.js";
import { required } from "../../harness/native.js";
import {
  application,
  commandDocumentsAre,
  configurationIs,
  receiveItemsWithIdBytes,
  receiveStockRuns,
  stockItemIdAnswerIs,
  stockItemIdRejectionIs,
  storedOrderDocuments,
  type StockItemIdWorld,
} from "./first-experiment-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.first-experiment.receive-stock-item-id-past-bound-refused",
  ),
  verifies: ref(
    "spec:application.first-experiment.receive-stock-item-id-past-bound-refused",
  ),
});
void anchor;
bindExample(
  contract,
  (): StockItemIdWorld => ({}),
  {
    "the production composition on a native backend": (world) =>
      application(world),
    "ReceiveStock is sent {items} stock items whose IDs are {idBytes} bytes of UTF-8, the last one's {lastIdBytes}":
      (world, { items, idBytes, lastIdBytes }) =>
        receiveItemsWithIdBytes(world, items, idBytes, lastIdBytes),
    "the backend runs with {configuration}": (world, { configuration }) =>
      configurationIs(world, configuration),
    "{run} runs": (world, { run }) => receiveStockRuns(world, run),
    "the caller receives {answer}": (world, { answer }) =>
      stockItemIdAnswerIs(world, answer),
    "the rejection names line {line} with a stock item ID of {length} bytes against a bound of {limit}":
      (world, { line, length, limit }) =>
        stockItemIdRejectionIs(world, line, length, limit, "ReceiveStock"),
    "the command read {readDocuments} documents and wrote {writtenDocuments}": (
      world,
      { readDocuments, writtenDocuments },
    ) => commandDocumentsAre(world, readDocuments, writtenDocuments),
  },
  async (world) => {
    expect(
      await storedOrderDocuments(required(world.backend, "the backend")),
    ).toEqual(
      required(world.before, "the stored documents before the command"),
    );
  },
);
