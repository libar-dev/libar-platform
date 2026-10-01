import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { failureAfterStateWriteContract as contract } from "../../generated/contracts/command.command-pipeline.failure-after-state-write.contract.js";
import {
  assertEvent,
  assertOutcome,
  assertReceipt,
  assertStateUnchanged,
  assertVersion,
  injectFault,
  prepareStream,
  runCommand,
  type FaultWorld,
} from "./pipeline-faults.js";
const anchor = specTest({
  id: testAnchorId("test:command.command-pipeline.failure-after-state-write"),
  verifies: ref("spec:command.command-pipeline.failure-after-state-write"),
});
void anchor;
// The depot's toDto throws for the fixture's after-state-write title. The adapter calls it at its
// step 10, after it appended the event and saved the folded state.
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
  ) => assertEvent(world, eventExists),
});
