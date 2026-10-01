import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { failureAfterJournalAppendContract as contract } from "../../generated/contracts/command.command-pipeline.failure-after-journal-append.contract.js";
import {
  assertEvent,
  assertNextCommandApplies,
  assertOutcome,
  assertReceipt,
  assertVersion,
  injectFault,
  prepareStream,
  runCommand,
  type FaultWorld,
} from "./pipeline-faults.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.command-pipeline.failure-after-journal-append",
  ),
  verifies: ref("spec:command.command-pipeline.failure-after-journal-append"),
});
void anchor;
// The depot's document mapping throws in isDeleted for the fixture's after-journal-append title. The
// adapter calls it at its step 9, after append inserted the event and before the stream row is written.
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
  ) => assertVersion(world, versionAfter),
  "a receipt for the key exists {receiptExists}": async (
    world,
    { receiptExists },
  ) => assertReceipt(world, receiptExists),
  "an event from the command exists in the journal {eventExists}": async (
    world,
    { eventExists },
  ) => {
    await assertEvent(world, eventExists);
    // The stream row still names the version before the failure, so a command that expects it applies.
    await assertNextCommandApplies(world, {
      requestKey: "k-next",
      title: "After the failure",
    });
  },
});
