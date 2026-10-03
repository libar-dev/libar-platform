import { installFixtureReadModel } from "./rebuild-install.js";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { failureBeforeReceiptContract as contract } from "../../generated/contracts/command.command-pipeline.failure-before-receipt.contract.js";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { projectionFaultTitle } from "../../fixture/convex/documentTitles.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";
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
// Step 9's read-model writes roll back with the mutation. CreateTwiceSummarizedDocument binds the
// document summary and then the document title, whose projection throws for its fault title, so the
// throw comes after step 9 wrote the summary row and before the receipt insert of step 10.
const twiceSummarized = "summarizedTwice:createTwiceSummarizedDocument";
async function readModelTables(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    events: await backend.admin.readTable("events", { component: "depot" }),
    summaries: await backend.admin.readTable("documentSummaries"),
    titles: await backend.admin.readTable("documentTitles"),
  };
}
test("native: a projection that throws after step 9 wrote the first read model's row leaves no read-model row, no receipt and no event or state change", async () => {
  const backend = await fixtureBackend();
  for (const readModel of ["documentSummary", "documentTitle"])
    await installFixtureReadModel(backend, readModel);
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|user-1`,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  const send = async (title: string) => {
    const mark = await backend.admin.logMark();
    let error: unknown;
    let response: unknown;
    try {
      response = await client.mutation(
        api.summarizedTwice.createTwiceSummarizedDocument,
        {
          tenantId: "t-1",
          requestKey: "k-twice",
          input: { documentId: "doc-1", title },
        },
      );
    } catch (thrown) {
      error = thrown;
    }
    const own = (entry: { identifier: string; componentPath: string | null }) =>
      entry.identifier === twiceSummarized && entry.componentPath === null;
    const records = await backend.admin.completionsSince(mark, (entries) =>
      entries.some(own),
    );
    const record = required(records.find(own), "the completion record");
    const request = records.filter(
      (entry) => entry.requestId === record.requestId,
    );
    return { error, response, request };
  };
  const faulted = await send(projectionFaultTitle);
  measure("readModelFault", {
    error: faulted.error === undefined ? null : String(faulted.error),
    records: faulted.request.map(({ identifier, componentPath, error }) => ({
      identifier,
      componentPath,
      error,
    })),
  });
  // One top-level mutation failed with the projection's plain error, a technical failure.
  const text = `Fault injected: ${projectionFaultTitle}, projecting document doc-1`;
  expect(faulted.response).toBeUndefined();
  expect(faulted.error, String(faulted.error)).toBeInstanceOf(Error);
  expect(faulted.error).not.toBeInstanceOf(ConvexError);
  expect(classifyThrown(faulted.error).kind).toBe("technical");
  expect(String(faulted.error)).toContain(text);
  expect(faulted.request).toHaveLength(1);
  expect(faulted.request[0]?.error).toContain(text);
  // Nothing of the command is stored: no row of either read model, no receipt, no event and no
  // stream row of the depot. The backend started empty, so every table the command writes is empty.
  expect(await readModelTables(backend)).toEqual({
    receipts: [],
    streams: [],
    events: [],
    summaries: [],
    titles: [],
  });
  // The same command and key without the fault is new intent, and step 9 writes both rows.
  const applied = await send("Report");
  expect(applied.error, String(applied.error)).toBeUndefined();
  expect(applied.response).toMatchObject({
    kind: "applied",
    replayed: false,
  });
  const { operationId } = applied.response as { operationId: string };
  const after = await readModelTables(backend);
  expect(after.receipts).toMatchObject([
    { requestKey: "k-twice", operationId },
  ]);
  expect(after.events).toMatchObject([{ streamId: "doc-1", operationId }]);
  expect(after.summaries).toMatchObject([
    { key: "doc-1", generation: 1, title: "Report" },
  ]);
  expect(after.titles).toMatchObject([
    { key: "doc-1", generation: 1, title: "Report" },
  ]);
});
