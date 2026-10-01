import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { failureBeforeReceiptContract as contract } from "../../generated/contracts/command.command-pipeline.failure-before-receipt.contract.js";
import {
  assertEvent,
  assertOutcome,
  assertReceipt,
  assertRetryExecutes,
  assertStateUnchanged,
  assertVersion,
  injectFault,
  prepareStream,
  runCommand,
  type FaultWorld,
} from "./pipeline-faults.js";
const anchor = specTest({
  id: testAnchorId("test:command.command-pipeline.failure-before-receipt"),
  verifies: ref("spec:command.command-pipeline.failure-before-receipt"),
});
void anchor;
// The fixture executor throws after the depot call returned and before the pipeline inserts the
// receipt, while the command's failBeforeReceipt switch is on. The depot's sub-transaction finished
// without error, and nothing of it survives the parent's throw.
bindExample(contract, (): FaultWorld => ({}), {
  "a receipted command on a context whose stream is at version {version}":
    async (world, { version }) => prepareStream(world, version),
  "a failure is injected {point}": async (world, { point }) =>
    injectFault(world, point),
  "the command runs as one top-level mutation": async (world) =>
    runCommand(world),
  "the mutation throws and the caller sees {outcome}": (world, { outcome }) =>
    assertOutcome(world, outcome),
  "the stream version afterwards is {versionAfter}": async (
    world,
    { versionAfter },
  ) => {
    await assertVersion(world, versionAfter);
    await assertStateUnchanged(world);
  },
  "a receipt for the key exists {receiptExists}": async (
    world,
    { receiptExists },
  ) => assertReceipt(world, receiptExists),
  "an event from the command exists in the journal {eventExists}": async (
    world,
    { eventExists },
  ) => {
    await assertEvent(world, eventExists);
    await assertRetryExecutes(world);
  },
});
